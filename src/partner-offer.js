// КП от партнёра: /v/<визитка артиста>?o=<номер КП>.
//
// Партнёр (ведущий, организатор) продаёт артиста своему клиенту. Страница из
// двух частей:
//   1. Витрина артиста — только то, что его раскрывает: обложка с видео,
//      факты, клиенты, форматы, номера, отзывы. Без контактов, «Проверить
//      дату», праздников и цен: связь у клиента — с партнёром.
//   2. Внизу — «Предложение для вас», как КП из калькулятора Eventory:
//      услуги с «Что вы получаете» и «Что входит», цена каждой, итог,
//      предоплата и кнопка «Согласен». Наценка партнёра уже внутри цен —
//      клиенту её не видно (сервер раскладывает её по услугам).
// Данные КП — Eventory, api/_partners.js.
import { toast } from './shared/components/toast.js';
import { escapeHtml } from './shared/lib/html.js';
import {
  brandMark,
  coverPositionValue,
  renderActsStrip,
  renderClientsLine,
  renderFactsRow,
  renderFormats,
  renderHero,
  renderReviews,
  resetReveal,
  reveal
} from './card-view-parts.js';

const OFFER_RE = /^[a-f0-9]{20}$/;
const API = '/api/promo?service=partners&action=';
const SEEN_KEY = 'eventory-offer-agreed:';
const DEFAULT_PREPAY = 50;

export function readOfferIdFromUrl() {
  try {
    const id = new URLSearchParams(window.location.search).get('o') || '';
    return OFFER_RE.test(id) ? id : '';
  } catch {
    return '';
  }
}

export async function fetchOffer(id) {
  try {
    const res = await fetch(`${API}offer-public&id=${encodeURIComponent(id)}`);
    const data = await res.json();
    return data?.ok ? data.offer : null;
  } catch {
    return null;
  }
}

// Визитка артиста в КП партнёра: ни одного контакта артиста — даже в
// «Сохранить контакт». Цен на визитке нет и так.
export function cardForOffer(card) {
  if (!card) return card;
  return {
    ...card,
    phone: '',
    email: '',
    telegram: '',
    vk: '',
    max: '',
    website: ''
  };
}

export function money(value) {
  return `${new Intl.NumberFormat('ru-RU').format(Math.round(Number(value) || 0))} ₽`;
}

export function longDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', weekday: 'long' }).format(new Date(y, m - 1, d));
}

function plural(n, one, few, many) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}

function duration(minutes) {
  const m = Math.round(Number(minutes) || 0);
  if (!m) return '';
  const h = Math.floor(m / 60);
  const rest = m % 60;
  const parts = [];
  if (h) parts.push(`${h} ${plural(h, 'час', 'часа', 'часов')}`);
  if (rest) parts.push(`${rest} ${plural(rest, 'минута', 'минуты', 'минут')}`);
  return parts.join(' ');
}

function agreedHere(offer) {
  try { return localStorage.getItem(SEEN_KEY + offer.offerId) === '1'; } catch { return false; }
}

