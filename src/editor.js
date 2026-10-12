// Редактор визитки — главный экран приложения артиста.
//
// Сверху — визитка одной плиткой (фото, имя, готовность), ниже — разделы-
// аккордеоны в том порядке, в каком визитку читает клиент, внизу —
// публикация. Всё сохраняется само (editor-draft.js); на публичную визитку
// правки уходят по кнопке «Опубликовать изменения».
import { escapeHtml, escapeAttr } from './shared/lib/html.js';
import { renderIcon } from './shared/components/icons.js';
import { toast } from './shared/components/toast.js';
import { hapticLight } from './shared/lib/haptic.js';
import {
  compressImage,
  BUSINESS_CARD_GALLERY_MAX_BYTES,
  CARD_LIMITS,
  DEFAULT_BUSINESS_CARD,
  rotateBusinessCardLeadKey
} from './shared/data/businessCard.js';
import { enabledOccasions } from './shared/data/occasions.js';
import { getCard, saveCard, publishCard, cardCompletion, CARD_CHECKLIST, cardPublicUrl, hasUnpublishedChanges } from './card-data.js';
import { mirrorRead } from './store.js';
import { createCardDraft } from './editor-draft.js';
import {
  BACKUP_MAX_BYTES,
  createEncryptedBackup,
  restoreEncryptedBackup,
  downloadBackupFile
} from './card-backup.js';
import { renderPaperCard } from './paper-card.js';
import {
  section, statusDone, statusNew,
  renderBasics, renderMedia, renderActs, renderContacts,
  renderTrust, renderProgram
} from './editor-sections.js';
import { renderOccasions, bindOccasionEditor } from './editor-occasions.js';

const state = {
  card: null,
  busy: false,
  openSection: '',
  openOccasion: '',
  professionsOpen: false   // список профессий развёрнут (по кнопке «Изменить»)
};

let draft = null;

// Пустая строка для каждого списка: человек нажал «Добавить» и печатает.
const LIST_BLANKS = {
  facts: { value: '', label: '' },
  formats: { minutes: '', title: '', description: '' },
  requirements: { title: '', text: '' },
  included: { text: '' },
  quotes: { text: '', author: '', occasion: '' }
};

// Подсказка «осталось» ведёт прямо в нужный раздел.
const CHECKLIST_SECTION = {
  name: 'basics',
  role: 'basics',
  contact: 'contacts',
  cover: 'media',
  trust: 'trust',
  offer: 'occasions'
};

/* ─────────── Верх экрана ─────────── */

function publishStatus(card) {
  if (!card.publishedSlug) return '<span class="ca-status">Черновик</span>';
  return hasUnpublishedChanges(card)
    ? '<span class="ca-status is-pending"><span class="ca-status-dot" aria-hidden="true"></span>Есть изменения</span>'
    : '<span class="ca-status is-live"><span class="ca-status-dot" aria-hidden="true"></span>Опубликована</span>';
}

