// Разметка визитки в клиентском виде.
//
// Один рендер на три места: публичная страница /v/<визитка>, страница
// праздника /v/<визитка>/<праздник> и предпросмотр в приложении владельца.
//
// Две страницы — два входа. По QR человек видит главную: кто это, почему ему
// можно доверять, плитки «На какой праздник?». Из рассылки Sales — сразу
// страницу своего повода: живую версию презентации с форматами, номерами,
// отзывами и тем, что нужно от площадки. Цены нет нигде: её назовут под
// дату и город, а заявка всегда одна — «Проверить дату».
import './styles/card-view.css';
import { escapeHtml, escapeAttr } from './shared/lib/html.js';
import { renderIcon, renderBrandIcon, hasBrandIcon } from './shared/components/icons.js';
import { businessCardTemplateUrl } from './shared/data/businessCard.js';
import {
  enabledOccasions,
  occasionInSeason,
  occasionTitle
} from './shared/data/occasions.js';

const OCCASION_ICONS = {
  corporate: 'briefcase',
  newyear: 'sparkle',
  graduation: 'cap',
  wedding: 'rings',
  jubilee: 'cake'
};

let revealIndex = 0;
function reveal() {
  revealIndex += 1;
  return `data-reveal style="--reveal-order:${Math.min(revealIndex, 12)}"`;
}

/* ─────────── Ссылки на контакты ─────────── */

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
function safeHref(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return '';
  return `https://${raw}`;
}

function phoneHref(phone) {
  const digits = String(phone || '').replace(/[^\d+]/g, '');
  return digits ? `tel:${digits}` : '';
}

