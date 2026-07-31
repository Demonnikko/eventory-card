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
    throw new Error('bad_response');
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

export async function uploadReview(token, { blob, author, role, duration }) {
  const video = await blobToDataUrl(blob);
  const data = await request('/api/card-review', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'upload', invite: token, video, author, role, duration })
  });
  return data.review;
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('read_failed'));
    reader.readAsDataURL(blob);
  });
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
