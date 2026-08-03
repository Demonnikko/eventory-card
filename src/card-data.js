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

// leadKey — ключ владельца: по нему он модерирует отзывы и смотрит
// статистику опубликованной визитки. Он обязан быть стабильным, поэтому
// живёт отдельно от карточки и создаётся ровно один раз. Раньше ключ
// выдавался внутри getCard и тут же сохранялся — из-за этого чтение
// карточки становилось записью и приводило к гонкам между экранами.
const LEAD_KEY_STORAGE = 'eventory-card:lead-key';

function readStableLeadKey() {
  try {
    const saved = localStorage.getItem(LEAD_KEY_STORAGE);
    if (/^[a-f0-9]{32}$/i.test(String(saved || ''))) return String(saved).toLowerCase();
  } catch { /* приватный режим — ключ проживёт в рамках сессии */ }
  return '';
}

function ensureStableLeadKey(existing) {
  if (/^[a-f0-9]{32}$/i.test(String(existing || ''))) {
    // Ключ уже есть в карточке — закрепляем его как основной.
    try { localStorage.setItem(LEAD_KEY_STORAGE, String(existing).toLowerCase()); } catch {}
    return String(existing).toLowerCase();
  }
  const stored = readStableLeadKey();
  if (stored) return stored;
  const fresh = createLeadKey();
  try { localStorage.setItem(LEAD_KEY_STORAGE, fresh); } catch {}
  return fresh;
}

// Карточка считается заполненной, если человек хоть что-то в неё ввёл.
// Нужно, чтобы отличить реальные данные от пустой заготовки: пустышка
// не должна вытеснять заполненную карточку — ни при чтении, ни при записи.
function hasContent(card) {
  if (!card) return false;
  const fields = ['name', 'role', 'city', 'tagline', 'bio', 'services',
    'priceFrom', 'phone', 'telegram', 'email', 'website', 'coverPhoto'];
  if (fields.some((f) => String(card[f] || '').trim())) return true;
  return Boolean(card.galleryPhotos?.length || card.servicePackages?.length);
}

export async function getCard() {
  const stored = await getRecord(CARD_ID);
  const mirror = mirrorRead();

  // Зеркало выигрывает, если в базе пусто, а в нём — данные. Раньше здесь
  // хватало самого факта записи в IndexedDB: пустая заготовка перекрывала
  // живое зеркало, и карточка терялась безвозвратно.
  let source = stored;
  if (!hasContent(stored) && hasContent(mirror)) source = mirror;
  if (!source) source = mirror || DEFAULT_BUSINESS_CARD;

  const normalized = normalizeBusinessCard(source);
  normalized.leadKey = ensureStableLeadKey(normalized.leadKey);
  return normalized;
}

export async function saveCard(card) {
  const normalized = normalizeBusinessCard(card);
  // После публикации сервер возвращает свой leadKey — он и становится
  // основным для этого устройства.
  normalized.leadKey = ensureStableLeadKey(normalized.leadKey);

  // Защита от затирания: пустую карточку поверх заполненной не пишем.
  // Так сохранение, сработавшее на устаревшем состоянии, не обнулит данные.
  if (!hasContent(normalized)) {
    const existing = await getRecord(CARD_ID);
    const mirror = mirrorRead();
    if (hasContent(existing) || hasContent(mirror)) {
      return normalizeBusinessCard(hasContent(existing) ? existing : mirror);
    }
  }

  await putRecord(normalized);
  mirrorSave(normalized);
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
