// Слой данных PWA-визитки.
//
// Модель карточки берём из основного приложения (единый формат = карточку
// можно перенести в CRM без конвертации), а хранение — своё, локальное.
import {
  DEFAULT_BUSINESS_CARD,
  normalizeBusinessCard,
  createLeadKey,
  publicCardPayload
} from './shared/data/businessCard.js';
import { enabledOccasions } from './shared/data/occasions.js';
import { getRecord, putRecord, mirrorSave, mirrorRead } from './store.js';

const CARD_ID = 'business-card';

export { DEFAULT_BUSINESS_CARD, normalizeBusinessCard };

// Публичная ссылка ведёт на домен ЭТОГО приложения, а не основного продукта:
// у визитки свой домен, и cardPublicUrl из общего модуля указывает на CRM.
// В браузере берём текущий origin — так ссылка верна и локально, и в проде.
//
// occasionSlug ведёт сразу на страницу праздника (/v/<визитка>/korporativ),
// source — откуда человек пришёл (qr, vk…): по нему «Отклик» считает каналы.
export function cardPublicUrl(slug, { occasionSlug = '', source = '' } = {}) {
  const cleanSlug = String(slug || '').trim();
  if (!cleanSlug) return '';
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const path = occasionSlug
    ? `/v/${encodeURIComponent(cleanSlug)}/${encodeURIComponent(occasionSlug)}`
    : `/v/${encodeURIComponent(cleanSlug)}`;
  return `${origin}${path}${source ? `?src=${encodeURIComponent(source)}` : ''}`;
}

// Карточка одна на все вкладки. Держим её в памяти, чтобы переключение
// вкладок не читало IndexedDB каждый раз — переходы становятся мгновенными.
// Кэш обновляется при каждом сохранении, поэтому не устаревает.
let cardCache = null;

export async function getCard() {
  if (cardCache) return cardCache;
  const stored = await getRecord(CARD_ID);
  // Если IndexedDB очистилась, поднимаем карточку из localStorage-зеркала.
  const source = stored || mirrorRead() || DEFAULT_BUSINESS_CARD;
  const normalized = normalizeBusinessCard(source);
  if (!normalized.leadKey) {
    return saveCard({ ...normalized, leadKey: createLeadKey() });
  }
  cardCache = normalized;
  return normalized;
}

export async function saveCard(card) {
  const normalized = normalizeBusinessCard(card);
  await putRecord(normalized);
  mirrorSave(normalized);
  cardCache = normalized;
  return normalized;
}

// Публикация переиспользует боевой эндпоинт основного продукта.
// crmEnabled всегда false: встроенный приём заявок в CRM — платная функция,
// бесплатная визитка публикуется в режиме прямых контактов.
export async function publishCard(card) {
  const payload = publicCardPayload(card);
  const body = {
    card: { ...payload, crmEnabled: false },
    leadKey: card.leadKey || ''
  };
  if (card.publishedSlug) body.slug = card.publishedSlug;

  const res = await fetch('/api/card-publish', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  let data = null;
  try {
    data = await res.json();
  } catch {
    throw new Error('publish_bad_response');
  }
  if (!res.ok || !data?.ok) {
    throw new Error(data?.error || 'publish_failed');
  }
  const saved = await saveCard({
    ...card,
    publishedSlug: data.slug,
    leadKey: data.leadKey || card.leadKey,
    publishedAt: Date.now()
  });
  writePublishedPrint(saved.publishedSlug, publicFingerprint(saved));
  return { card: saved, url: data.url || cardPublicUrl(data.slug) };
}

// Визитка возвращается на телефон с сервера — новый телефон или приложение
// переустановили. Берём опубликованную версию и ключ, который выдали по коду
// из Telegram. Отпечаток ставим сразу: это и есть опубликованная версия.
export async function adoptPublishedCard(slug, leadKey) {
  const res = await fetch(`/api/card-get?slug=${encodeURIComponent(slug)}`);
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.ok || !data.card) throw new Error('card_not_found');
  const saved = await saveCard({
    ...DEFAULT_BUSINESS_CARD,
    ...data.card,
    publishedSlug: slug,
    leadKey,
    publishedAt: Date.now()
  });
  writePublishedPrint(saved.publishedSlug, publicFingerprint(saved));
  return saved;
}

// ─── Неопубликованные изменения ───
//
// Редактор сохраняет правки на телефоне сразу, а на публичную визитку они
// попадают только по кнопке «Обновить». Раньше плашка при этом продолжала
// говорить «Визитка опубликована» — владелец менял цену, закрывал приложение и
// был уверен, что клиенты видят новую, а они видели старую.
//
// Храним отпечаток ровно того, что ушло на сервер, и сравниваем с тем, что
// ушло бы сейчас. Локальные настройки (режим витрины и т. п.) в отпечаток не
// входят — их изменение публикации не требует.
const PUBLISHED_PRINT_KEY = 'eventory-card:published-print:';

export function publicFingerprint(card) {
  const text = JSON.stringify(publicCardPayload(card));
  let hash = 5381;
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0;
  }
  return `${text.length}:${(hash >>> 0).toString(36)}`;
}

function readPublishedPrint(slug) {
  try {
    return localStorage.getItem(`${PUBLISHED_PRINT_KEY}${slug}`) || '';
  } catch {
    return '';
  }
}

function writePublishedPrint(slug, print) {
  if (!slug) return;
  try {
    localStorage.setItem(`${PUBLISHED_PRINT_KEY}${slug}`, print);
  } catch { /* приватный режим — индикатор просто будет осторожнее */ }
}

// true — есть правки, которых клиенты не видят. Если отпечатка нет (визитку
// публиковали до этого обновления или в другом браузере), честно считаем, что
// правки могут быть: ложное «обновите» безопасно, ложное «всё на месте» — нет.
export function hasUnpublishedChanges(card) {
  if (!card?.publishedSlug) return false;
  const saved = readPublishedPrint(card.publishedSlug);
  return !saved || saved !== publicFingerprint(card);
}

// Полнота карточки — единственная «метрика» в бесплатном продукте.
// Показывает пользователю, что ещё стоит заполнить до публикации.
export const CARD_CHECKLIST = [
  { id: 'name', label: 'Имя', done: (c) => Boolean(c.name) },
  { id: 'role', label: 'Чем вы занимаетесь', done: (c) => Boolean(c.role) },
  { id: 'contact', label: 'Контакт для связи', done: (c) => Boolean(c.phone || c.telegram || c.email) },
  { id: 'cover', label: 'Фото или оформление', done: (c) => Boolean(c.coverPhoto || c.profession) },
  { id: 'trust', label: 'Факты о себе', done: (c) => (c.facts || []).some((f) => f.value) || Boolean(c.clients) },
  { id: 'offer', label: 'Праздники или форматы', done: (c) => enabledOccasions(c).length > 0 || (c.formats || []).some((f) => f.title) }
];

export function cardCompletion(card) {
  const done = CARD_CHECKLIST.filter((item) => item.done(card)).length;
  return {
    done,
    total: CARD_CHECKLIST.length,
    percent: Math.round((done / CARD_CHECKLIST.length) * 100),
    missing: CARD_CHECKLIST.filter((item) => !item.done(card))
  };
}
