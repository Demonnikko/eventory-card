// Разметка разделов редактора визитки.
//
// Здесь только HTML: поля, списки, праздники. Состояние, автосохранение и
// публикация живут в editor.js. Разделы идут в том порядке, в каком визитку
// читает клиент: кто это → фото и номера → как связаться → праздники →
// почему можно доверять → форматы и что нужно от площадки.
import { escapeHtml, escapeAttr } from './shared/lib/html.js';
import { renderIcon } from './shared/components/icons.js';
import { BUSINESS_CARD_PROFESSIONS, CARD_LIMITS } from './shared/data/businessCard.js';
import { OCCASIONS, occasionTitle } from './shared/data/occasions.js';
import { activeUpsell, upsellHref } from './crm-upsell.js';

export function field({ name, label, value, type = 'text', textarea = false, rows = 3, placeholder = '', maxlength = 0, hint = '', data = '' }) {
  const attrs = [
    name ? `name="${escapeAttr(name)}"` : '',
    placeholder ? `placeholder="${escapeAttr(placeholder)}"` : '',
    maxlength ? `maxlength="${maxlength}"` : '',
    data
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

// Плитка раздела-аккордеона: иконка, название, краткое «что внутри» и статус.
export function section({ id, icon, title, sub, status = '', open, body }) {
  const bodyId = `ca-section-${id}`;
  return `
    <section class="ca-section${open ? ' is-open' : ''}" data-section="${escapeAttr(id)}">
      <button class="ca-section-head" type="button" data-toggle-section="${escapeAttr(id)}"
        aria-expanded="${open ? 'true' : 'false'}" aria-controls="${escapeAttr(bodyId)}">
        <span class="ca-section-icon" aria-hidden="true">${renderIcon(icon, { size: 20 })}</span>
        <span class="ca-section-titles">
          <span class="ca-section-title">${escapeHtml(title)}</span>
          ${sub ? `<span class="ca-section-sub">${escapeHtml(sub)}</span>` : ''}
        </span>
        ${status}
        <span class="ca-section-chevron" aria-hidden="true">${renderIcon('chevron-right', { size: 18 })}</span>
      </button>
      <div class="ca-section-body" id="${escapeAttr(bodyId)}" ${open ? '' : 'hidden'}>${body}</div>
    </section>
  `;
}

export const statusDone = '<span class="ca-section-done" role="img" aria-label="Заполнено">' + renderIcon('check', { size: 18 }) + '</span>';
export const statusNew = '<span class="ca-section-new">Новое</span>';

export function renderUpsell(pointId, leadKey) {
  const point = activeUpsell(pointId);
  if (!point) return '';
  return `
    <a class="ca-upsell" href="${escapeAttr(upsellHref(pointId, leadKey))}" target="_blank" rel="noopener">
      <span class="ca-upsell-eyebrow">${escapeHtml(point.eyebrow)}</span>
      <span class="ca-upsell-title">${escapeHtml(point.title)}</span>
      <span class="ca-upsell-text">${escapeHtml(point.text)}</span>
      <span class="ca-upsell-cta">${escapeHtml(point.cta)} ${renderIcon('chevron-right')}</span>
    </a>
  `;
}

/* ─────────── Кто вы ─────────── */

// Профессию выбирают один раз, а семь кнопок занимали четыре ряда на самом
// видном месте редактора. После выбора сворачиваем список до выбранной строки
// с «изменить» — верх экрана освобождается под собственно поля визитки.
export function renderProfessions(card, expanded = false) {
  const current = BUSINESS_CARD_PROFESSIONS.find((p) => p.id === card.profession);
  if (current && !expanded) {
    return `
      <div class="ca-chips is-picked">
        <span class="ca-chip is-active is-static">${escapeHtml(current.label)}</span>
        <button type="button" class="ca-chip-change" data-profession-edit>Изменить</button>
      </div>
    `;
  }
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

export function renderBasics(card, professionsOpen) {
  return `
    ${renderProfessions(card, professionsOpen)}
    ${field({ name: 'name', label: 'Имя', value: card.name, placeholder: 'Как вас зовут', maxlength: 80 })}
    ${field({ name: 'role', label: 'Чем занимаетесь', value: card.role, placeholder: 'Ведущий, иллюзионист, фотограф…', maxlength: 80 })}
    ${field({ name: 'city', label: 'Город', value: card.city, placeholder: 'Москва', maxlength: 80 })}
    ${field({ name: 'company', label: 'Бренд над именем', value: card.company, placeholder: 'Например: Kostyuk Project', maxlength: 40, hint: 'Небольшая надпись в верхнем углу визитки. Можно оставить пустым.' })}
    ${field({ name: 'tagline', label: 'Короткая подпись', value: card.tagline, placeholder: 'Ваши эмоции — мой главный фокус', maxlength: 90 })}
  `;
}

/* ─────────── Фото и номера ─────────── */

const COVER_POSITIONS = [
  { id: 'top', label: 'Лицо сверху' },
  { id: 'center', label: 'По центру' },
  { id: 'bottom', label: 'Ниже' }
];

export function renderMedia(card) {
  return `
    <div class="ca-cover">
      ${card.coverPhoto
        ? `<img class="ca-cover-img" src="${escapeAttr(card.coverPhoto)}" alt="Обложка визитки" />`
        : '<div class="ca-cover-empty">Главное фото — первое, что увидит клиент</div>'}
      <div class="ca-cover-actions">
        <button type="button" class="ca-btn ca-btn--ghost" data-cover-trigger>
          ${card.coverPhoto ? 'Заменить фото' : 'Добавить фото'}</button>
        <input type="file" accept="image/*" hidden data-cover-input />
        ${card.coverPhoto ? '<button type="button" class="ca-btn ca-btn--ghost" data-cover-remove>Убрать</button>' : ''}
      </div>
      ${card.coverPhoto ? `
        <div class="ca-segment" role="radiogroup" aria-label="Кадр обложки">
          ${COVER_POSITIONS.map((p) => `
            <button type="button" role="radio" aria-checked="${card.coverPosition === p.id ? 'true' : 'false'}"
              class="ca-segment-btn${card.coverPosition === p.id ? ' is-active' : ''}" data-cover-position="${p.id}">
              ${escapeHtml(p.label)}
            </button>
          `).join('')}
        </div>
      ` : ''}
    </div>
    ${field({ name: 'videoUrl', label: 'Видео выступления', value: card.videoUrl, type: 'url', placeholder: 'Ссылка на VK Видео или YouTube', hint: 'На визитке появится кнопка «Смотреть выступление».' })}
  `;
}

export function renderActs(card) {
  const photos = Array.isArray(card.galleryPhotos) ? card.galleryPhotos : [];
  const captions = Array.isArray(card.galleryCaptions) ? card.galleryCaptions : [];
  return `
    <div class="ca-gallery-editor">
      <div class="ca-editor-subhead">
        <span>Фото номеров и работ</span>
        <span>${photos.length} из ${CARD_LIMITS.gallery}</span>
      </div>
      ${photos.length ? `
        <div class="ca-gallery-list">
          ${photos.map((photo, index) => `
            <div class="ca-gallery-row">
              <img src="${escapeAttr(photo)}" alt="Фото ${index + 1}" />
              <input class="ca-input" type="text" maxlength="100"
                value="${escapeAttr(captions[index] || '')}" placeholder="Название номера"
                aria-label="Название номера ${index + 1}" data-gallery-caption="${index}" />
              <button type="button" class="ca-icon-btn" aria-label="Удалить фото ${index + 1}"
                data-gallery-remove="${index}">${renderIcon('trash')}</button>
            </div>
          `).join('')}
        </div>
      ` : '<p class="ca-note">Добавьте лучшие номера — на визитке они листаются лентой, а на страницах праздников из них выбирается фото.</p>'}
      ${photos.length < CARD_LIMITS.gallery ? `
        <button type="button" class="ca-btn ca-btn--ghost ca-gallery-add" data-gallery-trigger>
          ${renderIcon('upload')} Добавить фото</button>
        <input type="file" accept="image/*" multiple hidden data-gallery-input />
      ` : ''}
    </div>
  `;
}

/* ─────────── Контакты ─────────── */

export function renderContacts(card) {
  return `
    ${field({ name: 'phone', label: 'Телефон', value: card.phone, type: 'tel', placeholder: '+7 900 000-00-00' })}
    ${field({ name: 'telegram', label: 'Telegram', value: card.telegram, placeholder: '@username' })}
    ${field({ name: 'vk', label: 'ВКонтакте', value: card.vk, placeholder: 'vk.com/username' })}
    ${field({ name: 'max', label: 'MAX', value: card.max, placeholder: 'max.ru/u/username' })}
    ${field({ name: 'email', label: 'Почта', value: card.email, type: 'email', placeholder: 'mail@example.com' })}
    ${field({ name: 'website', label: 'Сайт', value: card.website, placeholder: 'https://' })}
  `;
}

/* ─────────── Праздники ─────────── */

// Выбор фото для праздника: обложка визитки или одно из фото номеров.
function photoPicker(card, occasionId, fieldName, selected, label) {
  const photos = card.galleryPhotos || [];
  const options = [
    { value: -1, src: card.coverPhoto, label: 'Обложка' },
    ...photos.map((src, i) => ({ value: i, src, label: card.galleryCaptions?.[i] || `Фото ${i + 1}` }))
  ];
  return `
    <fieldset class="ca-photo-pick">
      <legend class="ca-field-label">${escapeHtml(label)}</legend>
      <div class="ca-photo-pick-row">
        ${options.map((o) => `
          <button type="button" class="ca-photo-opt${o.value === selected ? ' is-active' : ''}"
            aria-pressed="${o.value === selected ? 'true' : 'false'}" aria-label="${escapeAttr(o.label)}"
            data-occ-photo="${escapeAttr(occasionId)}" data-occ-field="${escapeAttr(fieldName)}" data-value="${o.value}">
            ${o.src ? `<img src="${escapeAttr(o.src)}" alt="" />` : `<span>${escapeHtml(o.label)}</span>`}
          </button>
        `).join('')}
      </div>
    </fieldset>
  `;
}

function occasionField(occasionId, key, label, value, opts = {}) {
  return field({
    label,
    value,
    data: `data-occ="${escapeAttr(occasionId)}" data-occ-field="${escapeAttr(key)}"`,
    ...opts
  });
}

function renderOccasion(card, occasion, open) {
  const settings = card.occasions?.[occasion.id] || {};
  const on = settings.on === true;
  return `
    <div class="ca-occ${on ? ' is-on' : ''}">
      <div class="ca-occ-head">
        <button type="button" class="ca-switch" role="switch" aria-checked="${on ? 'true' : 'false'}"
          data-occ-toggle="${escapeAttr(occasion.id)}" aria-label="Показывать «${escapeAttr(occasion.title)}» на визитке">
          <span class="ca-switch-knob" aria-hidden="true"></span>
        </button>
        <span class="ca-occ-titles">
          <span class="ca-occ-title">${escapeHtml(occasion.seasonTitle ? `${occasion.title} · ${occasion.seasonTitle}` : occasion.title)}</span>
          <span class="ca-occ-sub">${on ? `/${escapeHtml(occasion.slug)}` : 'Скрыт на визитке'}</span>
        </span>
        ${on ? `
          <button type="button" class="ca-occ-more" data-occ-open="${escapeAttr(occasion.id)}"
            aria-expanded="${open ? 'true' : 'false'}">${open ? 'Свернуть' : 'Настроить'}</button>
        ` : ''}
      </div>
      ${on && open ? `
        <div class="ca-occ-body">
          ${occasionField(occasion.id, 'headline', 'Заголовок страницы', settings.headline, { placeholder: occasionTitle(occasion), maxlength: 90 })}
          ${occasionField(occasion.id, 'text', 'Пара слов под заголовком', settings.text, { textarea: true, rows: 2, maxlength: 220, placeholder: 'Для кого и в чём особенность программы' })}
          ${occasionField(occasion.id, 'note', 'Подпись на плитке', settings.note, { placeholder: occasion.note, maxlength: 60 })}
          ${photoPicker(card, occasion.id, 'photo', settings.photo ?? -1, 'Фото страницы')}
          ${occasionField(occasion.id, 'highlightTitle', 'Изюминка для этого праздника', settings.highlightTitle, { placeholder: 'Например: ваш логотип в финале', maxlength: 40 })}
          ${settings.highlightTitle ? `
            ${occasionField(occasion.id, 'highlightText', 'Чем она хороша', settings.highlightText, { textarea: true, rows: 2, maxlength: 140 })}
            ${photoPicker(card, occasion.id, 'highlightPhoto', settings.highlightPhoto ?? -1, 'Фото изюминки')}
          ` : ''}
          <a class="ca-text-link ca-occ-preview" href="#/preview/${escapeAttr(occasion.slug)}">Посмотреть страницу</a>
        </div>
      ` : ''}
    </div>
  `;
}

export function renderOccasions(card, openOccasion) {
  return `
    <p class="ca-note">Каждый праздник — своя страница: Sales присылает её ссылку, а по QR человек выбирает повод сам. Плитка того, что бронируют сейчас, на визитке самая крупная.</p>
    <div class="ca-occs">
      ${OCCASIONS.map((o) => renderOccasion(card, o, openOccasion === o.id)).join('')}
    </div>
  `;
}

/* ─────────── Списки: факты, цитаты, форматы, площадка ─────────── */

function listEditor({ list, items, limit, title, addLabel, empty, renderRow }) {
  return `
    <div class="ca-list" data-list-host="${escapeAttr(list)}">
      <div class="ca-editor-subhead">
        <span>${escapeHtml(title)}</span>
        <span>${items.length} из ${limit}</span>
      </div>
      ${items.length ? items.map((item, index) => `
        <div class="ca-list-row">
          <div class="ca-list-fields">${renderRow(item, index)}</div>
          <button type="button" class="ca-icon-btn" aria-label="Удалить" data-list-remove="${escapeAttr(list)}"
            data-index="${index}">${renderIcon('trash')}</button>
        </div>
      `).join('') : `<p class="ca-note">${escapeHtml(empty)}</p>`}
      ${items.length < limit ? `
        <button type="button" class="ca-btn ca-btn--ghost ca-list-add" data-list-add="${escapeAttr(list)}">
          ${renderIcon('plus')} ${escapeHtml(addLabel)}</button>
      ` : ''}
    </div>
  `;
}

function listInput(list, index, key, value, { placeholder, maxlength, label, textarea = false, rows = 2 }) {
  const data = `data-list="${escapeAttr(list)}" data-index="${index}" data-key="${escapeAttr(key)}"`;
  return textarea
    ? `<textarea class="ca-input" rows="${rows}" maxlength="${maxlength}" placeholder="${escapeAttr(placeholder)}" aria-label="${escapeAttr(label)}" ${data}>${escapeHtml(value || '')}</textarea>`
    : `<input class="ca-input" type="text" maxlength="${maxlength}" value="${escapeAttr(value || '')}" placeholder="${escapeAttr(placeholder)}" aria-label="${escapeAttr(label)}" ${data} />`;
}

export function renderTrust(card) {
  return `
    ${listEditor({
      list: 'facts', items: card.facts || [], limit: CARD_LIMITS.facts,
      title: 'Факты о себе', addLabel: 'Добавить факт',
      empty: 'Три коротких факта под именем: «10 лет — на сцене», «50+ — городов».',
      renderRow: (f, i) => `
        <div class="ca-list-pair">
          ${listInput('facts', i, 'value', f.value, { placeholder: '10 лет', maxlength: 12, label: 'Число или факт' })}
          ${listInput('facts', i, 'label', f.label, { placeholder: 'на сцене', maxlength: 24, label: 'Подпись' })}
        </div>
      `
    })}
    ${field({ name: 'clients', label: 'Среди клиентов', value: card.clients, placeholder: 'Газпром · Магнит · Danone', maxlength: 160, hint: 'Компании, для которых вы работали, через точку.' })}
    ${listEditor({
      list: 'quotes', items: card.quotes || [], limit: CARD_LIMITS.quotes,
      title: 'Слова клиентов', addLabel: 'Добавить отзыв',
      empty: 'Короткие текстовые отзывы — рядом с видеоотзывами.',
      renderRow: (q, i) => `
        ${listInput('quotes', i, 'text', q.text, { placeholder: 'Что сказал клиент', maxlength: 220, label: 'Текст отзыва', textarea: true })}
        ${listInput('quotes', i, 'author', q.author, { placeholder: 'Кто сказал', maxlength: 60, label: 'Автор' })}
      `
    })}
  `;
}

export function renderProgram(card, leadKey) {
  return `
    ${listEditor({
      list: 'formats', items: card.formats || [], limit: CARD_LIMITS.formats,
      title: 'Форматы', addLabel: 'Добавить формат',
      empty: 'Например: «20 минут — Сценический блок — три номера». Цены здесь нет: её вы назовёте под дату.',
      renderRow: (f, i) => `
        <div class="ca-list-pair ca-list-pair--time">
          ${listInput('formats', i, 'minutes', f.minutes, { placeholder: '20', maxlength: 6, label: 'Минут' })}
          ${listInput('formats', i, 'title', f.title, { placeholder: 'Сценический блок', maxlength: 48, label: 'Название формата' })}
        </div>
        ${listInput('formats', i, 'description', f.description, { placeholder: 'Что входит', maxlength: 90, label: 'Что входит' })}
      `
    })}
    ${listEditor({
      list: 'requirements', items: card.requirements || [], limit: CARD_LIMITS.requirements,
      title: 'Что нужно от площадки', addLabel: 'Добавить пункт',
      empty: 'Сцена, звук, свет, гримёрка — организатору спокойнее, когда это видно заранее.',
      renderRow: (r, i) => `
        ${listInput('requirements', i, 'title', r.title, { placeholder: 'Звук', maxlength: 24, label: 'Что нужно' })}
        ${listInput('requirements', i, 'text', r.text, { placeholder: 'Колонки для моего микрофона', maxlength: 70, label: 'Подробнее' })}
      `
    })}
    ${field({ name: 'requirementsNote', label: 'Что привозите с собой', value: card.requirementsNote, placeholder: 'Микрофон и реквизит привожу с собой', maxlength: 120 })}
    ${renderUpsell('quote', leadKey)}
  `;
}
