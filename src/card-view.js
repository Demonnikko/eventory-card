// Разметка карточки в клиентском виде.
//
// Один и тот же рендер используется и для предпросмотра (локальный черновик),
// и для публичной страницы /v/<slug> (карточка с сервера).
//
// Клиент открывает эту страницу один раз и смотрит секунд двадцать — поэтому
// вся работа здесь про первое впечатление: крупная антиква, много воздуха,
// золото тонкими акцентами. Появление разделов ставится через data-reveal,
// анимацией управляет card-app.css.
import { escapeHtml, escapeAttr } from './shared/lib/html.js';
import { renderIcon } from './shared/components/icons.js';
import { businessCardTemplateUrl } from './shared/data/businessCard.js';
import { renderReviewsSection } from './reviews-view.js';
import { renderGreeting } from './card-ask.js';

function contactIcon(name) {
  const unified = { telegram: 'share', website: 'externalLink' };
  return renderIcon(unified[name] || name);
}

function telegramHref(value) {
  const handle = String(value || '').replace(/^https?:\/\/t\.me\//i, '').replace(/^@/, '');
  return handle ? `https://t.me/${encodeURIComponent(handle)}` : '';
}

// Инициалы — подпись на «печати» в шапке, когда обложки нет.
function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '';
  const first = parts[0][0] || '';
  const second = parts.length > 1 ? parts[parts.length - 1][0] || '' : '';
  return (first + second).toUpperCase();
}

let revealIndex = 0;
function reveal(delayStep = 1) {
  revealIndex += delayStep;
  return `data-reveal style="--reveal-order:${revealIndex}"`;
}

// Номер для wa.me — только цифры, ведущий 8 в России меняем на 7.
function whatsappHref(phone) {
  let digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 11 && digits[0] === '8') digits = `7${digits.slice(1)}`;
  return `https://wa.me/${digits}`;
}

function renderContacts(card) {
  const items = [];
  if (card.phone) items.push({ icon: 'phone', label: 'Позвонить', href: `tel:${String(card.phone).replace(/\s/g, '')}` });
  const wa = whatsappHref(card.phone);
  if (wa) items.push({ icon: 'whatsapp', label: 'WhatsApp', href: wa });
  const tg = telegramHref(card.telegram);
  if (tg) items.push({ icon: 'telegram', label: 'Telegram', href: tg });
  if (card.email) items.push({ icon: 'note', label: 'Написать', href: `mailto:${card.email}` });
  if (card.website) items.push({ icon: 'website', label: 'Сайт', href: card.website });
  if (!items.length) return '';
  return `
    <nav class="cp-contacts" ${reveal()}>
      ${items.map((i) => `
        <a class="cp-contact" href="${escapeAttr(i.href)}" target="_blank" rel="noopener">
          <span class="cp-contact-icon">${contactIcon(i.icon)}</span>
          <span class="cp-contact-label">${escapeHtml(i.label)}</span>
        </a>
      `).join('')}
    </nav>
  `;
}

function renderServices(card) {
  const lines = String(card.services || '')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
  const packages = Array.isArray(card.servicePackages) ? card.servicePackages : [];
  if (!lines.length && !packages.length) return '';
  return `
    <section class="cp-block" ${reveal()}>
      <h2 class="cp-block-title">Услуги</h2>
      ${lines.length ? `
        <ul class="cp-services">
          ${lines.map((l) => `<li><span class="cp-services-mark" aria-hidden="true"></span>${escapeHtml(l)}</li>`).join('')}
        </ul>
      ` : ''}
      ${packages.length ? `
        <div class="cp-packages">
          ${packages.map((p) => `
            <div class="cp-package">
              <div class="cp-package-head">
                <span class="cp-package-title">${escapeHtml(p.title || '')}</span>
                ${p.price ? `<span class="cp-package-price">${escapeHtml(p.price)}</span>` : ''}
              </div>
              ${p.description ? `<span class="cp-package-desc">${escapeHtml(p.description)}</span>` : ''}
            </div>
          `).join('')}
        </div>
      ` : ''}
    </section>
  `;
}

function renderGallery(card) {
  const photos = Array.isArray(card.galleryPhotos) ? card.galleryPhotos.filter(Boolean) : [];
  if (!photos.length) return '';
  const captions = Array.isArray(card.galleryCaptions) ? card.galleryCaptions : [];
  return `
    <section class="cp-block" ${reveal()}>
      <h2 class="cp-block-title">Работы</h2>
      <div class="cp-gallery">
        ${photos.map((src, i) => `
          <figure class="cp-gallery-item">
            <img src="${escapeAttr(src)}" alt="" loading="lazy" />
            ${captions[i] ? `<figcaption>${escapeHtml(captions[i])}</figcaption>` : ''}
          </figure>
        `).join('')}
      </div>
    </section>
  `;
}

