// Редактор визитки — главный экран бесплатного приложения.
//
// Отличие от редактора в CRM: без разделов Pro, без Telegram-синхронизации,
// без лидов внутри. Всё, что требует системы, вынесено в блоки CRM.
import { escapeHtml, escapeAttr } from './shared/lib/html.js';
import { renderIcon } from './shared/components/icons.js';
import { toast } from './shared/components/toast.js';
import { compressImage, BUSINESS_CARD_PROFESSIONS } from './shared/data/businessCard.js';
import { getCard, saveCard, publishCard, cardCompletion, CARD_CHECKLIST } from './card-data.js';
import { activeUpsell, upsellHref, CRM_NAME } from './crm-upsell.js';

const THEME_OPTIONS = [
  { id: 'gold', label: 'Золото' },
  { id: 'blue', label: 'Синий' },
  { id: 'platinum', label: 'Платина' },
  { id: 'graphite', label: 'Графит' }
];

const state = {
  card: null,
  busy: false,
  openSection: 'basics'
};

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
  return `
    <section class="ca-section${open ? ' is-open' : ''}" data-section="${escapeAttr(id)}">
      <button class="ca-section-head" type="button" data-toggle-section="${escapeAttr(id)}">
        <span class="ca-section-titles">
          <span class="ca-section-title">${escapeHtml(title)}</span>
          ${sub ? `<span class="ca-section-sub">${escapeHtml(sub)}</span>` : ''}
        </span>
        <span class="ca-section-chevron" aria-hidden="true">${renderIcon('chevron-right')}</span>
      </button>
      <div class="ca-section-body" ${open ? '' : 'hidden'}>${body}</div>
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
    <a class="ca-upsell" href="${escapeAttr(upsellHref(pointId))}" target="_blank" rel="noopener">
      <span class="ca-upsell-eyebrow">${escapeHtml(point.eyebrow)}</span>
      <span class="ca-upsell-title">${escapeHtml(point.title)}</span>
      <span class="ca-upsell-text">${escapeHtml(point.text)}</span>
      <span class="ca-upsell-cta">${escapeHtml(point.cta)} ${renderIcon('chevron-right')}</span>
    </a>
  `;
}

function renderThemes(card) {
  return `
    <div class="ca-themes">
      ${THEME_OPTIONS.map((t) => `
        <button type="button" class="ca-theme ca-theme--${t.id}${card.theme === t.id ? ' is-active' : ''}" data-theme="${escapeAttr(t.id)}">
          <span class="ca-theme-swatch" aria-hidden="true"></span>
          <span class="ca-theme-label">${escapeHtml(t.label)}</span>
        </button>
      `).join('')}
    </div>
  `;
}

function renderCover(card) {
  return `
    <div class="ca-cover">
      ${card.coverPhoto
        ? `<img class="ca-cover-img" src="${escapeAttr(card.coverPhoto)}" alt="" />`
        : '<div class="ca-cover-empty">Фото или обложка</div>'}
      <div class="ca-cover-actions">
        <label class="ca-btn ca-btn--ghost">
          ${card.coverPhoto ? 'Заменить фото' : 'Добавить фото'}
          <input type="file" accept="image/*" hidden data-cover-input />
        </label>
        ${card.coverPhoto ? '<button type="button" class="ca-btn ca-btn--ghost" data-cover-remove>Убрать</button>' : ''}
      </div>
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
        sub: 'Фото и цвет',
        body: `${renderCover(card)}${renderThemes(card)}`
      })}

      ${section({
        id: 'contacts',
        title: 'Контакты',
        sub: 'Как с вами связаться',
        body: `
          ${field({ name: 'phone', label: 'Телефон', value: card.phone, type: 'tel', placeholder: '+7 900 000-00-00' })}
          ${field({ name: 'telegram', label: 'Telegram', value: card.telegram, placeholder: '@username' })}
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
          ${renderUpsell('leads')}
        `
      })}

      ${renderPublishBar(card)}
    </form>
  `;
}

async function persist(patch) {
  state.card = await saveCard({ ...state.card, ...patch });
}

export const editor = {
  id: 'editor',
  title: 'Моя визитка',
  render() {
    return renderContent();
  },
  async mount(node) {
    state.card = await getCard();
    node.innerHTML = renderContent();
    bind(node);
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
  let saveTimer = null;
  form.addEventListener('input', (e) => {
    const el = e.target;
    if (!el.name) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      await persist({ [el.name]: el.value });
      const bar = node.querySelector('.ca-progress');
      if (bar) bar.outerHTML = renderProgress(state.card);
    }, 350);
  });

  node.querySelectorAll('[data-toggle-section]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.toggleSection;
      state.openSection = state.openSection === id ? '' : id;
      rerender(node);
    });
  });

  node.querySelectorAll('[data-theme]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await persist({ theme: btn.dataset.theme });
      rerender(node);
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

  const publishBtn = node.querySelector('[data-publish]');
  if (publishBtn) {
    publishBtn.addEventListener('click', async () => {
      if (state.busy) return;
      if (!state.card.name) {
        toast.show('Добавьте имя — без него визитку не опубликовать');
        return;
      }
      state.busy = true;
      rerender(node);
      try {
        const { card } = await publishCard(state.card);
        state.card = card;
        toast.show('Визитка опубликована');
      } catch (err) {
        toast(err?.message === 'card_too_large'
          ? 'Слишком тяжёлое фото — уменьшите его'
          : 'Не удалось опубликовать. Попробуйте ещё раз');
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
}

export { state as editorState, CRM_NAME, CARD_CHECKLIST };
