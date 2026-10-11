// Своя обложка праздника: ужимаем фото в браузере, получаем у сервера
// разрешение (он проверяет ключ владельца) и кладём файл прямо в Vercel Blob.
// В визитке остаётся только ссылка — 1 МБ публикации не тратится.
import { compressImage } from './shared/data/businessCard.js';

const COVER_MAX_BYTES = 450 * 1024;

function randomHex(length) {
  const bytes = new Uint8Array(Math.ceil(length / 2));
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('').slice(0, length);
}

// Ошибки — коды, которые редактор переводит в понятный текст.
export async function uploadOccasionCover(card, file) {
  if (!card?.publishedSlug || !card?.leadKey) throw new Error('not_published');
  const dataUrl = await compressImage(file, { maxDim: 1400, quality: 0.84, maxBytes: COVER_MAX_BYTES });
  const blob = await (await fetch(dataUrl)).blob();
  const contentType = 'image/jpeg';
  const pathname = `covers/${card.publishedSlug}/${randomHex(18)}.jpg`;

  const authRes = await fetch('/api/card-cover-upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slug: card.publishedSlug, key: card.leadKey, contentType, size: blob.size, pathname })
  });
  const auth = await authRes.json().catch(() => null);
  if (!authRes.ok || !auth?.uploadUrl) throw new Error(auth?.error || 'upload_not_authorized');

  const res = await fetch(auth.uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': contentType,
      'x-content-type': contentType,
      'x-vercel-blob-access': 'public'
    },
    body: blob
  });
  const result = await res.json().catch(() => null);
  if (!res.ok || !result?.url) throw new Error('upload_failed');
  return result.url;
}
