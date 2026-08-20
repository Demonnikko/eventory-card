// Редактор визитки — главный экран бесплатного приложения.
//
// Отличие от редактора в CRM: без разделов Pro, без Telegram-синхронизации,
// без лидов внутри. Всё, что требует системы, вынесено в блоки CRM.
import { escapeHtml, escapeAttr } from './shared/lib/html.js';
import { renderIcon } from './shared/components/icons.js';
import { toast } from './shared/components/toast.js';
import {
  compressImage,
  BUSINESS_CARD_PROFESSIONS,
  BUSINESS_CARD_GALLERY_MAX_BYTES,
  rotateBusinessCardLeadKey
} from './shared/data/businessCard.js';
import { getCard, saveCard, publishCard, cardCompletion, CARD_CHECKLIST } from './card-data.js';
import { createCardDraft } from './editor-draft.js';
import {
  BACKUP_MAX_BYTES,
  createEncryptedBackup,
  restoreEncryptedBackup,
  downloadBackupFile
} from './card-backup.js';
import { activeUpsell, upsellHref, CRM_NAME } from './crm-upsell.js';

const state = {
  card: null,
  busy: false,
  openSection: 'basics'
};

let draft = null;

function field({ name, label, value, type = 'text', textarea = false, rows = 3, placeholder = '', maxlength = 0, hint = '' }) {
  const attrs = [
    `name="${escapeAttr(name)}"`,
    placeholder ? `placeholder="${escapeAttr(placeholder)}"` : '',
    maxlength ? `maxlength="${maxlength}"` : ''
  ].filter(Boolean).join(' ');
  const control = textarea
    ? `<textarea class="ca-input" rows="${rows}" ${attrs}>${escapeHtml(value || '')}</textarea>`
    : `<input class="ca-input" type="${escapeAttr(type)}" value="${escapeAttr(value || '')}" ${attrs} />`;
  return `
    <label class="ca-field">
      <span class="ca-field-label">${escapeHtml(label)}</span>
      ${control}
      ${hint ? `<span class="ca-field-hint">${escapeHtml(hint)}</span>` : ''}
    </label>
  `;
}

function section({ id, title, sub, body }) {
  const open = state.openSection === id;
  const bodyId = `ca-section-${id}`;
  return `
    <section class="ca-section${open ? ' is-open' : ''}" data-section="${escapeAttr(id)}">
      <button class="ca-section-head" type="button" data-toggle-section="${escapeAttr(id)}"
        aria-expanded="${open ? 'true' : 'false'}" aria-controls="${escapeAttr(bodyId)}">
        <span class="ca-section-titles">
          <span class="ca-section-title">${escapeHtml(title)}</span>
          ${sub ? `<span class="ca-section-sub">${escapeHtml(sub)}</span>` : ''}
        </span>
        <span class="ca-section-chevron" aria-hidden="true">${renderIcon('chevron-right')}</span>
      </button>
      <div class="ca-section-body" id="${escapeAttr(bodyId)}" ${open ? '' : 'hidden'}>${body}</div>
    </section>
  `;
}

function renderProgress(card) {
  const { done, total, percent, missing } = cardCompletion(card);
  return `
    <div class="ca-progress">
      <div class="ca-progress-top">
        <span class="ca-progress-label">Готовность визитки</span>
        <span class="ca-progress-value">${done} из ${total}</span>
      </div>
      <div class="ca-progress-bar"><span style="width:${percent}%"></span></div>
      ${missing.length
        ? `<div class="ca-progress-missing">Осталось: ${missing.map((m) => escapeHtml(m.label)).join(', ')}</div>`
        : '<div class="ca-progress-missing is-done">Визитка заполнена — можно публиковать</div>'}
    </div>
  `;
}

