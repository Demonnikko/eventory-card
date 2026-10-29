// Страница праздника — живая продающая презентация под один повод.
//
// Порядок экранов повторяет логику сильной презентации для заказчика:
//   обложка (что получит вечер) → «ради этого момента» (почему это работает)
//   → артист (почему ему можно доверять) → форматы (как вписать в программу)
//   → номера по экрану на каждый (что увидят гости) → изюминка под повод
//   → отзывы (кто уже доволен) → за кулисами (что нужно от площадки)
//   → «теперь ваша дата» (что входит, почему сейчас, заявка).
// Кнопка «Проверить дату» при этом висит внизу всё время — дочитывать до
// конца, чтобы оставить заявку, не нужно.
import './styles/occasion-view.css';
import { escapeHtml, escapeAttr } from './shared/lib/html.js';
import { mediaUrl } from './shared/lib/media-url.js';
import { renderIcon } from './shared/components/icons.js';
import { occasionInSeason, occasionTitle, occasionFx } from './shared/data/occasions.js';
import { renderFx } from './occasion-fx.js';
import {
  reveal,
  photoAt,
  optionalPhoto,
  coverPositionValue,
  renderHero,
  brandMark,
  sectionHead,
  renderFormats,
  renderReviews,
  renderRequirements,
  renderContacts,
  canRequestDate
} from './card-view-parts.js';

/* ─────────── Ради этого момента ─────────── */

function renderMoment(card, settings) {
  if (!settings.momentTitle && !settings.momentText) return '';
  const photo = optionalPhoto(card, settings.momentPhoto);
  return `
    <section class="vz-section vz-moment${photo ? ' has-photo' : ''}" data-section="Момент" ${reveal()}>
      ${sectionHead({ kicker: 'Ради этого момента', title: settings.momentTitle || 'Ради этого момента' })}
      ${photo ? `<img class="vz-moment-img" src="${escapeAttr(photo)}" alt="" loading="lazy" />` : ''}
      ${settings.momentText ? `<p class="vz-moment-text">${escapeHtml(settings.momentText)}</p>` : ''}
    </section>
  `;
}

/* ─────────── Артист ─────────── */

// Портрет крупно — только если обложка страницы другая (фото с праздника).
// Иначе тот же кадр второй раз подряд выглядел бы ошибкой: тогда маленький
// круглый портрет рядом с именем.
function renderArtist(card, { heroIsCover }) {
  const facts = (card.facts || []).filter((f) => f.value);
  if (!card.name && !facts.length && !card.clients && !card.credentials) return '';
  const portrait = card.coverPhoto && !heroIsCover ? card.coverPhoto : '';
  const avatar = card.coverPhoto && heroIsCover ? card.coverPhoto : '';
  return `
    <section class="vz-section vz-artist" data-section="Артист" ${reveal()}>
      <span class="vz-kicker vz-section-kicker">Артист</span>
      ${portrait ? `<img class="vz-artist-portrait" src="${escapeAttr(portrait)}" alt="${escapeAttr(card.name || '')}" loading="lazy"
        style="object-position:${escapeAttr(coverPositionValue(card))}" />` : ''}
      <div class="vz-artist-head">
        ${avatar ? `<img class="vz-artist-avatar" src="${escapeAttr(avatar)}" alt="" loading="lazy"
          style="object-position:${escapeAttr(coverPositionValue(card))}" />` : ''}
        <div class="vz-artist-names">
          <h2 class="vz-h2 vz-artist-name">${escapeHtml(card.name || '')}</h2>
          ${card.role ? `<span class="vz-artist-role">${escapeHtml(card.role)}</span>` : ''}
        </div>
      </div>
      ${facts.length ? `
        <div class="vz-artist-facts" style="--cols:${facts.length}">
          ${facts.map((f) => `
            <div class="vz-artist-fact">
              <span class="vz-artist-fact-value">${escapeHtml(f.value)}</span>
              ${f.label ? `<span class="vz-artist-fact-label">${escapeHtml(f.label)}</span>` : ''}
            </div>
          `).join('')}
        </div>
      ` : ''}
      ${card.credentials ? `<p class="vz-artist-credentials">${escapeHtml(card.credentials)}</p>` : ''}
      ${card.clients ? `
        <div class="vz-artist-clients">
          <span class="vz-kicker">Выступал для</span>
          <span class="vz-artist-clients-list">${escapeHtml(card.clients)}</span>
        </div>
      ` : ''}
    </section>
  `;
}

/* ─────────── Номера ─────────── */

// Номера страницы: выбор владельца для этого праздника или все фото номеров.
function pickedActs(card, settings) {
  const photos = card.galleryPhotos || [];
  const indexes = Array.isArray(settings.acts) ? settings.acts : photos.map((_, i) => i);
  return indexes.filter((i) => photos[i]);
}