function renderHero(card) {
  const cover = card.coverPhoto;
  const meta = [card.role, card.city].filter(Boolean);
  // Направление, выбранное в приветствии, проступает фактурой за именем —
  // ровно та бумага, которую человек выбрал себе на входе.
  const template = !cover && card.profession ? businessCardTemplateUrl(card.profession) : '';

  return `
    <header class="cp-hero${cover ? ' has-cover' : ''}${template ? ' has-texture' : ''}"
      ${template ? `style="--cp-texture:url('${escapeAttr(template)}')"` : ''}>
      ${template ? '<span class="cp-hero-texture" aria-hidden="true"></span>' : ''}
      ${cover ? `
        <div class="cp-hero-media" aria-hidden="true">
          <img class="cp-hero-img" src="${escapeAttr(cover)}" alt="" />
          <span class="cp-hero-veil"></span>
        </div>
      ` : `
        <div class="cp-hero-plate" aria-hidden="true">
          <span class="cp-hero-monogram">${escapeHtml(initials(card.name))}</span>
        </div>
      `}

      <div class="cp-hero-copy">
        <h1 class="cp-name" ${reveal()}>${escapeHtml(card.name || 'Ваше имя')}</h1>
        <span class="cp-rule" aria-hidden="true" ${reveal()}></span>
        ${meta.length ? `
          <p class="cp-role" ${reveal()}>
            ${meta.map((m) => `<span>${escapeHtml(m)}</span>`).join('<i aria-hidden="true">·</i>')}
          </p>
        ` : ''}
        ${card.tagline ? `<p class="cp-tagline" ${reveal()}>${escapeHtml(card.tagline)}</p>` : ''}
      </div>
    </header>
  `;
}

// interactive=false — предпросмотр: кнопка показывается, но никуда не ведёт,
// чтобы владелец не написал сам себе во время редактирования.
// reviews — видеоотзывы: их грузят отдельно от карточки, поэтому приходят
// вторым аргументом и вставляются перед ценой, ближе к решению написать.
// greeting — узнавание вернувшегося гостя, ask — блок быстрых вопросов.
// Оба грузятся отдельно от карточки, поэтому приходят параметрами.
export function renderCardView(card, { interactive = true, reviews = [], greeting = null, ask = '' } = {}) {
  revealIndex = 0;

  const ctaHref = telegramHref(card.telegram)
    || (card.phone ? `tel:${String(card.phone).replace(/\s/g, '')}` : '')
    || (card.email ? `mailto:${card.email}` : '');

  const ctaLabel = escapeHtml(card.ctaText || 'Оставить заявку');
  const ctaInner = `<span class="cp-cta-label">${ctaLabel}</span><span class="cp-cta-sheen" aria-hidden="true"></span>`;
  const cta = card.leadEnabled && ctaHref
    ? (interactive
        ? `<a class="cp-cta-btn" href="${escapeAttr(ctaHref)}" target="_blank" rel="noopener">${ctaInner}</a>`
        : `<span class="cp-cta-btn">${ctaInner}</span>`)
    : '';

  return `
    <article class="cp-card cp-theme--${escapeAttr(card.theme || 'gold')}">
      ${renderHero(card)}
      ${greeting ? renderGreeting(greeting) : ''}
      ${renderContacts(card)}

      ${card.bio ? `
        <section class="cp-block" ${reveal()}>
          <h2 class="cp-block-title">О себе</h2>
          <p class="cp-bio">${escapeHtml(card.bio).replace(/\n/g, '<br />')}</p>
        </section>
      ` : ''}

      ${renderServices(card)}
      ${renderGallery(card)}
      ${renderReviewsSection(reviews)}

      ${card.priceFrom ? `
        <section class="cp-block cp-price" ${reveal()}>
          <span class="cp-price-label">Стоимость от</span>
          <span class="cp-price-value">${escapeHtml(card.priceFrom)}</span>
        </section>
      ` : ''}

      ${ask}

      ${cta ? `
        <div class="cp-cta" ${reveal()}>
          ${cta}
          <span class="cp-cta-note">Отвечаю ${escapeHtml(card.responseTime || 'в течение дня')}</span>
        </div>
      ` : ''}

      ${interactive ? `
        <div class="cp-save" ${reveal()}>
          <button type="button" class="cp-save-btn" data-save-contact>
            ${renderIcon('download')}
            <span>Сохранить контакт</span>
          </button>
          <span class="cp-save-note">Запишется в телефонную книгу вместе со ссылкой на визитку</span>
        </div>
      ` : ''}
    </article>
  `;
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