function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '';
  return ((parts[0][0] || '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

function renderProfileTile(card) {
  const { percent } = cardCompletion(card);
  const meta = [card.role, card.city].filter(Boolean).join(' · ');
  return `
    <section class="ca-profile" data-profile>
      <div class="ca-profile-row">
        ${card.coverPhoto
          ? `<img class="ca-profile-photo" src="${escapeAttr(card.coverPhoto)}" alt="" />`
          : `<span class="ca-profile-photo is-empty" aria-hidden="true">${escapeHtml(initials(card.name) || '·')}</span>`}
        <span class="ca-profile-copy">
          <span class="ca-profile-name" data-profile-name>${escapeHtml(card.name || 'Ваше имя')}</span>
          <span class="ca-profile-meta" data-profile-meta>${escapeHtml(meta || 'Расскажите, кто вы')}</span>
        </span>
        <a class="ca-round-link" href="#/preview" aria-label="Посмотреть визитку глазами клиента">
          ${renderIcon('eye', { size: 20 })}
        </a>
      </div>
      <div class="ca-profile-progress" data-progress>
        <div class="ca-profile-progress-top">
          <span>Готово</span>
          <span>${percent}%</span>
        </div>
        <div class="ca-progress-bar"><span style="width:${percent}%"></span></div>
      </div>
    </section>
  `;
}

function renderMissing(card) {
  const { missing } = cardCompletion(card);
  if (!missing.length) return '';
  const next = missing[0];
  return `
    <button type="button" class="ca-hint" data-hint-section="${escapeAttr(CHECKLIST_SECTION[next.id] || 'basics')}">
      <span class="ca-hint-icon" aria-hidden="true">${renderIcon('sparkle', { size: 18 })}</span>
      <span class="ca-hint-text">Осталось: ${escapeHtml(next.label.toLowerCase())}${missing.length > 1 ? ` и ещё ${missing.length - 1}` : ''}</span>
      ${renderIcon('chevron-right', { size: 18 })}
    </button>
  `;
}

/* ─────────── Разделы ─────────── */

function filledCount(list, key) {
  return (list || []).filter((item) => String(item[key] || '').trim()).length;
}

function plural(n, one, few, many) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}

function renderSections(card) {
  const open = state.openSection;
  const occasions = enabledOccasions(card);
  const facts = filledCount(card.facts, 'value');
  const formats = filledCount(card.formats, 'title');
  const photos = card.galleryPhotos.length;
  const contacts = [card.phone, card.telegram, card.vk, card.max, card.email, card.website].filter(Boolean).length;

  return [
    section({
      id: 'basics', icon: 'user', title: 'Кто вы', open: open === 'basics',
      sub: [card.name, card.role].filter(Boolean).join(', ') || 'Имя, специализация, город',
      status: card.name && card.role ? statusDone : '',
      body: renderBasics(card, state.professionsOpen)
    }),
    section({
      id: 'media', icon: 'image', title: 'Фото и видео', open: open === 'media',
      sub: card.coverPhoto ? (card.videoUrl ? 'Обложка и выступление' : 'Обложка, добавьте видео') : 'Главное фото визитки',
      status: card.coverPhoto ? statusDone : '',
      body: renderMedia(card)
    }),
    section({
      id: 'acts', icon: 'play', title: 'Номера', open: open === 'acts',
      sub: photos ? `${photos} ${plural(photos, 'фото', 'фото', 'фото')} из ${CARD_LIMITS.gallery}` : 'Фото номеров и работ',
      status: photos ? statusDone : '',
      body: renderActs(card)
    }),
    section({
      id: 'contacts', icon: 'phone', title: 'Контакты', open: open === 'contacts',
      sub: contacts ? ['Телефон', 'Telegram', 'ВКонтакте', 'MAX', 'Почта', 'Сайт'].filter((_, i) => [card.phone, card.telegram, card.vk, card.max, card.email, card.website][i]).join(', ') : 'Как с вами связаться',
      status: card.phone || card.telegram || card.email ? statusDone : '',
      body: renderContacts(card)
    }),
    section({
      id: 'occasions', icon: 'sparkle', title: 'Праздники', open: open === 'occasions',
      sub: occasions.length ? `${occasions.length} ${plural(occasions.length, 'страница', 'страницы', 'страниц')}: ${occasions.map((o) => o.title.toLowerCase()).join(', ')}` : 'Страницы под корпоратив, свадьбы, выпускные',
      status: occasions.length ? statusDone : statusNew,
      body: renderOccasions(card, state.openOccasion)
    }),
    section({
      id: 'trust', icon: 'note', title: 'Доверие', open: open === 'trust',
      sub: facts || card.clients ? [facts ? `${facts} ${plural(facts, 'факт', 'факта', 'фактов')}` : '', card.clients ? 'клиенты' : '', filledCount(card.quotes, 'text') ? 'отзывы' : ''].filter(Boolean).join(', ') : 'Факты, клиенты, отзывы',
      status: facts || card.clients ? statusDone : '',
      body: renderTrust(card)
    }),
    section({
      id: 'program', icon: 'calendar', title: 'Форматы и площадка', open: open === 'program',
      sub: formats ? `${formats} ${plural(formats, 'формат', 'формата', 'форматов')}${filledCount(card.requirements, 'title') ? ', требования к площадке' : ''}` : 'Сколько длится и что нужно',
      status: formats ? statusDone : '',
      body: renderProgram(card, card.leadKey)
    }),
    section({
      id: 'backup', icon: 'download', title: 'Резервная копия', open: open === 'backup',
      sub: 'Перенос на другой телефон',
      body: renderBackup()
    })
  ].join('');
}

/* ─────────── Публикация ─────────── */

// Первая публикация — кульминация всей сборки: визитка перестаёт быть
// черновиком и становится доступной людям. Поэтому показываем момент: сама
// карточка, живой адрес и следующий шаг. Обновление визитки — рутина, там тост.
function renderPublishedMoment(card) {
  const url = cardPublicUrl(card.publishedSlug);
  return `
    <div class="ca-published" data-published role="dialog" aria-modal="true" aria-labelledby="ca-published-title">
      <div class="ca-published-panel">
        <div class="ca-published-card">
          ${renderPaperCard({ name: card.name, profession: card.profession, role: card.role })}
        </div>
        <p class="ca-published-kicker">Готово</p>
        <h2 class="ca-published-title" id="ca-published-title">Визитка опубликована</h2>
        <p class="ca-published-lead">Теперь её можно открыть по ссылке или показать QR-кодом.</p>
        <p class="ca-published-url">${escapeHtml(url)}</p>
        <div class="ca-published-actions">
          <button type="button" class="ca-btn ca-btn--primary" data-published-share>Ссылки и QR-код</button>
          <button type="button" class="ca-btn ca-btn--ghost" data-published-close>Позже</button>
        </div>
      </div>
    </div>
  `;
}

// Три честных состояния публикации. Главное — «есть изменения, которых
// клиенты ещё не видят»: редактор сохраняет правки на телефоне сразу, а на
// публичную визитку они попадают только по кнопке.
function renderPublishState(card, dirty) {
  if (!card.publishedSlug) {
    return '<div class="ca-publish-hint" data-publish-state>Опубликуйте и получите ссылки и QR-код</div>';
  }
  return dirty
    ? `<div class="ca-publish-live is-pending" data-publish-state>
         <span class="ca-publish-dot" aria-hidden="true"></span>
         <span>Есть изменения, которых клиенты ещё не видят</span>
       </div>`
    : `<div class="ca-publish-live" data-publish-state>
         <span class="ca-publish-dot" aria-hidden="true"></span>
         <span>Опубликовано: клиенты видят актуальную визитку</span>
       </div>`;
}

function publishLabel(card, dirty) {
  if (state.busy) return 'Публикуем…';
  if (!card.publishedSlug) return 'Опубликовать визитку';
  return dirty ? 'Опубликовать изменения' : 'Обновить визитку';
}

// Кнопка главная, пока есть что публиковать; когда всё на месте — спокойная.
function publishButtonClass(card, dirty) {
  return !card.publishedSlug || dirty ? 'ca-btn ca-btn--primary' : 'ca-btn ca-btn--ghost';
}

function renderPublishBar(card) {
  const published = Boolean(card.publishedSlug);
  const dirty = hasUnpublishedChanges(card);
  return `
    <div class="ca-publish">
      ${renderPublishState(card, dirty)}
      <button type="button" class="${publishButtonClass(card, dirty)}" data-publish ${state.busy ? 'disabled' : ''}>
        ${publishLabel(card, dirty)}
      </button>
      ${published ? '<a class="ca-btn ca-btn--ghost" href="#/share">Ссылки и QR-код</a>' : ''}
      ${published ? '<button type="button" class="ca-key-rotate" data-rotate-key>Сменить ключ доступа</button>' : ''}
    </div>
  `;
}

// Обновляем состояние публикации прямо во время ввода — но точечно (сама
// кнопка остаётся, с её обработчиком) и с небольшой паузой: отпечаток карточки
// с фотографиями считать на каждую букву незачем.
let publishStateTimer = 0;

function schedulePublishState(node) {
  clearTimeout(publishStateTimer);
  publishStateTimer = setTimeout(() => refreshLiveBits(node), 250);
}

function refreshLiveBits(node) {
  if (!state.card || state.busy) return;
  const card = state.card;
  const dirty = hasUnpublishedChanges(card);
  const status = node.querySelector('[data-publish-state]');
  if (status) status.outerHTML = renderPublishState(card, dirty);
  const btn = node.querySelector('[data-publish]');
  if (btn) {
    btn.className = publishButtonClass(card, dirty);
    btn.textContent = publishLabel(card, dirty);
  }
  const chip = node.querySelector('[data-head-status]');
  if (chip) chip.innerHTML = publishStatus(card);
  const progress = node.querySelector('[data-progress]');
  if (progress) {
    const { percent } = cardCompletion(card);
    progress.querySelector('.ca-profile-progress-top span:last-child').textContent = `${percent}%`;
    progress.querySelector('.ca-progress-bar span').style.width = `${percent}%`;
  }
  const hint = node.querySelector('[data-hint-host]');
  if (hint) {
    hint.innerHTML = renderMissing(card);
    bindHint(node);
  }
}

function renderBackup() {
  return `
    <div class="ca-backup">
      <p class="ca-note">Файл позволяет восстановить визитку и управление опубликованной ссылкой на другом устройстве.</p>
      <label class="ca-field">
        <span class="ca-field-label">Пароль резервной копии</span>
        <input class="ca-input" type="password" minlength="8" maxlength="120"
          autocomplete="new-password" placeholder="Минимум 8 символов" data-backup-password />
        <span class="ca-field-hint">Запомните пароль: без него файл невозможно расшифровать.</span>
      </label>
      <div class="ca-backup-actions">
        <button type="button" class="ca-btn ca-btn--ghost" data-backup-export>${renderIcon('download')} Скачать копию</button>
        <button type="button" class="ca-btn ca-btn--ghost" data-backup-import-trigger>
          ${renderIcon('upload')} Восстановить</button>
        <input type="file" accept=".eventory-card,application/json" hidden data-backup-import />
      </div>
      <p class="ca-backup-warning">Не передавайте файл и пароль вместе: копия содержит закрытый ключ владельца.</p>
      <a class="ca-text-link" href="#/privacy">Как используются данные</a>
    </div>
  `;
}

function renderContent() {
  const card = state.card;
  if (!card) return '<div class="ca-loading">Загружаем визитку…</div>';

  return `
    <div class="ca-editor">
      <div class="ca-page-head">
        <h1 class="ca-page-title">Моя визитка</h1>
        <span data-head-status>${publishStatus(card)}</span>
      </div>
      ${renderProfileTile(card)}
      <div data-hint-host>${renderMissing(card)}</div>
      <form class="ca-form" data-card-form novalidate>
        ${renderSections(card)}
      </form>
      ${renderPublishBar(card)}
    </div>
  `;
}

/* ─────────── Момент публикации ─────────── */

// Момент публикации живёт поверх редактора и снимается по любой кнопке.
// Держим его отдельным узлом, а не частью формы: rerender редактора не должен
// его гасить, пока человек читает адрес своей визитки.
function showPublishedMoment() {
  const host = document.createElement('div');
  host.innerHTML = renderPublishedMoment(state.card);
  const overlay = host.firstElementChild;
  if (!overlay) return;
  document.body.appendChild(overlay);

  const close = () => {
    overlay.remove();
    window.removeEventListener('hashchange', close);
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  overlay.querySelector('[data-published-close]')?.addEventListener('click', close);
  overlay.querySelector('[data-published-share]')?.addEventListener('click', () => {
    close();
    window.location.hash = '#/share';
  });
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  window.addEventListener('hashchange', close);
  document.addEventListener('keydown', onKey);
  overlay.querySelector('[data-published-share]')?.focus({ preventScroll: true });
}

/* ─────────── Черновик ─────────── */

function updateDraft(patch) {
  state.card = draft.schedule(patch);
  return state.card;
}

async function persist(patch) {
  state.card = await draft.persist(patch);
  return state.card;
}

async function flushDraft() {
  if (!draft) return state.card;
  state.card = await draft.flush();
  return state.card;
}

function listCopy(list) {
  return (state.card[list] || []).map((item) => ({ ...item }));
}

function occasionPatch(id, changes) {
  const current = state.card.occasions?.[id] || { photo: -1, momentPhoto: -1, highlightPhoto: -1 };
  return { occasions: { ...state.card.occasions, [id]: { ...current, ...changes } } };
}

// Подписи номеров — параллельные массивы: строка i описывает фото i.
function galleryTextPatch(key, index, value) {
  const list = [...(state.card[key] || [])];
  while (list.length < state.card.galleryPhotos.length) list.push('');
  list[index] = value;
  return { [key]: list };
}

export const editor = {
  id: 'editor',
  title: 'Моя визитка',
  render() {
    return renderContent();
  },
  async mount(node) {
    // Раскрытый список профессий — состояние одного захода, а не настройка.
    state.professionsOpen = false;
    state.card = mirrorRead() || DEFAULT_BUSINESS_CARD;
    draft = createCardDraft(state.card, { save: saveCard });
    state.card = draft.card;
    node.innerHTML = renderContent();
    bind(node);

    // Дочитываем актуальные данные из IndexedDB без блокировки первого кадра
    getCard().then((card) => {
      if (!card) return;
      state.card = card;
      draft = createCardDraft(state.card, { save: saveCard });
      state.card = draft.card;
      rerender(node);
    }).catch(() => {});
  },
  async unmount() {
    clearTimeout(publishStateTimer);
    await flushDraft();
  }
};

// Полная перерисовка — только после действий, меняющих структуру (фото,
// строка списка, праздник). Позицию прокрутки сохраняем: человек не должен
// оказаться наверху экрана из-за того, что добавил строку.
function rerender(node) {
  const y = window.scrollY;
  node.innerHTML = renderContent();
  bind(node);
  window.scrollTo(0, y);
}

function bindHint(node) {
  node.querySelector('[data-hint-section]')?.addEventListener('click', (event) => {
    openSection(node, event.currentTarget.dataset.hintSection, { scroll: true });
  });
}

function openSection(node, id, { scroll = false } = {}) {
  state.openSection = id;
  node.querySelectorAll('.ca-section').forEach((sec) => {
    const isOpen = sec.dataset.section === id;
    sec.classList.toggle('is-open', isOpen);
    const body = sec.querySelector('.ca-section-body');
    if (body) body.hidden = !isOpen;
    sec.querySelector('[data-toggle-section]')?.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  });
  if (scroll) {
    node.querySelector(`.ca-section[data-section="${id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function bindInput(node, form) {
  // Автосохранение: человек не должен думать о кнопке «Сохранить» — визитка
  // живёт локально и пишется сразу.
  form.addEventListener('input', (e) => {
    const el = e.target;
    if (el.dataset.list) {
      const items = listCopy(el.dataset.list);
      const index = Number(el.dataset.index);
      items[index] = { ...(items[index] || {}), [el.dataset.key]: el.value };
      updateDraft({ [el.dataset.list]: items });
    } else if (el.dataset.occ) {
      updateDraft(occasionPatch(el.dataset.occ, { [el.dataset.occField]: el.value }));
    } else if (el.dataset.galleryCaption != null) {
      updateDraft(galleryTextPatch('galleryCaptions', Number(el.dataset.galleryCaption), el.value));
    } else if (el.dataset.galleryHeadline != null) {
      updateDraft(galleryTextPatch('galleryHeadlines', Number(el.dataset.galleryHeadline), el.value));
    } else if (el.dataset.galleryText != null) {
      updateDraft(galleryTextPatch('galleryTexts', Number(el.dataset.galleryText), el.value));
    } else if (el.dataset.customTitle) {
      // Название своего праздника меняется, адрес страницы — нет: ссылка уже
      // могла уйти клиентам.
      const id = el.dataset.customTitle;
      updateDraft({
        customOccasions: state.card.customOccasions.map((item) => (item.id === id ? { ...item, title: el.value } : item))
      });
    } else if (el.dataset.occNewTitle != null) {
      return;
    } else if (el.name) {
      updateDraft({ [el.name]: el.value });
    } else {
      return;
    }
    if (el.name === 'name' || el.name === 'role' || el.name === 'city') {
      const nameEl = node.querySelector('[data-profile-name]');
      const metaEl = node.querySelector('[data-profile-meta]');
      if (nameEl) nameEl.textContent = state.card.name || 'Ваше имя';
      if (metaEl) metaEl.textContent = [state.card.role, state.card.city].filter(Boolean).join(' · ') || 'Расскажите, кто вы';
    }
    schedulePublishState(node);
  });

  // Blur/change — естественная граница поля. Записываем сразу, чтобы даже
  // закрытие вкладки сразу после ввода не оставляло значение только в таймере.
  form.addEventListener('change', () => {
    flushDraft().catch(() => {
      toast.show('Не удалось сохранить изменение', { error: true });
    });
  });
}

function bindSections(node) {
  node.querySelectorAll('[data-toggle-section]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.toggleSection;
      // Переключение секции не перерисовывает форму: она не мигает, а скролл
      // и фото в галерее остаются на месте.
      openSection(node, state.openSection === id ? '' : id);
    });
  });
  bindHint(node);
}

function bindProfession(node) {
  node.querySelectorAll('[data-profession]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const next = state.card.profession === btn.dataset.profession ? '' : btn.dataset.profession;
      // Выбрал — список сворачивается обратно в одну строку. Снял выбор —
      // остаётся раскрытым, иначе выбирать станет негде.
      state.professionsOpen = !next;
      await persist({ profession: next });
      rerender(node);
    });
  });
  node.querySelector('[data-profession-edit]')?.addEventListener('click', () => {
    state.professionsOpen = true;
    rerender(node);
  });
}

function bindCover(node) {
  const coverInput = node.querySelector('[data-cover-input]');
  if (coverInput) {
    node.querySelector('[data-cover-trigger]')?.addEventListener('click', () => coverInput.click());
    coverInput.addEventListener('change', async () => {
      const file = coverInput.files?.[0];
      if (!file) return;
      try {
        const dataUrl = await compressImage(file, { maxDim: 1200, quality: 0.82, maxBytes: 300 * 1024 });
        await persist({ coverPhoto: dataUrl });
        rerender(node);
      } catch {
        toast.show('Не удалось обработать фото', { error: true });
      }
    });
  }
  node.querySelector('[data-cover-remove]')?.addEventListener('click', async () => {
    await persist({ coverPhoto: '' });
    rerender(node);
  });
  node.querySelectorAll('[data-cover-position]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      hapticLight();
      await persist({ coverPosition: btn.dataset.coverPosition });
      rerender(node);
    });
  });
}

function bindGallery(node) {
  const galleryInput = node.querySelector('[data-gallery-input]');
  if (galleryInput) {
    node.querySelector('[data-gallery-trigger]')?.addEventListener('click', () => galleryInput.click());
    galleryInput.addEventListener('change', async () => {
      const remaining = CARD_LIMITS.gallery - state.card.galleryPhotos.length;
      const files = Array.from(galleryInput.files || []).slice(0, remaining);
      if (!files.length) return;
      galleryInput.disabled = true;
      try {
        const additions = [];
        for (const file of files) {
          additions.push(await compressImage(file, {
            maxDim: 1000,
            quality: 0.78,
            maxBytes: BUSINESS_CARD_GALLERY_MAX_BYTES
          }));
        }
        const pad = (key) => {
          const list = [...(state.card[key] || [])];
          while (list.length < state.card.galleryPhotos.length) list.push('');
          return [...list, ...additions.map(() => '')];
        };
        await persist({
          galleryPhotos: [...state.card.galleryPhotos, ...additions],
          galleryCaptions: pad('galleryCaptions'),
          galleryHeadlines: pad('galleryHeadlines'),
          galleryTexts: pad('galleryTexts')
        });
        rerender(node);
      } catch {
        toast.show('Не удалось обработать одно из фото', { error: true });
        galleryInput.disabled = false;
      }
    });
  }

  node.querySelectorAll('[data-gallery-remove]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const index = Number(btn.dataset.galleryRemove);
      // Праздники ссылаются на фото по номеру: удалённое фото уходит в обложку
      // (у момента и изюминки — «без фото»), а следующие сдвигаются на одно
      // место — иначе страница показала бы соседний снимок.
      const shift = (value) => (value === index ? -1 : value > index ? value - 1 : value);
      const shiftActs = (acts) => (Array.isArray(acts)
        ? acts.filter((i) => i !== index).map((i) => (i > index ? i - 1 : i))
        : acts);
      const occasions = Object.fromEntries(Object.entries(state.card.occasions || {}).map(([id, item]) => [
        id, {
          ...item,
          photo: shift(item.photo),
          momentPhoto: shift(item.momentPhoto),
          highlightPhoto: shift(item.highlightPhoto),
          acts: shiftActs(item.acts)
        }
      ]));
      const without = (key) => (state.card[key] || []).filter((_, i) => i !== index);
      await persist({
        galleryPhotos: without('galleryPhotos'),
        galleryCaptions: without('galleryCaptions'),
        galleryHeadlines: without('galleryHeadlines'),
        galleryTexts: without('galleryTexts'),
        occasions
      });
      rerender(node);
    });
  });
}

function bindLists(node) {
  node.querySelectorAll('[data-list-add]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const list = btn.dataset.listAdd;
      await persist({ [list]: [...listCopy(list), { ...LIST_BLANKS[list] }] });
      rerender(node);
      // Курсор сразу в новую строку: человек нажал «Добавить», чтобы печатать.
      const inputs = node.querySelectorAll(`[data-list="${list}"]`);
      const keys = Object.keys(LIST_BLANKS[list]);
      inputs[inputs.length - keys.length]?.focus();
    });
  });
  node.querySelectorAll('[data-list-remove]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const list = btn.dataset.listRemove;
      const index = Number(btn.dataset.index);
      await persist({ [list]: listCopy(list).filter((_, i) => i !== index) });
      rerender(node);
    });
  });
}

function bindBackup(node) {
  const backupPassword = node.querySelector('[data-backup-password]');
  const backupExport = node.querySelector('[data-backup-export]');
  if (backupExport && backupPassword) {
    backupExport.addEventListener('click', async () => {
      if (backupPassword.value.length < 8) {
        toast.show('Придумайте пароль минимум из 8 символов');
        backupPassword.focus();
        return;
      }
      backupExport.disabled = true;
      try {
        await flushDraft();
        const contents = await createEncryptedBackup(state.card, backupPassword.value);
        downloadBackupFile(contents, state.card.name);
        toast.show('Зашифрованная копия скачана', { ok: true });
      } catch {
        toast.show('Не удалось создать резервную копию', { error: true });
      } finally {
        backupExport.disabled = false;
      }
    });
  }

  const backupImport = node.querySelector('[data-backup-import]');
  if (backupImport && backupPassword) {
    node.querySelector('[data-backup-import-trigger]')?.addEventListener('click', () => backupImport.click());
    backupImport.addEventListener('change', async () => {
      const file = backupImport.files?.[0];
      if (!file) return;
      if (backupPassword.value.length < 8) {
        toast.show('Введите пароль от резервной копии');
        backupPassword.focus();
        backupImport.value = '';
        return;
      }
      if (file.size > BACKUP_MAX_BYTES) {
        toast.show('Файл резервной копии слишком большой', { error: true });
        backupImport.value = '';
        return;
      }
      try {
        const restored = await restoreEncryptedBackup(await file.text(), backupPassword.value);
        if (!window.confirm('Заменить текущую визитку данными из резервной копии?')) return;
        state.card = await saveCard(restored);
        draft = createCardDraft(state.card, { save: saveCard });
        rerender(node);
        toast.show('Визитка восстановлена', { ok: true });
      } catch (err) {
        const message = err?.message === 'backup_password'
          ? 'Неверный пароль или повреждённый файл'
          : 'Не удалось прочитать резервную копию';
        toast.show(message, { error: true });
      } finally {
        backupImport.value = '';
      }
    });
  }
}

function bindPublish(node) {
  node.querySelector('[data-publish]')?.addEventListener('click', async () => {
    if (state.busy) return;
    try {
      await flushDraft();
    } catch {
      toast.show('Не удалось сохранить визитку', { error: true });
      return;
    }
    if (!state.card.name) {
      toast.show('Добавьте имя, без него визитку не опубликовать');
      openSection(node, 'basics', { scroll: true });
      return;
    }
    if (!state.card.phone && !state.card.telegram && !state.card.email) {
      toast.show('Добавьте телефон, Telegram или почту для связи');
      openSection(node, 'contacts', { scroll: true });
      return;
    }
    // Первая это публикация или обновление — решаем ДО запроса: после него
    // publishedSlug уже проставлен.
    const firstTime = !state.card.publishedSlug;
    state.busy = true;
    rerender(node);
    try {
      const { card } = await publishCard(state.card);
      state.card = card;
      if (firstTime) showPublishedMoment();
      else toast.show('Визитка обновлена', { ok: true });
    } catch (err) {
      toast.show(err?.message === 'card_too_large'
        ? 'Слишком тяжёлые фото, уберите одно или замените'
        : 'Не удалось опубликовать. Попробуйте ещё раз', { error: true });
    } finally {
      state.busy = false;
      rerender(node);
    }
  });

  node.querySelector('[data-rotate-key]')?.addEventListener('click', async () => {
    if (state.busy) return;
    if (!window.confirm('Сменить ключ доступа к заявкам? Старый ключ перестанет работать. Если у вас подключён Eventory Pro, после смены зайдите в Eventory по ссылке из визитки ещё раз, чтобы контакты снова открылись.')) return;
    state.busy = true;
    rerender(node);
    try {
      state.card = await rotateBusinessCardLeadKey(state.card);
      toast.show('Ключ доступа обновлён', { ok: true });
    } catch (err) {
      toast.show(err?.message === 'not_published'
        ? 'Сначала опубликуйте визитку'
        : 'Не удалось сменить ключ. Попробуйте ещё раз', { error: true });
    } finally {
      state.busy = false;
      rerender(node);
    }
  });
}

function bind(node) {
  const form = node.querySelector('[data-card-form]');
  if (!form) return;
  bindInput(node, form);
  bindSections(node);
  bindProfession(node);
  bindCover(node);
  bindGallery(node);
  bindLists(node);
  bindOccasionEditor(node, {
    card: () => state.card,
    persist,
    occasionPatch,
    listCopy,
    rerender: () => rerender(node),
    openOccasion: (id) => {
      if (id === undefined) return state.openOccasion;
      state.openOccasion = id;
      return id;
    }
  });
  bindBackup(node);
  bindPublish(node);
}

export { state as editorState, CARD_CHECKLIST };