// Блок перехода в CRM. Намеренно оформлен как подсказка, а не как замок:
// пользователь ничего не теряет, ему показывают следующий шаг.
function renderUpsell(pointId) {
  const point = activeUpsell(pointId);
  if (!point) return '';
  return `
    <a class="ca-upsell" href="${escapeAttr(upsellHref(pointId, state.card?.leadKey))}" target="_blank" rel="noopener">
      <span class="ca-upsell-eyebrow">${escapeHtml(point.eyebrow)}</span>
      <span class="ca-upsell-title">${escapeHtml(point.title)}</span>
      <span class="ca-upsell-text">${escapeHtml(point.text)}</span>
      <span class="ca-upsell-cta">${escapeHtml(point.cta)} ${renderIcon('chevron-right')}</span>
    </a>
  `;
}

function renderCover(card) {
  return `
    <div class="ca-cover">
      ${card.coverPhoto
        ? `<img class="ca-cover-img" src="${escapeAttr(card.coverPhoto)}" alt="" />`
        : '<div class="ca-cover-empty">Фото или обложка</div>'}
      <div class="ca-cover-actions">
        <button type="button" class="ca-btn ca-btn--ghost" data-cover-trigger>
          ${card.coverPhoto ? 'Заменить фото' : 'Добавить фото'}</button>
        <input type="file" accept="image/*" hidden data-cover-input />
        ${card.coverPhoto ? '<button type="button" class="ca-btn ca-btn--ghost" data-cover-remove>Убрать</button>' : ''}
      </div>
    </div>
  `;
}

function renderGallery(card) {
  const photos = Array.isArray(card.galleryPhotos) ? card.galleryPhotos : [];
  const captions = Array.isArray(card.galleryCaptions) ? card.galleryCaptions : [];
  return `
    <div class="ca-gallery-editor">
      <div class="ca-editor-subhead">
        <span>Галерея работ</span>
        <span>${photos.length} из 6</span>
      </div>
      ${photos.length ? `
        <div class="ca-gallery-list">
          ${photos.map((photo, index) => `
            <div class="ca-gallery-row">
              <img src="${escapeAttr(photo)}" alt="Работа ${index + 1}" />
              <input class="ca-input" type="text" maxlength="100"
                value="${escapeAttr(captions[index] || '')}" placeholder="Подпись к работе"
                aria-label="Подпись к работе ${index + 1}" data-gallery-caption="${index}" />
              <button type="button" class="ca-icon-btn" aria-label="Удалить работу ${index + 1}"
                data-gallery-remove="${index}">${renderIcon('trash')}</button>
            </div>
          `).join('')}
        </div>
      ` : '<p class="ca-note">Добавьте лучшие работы — они появятся отдельной галереей на визитке.</p>'}
      ${photos.length < 6 ? `
        <button type="button" class="ca-btn ca-btn--ghost ca-gallery-add" data-gallery-trigger>
          ${renderIcon('upload')} Добавить фото</button>
        <input type="file" accept="image/*" multiple hidden data-gallery-input />
      ` : ''}
    </div>
  `;
}

function renderServicePackages(card) {
  const packages = Array.isArray(card.servicePackages) ? card.servicePackages : [];
  return `
    <div class="ca-packages">
      <div class="ca-editor-subhead">
        <span>Пакеты услуг</span>
        <span>${packages.length} из 3</span>
      </div>
      ${packages.map((item, index) => `
        <div class="ca-package">
          <div class="ca-package-head">
            <span>Пакет ${index + 1}</span>
            <button type="button" class="ca-icon-btn" aria-label="Удалить пакет ${index + 1}"
              data-package-remove="${index}">${renderIcon('trash')}</button>
          </div>
          <input class="ca-input" type="text" maxlength="80" value="${escapeAttr(item.title || '')}"
            placeholder="Название" aria-label="Название пакета ${index + 1}"
            data-package-index="${index}" data-package-field="title" />
          <input class="ca-input" type="text" maxlength="40" value="${escapeAttr(item.price || '')}"
            placeholder="Цена" aria-label="Цена пакета ${index + 1}"
            data-package-index="${index}" data-package-field="price" />
          <textarea class="ca-input" rows="2" maxlength="180" placeholder="Что входит"
            aria-label="Описание пакета ${index + 1}" data-package-index="${index}"
            data-package-field="description">${escapeHtml(item.description || '')}</textarea>
        </div>
      `).join('')}
      ${packages.length < 3
        ? '<button type="button" class="ca-btn ca-btn--ghost ca-package-add" data-package-add>Добавить пакет</button>'
        : ''}
    </div>
  `;
}