function contactIcon(name) {
  if (hasBrandIcon(name)) return renderBrandIcon(name, { size: 22 });
  return renderIcon(name, { size: 22 });
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
function photoAt(card, index) {
  if (index >= 0) return String(card.galleryPhotos?.[index] || '');
  return String(card.coverPhoto || '');
}

function coverPositionValue(card) {
  return { top: 'center 18%', center: 'center', bottom: 'center 82%' }[card.coverPosition] || 'center 18%';
}

/* ─────────── Шапка ─────────── */

function renderPlay(card) {
  const href = safeHref(card.videoUrl);
  if (!href) return '';
  return `
    <a class="vz-play" href="${escapeAttr(href)}" target="_blank" rel="noopener">
      <span class="vz-play-dot" aria-hidden="true">${renderIcon('play', { size: 12 })}</span>
      Смотреть выступление
    </a>
  `;
}

function initials(name) {
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

function renderHero(card, { photo, position, top, eyebrow, title, titleClass, lead }) {
  return `
    <header class="vz-hero${photo ? ' has-photo' : ' is-plain'}">
      <div class="vz-hero-media" aria-hidden="${photo ? 'false' : 'true'}">
        ${renderHeroMedia(card, photo, position)}
        <span class="vz-hero-veil" aria-hidden="true"></span>
      </div>
      <div class="vz-hero-top">${top}</div>
      <div class="vz-hero-copy">
        ${eyebrow ? `<span class="vz-eyebrow" ${reveal()}>${escapeHtml(eyebrow)}</span>` : ''}
        <h1 class="${titleClass}" ${reveal()}>${escapeHtml(title)}</h1>
        ${lead ? `<p class="vz-lead" ${reveal()}>${escapeHtml(lead)}</p>` : ''}
        <div ${reveal()}>${renderPlay(card)}</div>
      </div>
    </header>
  `;
}

function brandMark(card) {
  return card.company ? `<span class="vz-brand">${escapeHtml(card.company)}</span>` : '<span></span>';
}

/* ─────────── Доверие ─────────── */

function renderFactsRow(card) {
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

function renderClientsLine(card) {
  if (!card.clients) return '';
  return `
    <p class="vz-clients" ${reveal()}>
      <span>Среди клиентов:</span> ${escapeHtml(card.clients)}
    </p>
  `;
}

// На странице праздника доверие — плитками: компания-заказчик решает быстрее,
// когда видит опыт и громкие имена раньше программы.
function renderTrustBento(card) {
  const facts = (card.facts || []).filter((f) => f.value);
  if (!facts.length && !card.clients) return '';
  return `
    <div class="vz-trust" ${reveal()}>
      ${facts.map((f, i) => `
        <div class="vz-trust-tile${facts.length === 3 && i === 2 ? ' is-wide' : ''}">
          <span class="vz-trust-value">${escapeHtml(f.value)}</span>
          ${f.label ? `<span class="vz-trust-label">${escapeHtml(f.label)}</span>` : ''}
        </div>
      `).join('')}
      ${card.clients ? `
        <div class="vz-trust-tile is-wide is-clients">
          <span class="vz-kicker">Среди клиентов</span>
          <span class="vz-trust-clients">${escapeHtml(card.clients)}</span>
        </div>
      ` : ''}
    </div>
  `;
}

/* ─────────── Праздники ─────────── */

function occasionHref(slug, occasion, { interactive, query }) {
  if (!interactive) return `#/preview/${encodeURIComponent(occasion.slug)}`;
  return `/v/${encodeURIComponent(slug)}/${encodeURIComponent(occasion.slug)}${query || ''}`;
}

function renderOccasionTile(card, occasion, { lead, wide, href, now }) {
  const settings = card.occasions?.[occasion.id] || {};
  const photo = settings.photo >= 0 ? photoAt(card, settings.photo) : '';
  const seasonal = occasionInSeason(occasion, now);
  const note = settings.note || occasion.note;
  const classes = [
    'vz-tile',
    lead ? 'is-lead' : '',
    wide ? 'is-wide' : '',
    photo ? 'has-photo' : ''
  ].filter(Boolean).join(' ');

  return `
    <a class="${classes}" href="${escapeAttr(href)}" data-occasion-link="${escapeAttr(occasion.slug)}">
      ${photo ? `
        <img class="vz-tile-img" src="${escapeAttr(photo)}" alt="" loading="lazy" />
        <span class="vz-tile-veil" aria-hidden="true"></span>
      ` : `<span class="vz-tile-icon" aria-hidden="true">${renderIcon(OCCASION_ICONS[occasion.id], { size: lead ? 30 : 26 })}</span>`}
      <span class="vz-tile-copy">
        ${lead && seasonal ? '<span class="vz-chip vz-chip--solid">Сезон · бронируют сейчас</span>' : ''}
        <span class="vz-tile-title">${escapeHtml(occasionTitle(occasion, now))}</span>
        <span class="vz-tile-note">
          <span>${escapeHtml(note)}</span>
          ${lead ? `<span class="vz-tile-arrow" aria-hidden="true">${renderIcon('chevron-right', { size: 18 })}</span>` : ''}
        </span>
      </span>
    </a>
  `;
}

function renderOccasions(card, { slug, interactive, query, now }) {
  const list = enabledOccasions(card, now);
  if (!list.length) return '';
  const [first, ...rest] = list;
  const oddTail = rest.length % 2 === 1;
  return `
    <section class="vz-section" data-section="Праздники" ${reveal()}>
      <h2 class="vz-h2">На какой праздник?</h2>
      <p class="vz-sub">Выберите — покажу программу под ваш повод</p>
      <div class="vz-bento">
        ${renderOccasionTile(card, first, { lead: true, href: occasionHref(slug, first, { interactive, query }), now })}
        ${rest.map((occasion, i) => renderOccasionTile(card, occasion, {
          wide: oddTail && i === rest.length - 1,
          href: occasionHref(slug, occasion, { interactive, query }),
          now
        })).join('')}
      </div>
    </section>
  `;
}

/* ─────────── Программа ─────────── */

function renderFormats(card) {
  const formats = (card.formats || []).filter((f) => f.title);
  if (!formats.length) return '';
  return `
    <section class="vz-section" data-section="Форматы" ${reveal()}>
      <h2 class="vz-h2">Форматы</h2>
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

function renderActs(card) {
  const photos = (card.galleryPhotos || []).filter(Boolean);
  if (!photos.length) return '';
  const captions = card.galleryCaptions || [];
  return `
    <section class="vz-section vz-section--bleed" data-section="Номера" ${reveal()}>
      <h2 class="vz-h2">Номера</h2>
      <div class="vz-strip" role="list">
        ${photos.map((src, i) => `
          <figure class="vz-act" role="listitem">
            <img src="${escapeAttr(src)}" alt="${escapeAttr(captions[i] || `Номер ${i + 1}`)}" loading="lazy" />
            ${captions[i] ? `<figcaption>${escapeHtml(captions[i])}</figcaption>` : ''}
          </figure>
        `).join('')}
      </div>
    </section>
  `;
}

function renderHighlight(card, settings) {
  if (!settings?.highlightTitle) return '';
  const photo = settings.highlightPhoto >= 0 ? photoAt(card, settings.highlightPhoto) : '';
  return `
    <div class="vz-highlight${photo ? ' has-photo' : ''}" ${reveal()}>
      ${photo ? `<img class="vz-highlight-img" src="${escapeAttr(photo)}" alt="" loading="lazy" />` : ''}
      <div class="vz-highlight-copy">
        <span class="vz-chip">Изюминка</span>
        <span class="vz-highlight-title">${escapeHtml(settings.highlightTitle)}</span>
        ${settings.highlightText ? `<span class="vz-highlight-text">${escapeHtml(settings.highlightText)}</span>` : ''}
      </div>
    </div>
  `;
}

// Отзывы: видео-кружки приходят с сервера позже карточки (их вставляет
// reviews-view.js в [data-reels-host]), текстовые цитаты лежат в самой
// визитке. Секция есть в разметке всегда, а прячется, пока ей нечего показать.
function renderReviews(card) {
  const quotes = (card.quotes || []).filter((q) => q.text);
  return `
    <section class="vz-section vz-section--bleed vz-reviews" data-section="Отзывы" data-reviews-slot
      ${quotes.length ? '' : 'hidden'} ${reveal()}>
      <h2 class="vz-h2">Отзывы</h2>
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

function renderRequirements(card) {
  const items = (card.requirements || []).filter((r) => r.title);
  if (!items.length && !card.requirementsNote) return '';
  return `
    <section class="vz-section" data-section="Площадка" ${reveal()}>
      <h2 class="vz-h2">Что нужно от площадки</h2>
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

function renderPrice() {
  return `
    <section class="vz-price" data-section="Стоимость" ${reveal()}>
      <span class="vz-kicker">Стоимость</span>
      <span class="vz-price-title">Под вашу дату и город</span>
      <span class="vz-price-text">Назову точную сумму, когда узнаю дату, город и формат.</span>
    </section>
  `;
}

/* ─────────── Связь ─────────── */

function renderContacts(card, interactive) {
  const items = contactItems(card);
  if (!items.length) return '';
  const cols = items.length === 4 ? 2 : Math.min(items.length, 3);
  return `
    <section class="vz-section" data-section="Контакты" ${reveal()}>
      <nav class="vz-contacts" style="--cols:${cols}" aria-label="Контакты">
        ${items.map((i) => `
          <a class="vz-contact" href="${escapeAttr(i.href)}" target="_blank" rel="noopener" data-contact>
            <span class="vz-contact-icon">${contactIcon(i.icon)}</span>
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

// Главное действие визитки — одна кнопка на стеклянной панели внизу экрана.
// Без контактов владельца ответить некуда, поэтому и заявку не показываем.
function renderDateBar(card, { interactive = true } = {}) {
  if (!card.phone && !card.telegram && !card.email) return '';
  const tel = phoneHref(card.phone);
  return `
    <div class="vz-bar${interactive ? '' : ' is-preview'}" data-date-bar>
      <button type="button" class="vz-cta" data-date-open>Проверить дату</button>
      ${tel ? `
        <a class="vz-bar-call" href="${escapeAttr(tel)}" aria-label="Позвонить" data-contact>
          ${renderIcon('phone', { size: 20 })}
        </a>
      ` : ''}
    </div>
  `;
}

/* ─────────── Страницы ─────────── */

function shareButton(interactive) {
  if (!interactive) return '';
  return `
    <button type="button" class="vz-glass-btn" data-share-card aria-label="Поделиться визиткой">
      ${renderIcon('share', { size: 20 })}
    </button>
  `;
}

// Тело визитки, когда праздников нет (артисту они не нужны или ещё не
// включены): вся программа на одной странице, чтобы визитка не была пустой.
function renderProgramBody(card) {
  return [
    renderFormats(card),
    renderActs(card),
    renderRequirements(card)
  ].join('');
}

function renderMainPage(card, ctx) {
  const meta = [card.role, card.city].filter(Boolean).join(' · ');
  const hasOccasions = enabledOccasions(card, ctx.now).length > 0;
  return `
    <article class="vz vz--main">
      ${renderHero(card, {
        photo: card.coverPhoto,
        position: coverPositionValue(card),
        top: `${brandMark(card)}${shareButton(ctx.interactive)}`,
        eyebrow: meta,
        title: card.name || 'Ваше имя',
        titleClass: 'vz-name',
        lead: card.tagline
      })}
      <div class="vz-body">
        ${renderFactsRow(card)}
        ${renderClientsLine(card)}
        ${hasOccasions ? renderOccasions(card, ctx) : renderProgramBody(card)}
        ${renderReviews(card)}
        ${renderContacts(card, ctx.interactive)}
      </div>
    </article>
  `;
}

function renderOccasionPage(card, occasion, ctx) {
  const settings = card.occasions?.[occasion.id] || {};
  const title = occasionTitle(occasion, ctx.now);
  const photo = photoAt(card, settings.photo ?? -1) || card.coverPhoto;
  const position = settings.photo >= 0 ? 'center 30%' : coverPositionValue(card);
  const backHref = ctx.interactive
    ? `/v/${encodeURIComponent(ctx.slug)}${ctx.query || ''}`
    : '#/preview';
  const byline = [card.name, card.role].filter(Boolean).join(' · ');
  return `
    <article class="vz vz--occasion">
      ${renderHero(card, {
        photo,
        position,
        top: `
          <a class="vz-glass-chip" href="${escapeAttr(backHref)}" data-occasion-back>
            ${renderIcon('arrow-left', { size: 16 })} Все праздники
          </a>
          ${brandMark(card)}
        `,
        eyebrow: title,
        title: settings.headline || title,
        titleClass: 'vz-headline',
        lead: settings.text || byline
      })}
      <div class="vz-body">
        ${renderTrustBento(card)}
        ${renderFormats(card)}
        ${renderActs(card)}
        ${renderHighlight(card, settings)}
        ${renderReviews(card)}
        ${renderRequirements(card)}
        ${renderPrice()}
        ${renderContacts(card, ctx.interactive)}
      </div>
    </article>
  `;
}

// interactive=false — предпросмотр владельца: ссылки ведут по экранам
// приложения, а кнопки заявки и сохранения контакта никуда не отправляют.
// occasion — праздник из каталога (страница повода) или null (главная).
// query — метка и источник из адреса визитки, их несут ссылки на праздники,
// чтобы «Отклик» не потерял, откуда пришёл человек.
export function renderCardView(card, {
  interactive = true,
  occasion = null,
  slug = '',
  query = '',
  now = new Date()
} = {}) {
  revealIndex = 0;
  const ctx = { interactive, slug: slug || card.publishedSlug || '', query, now };
  const page = occasion && card.occasions?.[occasion.id]?.on
    ? renderOccasionPage(card, occasion, ctx)
    : renderMainPage(card, ctx);
  return `${page}${renderDateBar(card, { interactive })}`;
}

// [data-reveal] держит will-change на время появления — это ускоряет старт
// анимации. Снимаем его сразу после, иначе GPU-слои остаются висеть на
// статичной странице и на слабых телефонах эффект обратный: замедление
// вместо ускорения. Вызывать один раз после вставки карточки в DOM.
export function cleanupRevealHints(root) {
  root.querySelectorAll('[data-reveal]').forEach((el) => {
    el.addEventListener('animationend', () => {
      el.style.willChange = 'auto';
    }, { once: true });
  });
}
