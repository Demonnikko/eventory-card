// Работа с видеоотзывами на стороне браузера.
import { getCard } from './card-data.js';

export const MAX_DURATION = 30;   // секунд — дольше кружки не смотрят
export const MIN_DURATION = 2;

async function request(url, options) {
  const res = await fetch(url, options);
  let data = null;
  try {
    data = await res.json();
  } catch {
    const mitigated = res.status === 403 || res.headers.get('x-vercel-mitigated');
    throw new Error(mitigated ? 'security_checkpoint' : 'bad_response');
  }
  if (!res.ok || !data?.ok) throw new Error(data?.error || 'request_failed');
  return data;
}

// Публичный список — то, что видит клиент на визитке.
export async function fetchReviews(slug) {
  if (!slug) return [];
  try {
    const data = await request(`/api/card-review?slug=${encodeURIComponent(slug)}`);
    return data.reviews || [];
  } catch {
    // Отзывы — украшение визитки, а не её суть: молча показываем без них.
    return [];
  }
}

// Список для владельца: включает неподтверждённые.
export async function fetchOwnReviews() {
  const card = await getCard();
  if (!card.publishedSlug || !card.leadKey) return [];
  const data = await request(
    `/api/card-review?slug=${encodeURIComponent(card.publishedSlug)}&key=${encodeURIComponent(card.leadKey)}`
  );
  return data.reviews || [];
}

export async function createInvite() {
  const card = await getCard();
  if (!card.publishedSlug) throw new Error('not_published');
  const data = await request('/api/card-review', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'invite', slug: card.publishedSlug, key: card.leadKey })
  });
  return `${window.location.origin}/r/${data.token}`;
}

export async function approveReview(id, approved = true) {
  const card = await getCard();
  return request('/api/card-review', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'approve', slug: card.publishedSlug, key: card.leadKey, id, approved })
  });
}

export async function removeReview(id) {
  const card = await getCard();
  return request('/api/card-review', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'delete', slug: card.publishedSlug, key: card.leadKey, id })
  });
}

// Заказчик открыл ссылку-приглашение: узнаём, чью визитку он подтверждает.
export async function fetchInvite(token) {
  const data = await request(`/api/card-review?invite=${encodeURIComponent(token)}`);
  return data;
}

// Обложка кружка. Без неё браузер показывает пустой прямоугольник (кадр
// декодируется только при воспроизведении), и на визитке вместо лица
// человека висят инициалы. Берём кадр на полусекунде: на нулевой кадр
// часто приходится моргание или ещё не наведённая камера.
async function grabPoster(blob) {
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = url;

  try {
    await new Promise((resolve, reject) => {
      const fail = () => reject(new Error('poster_decode_failed'));
      video.onloadeddata = resolve;
      video.onerror = fail;
      setTimeout(fail, 4000);
    });

    if (video.duration && Number.isFinite(video.duration)) {
      const target = Math.min(0.5, video.duration / 2);
      await new Promise((resolve) => {
        video.onseeked = resolve;
        video.onerror = resolve;
        video.currentTime = target;
        setTimeout(resolve, 2000);
      });
    }

    const side = Math.min(video.videoWidth, video.videoHeight) || 0;
    if (!side) return null;

    // Квадрат по центру: кружок всё равно обрежет края, а файл меньше.
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = Math.min(side, 480);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(
      video,
      (video.videoWidth - side) / 2, (video.videoHeight - side) / 2, side, side,
      0, 0, canvas.width, canvas.height
    );
    return await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82));
  } catch {
    return null;
  } finally {
    video.src = '';
    URL.revokeObjectURL(url);
  }
}

export async function uploadReview(token, {
  blob, slug, author, role, duration, consent, videoUrl = ''
}) {
  let uploadedUrl = videoUrl;
  if (!uploadedUrl) uploadedUrl = await uploadReviewVideo(token, slug, blob);

  // Обложка — украшение: если снять или загрузить не вышло, отзыв всё равно
  // должен уйти. Поэтому ошибки здесь глушим намеренно.
  let posterUrl = '';
  try {
    const poster = await grabPoster(blob);
    if (poster) posterUrl = await uploadReviewVideo(token, slug, poster);
  } catch { /* отзыв важнее обложки */ }

  try {
    const data = await request('/api/card-review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'upload', invite: token, videoUrl: uploadedUrl, posterUrl,
        author, role, duration, consent: consent === true
      })
    });
    return data.review;
  } catch (error) {
    // Если ответ потерялся после загрузки, повторная кнопка не должна ещё раз
    // гонять тот же ролик по мобильной сети.
    error.videoUrl = uploadedUrl;
    throw error;
  }
}

const EXT_BY_TYPE = {
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'image/jpeg': 'jpg'
};

async function uploadReviewVideo(token, slug, blob) {
  if (!blob || !slug) throw new Error('invalid_video');
  const contentType = String(blob.type || '').split(';')[0].toLowerCase();
  const ext = EXT_BY_TYPE[contentType];
  if (!ext) throw new Error('invalid_video');

  const bytes = new Uint8Array(9);
  crypto.getRandomValues(bytes);
  const id = Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
  const pathname = `reviews/${slug}/${id}.${ext}`;

  const auth = await request('/api/card-review-upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ invite: token, pathname, contentType, size: blob.size })
  });

  const res = await fetch(auth.uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': contentType,
      'x-content-type': contentType,
      'x-vercel-blob-access': 'public'
    },
    body: blob
  });
  let result = null;
  try { result = await res.json(); } catch { /* код ошибки ниже */ }
  if (!res.ok || !result?.url) throw new Error('upload_failed');
  return result.url;
}

// Формат подбираем под браузер: Safari умеет mp4, остальные — webm.
export function pickMimeType() {
  const candidates = [
    'video/mp4;codecs=avc1',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm'
  ];
  for (const type of candidates) {
    if (window.MediaRecorder?.isTypeSupported?.(type)) return type;
  }
  return '';
}

export function recordingSupported() {
  return Boolean(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);
}
