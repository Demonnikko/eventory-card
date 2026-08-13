// Хранилище видеоотзывов.
//
// Видео лежат в Vercel Blob (карточка публикуется одним JSON с лимитом
// ~320КБ — кружок туда не поместится), а метаданные отзыва — в том же
// Redis, что и остальные данные визитки.
//
// Blob-доступ идёт через официальный @vercel/blob SDK, а не через прямые
// fetch-запросы: проект подключён к хранилищу через OIDC (Vercel сам
// выдаёт временный токен на реквест), статичного BLOB_READ_WRITE_TOKEN
// в переменных окружения нет. SDK одинаково работает в обоих случаях —
// и с классическим токеном, если его когда-нибудь добавят, и без него.
import crypto from 'node:crypto';
import { put, del, head } from '@vercel/blob';

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

// Видео лежат в отдельном ПУБЛИЧНОМ сторе card-media: его блобы читаются по
// прямому URL без подписи, поэтому клиент видит ролик без 403. Стор подключён
// с префиксом CARD_MEDIA_, чтобы не конфликтовать со старым приватным
// card-reviews (голые BLOB_*). Поэтому нигде не полагаемся на дефолт SDK —
// авторизуем каждый вызов явно этим стором.
const CARD_MEDIA_TOKEN = process.env.CARD_MEDIA_READ_WRITE_TOKEN;
const CARD_MEDIA_STORE_ID = process.env.CARD_MEDIA_STORE_ID;
const OIDC_TOKEN = process.env.VERCEL_OIDC_TOKEN;

// Опции авторизации для put/head/del. Приоритет — классический read-write
// токен; если галочку токена при подключении не ставили, работает связка
// OIDC + storeId (её Vercel даёт на рантайме всегда).
export function blobAuth() {
  if (CARD_MEDIA_TOKEN) return { token: CARD_MEDIA_TOKEN };
  if (OIDC_TOKEN && CARD_MEDIA_STORE_ID) {
    return { oidcToken: OIDC_TOKEN, storeId: CARD_MEDIA_STORE_ID };
  }
  return {};
}

export function blobConfigured() {
  return Boolean(CARD_MEDIA_TOKEN || (OIDC_TOKEN && CARD_MEDIA_STORE_ID));
}

export function storeConfigured() {
  return Boolean(REDIS_URL && REDIS_TOKEN);
}

async function redis(command) {
  if (!storeConfigured()) return null;
  const operation = String(command?.[0] || 'UNKNOWN');
  try {
    const res = await fetch(REDIS_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${REDIS_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(command)
    });
    if (!res.ok) {
      console.error('[card-review:redis] response failed', { operation, status: res.status });
      return null;
    }
    const data = await res.json().catch(() => null);
    if (!data || !Object.prototype.hasOwnProperty.call(data, 'result')) {
      console.error('[card-review:redis] invalid response', { operation });
      return null;
    }
    return data.result ?? null;
  } catch (error) {
    console.error('[card-review:redis] request failed', {
      operation,
      error: error instanceof Error ? error.message : String(error)
    });
    return null;
  }
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
  const ttlSeconds = 60 * 60 * 24 * 30;

  // Нельзя отдавать владельцу ссылку, пока мы не доказали, что токен
  // действительно записан. Раньше SET мог завершиться ошибкой, но функция
  // всё равно возвращала true — именно так появлялись «недействительные» ссылки.
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const saved = await redis(['SET', INVITE_KEY(token), slug, 'EX', String(ttlSeconds)]);
    if (saved !== 'OK') {
      console.error('[card-review:invite] save failed', { attempt });
      continue;
    }

    const storedSlug = await redis(['GET', INVITE_KEY(token)]);
    if (String(storedSlug || '') === slug) return true;
    console.error('[card-review:invite] verification failed', { attempt });
  }

  return false;
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
    consentAt: Number(input.consentAt) || 0,
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
  const saved = await redis(['SET', KEY(slug), JSON.stringify(items.slice(0, MAX_REVIEWS))]);
  return saved === 'OK';
}

// Больше десятка кружков никто не смотрит, а публичная страница тяжелеет.
export const MAX_REVIEWS = 12;

export async function addReview(slug, review) {
  if (!storeConfigured()) return null;
  const all = await listReviews(slug, { approvedOnly: false });
  if (all.length >= MAX_REVIEWS) return null;
  const item = sanitizeReview({ ...review, approved: false });
  if (!await writeReviews(slug, [item, ...all])) throw new Error('review_store_failed');
  return item;
}

export async function updateReview(slug, id, patch) {
  if (!storeConfigured()) return null;
  const all = await listReviews(slug, { approvedOnly: false });
  const idx = all.findIndex((r) => r.id === id);
  if (idx === -1) return null;
  const next = sanitizeReview({ ...all[idx], ...patch, id: all[idx].id });
  all[idx] = next;
  if (!await writeReviews(slug, all)) return null;
  return next;
}

export async function deleteReview(slug, id) {
  if (!storeConfigured()) return false;
  const all = await listReviews(slug, { approvedOnly: false });
  const next = all.filter((r) => r.id !== id);
  if (next.length === all.length) return false;
  return writeReviews(slug, next);
}

