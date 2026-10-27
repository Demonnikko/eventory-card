// КП от партнёра: /v/<визитка артиста>?o=<номер КП>.
//
// Партнёр (ведущий, организатор) продаёт артиста со своей наценкой. Клиент
// видит визитку артиста, но связь — только через партнёра: контакты
// артиста и его цены скрыты, вместо них — контакт партнёра, услуги и одна
// итоговая сумма. Данные КП — Eventory, api/_partners.js.
import { toast } from './shared/components/toast.js';

const OFFER_RE = /^[a-f0-9]{20}$/;
const API = '/api/promo?service=partners&action=';
const SEEN_KEY = 'eventory-offer-agreed:';

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

// Визитка артиста глазами клиента партнёра: без его телефона, почты и
// мессенджеров. Телефон — партнёра, чтобы «Сохранить контакт» тоже вёл к нему.
export function cardForOffer(card, offer) {
  if (!card || !offer) return card;
  return {
    ...card,
    phone: offer.partner?.phone || '',
    email: '',
    telegram: '',
    vk: '',
    max: '',
    website: ''
  };
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function money(value) {
  return `${new Intl.NumberFormat('ru-RU').format(Math.round(Number(value) || 0))} ₽`;
}

function longDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' }).format(new Date(y, m - 1, d));
}

function agreedHere(offer) {
  try { return localStorage.getItem(SEEN_KEY + offer.offerId) === '1'; } catch { return false; }
}

function telHref(phone) {
  return `tel:${String(phone || '').replace(/[^\d+]/g, '')}`;
}

export function renderOfferBlock(offer) {
  if (!offer) return '';
  const agreed = offer.status !== 'sent' || agreedHere(offer);
  const partner = offer.partner || {};
  return `
    <section class="po-card" data-offer-block id="offer">
      <p class="po-card-label">Предложение для вас</p>
      <ul class="po-card-items">
        ${(offer.items || []).map((i) => `
          <li>
            <span>${escapeHtml(i.title)}${i.qty > 1 ? ` × ${i.qty}` : ''}</span>
            ${i.description ? `<small>${escapeHtml(i.description)}</small>` : ''}
          </li>`).join('')}
      </ul>
      <div class="po-card-total">
        <span>Итого</span>
        <b>${escapeHtml(money(offer.total))}</b>
      </div>
      ${offer.eventDate ? `<p class="po-card-date">${escapeHtml(longDate(offer.eventDate))}</p>` : ''}
      ${agreed
        ? `<p class="po-card-done">Вы согласились — ${escapeHtml(partner.name || 'организатор')} свяжется с вами.</p>`
        : '<button type="button" class="po-card-cta" data-offer-agree>Согласен</button>'}
      ${partner.phone
        ? `<a class="po-card-phone" href="${escapeHtml(telHref(partner.phone))}">${escapeHtml(partner.name || 'Организатор')} · ${escapeHtml(partner.phone)}</a>`
        : (partner.name ? `<p class="po-card-phone">Организатор: ${escapeHtml(partner.name)}</p>` : '')}
    </section>
  `;
}

// Номер КП в адресе есть, а предложения нет: устарело или удалено.
export function renderOfferGone() {
  return `
    <section class="po-card" data-offer-block id="offer">
      <p class="po-card-label">Предложение больше недоступно</p>
      <p class="po-card-done">Свяжитесь с организатором, который прислал вам эту ссылку.</p>
    </section>
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
      toast.show('Не получилось отправить — проверьте интернет');
    }
  });
}

// «Проверить дату» в КП партнёра ведёт к предложению, а не в заявку
// артисту напрямую: клиент — партнёра.
export function focusOffer(node) {
  node.querySelector('[data-offer-block]')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