function renderProfessions(card) {
  return `
    <div class="ca-chips">
      ${BUSINESS_CARD_PROFESSIONS.map((p) => `
        <button type="button" class="ca-chip${card.profession === p.id ? ' is-active' : ''}" data-profession="${escapeAttr(p.id)}">
          ${escapeHtml(p.label)}
        </button>
      `).join('')}
    </div>
  `;
}

function renderPublishBar(card) {
  const published = Boolean(card.publishedSlug);
  return `
    <div class="ca-publish">
      ${published
        ? `<div class="ca-publish-live">
             <span class="ca-publish-dot" aria-hidden="true"></span>
             <span>Визитка опубликована</span>
           </div>`
        : '<div class="ca-publish-hint">Опубликуйте — получите ссылку и QR-код</div>'}
      <button type="button" class="ca-btn ca-btn--primary" data-publish ${state.busy ? 'disabled' : ''}>
        ${state.busy ? 'Публикуем…' : (published ? 'Обновить визитку' : 'Опубликовать визитку')}
      </button>
      ${published ? '<button type="button" class="ca-btn ca-btn--ghost" data-open-share>Ссылка и QR-код</button>' : ''}
      ${published ? '<button type="button" class="ca-key-rotate" data-rotate-key>Сменить ключ доступа</button>' : ''}
    </div>
  `;
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
    <form class="ca-form" data-card-form>
      ${renderProgress(card)}

      ${section({
        id: 'basics',
        title: 'Кто вы',
        sub: 'Имя, специализация, город',
        body: `
          ${renderProfessions(card)}
          ${field({ name: 'name', label: 'Имя', value: card.name, placeholder: 'Как вас зовут', maxlength: 80 })}
          ${field({ name: 'role', label: 'Чем занимаетесь', value: card.role, placeholder: 'Ведущий, фотограф, декоратор…', maxlength: 80 })}
          ${field({ name: 'city', label: 'Город', value: card.city, placeholder: 'Москва', maxlength: 80 })}
          ${field({ name: 'tagline', label: 'Короткая подпись', value: card.tagline, placeholder: 'Свадьбы и корпоративы под ключ', maxlength: 90 })}
        `
      })}

      ${section({
        id: 'look',
        title: 'Оформление',
        sub: 'Фото и галерея',
        body: `${renderCover(card)}${renderGallery(card)}`
      })}

      ${section({
        id: 'contacts',
        title: 'Контакты',
        sub: 'Как с вами связаться',
        body: `
          ${field({ name: 'phone', label: 'Телефон', value: card.phone, type: 'tel', placeholder: '+7 900 000-00-00' })}
          ${field({ name: 'telegram', label: 'Telegram', value: card.telegram, placeholder: '@username' })}
          ${field({ name: 'vk', label: 'ВКонтакте', value: card.vk, placeholder: 'vk.com/username' })}
          ${field({ name: 'max', label: 'MAX', value: card.max, placeholder: 'max.ru/u/username' })}
          ${field({ name: 'email', label: 'Email', value: card.email, type: 'email', placeholder: 'mail@example.com' })}
          ${field({ name: 'website', label: 'Сайт или соцсеть', value: card.website, placeholder: 'https://' })}
        `
      })}

      ${section({
        id: 'about',
        title: 'О себе и услуги',
        sub: 'Что вы делаете и сколько это стоит',
        body: `
          ${field({ name: 'bio', label: 'О себе', value: card.bio, textarea: true, rows: 5, maxlength: 800, placeholder: 'Коротко о вашем опыте' })}
          ${field({ name: 'services', label: 'Услуги', value: card.services, textarea: true, rows: 4, maxlength: 800, placeholder: 'Каждая услуга с новой строки' })}
          ${field({ name: 'priceFrom', label: 'Цена от', value: card.priceFrom, placeholder: '30 000 ₽', maxlength: 40 })}
          ${renderServicePackages(card)}
          ${renderUpsell('quote')}
        `
      })}

      ${section({
        id: 'leads',
        title: 'Заявки',
        sub: 'Что происходит после клика',
        body: `
          ${field({ name: 'ctaText', label: 'Текст кнопки', value: card.ctaText, placeholder: 'Оставить заявку', maxlength: 40 })}
          <p class="ca-note">Клиент нажимает кнопку и пишет вам напрямую — в Telegram или по телефону. Это работает бесплатно и без ограничений.</p>
          ${field({ name: 'offerText', label: 'Спецпредложение для «горячих»', value: card.offerText, textarea: true, rows: 2, maxlength: 140, placeholder: 'Скидка 10% при брони на этой неделе', hint: 'Гостю, кто заходил несколько раз, но молчит, визитка сама покажет это предложение — чтобы он оставил контакт. Пишите своё условие; пусто — предложение не показывается.' })}
          ${renderUpsell('leads')}
        `
      })}

      ${section({
        id: 'backup',
        title: 'Резервная копия',
        sub: 'Перенос и восстановление',
        body: renderBackup()
      })}

      ${renderPublishBar(card)}
    </form>
  `;
}

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

export const editor = {
  id: 'editor',
  title: 'Моя визитка',
  render() {
    return renderContent();
  },
  async mount(node) {
    state.card = await getCard();
    draft = createCardDraft(state.card, { save: saveCard });
    state.card = draft.card;
    node.innerHTML = renderContent();
    bind(node);
  },
  async unmount() {
    await flushDraft();
  }
};

function rerender(node) {
  node.innerHTML = renderContent();
  bind(node);
}

function bind(node) {
  const form = node.querySelector('[data-card-form]');
  if (!form) return;

  // Автосохранение: пользователь бесплатного продукта не должен думать
  // о кнопке «Сохранить» — карточка живёт локально и пишется сразу.
  form.addEventListener('input', (e) => {
    const el = e.target;
    if (el.dataset.packageField) {
      const index = Number(el.dataset.packageIndex);
      const packages = state.card.servicePackages.map((item) => ({ ...item }));
      packages[index] = { ...(packages[index] || {}), [el.dataset.packageField]: el.value };
      updateDraft({ servicePackages: packages });
    } else if (el.dataset.galleryCaption != null) {
      const captions = [...state.card.galleryCaptions];
      captions[Number(el.dataset.galleryCaption)] = el.value;
      updateDraft({ galleryCaptions: captions });
    } else if (el.name) {
      updateDraft({ [el.name]: el.value });
    } else {
      return;
    }
    const bar = node.querySelector('.ca-progress');
    if (bar) bar.outerHTML = renderProgress(state.card);
  });

  // Blur/change — естественная граница поля. Записываем сразу, чтобы даже
  // закрытие вкладки сразу после ввода не оставляло значение только в таймере.
  form.addEventListener('change', () => {
    flushDraft().catch(() => {
      toast.show('Не удалось сохранить изменение', { error: true });
    });
  });

  node.querySelectorAll('[data-toggle-section]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.toggleSection;
      state.openSection = state.openSection === id ? '' : id;
      // Раньше переключение секции перерисовывало ВСЮ форму (node.innerHTML):
      // она мигала, скролл прыгал, галерея с фото пересоздавалась ради
      // открытия текстовой секции. Теперь просто показываем/прячем тела
      // секций — форма остаётся на месте.
      node.querySelectorAll('.ca-section').forEach((sec) => {
        const open = sec.dataset.section === state.openSection;
        sec.classList.toggle('is-open', open);
        const body = sec.querySelector('.ca-section-body');
        if (body) body.hidden = !open;
        const head = sec.querySelector('[data-toggle-section]');
        if (head) head.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
    });
  });

  node.querySelectorAll('[data-profession]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const next = state.card.profession === btn.dataset.profession ? '' : btn.dataset.profession;
      await persist({ profession: next });
      rerender(node);
    });
  });

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
        toast.show('Не удалось обработать фото');
      }
    });
  }

  const coverRemove = node.querySelector('[data-cover-remove]');
  if (coverRemove) {
    coverRemove.addEventListener('click', async () => {
      await persist({ coverPhoto: '' });
      rerender(node);
    });
  }

  const galleryInput = node.querySelector('[data-gallery-input]');
  if (galleryInput) {
    node.querySelector('[data-gallery-trigger]')?.addEventListener('click', () => galleryInput.click());
    galleryInput.addEventListener('change', async () => {
      const remaining = 6 - state.card.galleryPhotos.length;
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
        await persist({
          galleryPhotos: [...state.card.galleryPhotos, ...additions],
          galleryCaptions: [...state.card.galleryCaptions, ...additions.map(() => '')]
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
      await persist({
        galleryPhotos: state.card.galleryPhotos.filter((_, i) => i !== index),
        galleryCaptions: state.card.galleryCaptions.filter((_, i) => i !== index)
      });
      rerender(node);
    });
  });

  const packageAdd = node.querySelector('[data-package-add]');
  if (packageAdd) {
    packageAdd.addEventListener('click', async () => {
      const number = state.card.servicePackages.length + 1;
      await persist({
        servicePackages: [...state.card.servicePackages, {
          title: `Пакет ${number}`,
          price: '',
          description: ''
        }]
      });
      rerender(node);
    });
  }

  node.querySelectorAll('[data-package-remove]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const index = Number(btn.dataset.packageRemove);
      await persist({ servicePackages: state.card.servicePackages.filter((_, i) => i !== index) });
      rerender(node);
    });
  });

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

  const publishBtn = node.querySelector('[data-publish]');
  if (publishBtn) {
    publishBtn.addEventListener('click', async () => {
      if (state.busy) return;
      try {
        await flushDraft();
      } catch {
        toast.show('Не удалось сохранить визитку', { error: true });
        return;
      }
      if (!state.card.name) {
        toast.show('Добавьте имя — без него визитку не опубликовать');
        return;
      }
      if (!state.card.phone && !state.card.telegram && !state.card.email) {
        toast.show('Добавьте телефон, Telegram или email для связи');
        return;
      }
      state.busy = true;
      rerender(node);
      try {
        const { card } = await publishCard(state.card);
        state.card = card;
        toast.show('Визитка опубликована');
      } catch (err) {
        toast.show(err?.message === 'card_too_large'
          ? 'Слишком тяжёлое фото — уменьшите его'
          : 'Не удалось опубликовать. Попробуйте ещё раз', { error: true });
      } finally {
        state.busy = false;
        rerender(node);
      }
    });
  }

  const shareBtn = node.querySelector('[data-open-share]');
  if (shareBtn) {
    shareBtn.addEventListener('click', () => {
      window.location.hash = '#/share';
    });
  }

  const rotateBtn = node.querySelector('[data-rotate-key]');
  if (rotateBtn) {
    rotateBtn.addEventListener('click', async () => {
      if (state.busy) return;
      if (!window.confirm('Сменить ключ доступа к заявкам? Старый ключ перестанет работать. Если у вас подключён Eventory Pro — после смены зайдите в Eventory по ссылке из визитки ещё раз, чтобы контакты снова открылись.')) return;
      state.busy = true;
      rerender(node);
      try {
        const card = await rotateBusinessCardLeadKey(state.card);
        state.card = card;
        toast.show('Ключ доступа обновлён');
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
}

export { state as editorState, CRM_NAME, CARD_CHECKLIST };