/* ─────────── Blob ─────────── */

export const MAX_VIDEO_BYTES = 12 * 1024 * 1024; // ~30 секунд кружка
export const MAX_POSTER_BYTES = 512 * 1024; // один кадр в JPEG

export async function uploadVideo(slug, buffer, contentType) {
  if (!blobConfigured()) throw new Error('blob_not_configured');
  const ext = contentType.includes('mp4') ? 'mp4' : 'webm';
  const name = `reviews/${slug}/${createId()}.${ext}`;
  const blob = await put(name, buffer, {
    access: 'public',
    contentType,
    addRandomSuffix: true,
    cacheControlMaxAge: 31536000,
    ...blobAuth()
  });
  return blob.url;
}

// Клиент загружает ролик напрямую в Blob, а API получает только URL. Перед
// сохранением метаданных убеждаемся, что это действительно наш свежий ролик,
// лежащий в каталоге нужной визитки, а не произвольная внешняя ссылка.
export async function verifyUploadedVideo(slug, value, kind = 'video') {
  const poster = kind === 'poster';
  const namePattern = poster ? /^[a-f0-9]{18}\.jpg$/i : /^[a-f0-9]{18}\.(webm|mp4)$/i;
  const typePattern = poster ? /^image\/jpeg(?:$|;)/i : /^video\/(webm|mp4)(?:$|;)/i;
  const maxBytes = poster ? MAX_POSTER_BYTES : MAX_VIDEO_BYTES;

  let url;
  let pathname;
  try {
    url = new URL(String(value || ''));
    pathname = decodeURIComponent(url.pathname).replace(/^\/+/, '');
  } catch {
    return false;
  }

  // Хост проверяем так же, как это делает сам @vercel/blob: любой поддомен
  // хранилища. Приватный стор отдаёт `*.private.blob…`, публичный —
  // `*.public.blob…`, и жёсткая привязка к одному из них отвергала бы
  // законный ролик ещё до обращения к хранилищу. Подлинность ссылки
  // обеспечивают проверки пути и метаданных ниже.
  if (url.protocol !== 'https:' || url.port || !url.hostname.endsWith('.blob.vercel-storage.com')) {
    console.error('[card-review:blob] rejected url', { host: url.hostname, protocol: url.protocol });
    return false;
  }
  const prefix = `reviews/${slug}/`;
  if (!pathname.startsWith(prefix)) {
    console.error('[card-review:blob] rejected path', { pathname, expectedPrefix: prefix });
    return false;
  }
  if (!namePattern.test(pathname.slice(prefix.length))) {
    console.error('[card-review:blob] rejected filename', { name: pathname.slice(prefix.length), kind });
    return false;
  }

  // head() может не увидеть блоб сразу после клиентского PUT — хранилище
  // отдаёт метаданные с небольшой задержкой согласованности. Пара коротких
  // повторов дешевле, чем заставлять человека переснимать ролик.
  const delays = [0, 400, 900];
  for (let i = 0; i < delays.length; i += 1) {
    if (delays[i]) await new Promise((resolve) => setTimeout(resolve, delays[i]));
    try {
      const metadata = await head(url.toString(), blobAuth());
      const storedPath = String(metadata.pathname || '').replace(/^\/+/, '');
      const ok = storedPath === pathname
        && typePattern.test(String(metadata.contentType || ''))
        && Number(metadata.size) > 0
        && Number(metadata.size) <= maxBytes;
      if (ok) return true;
      if (i === delays.length - 1) {
        console.error('[card-review:blob] metadata mismatch', {
          expectedPath: pathname,
          storedPath,
          contentType: metadata.contentType,
          size: metadata.size
        });
      }
    } catch (error) {
      if (i === delays.length - 1) {
        console.error('[card-review:blob] verification failed', {
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
  }
  return false;
}

// Авторизация СТАРОГО приватного стора card-reviews (голые BLOB_*). Видео,
// записанные до перехода на публичный card-media, лежат именно там, поэтому
// удалять их нужно его токеном, а не токеном нового стора.
function legacyBlobAuth() {
  if (process.env.BLOB_READ_WRITE_TOKEN) return { token: process.env.BLOB_READ_WRITE_TOKEN };
  if (process.env.VERCEL_OIDC_TOKEN && process.env.BLOB_STORE_ID) {
    return { oidcToken: process.env.VERCEL_OIDC_TOKEN, storeId: process.env.BLOB_STORE_ID };
  }
  return null;
}

export async function deleteVideo(url) {
  if (!url) return true;

  // Пробуем удалить обоими сторами: файл лежит либо в новом card-media,
  // либо в старом card-reviews, а по URL это не всегда однозначно.
  const attempts = [blobAuth(), legacyBlobAuth()].filter(Boolean);
  for (const auth of attempts) {
    try {
      await del(url, auth);
      return true; // успех хотя бы в одном сторе — файл удалён
    } catch { /* пробуем следующий стор */ }
  }
  // Файл удалить не удалось (уже стёрт, недоступен или чужой стор). Не
  // блокируем этим удаление самого отзыва — осиротевший файл в Blob лучше,
  // чем отзыв, который владелец не может убрать с визитки.
  return false;
}
