// Предложение с датой на визитке организатора: /v/<визитка>?c=<предложение>
// (режим организатора Eventory, этап 4).
//
// Организатор собрал в калькуляторе свою программу и артистов команды.
// Клиент видит визитку организатора и внизу — «Предложение для вас»: каждая
// услуга с ценой «под ключ», дата и город, подтвердил ли артист дату, итог
// с предоплатой и «Согласен». Данные — Eventory, api/_team-offer.js.
import { escapeHtml } from './shared/lib/html.js';
import { toast } from './shared/components/toast.js';
import { hapticSuccess } from './shared/lib/haptic.js';
import { renderItem, money, longDate } from './partner-offer.js';
import './styles/team-block.css';

const API = '/api/promo?service=partners&action=';
const OFFER_RE = /^[a-f0-9]{20}$/;
const SEEN_KEY = 'eventory-team-offer-agreed:';

const STATUS = {
  free: { label: 'Дата подтверждена', tone: 'is-free' },
  busy: { label: 'Дата занята, подберу замену', tone: 'is-busy' },
  asked: { label: 'Проверяю дату', tone: '' }
};

export function readTeamOfferId() {
  try {
    const id = new URLSearchParams(window.location.search).get('c') || '';
    return OFFER_RE.test(id) ? id : '';
  } catch {
    return '';
  }
}

export async function fetchTeamOffer(id) {
  try {
    const res = await fetch(`${API}team-offer-public&id=${encodeURIComponent(id)}`);
    const data = await res.json();
    return data?.ok ? data.offer : null;
  } catch {
    return null;
  }
}

function agreedHere(offer) {
  try { return localStorage.getItem(SEEN_KEY + offer.offerId) === '1'; } catch { return false; }
}

function renderTeamItem(item) {
  const status = STATUS[item.status] || STATUS.asked;
  return `
    <div class="to-team">
      ${renderItem({ title: `${item.name} · ${item.serviceTitle}`, summary: item.summary, description: item.description, durationMinutes: item.durationMinutes, qty: 1, price: item.price })}
      <span class="to-status ${status.tone}">${escapeHtml(status.label)}</span>
    </div>
  `;
}

function renderBlock(offer) {
  const agreed = offer.status !== 'sent' || agreedHere(offer);
  const prepay = offer.prepayPercent ? Math.round((offer.total * offer.prepayPercent) / 100 / 100) * 100 : 0;
  const where = [longDate(offer.date), offer.city].filter(Boolean).join(' · ');
  let action;
  if (agreed) action = '<p class="po-done">Спасибо! Я свяжусь с вами, чтобы закрепить дату.</p>';
  else if (offer.expired) action = '<p class="po-done">Срок предложения прошёл. Напишите мне, и я пришлю новое.</p>';
  else action = '<button type="button" class="po-cta" data-team-offer-agree>Согласен</button>';
  return `
    <section class="po-card to-card" data-team-offer id="offer">
      <span class="po-kicker">Предложение для вас</span>
      <h2 class="po-title">${escapeHtml(offer.title || 'Программа для вашего праздника')}</h2>
      ${where ? `<p class="po-date">${escapeHtml(where)}</p>` : ''}
      <div class="po-items">
        ${offer.own.map((item) => renderItem({ ...item, qty: 1 })).join('')}
        ${offer.team.length ? '<span class="po-item-label to-team-label">Рекомендую для вашего праздника</span>' : ''}
        ${offer.team.map(renderTeamItem).join('')}
      </div>
      <div class="po-sum">
        <div class="po-sum-row is-total"><span>Итого</span><b>${escapeHtml(money(offer.total))}</b></div>
        ${prepay ? `<div class="po-sum-row"><span>Предоплата ${offer.prepayPercent}%, бронь даты</span><b>${escapeHtml(money(prepay))}</b></div>` : ''}
      </div>
      ${action}
    </section>
  `;
}

// Встраивает предложение в визитку над подписью внизу. Визитку перерисовывают
// (кэш → свежие данные) — зовём снова.
export function injectTeamOffer(node, offer) {
  if (!node || !offer) return;
  node.querySelector('[data-team-offer]')?.remove();
  const page = node.querySelector('.cp-page') || node;
  const tpl = document.createElement('template');
  tpl.innerHTML = renderBlock(offer).trim();
  const block = tpl.content.firstElementChild;
  const footer = page.querySelector('.cp-footer');
  if (footer) footer.before(block);
  else page.appendChild(block);
  // Здесь главное действие — «Согласен», «Проверить дату» только путает.
  node.querySelector('[data-date-bar]')?.setAttribute('hidden', '');
  block.querySelector('[data-team-offer-agree]')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.textContent = 'Отправляю…';
    try {
      const res = await fetch(`${API}team-offer-agree`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ offerId: offer.offerId })
      });
      const data = await res.json();
      if (!data?.ok) throw new Error(data?.error || 'failed');
      try { localStorage.setItem(SEEN_KEY + offer.offerId, '1'); } catch { /* приватный режим */ }
      hapticSuccess();
      injectTeamOffer(node, { ...offer, status: 'agreed' });
    } catch {
      btn.disabled = false;
      btn.textContent = 'Согласен';
      toast.show('Не получилось отправить. Проверьте интернет');
    }
  });
}

// «Заказать» и «Проверить дату» на визитке ведут к предложению.
export function scrollToTeamOffer(node) {
  node.querySelector('[data-team-offer]')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