export function renderItem(item) {
  const includes = String(item.description || '')
    .split('\n')
    .map((line) => line.replace(/^[\s•\-–—]+/, '').trim())
    .filter(Boolean);
  const time = duration(item.durationMinutes * (item.qty || 1));
  return `
    <article class="po-item">
      <div class="po-item-head">
        <h3 class="po-item-title">${escapeHtml(item.title)}${item.qty > 1 ? ` <span>× ${item.qty}</span>` : ''}</h3>
        ${item.price ? `<span class="po-item-price">${escapeHtml(money(item.price))}</span>` : ''}
      </div>
      ${time ? `<span class="po-item-time">${escapeHtml(time)}</span>` : ''}
      ${item.summary ? `
        <div class="po-item-block">
          <span class="po-item-label">Что вы получаете</span>
          <p>${escapeHtml(item.summary)}</p>
        </div>` : ''}
      ${includes.length ? `
        <div class="po-item-block">
          <span class="po-item-label">Что входит</span>
          <ul>${includes.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul>
        </div>` : ''}
    </article>
  `;
}

export function renderOfferBlock(offer) {
  if (!offer) return '';
  const agreed = offer.status !== 'sent' || agreedHere(offer);
  const prepayPercent = Number(offer.prepayPercent) || DEFAULT_PREPAY;
  const prepay = Math.round((offer.total * prepayPercent) / 100 / 100) * 100;
  const partnerName = offer.partner?.name || '';
  return `
    <section class="po-card" data-offer-block id="offer" ${reveal()}>
      <span class="po-kicker">Предложение для вас</span>
      <h2 class="po-title">Программа для вашего праздника</h2>
      ${offer.eventDate ? `<p class="po-date">${escapeHtml(longDate(offer.eventDate))}</p>` : ''}
      <div class="po-items">${(offer.items || []).map(renderItem).join('')}</div>
      <div class="po-sum">
        <div class="po-sum-row is-total"><span>Итого</span><b>${escapeHtml(money(offer.total))}</b></div>
        <div class="po-sum-row"><span>Предоплата ${prepayPercent}%, бронь даты</span><b>${escapeHtml(money(prepay))}</b></div>
      </div>
      ${agreed
        ? `<p class="po-done">Спасибо! ${escapeHtml(partnerName || 'Организатор')} свяжется с вами, чтобы закрепить дату.</p>`
        : '<button type="button" class="po-cta" data-offer-agree>Согласен</button>'}
      ${partnerName && !agreed ? `<p class="po-note">Предложение подготовил(а) ${escapeHtml(partnerName)}. Детали обсудите там, где получили эту ссылку.</p>` : ''}
    </section>
  `;
}

// Номер КП в адресе есть, а предложения нет: устарело или удалено.
export function renderOfferGone() {
  return `
    <section class="po-card" data-offer-block id="offer">
      <span class="po-kicker">Предложение больше недоступно</span>
      <p class="po-done">Свяжитесь с организатором, который прислал вам эту ссылку.</p>
    </section>
  `;
}

// Витрина артиста для КП: то, что его раскрывает, и предложение внизу.
export function renderOfferPage(card, offer) {
  resetReveal();
  const meta = [card.role, card.city].filter(Boolean).join(' · ');
  return `
    <article class="vz vz--main vz--offer">
      ${renderHero(card, {
        photo: card.coverPhoto,
        position: coverPositionValue(card),
        top: brandMark(card),
        eyebrow: meta,
        title: card.name || 'Артист',
        titleClass: 'vz-name',
        lead: card.tagline
      })}
      <div class="vz-body">
        ${renderFactsRow(card)}
        ${renderClientsLine(card)}
        ${renderFormats(card)}
        ${renderActsStrip(card)}
        ${renderReviews(card)}
        ${offer ? renderOfferBlock(offer) : renderOfferGone()}
      </div>
    </article>
  `;
}

// «Согласен» — без форм: имя и детали клиент обсудит с партнёром.
export function bindOfferBlock(node, offer, onAgreed) {
  node.querySelector('[data-offer-agree]')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.textContent = 'Отправляем…';
    try {
      const res = await fetch(`${API}offer-agree`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ offerId: offer.offerId })
      });
      const data = await res.json();
      if (!data?.ok) throw new Error(data?.error || 'failed');
      try { localStorage.setItem(SEEN_KEY + offer.offerId, '1'); } catch { /* приватный режим */ }
      onAgreed();
    } catch {
      btn.disabled = false;
      btn.textContent = 'Согласен';
      toast.show('Не получилось отправить. Проверьте интернет');
    }
  });
}

// «Заказать» из карточки номера ведёт к предложению, а не в заявку артисту
// напрямую: клиент — партнёра.
export function focusOffer(node) {
  node.querySelector('[data-offer-block]')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
