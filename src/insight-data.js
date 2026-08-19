// Метки показов, узнавание гостей и ночные вопросы — сторона браузера.
import { getCard, cardPublicUrl } from './card-data.js';

const VISITOR_KEY = 'eventory-card:visitor';

// Случайный идентификатор гостя в его собственном браузере. Нужен, чтобы
// отличить «шесть открытий одним человеком» от «шесть разных людей» и
// узнать вернувшегося. Ничего личного не содержит и наружу не уходит,
// кроме как в связке со ссылкой визитки.
export function visitorId() {
  try {
    let id = localStorage.getItem(VISITOR_KEY);
    if (!id) {
      id = (crypto.randomUUID?.() || String(Math.random()).slice(2)).replace(/-/g, '').slice(0, 24);
      localStorage.setItem(VISITOR_KEY, id);
    }
    return id;
  } catch {
    return '';
  }
}

async function request(url, options) {
  const res = await fetch(url, options);
  let data = null;
  try {
    data = await res.json();
  } catch {
    throw new Error('bad_response');
  }
  if (!res.ok || !data?.ok) throw new Error(data?.error || 'request_failed');
  return data;
}

function post(payload) {
  return request('/api/card-insight', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

/* ─────────── Владелец ─────────── */

export async function fetchInsight() {
  const card = await getCard();
  if (!card.publishedSlug || !card.leadKey) {
    return { summary: { opens: 0, visitors: 0, contacts: 0, lastAt: 0 }, tags: [], dialogs: [] };
  }
  return request(
    `/api/card-insight?slug=${encodeURIComponent(card.publishedSlug)}&key=${encodeURIComponent(card.leadKey)}`
  );
}

export async function createTag({ label, place, date }) {
  const card = await getCard();
  if (!card.publishedSlug) throw new Error('not_published');
  const data = await post({
    action: 'tag-create', slug: card.publishedSlug, key: card.leadKey, label, place, date
  });
  return data.tag;
}

export async function deleteTag(id) {
  const card = await getCard();
  return post({ action: 'tag-delete', slug: card.publishedSlug, key: card.leadKey, id });
}

export async function markDialogsRead() {
  const card = await getCard();
  return post({ action: 'dialogs-read', slug: card.publishedSlug, key: card.leadKey });
}

// Ссылка под конкретное событие: та же визитка, но с меткой в адресе.
export function taggedUrl(slug, tagId) {
  const base = cardPublicUrl(slug);
  return tagId ? `${base}?t=${encodeURIComponent(tagId)}` : base;
}

/* ─────────── Гость ─────────── */

// Учёт открытия. Тихий: ошибки не показываем — гость пришёл смотреть
// визитку, а не наши сообщения.
export function trackOpen(slug, tagId, { event = 'open', interest = '' } = {}) {
  const visitor = visitorId();
  if (!slug) return Promise.resolve();
  return post({ action: 'track', slug, tag: tagId, visitor, event, interest })
    .catch(() => { /* учёт не критичен */ });
}

export async function greetReturning(slug) {
  const visitor = visitorId();
  if (!slug || !visitor) return null;
  try {
    const data = await post({ action: 'greet', slug, visitor });
    return data.returning ? data : null;
  } catch {
    return null;
  }
}

export async function askQuestion(slug, { question, contact = '', tagId = '' }) {
  return post({ action: 'ask', slug, question, contact, tag: tagId });
}

// Заявка «Узнать цену» от гостя: имя + контакт + (необязательно) дата события.
export async function sendLead(slug, { name, phone = '', vk = '', telegram = '', eventDate = '', tagId = '' }) {
  // Читаемая строка контакта — её видит Pro-владелец в заявке сейчас. Отдельные
  // поля phone/vk/telegram сохраняются структурно для будущей sales-системы.
  const contact = [
    phone && `☎ ${phone}`,
    vk && `ВК: ${vk}`,
    telegram && `TG: ${telegram}`
  ].filter(Boolean).join(' · ');
  return post({ action: 'lead', slug, name, contact, phone, vk, telegram, eventDate, tag: tagId });
}

export async function markLeadsRead() {
  const card = await getCard();
  return post({ action: 'leads-read', slug: card.publishedSlug, key: card.leadKey });
}

// Удаление заявки владельцем: спам, ошибочная или тестовая. Возвращает true при
// успехе — вызывающий убирает строку из UI только по факту удаления на сервере.
export async function deleteLead(id) {
  const card = await getCard();
  const data = await post({ action: 'lead-delete', slug: card.publishedSlug, key: card.leadKey, id });
  return data?.ok === true;
}

// Telegram-уведомления о заявках. Идут через основной проект (там бот): визитка
// шлёт leadKey, получает ссылку на бота / статус. Отдельные эндпоинты promo.
async function cardLinkPost(action, extra = {}) {
  const card = await getCard();
  if (!card.leadKey) throw new Error('no_lead_key');
  const res = await fetch(`/api/promo?service=card-link&action=${encodeURIComponent(action)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cardKey: card.leadKey, ...extra })
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.ok) throw new Error(data?.error || 'request_failed');
  return data;
}

export async function telegramLink() {
  const data = await cardLinkPost('tg-link');
  return data.url;
}

export async function telegramStatus() {
  try {
    const data = await cardLinkPost('tg-status');
    return data.connected === true;
  } catch { return false; }
}

export async function telegramUnlink() {
  return cardLinkPost('tg-unlink');
}

// Партнёрка визитки: реф-ссылка владельца = его визитка + ?ref=<leadKey>.
// Приглашённый переходит, видит визитку-пример и регистрируется; опубликует
// свою — засчитается. 3 приглашённых = месяц Pro.
export function referralLink(card) {
  if (!card?.publishedSlug || !card?.leadKey) return '';
  return `${cardPublicUrl(card.publishedSlug)}?ref=${encodeURIComponent(card.leadKey)}`;
}

export async function referralStats() {
  const card = await getCard();
  if (!card.leadKey) return { needed: 3, invited: 0, earned: 0 };
  try {
    const res = await fetch('/api/promo?service=referral-card&action=stats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cardKey: card.leadKey })
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.ok) return { needed: 3, invited: 0, earned: 0 };
    return { needed: data.needed || 3, invited: data.invited || 0, earned: data.earned || 0 };
  } catch {
    return { needed: 3, invited: 0, earned: 0 };
  }
}

// Метка из адреса визитки — по ней считаем, с какого события пришёл гость.
export function readTagFromUrl() {
  try {
    return new URLSearchParams(window.location.search).get('t') || '';
  } catch {
    return '';
  }
}
