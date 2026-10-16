// Общие детали клиентской визитки: шапка, форматы, отзывы, площадка,
// контакты. Ими пользуются и главная (card-view.js), и страница праздника
// (occasion-view.js) — один вид, одни ссылки, одна защита от чужих адресов.
import { escapeHtml, escapeAttr } from './shared/lib/html.js';
import { renderIcon, renderBrandIcon, hasBrandIcon } from './shared/components/icons.js';
import { businessCardTemplateUrl } from './shared/data/businessCard.js';

export const OCCASION_ICONS = {
  corporate: 'briefcase',
  graduation: 'cap',
  wedding: 'rings'
};

export function occasionIcon(occasion) {
  return OCCASION_ICONS[occasion?.id] || 'sparkle';
}

// Блоки всплывают по очереди: номер растёт на каждой странице заново.
let revealIndex = 0;
export function resetReveal() {
  revealIndex = 0;
}
export function reveal() {
  revealIndex += 1;
  return `data-reveal style="--reveal-order:${Math.min(revealIndex, 12)}"`;
}

/* ─────────── Ссылки ─────────── */

function telegramHref(value) {
  const handle = String(value || '').replace(/^https?:\/\/t\.me\//i, '').replace(/^@/, '');
  return handle ? `https://t.me/${encodeURIComponent(handle)}` : '';
}

// ВКонтакте: принимаем и полную ссылку, и короткое имя (id/vk.com/…).
function vkHref(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  const handle = raw.replace(/^@/, '').replace(/^vk\.(com|ru)\//i, '');
  return handle ? `https://vk.com/${encodeURIComponent(handle)}` : '';
}

// MAX (российский мессенджер): ссылка вида max.ru/u/<username> или полная.
function maxHref(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  const handle = raw.replace(/^@/, '').replace(/^max\.ru\/(u\/)?/i, '');
  return handle ? `https://max.ru/u/${encodeURIComponent(handle)}` : '';
}

// Сайт и ссылка на видео: в поле можно вписать что угодно, а значение уходит
// прямо в href. Пропускаем только http(s) — иначе строка «javascript:…» стала
// бы исполняемой ссылкой на публичной странице. Домен без схемы дополняем.
export function safeHref(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return '';
  return `https://${raw}`;
}

export function phoneHref(phone) {
  const digits = String(phone || '').replace(/[^\d+]/g, '');
  return digits ? `tel:${digits}` : '';
}

function contactIcon(name) {
  if (hasBrandIcon(name)) {
    return `<span class="vz-contact-icon">${renderBrandIcon(name, { size: 28 })}</span>`;
  }
  return `<span class="vz-contact-icon is-glyph">${renderIcon(name, { size: 16 })}</span>`;
}

function contactItems(card) {
  const items = [];
  const tel = phoneHref(card.phone);
  if (tel) items.push({ icon: 'phone', label: 'Позвонить', href: tel });
  const tg = telegramHref(card.telegram);
  if (tg) items.push({ icon: 'telegram', label: 'Telegram', href: tg });
  const vk = vkHref(card.vk);
  if (vk) items.push({ icon: 'vk', label: 'ВКонтакте', href: vk });
  const max = maxHref(card.max);
  if (max) items.push({ icon: 'max', label: 'MAX', href: max });
  if (card.email) items.push({ icon: 'note', label: 'Почта', href: `mailto:${card.email}` });
  const site = safeHref(card.website);
  if (site) items.push({ icon: 'externalLink', label: 'Сайт', href: site });
  return items;
}

/* ─────────── Фото ─────────── */

// -1 — обложка визитки, 0…5 — фото из «Номеров».
export function photoAt(card, index) {
  if (index >= 0) return String(card.galleryPhotos?.[index] || '');
  return String(card.coverPhoto || '');
}

// Фото блока, где -1 значит «без фото» (момент, изюминка), а не обложку.
export function optionalPhoto(card, index) {
  return index >= 0 ? photoAt(card, index) : '';
}

// Кадр обложки: «лицо сверху», центр или ниже. Принимает визитку или
// настройки праздника — у обоих поле coverPosition.
export function coverPositionValue(source) {
  return { top: 'center 18%', center: 'center', bottom: 'center 82%' }[source?.coverPosition] || 'center 18%';
}

/* ─────────── Шапка ─────────── */

function renderPlay(videoUrl) {
  const href = safeHref(videoUrl);
  if (!href) return '';
  return `
    <a class="vz-play" href="${escapeAttr(href)}" target="_blank" rel="noopener" data-video-open data-video-url="${escapeAttr(href)}">
      <span class="vz-play-dot" aria-hidden="true">${renderIcon('play', { size: 12 })}</span>
      Смотреть выступление
    </a>
  `;
}

export function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '';
  return ((parts[0][0] || '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

function renderHeroMedia(card, photo, position) {
  if (photo) {
    return `
      <img class="vz-hero-img" src="${escapeAttr(photo)}" alt="" fetchpriority="high"
        style="object-position:${escapeAttr(position)}" />
    `;
  }
  // Без фото — фактура выбранного направления и монограмма: шапка не пустая.
  const template = card.profession ? businessCardTemplateUrl(card.profession) : '';
  return `
    <span class="vz-hero-texture" aria-hidden="true"
      ${template ? `style="--vz-texture:url('${escapeAttr(template)}')"` : ''}></span>
    <span class="vz-hero-monogram" aria-hidden="true">${escapeHtml(initials(card.name))}</span>
  `;
}

// overlay — праздничная анимация (occasion-fx.js): между фото и текстом.
export function renderHero(card, { photo, position, top, chip = '', eyebrow, title, titleClass, lead, video, overlay = '' }) {
  return `
    <header class="vz-hero${photo ? ' has-photo' : ' is-plain'}">
      <div class="vz-hero-media" aria-hidden="${photo ? 'false' : 'true'}">
        ${renderHeroMedia(card, photo, position)}
        <span class="vz-hero-veil" aria-hidden="true"></span>
      </div>
      ${overlay}
      <div class="vz-hero-top">${top}</div>
      <div class="vz-hero-copy">
        ${chip ? `<span class="vz-chip vz-chip--solid" ${reveal()}>${escapeHtml(chip)}</span>` : ''}
        ${eyebrow ? `<span class="vz-eyebrow" ${reveal()}>${escapeHtml(eyebrow)}</span>` : ''}
        <h1 class="${titleClass}" ${reveal()}>${escapeHtml(title)}</h1>
        ${lead ? `<p class="vz-lead" ${reveal()}>${escapeHtml(lead)}</p>` : ''}
        <div ${reveal()}>${renderPlay(video ?? card.videoUrl)}</div>
      </div>
    </header>
  `;
}

export function brandMark(card) {
  return card.company ? `<span class="vz-brand">${escapeHtml(card.company)}</span>` : '<span></span>';
}

// Заголовок экрана как у слайда презентации: мелкая строка-раздел и крупный
// заголовок Prata. На главной кикер не нужен — там короткие заголовки.
export function sectionHead({ kicker = '', title, sub = '' }) {
  return `
    ${kicker ? `<span class="vz-kicker vz-section-kicker">${escapeHtml(kicker)}</span>` : ''}
    <h2 class="vz-h2">${escapeHtml(title)}</h2>
    ${sub ? `<p class="vz-sub">${escapeHtml(sub)}</p>` : ''}
  `;
}

/* ─────────── Доверие ─────────── */

export function renderFactsRow(card) {
  const facts = (card.facts || []).filter((f) => f.value);
  if (!facts.length) return '';
  return `
    <div class="vz-facts" style="--cols:${facts.length}" ${reveal()}>
      ${facts.map((f) => `
        <div class="vz-fact">
          <span class="vz-fact-value">${escapeHtml(f.value)}</span>
          ${f.label ? `<span class="vz-fact-label">${escapeHtml(f.label)}</span>` : ''}
        </div>
      `).join('')}
    </div>
  `;
}

export function renderClientsLine(card) {
  if (!card.clients) return '';
  return `
    <p class="vz-clients" ${reveal()}>
      <span>Среди клиентов:</span> ${escapeHtml(card.clients)}
    </p>
  `;
}

/* ─────────── Программа ─────────── */

export function renderFormats(card, head = { title: 'Форматы' }) {
  const formats = (card.formats || []).filter((f) => f.title);
  if (!formats.length) return '';
  return `
    <section class="vz-section" data-section="Форматы" ${reveal()}>
      ${sectionHead(head)}
      <div class="vz-formats">
        ${formats.map((f) => `
          <div class="vz-format">
            ${f.minutes ? `
              <span class="vz-format-time">
                <span class="vz-format-min">${escapeHtml(f.minutes)}</span>
                <span class="vz-format-unit">минут</span>
              </span>
            ` : ''}
            <span class="vz-format-copy">
              <span class="vz-format-title">${escapeHtml(f.title)}</span>
              ${f.description ? `<span class="vz-format-desc">${escapeHtml(f.description)}</span>` : ''}
            </span>
          </div>
        `).join('')}
      </div>
      <p class="vz-footnote">Состав и время выхода согласуем заранее.</p>
    </section>
  `;
}

// Лента номеров для главной без праздников: фото с названием.
export function renderActsStrip(card) {
  const photos = (card.galleryPhotos || []).filter(Boolean);
  if (!photos.length) return '';
  const captions = card.galleryCaptions || [];
  return `
    <section class="vz-section vz-section--bleed" data-section="Номера" ${reveal()}>
      <h2 class="vz-h2">Номера</h2>
      <div class="vz-strip" role="list">
        ${photos.map((src, i) => `
          <figure class="vz-act vz-act--clickable" role="button" tabindex="0" data-act-open="${i}" aria-label="${escapeAttr(captions[i] || `Номер ${i + 1}`)} — подробнее">
            <img src="${escapeAttr(src)}" alt="${escapeAttr(captions[i] || `Номер ${i + 1}`)}" loading="lazy" />
            <div class="vz-act-info">
              ${captions[i] ? `<figcaption>${escapeHtml(captions[i])}</figcaption>` : ''}
              <span class="vz-act-badge">Подробнее</span>
            </div>
          </figure>
        `).join('')}
      </div>
    </section>
  `;
}

// Отзывы: видео-кружки приходят с сервера позже карточки (их вставляет
// reviews-view.js в [data-reels-host]), текстовые цитаты лежат в самой
// визитке. Секция есть в разметке всегда, а прячется, пока ей нечего показать.
// На странице праздника — отзывы этого праздника и общие, свои первыми.
export function renderReviews(card, { occasionId = '', head = { title: 'Отзывы' } } = {}) {
  const all = (card.quotes || []).filter((q) => q.text);
  const quotes = occasionId
    ? [
      ...all.filter((q) => q.occasion === occasionId),
      ...all.filter((q) => !q.occasion)
    ]
    : all;
  return `
    <section class="vz-section vz-section--bleed vz-reviews" data-section="Отзывы" data-reviews-slot
      ${quotes.length ? '' : 'hidden'} ${reveal()}>
      <div class="vz-bleed-head">${sectionHead(head)}</div>
      <div class="vz-reels-host" data-reels-host></div>
      ${quotes.length ? `
        <div class="vz-strip vz-strip--quotes" role="list">
          ${quotes.map((q) => `
            <figure class="vz-quote" role="listitem">
              <blockquote>«${escapeHtml(q.text.replace(/^[«"]+|[»"]+$/g, ''))}»</blockquote>
              ${q.author ? `<figcaption>${escapeHtml(q.author)}</figcaption>` : ''}
            </figure>
          `).join('')}
        </div>
      ` : ''}
    </section>
  `;
}

export function renderRequirements(card, head = { title: 'Что нужно от площадки' }) {
  const items = (card.requirements || []).filter((r) => r.title);
  if (!items.length && !card.requirementsNote) return '';
  return `
    <section class="vz-section" data-section="Площадка" ${reveal()}>
      ${sectionHead(head)}
      ${items.length ? `
        <div class="vz-needs">
          ${items.map((r) => `
            <div class="vz-need">
              <span class="vz-need-title">${escapeHtml(r.title)}</span>
              ${r.text ? `<span class="vz-need-text">${escapeHtml(r.text)}</span>` : ''}
            </div>
          `).join('')}
        </div>
      ` : ''}
      ${card.requirementsNote ? `<p class="vz-note">${escapeHtml(card.requirementsNote)}</p>` : ''}
    </section>
  `;
}

/* ─────────── Связь ─────────── */

export function renderContacts(card, interactive) {
  const items = contactItems(card);
  if (!items.length) return '';
  const cols = items.length === 4 ? 2 : Math.min(items.length, 3);
  return `
    <section class="vz-section" data-section="Контакты" ${reveal()}>
      <nav class="vz-contacts" style="--cols:${cols}" aria-label="Контакты">
        ${items.map((i) => `
          <a class="vz-contact" href="${escapeAttr(i.href)}" target="_blank" rel="noopener" data-contact>
            ${contactIcon(i.icon)}
            <span class="vz-contact-label">${escapeHtml(i.label)}</span>
          </a>
        `).join('')}
      </nav>
      ${interactive ? `
        <button type="button" class="vz-save" data-save-contact>
          ${renderIcon('download', { size: 20 })}
          <span>Сохранить контакт</span>
        </button>
      ` : ''}
    </section>
  `;
}

// Есть ли куда ответить на заявку: без контактов владельца кнопку не рисуем.
export function canRequestDate(card) {
  return Boolean(card.phone || card.telegram || card.email);
}