function renderActScreens(card, settings) {
  const indexes = pickedActs(card, settings);
  if (!indexes.length) return '';
  return `
    <section class="vz-section vz-acts" data-section="Номера" ${reveal()}>
      ${sectionHead({ kicker: 'Номера', title: 'Что увидят гости' })}
      ${indexes.map((i) => {
        const name = card.galleryCaptions?.[i] || '';
        const headline = card.galleryHeadlines?.[i] || name;
        const text = card.galleryTexts?.[i] || '';
        return `
          <article class="vz-act-screen vz-act-screen--clickable" role="button" tabindex="0" data-act-open="${i}" aria-label="${escapeAttr(name || headline || `Номер ${i + 1}`)}, подробнее">
            <img class="vz-act-screen-img" src="${escapeAttr(photoAt(card, i))}" alt="${escapeAttr(name || headline || `Номер ${i + 1}`)}" loading="lazy" />
            <div class="vz-act-screen-copy">
              ${name && headline !== name ? `<span class="vz-kicker">${escapeHtml(name)}</span>` : ''}
              ${headline ? `<h3 class="vz-act-screen-title">${escapeHtml(headline)}</h3>` : ''}
              ${text ? `<p class="vz-act-screen-text">${escapeHtml(text)}</p>` : ''}
              <div class="vz-act-screen-action">
                <span class="vz-act-more-btn">Подробнее о номере</span>
              </div>
            </div>
          </article>
        `;
      }).join('')}
    </section>
  `;
}

function renderHighlight(card, settings) {
  if (!settings.highlightTitle) return '';
  const photo = optionalPhoto(card, settings.highlightPhoto);
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

/* ─────────── Теперь ваша дата ─────────── */

// Финал как последний слайд: цена — под дату, что входит, почему не тянуть,
// и сама кнопка. Без контактов владельца заявку некуда отправить — тогда
// финал заканчивается контактами ниже.
function renderFinale(card, settings, { interactive }) {
  const formats = (card.formats || []).filter((f) => f.title);
  const included = (card.included || []).filter((item) => item.text);
  return `
    <section class="vz-finale" data-section="Ваша дата" ${reveal()}>
      <span class="vz-kicker">Ваше событие</span>
      <h2 class="vz-finale-title">Теперь ваша дата</h2>
      <p class="vz-finale-sub">Стоимость зависит от даты и города. Назову точную сумму, когда узнаю дату, город и формат.</p>
      ${formats.length ? `
        <div class="vz-finale-formats">
          ${formats.map((f) => `
            <div class="vz-finale-format">
              ${f.minutes ? `<span class="vz-finale-min">${escapeHtml(f.minutes)} мин</span>` : ''}
              <span class="vz-finale-format-title">${escapeHtml(f.title)}</span>
            </div>
          `).join('')}
        </div>
      ` : ''}
      ${included.length ? `
        <ul class="vz-included" aria-label="Что входит">
          ${included.map((item) => `
            <li>${renderIcon('check', { size: 16 })}<span>${escapeHtml(item.text)}</span></li>
          `).join('')}
        </ul>
      ` : ''}
      ${settings.urgency ? `<p class="vz-urgency">${renderIcon('clock', { size: 16 })}<span>${escapeHtml(settings.urgency)}</span></p>` : ''}
      ${canRequestDate(card) ? `
        <button type="button" class="vz-cta vz-finale-cta" data-date-open${interactive ? '' : ' data-preview'}>Проверить дату</button>
      ` : ''}
    </section>
  `;
}

/* ─────────── Страница ─────────── */

export function renderOccasionPage(card, occasion, ctx) {
  const settings = card.occasions?.[occasion.id] || {};
  const title = occasionTitle(occasion, ctx.now);
  // Обложка страницы: своя обложка праздника → фото из визитки → обложка визитки.
  const ownCover = mediaUrl(settings.cover);
  const heroIsCover = !ownCover && !(settings.photo >= 0 && photoAt(card, settings.photo));
  const photo = ownCover || (heroIsCover ? card.coverPhoto : photoAt(card, settings.photo));
  const position = ownCover
    ? coverPositionValue(settings)
    : (heroIsCover ? coverPositionValue(card) : 'center 30%');
  const byline = [card.name, card.role].filter(Boolean).join(' · ');
  // «Все праздники» — только если человек пришёл сюда с главной визитки.
  // По ссылке из Sales страница самостоятельна: заказчик корпоратива не
  // должен видеть, что рядом есть свадьбы и выпускные.
  const backHref = ctx.interactive ? `/v/${encodeURIComponent(ctx.slug)}${ctx.query || ''}` : '#/preview';
  const back = ctx.fromMain ? `
    <a class="vz-glass-chip" href="${escapeAttr(backHref)}" data-occasion-back>
      ${renderIcon('arrow-left', { size: 16 })} Все праздники
    </a>
  ` : '';
  return `
    <article class="vz vz--occasion">
      ${renderHero(card, {
        photo,
        position,
        // Бренд всегда справа: и с кнопкой «Все праздники», и без неё (по ссылке
        // из Sales). Слева остаётся место шарам гирлянды.
        top: `${back || '<span></span>'}${brandMark(card)}`,
        chip: occasionInSeason(occasion, ctx.now) ? 'Сезон · бронируют сейчас' : '',
        eyebrow: title,
        title: settings.headline || title,
        titleClass: 'vz-headline',
        lead: settings.text || byline,
        video: settings.video || card.videoUrl,
        overlay: renderFx(occasionFx(occasion, settings, ctx.now))
      })}
      <div class="vz-body">
        ${renderMoment(card, settings)}
        ${renderArtist(card, { heroIsCover })}
        ${renderFormats(card, { kicker: 'Форматы', title: 'Под ритм вашего вечера' })}
        ${renderActScreens(card, settings)}
        ${renderHighlight(card, settings)}
        ${renderReviews(card, { occasionId: occasion.id, head: { kicker: 'Отзывы', title: 'Что говорят после финала' } })}
        ${renderRequirements(card, { kicker: 'От площадки', title: 'За кулисами всё по делу' })}
        ${renderFinale(card, settings, ctx)}
        ${renderContacts(card, ctx.interactive)}
      </div>
    </article>
  `;
}
