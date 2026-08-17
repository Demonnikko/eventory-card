// Слой данных PWA-визитки.
//
// Модель карточки берём из основного приложения (единый формат = карточку
// можно перенести в CRM без конвертации), а хранение — своё, локальное.
import {
  DEFAULT_BUSINESS_CARD,
  normalizeBusinessCard,
  createLeadKey,
  publicCardPayload,
  buildVCard
} from './shared/data/businessCard.js';
import { getRecord, putRecord, mirrorSave, mirrorRead } from './store.js';

const CARD_ID = 'business-card';

export { DEFAULT_BUSINESS_CARD, normalizeBusinessCard, buildVCard };

// Публичная ссылка ведёт на домен ЭТОГО приложения, а не основного продукта:
// у визитки свой домен, и cardPublicUrl из общего модуля указывает на CRM.
// В браузере берём текущий origin — так ссылка верна и локально, и в проде.
export function cardPublicUrl(slug) {
  const cleanSlug = String(slug || '').trim();
  if (!cleanSlug) return '';
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}/v/${encodeURIComponent(cleanSlug)}`;
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
  const payload = publicCardPayload(card, null);
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
  return { card: saved, url: data.url || cardPublicUrl(data.slug) };
}

// Полнота карточки — единственная «метрика» в бесплатном продукте.
// Показывает пользователю, что ещё стоит заполнить до публикации.
export const CARD_CHECKLIST = [
  { id: 'name', label: 'Имя', done: (c) => Boolean(c.name) },
  { id: 'role', label: 'Чем вы занимаетесь', done: (c) => Boolean(c.role || c.headline) },
  { id: 'contact', label: 'Контакт для связи', done: (c) => Boolean(c.phone || c.telegram || c.email) },
  { id: 'cover', label: 'Фото или оформление', done: (c) => Boolean(c.coverPhoto || c.profession) },
  { id: 'about', label: 'О себе', done: (c) => Boolean(c.bio) },
  { id: 'services', label: 'Услуги или цена', done: (c) => Boolean(c.services || c.priceFrom || c.servicePackages?.length) }
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
