// Доступ к опубликованной карточке и проверка прав владельца.
//
// Логика намеренно продублирована из api/_business-card.js основного продукта,
// а не импортируется: у визитки свой проект на Vercel со своим корнем, и
// функции не могут тянуть код выше него. Дублируется меньше 40 строк,
// формат ключей общий — карточки читаются из той же базы.
import crypto from 'node:crypto';

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

const SLUG_RE = /^[a-z0-9_-]{6,32}$/i;
const LEAD_KEY_RE = /^[a-f0-9]{32}$/;

export function storeConfigured() {
  return Boolean(REDIS_URL && REDIS_TOKEN);
}

export async function redisCommand(command) {
  if (!storeConfigured()) return null;
  const res = await fetch(REDIS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${REDIS_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(command)
  });
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  return data?.result ?? null;
}

export function normalizeSlug(slug) {
  const value = String(slug || '').trim();
  return SLUG_RE.test(value) ? value : '';
}

export function normalizeLeadKey(key) {
  const value = String(key || '').trim().toLowerCase();
  return LEAD_KEY_RE.test(value) ? value : '';
}

// Сравнение за постоянное время: ключ владельца — секрет, и подбирать его
// по скорости ответа не должно получаться.
export function timingSafeTextEqual(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  return left.length > 0 && left.length === right.length && crypto.timingSafeEqual(left, right);
}

export async function readPublicCard(slug) {
  const safe = normalizeSlug(slug);
  if (!safe) return null;
  const raw = await redisCommand(['GET', `eventory:card:${safe}`]);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function leadKeyMatches(data, key) {
  const expected = normalizeLeadKey(data?.leadKey);
  const actual = normalizeLeadKey(key);
  return Boolean(expected && actual && timingSafeTextEqual(expected, actual));
}
