// Хранилище видеоотзывов.
//
// Видео лежат в Vercel Blob (карточка публикуется одним JSON с лимитом
// ~320КБ — кружок туда не поместится), а метаданные отзыва — в том же
// Redis, что и остальные данные визитки.
//
// Пока Blob не подключён, модуль честно сообщает об этом, а не падает:
// приложение продолжает работать, просто без видеоотзывов.
import crypto from 'node:crypto';

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;

export function blobConfigured() {
  return Boolean(BLOB_TOKEN);
}

export function storeConfigured() {
  return Boolean(REDIS_URL && REDIS_TOKEN);
}

async function redis(command) {
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

const KEY = (slug) => `eventory:card:${slug}:reviews`;
// Токен приглашения: по нему клиент попадает на страницу записи.
const INVITE_KEY = (token) => `eventory:card:invite:${token}`;

export function createId() {
  return crypto.randomBytes(9).toString('hex');
}

export function createInviteToken() {
  return crypto.randomBytes(16).toString('hex');
}

/* ─────────── Приглашения ─────────── */

// Владелец создаёт ссылку-приглашение, отправляет заказчику. Ссылка живёт
// 30 дней: отзыв просят по свежим следам, вечная ссылка — лишний риск.
export async function saveInvite(token, slug) {
  if (!storeConfigured()) return false;
  await redis(['SET', INVITE_KEY(token), slug, 'EX', String(60 * 60 * 24 * 30)]);
  return true;
}

export async function readInvite(token) {
  if (!storeConfigured()) return null;
  const slug = await redis(['GET', INVITE_KEY(token)]);
  return slug ? String(slug) : null;
}

/* ─────────── Отзывы ─────────── */

export function sanitizeReview(input = {}) {
  const clean = (v, max) => String(v ?? '').trim().slice(0, max);
  return {
    id: clean(input.id, 32) || createId(),
    author: clean(input.author, 60),
    role: clean(input.role, 80),          // «невеста», «директор по маркетингу»
    videoUrl: clean(input.videoUrl, 500),
    posterUrl: clean(input.posterUrl, 500),
    duration: Math.max(0, Math.min(120, Number(input.duration) || 0)),
    createdAt: Number(input.createdAt) || Date.now(),
    // Отзыв виден клиентам только после подтверждения владельцем.
    approved: input.approved === true
  };
}

export async function listReviews(slug, { approvedOnly = true } = {}) {
  if (!storeConfigured()) return [];
  const raw = await redis(['GET', KEY(slug)]);
  if (!raw) return [];
  let items = [];
  try {
    items = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(items)) return [];
  const list = items.map(sanitizeReview);
  return approvedOnly ? list.filter((r) => r.approved) : list;
}

async function writeReviews(slug, items) {
  await redis(['SET', KEY(slug), JSON.stringify(items.slice(0, MAX_REVIEWS))]);
}

// Больше десятка кружков никто не смотрит, а публичная страница тяжелеет.
export const MAX_REVIEWS = 12;

export async function addReview(slug, review) {
  if (!storeConfigured()) return null;
  const all = await listReviews(slug, { approvedOnly: false });
  if (all.length >= MAX_REVIEWS) return null;
  const item = sanitizeReview({ ...review, approved: false });
  await writeReviews(slug, [item, ...all]);
  return item;
}

export async function updateReview(slug, id, patch) {
  if (!storeConfigured()) return null;
  const all = await listReviews(slug, { approvedOnly: false });
  const idx = all.findIndex((r) => r.id === id);
  if (idx === -1) return null;
  const next = sanitizeReview({ ...all[idx], ...patch, id: all[idx].id });
  all[idx] = next;
  await writeReviews(slug, all);
  return next;
}

export async function deleteReview(slug, id) {
  if (!storeConfigured()) return false;
  const all = await listReviews(slug, { approvedOnly: false });
  const next = all.filter((r) => r.id !== id);
  if (next.length === all.length) return false;
  await writeReviews(slug, next);
  return true;
}

/* ─────────── Blob ─────────── */

export const MAX_VIDEO_BYTES = 12 * 1024 * 1024; // ~30 секунд кружка

// Загрузка в Vercel Blob напрямую по REST — чтобы не тянуть зависимость
// в проект ради одного запроса.
export async function uploadVideo(slug, buffer, contentType) {
  if (!blobConfigured()) throw new Error('blob_not_configured');
  const name = `reviews/${slug}/${createId()}.${contentType.includes('mp4') ? 'mp4' : 'webm'}`;
  const res = await fetch(`https://blob.vercel-storage.com/${name}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${BLOB_TOKEN}`,
      'Content-Type': contentType,
      'x-content-type': contentType,
      'x-add-random-suffix': '1',
      'x-cache-control-max-age': '31536000'
    },
    body: buffer
  });
  if (!res.ok) throw new Error('blob_upload_failed');
  const data = await res.json().catch(() => null);
  if (!data?.url) throw new Error('blob_upload_failed');
  return data.url;
}

export async function deleteVideo(url) {
  if (!blobConfigured() || !url) return;
  try {
    await fetch('https://blob.vercel-storage.com/delete', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${BLOB_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ urls: [url] })
    });
  } catch { /* висящий файл не ломает удаление отзыва */ }
}
