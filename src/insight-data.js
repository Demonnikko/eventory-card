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
  if (!card.publishedSlug || !card.leadKey) return { tags: [], dialogs: [] };
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

// Метка из адреса визитки — по ней считаем, с какого события пришёл гость.
export function readTagFromUrl() {
  try {
    return new URLSearchParams(window.location.search).get('t') || '';
  } catch {
    return '';
  }
}
