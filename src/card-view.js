// Разметка визитки в клиентском виде.
//
// Один рендер на три места: публичная страница /v/<визитка>, страница
// праздника /v/<визитка>/<праздник> и предпросмотр в приложении владельца.
//
// Две страницы — два входа. По QR человек видит главную: кто это, почему ему
// можно доверять, плитки «На какой праздник?». Из рассылки Sales — сразу
// страницу своего повода: живую продающую презентацию (occasion-view.js).
// Цены нет нигде: её назовут под дату и город, а заявка всегда одна —
// «Проверить дату».
import './styles/card-view.css';
import { escapeHtml, escapeAttr } from './shared/lib/html.js';
import { renderIcon } from './shared/components/icons.js';
import { enabledOccasions, occasionInSeason, occasionTitle } from './shared/data/occasions.js';
import {
  resetReveal,
  reveal,
  photoAt,
  coverPositionValue,
  occasionIcon,
  phoneHref,
  canRequestDate,
  renderHero,
  brandMark,
  renderFactsRow,
  renderClientsLine,
  renderFormats,
  renderActsStrip,
  renderReviews,
  renderRequirements,
  renderContacts
} from './card-view-parts.js';
import { renderOccasionPage } from './occasion-view.js';

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
      ` : `<span class="vz-tile-icon" aria-hidden="true">${renderIcon(occasionIcon(occasion), { size: lead ? 30 : 26 })}</span>`}
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

/* ─────────── Нижняя панель ─────────── */

// Главное действие визитки — одна кнопка на стеклянной панели внизу экрана.
// Без контактов владельца ответить некуда, поэтому и заявку не показываем.
function renderDateBar(card, { interactive = true } = {}) {
  if (!canRequestDate(card)) return '';
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

/* ─────────── Главная ─────────── */

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
    renderActsStrip(card),
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

// interactive=false — предпросмотр владельца: ссылки ведут по экранам
// приложения, а кнопки заявки и сохранения контакта никуда не отправляют.
// occasion — праздник визитки (страница повода) или null (главная).
// fromMain — человек пришёл на праздник с главной: тогда есть «Все праздники».
// query — метка и источник из адреса визитки, их несут ссылки на праздники,
// чтобы «Отклик» не потерял, откуда пришёл человек.
export function renderCardView(card, {
  interactive = true,
  occasion = null,
  fromMain = false,
  slug = '',
  query = '',
  now = new Date()
} = {}) {
  resetReveal();
  const ctx = { interactive, fromMain, slug: slug || card.publishedSlug || '', query, now };
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
