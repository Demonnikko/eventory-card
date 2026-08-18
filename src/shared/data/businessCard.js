import { normalizePhone, normalizeTelegram, normalizeVk, normalizeMax } from './profile.js';

// Собрать занятость по месяцам из событий (последние 3 + следующие 9 месяцев = 12 плиток)

const CARD_ID = 'business-card';

// Редактор визитки заморожен в браузере/PWA до запуска отдельного продукта.
// Данные и публичные ссылки сохраняются для безопасной миграции.
export const BUSINESS_CARD_AVAILABLE = false;

export const BUSINESS_CARD_PROFESSIONS = [
  { id: 'host', label: 'Ведущий', background: 'speech' },
  { id: 'illusionist', label: 'Иллюзионист', background: 'magic' },
  { id: 'vocalist', label: 'Вокалист', background: 'vocal' },
  { id: 'organizer', label: 'Организатор', background: 'event' },
  { id: 'decorator', label: 'Декоратор', background: 'decor' },
  { id: 'videographer', label: 'Видеограф', background: 'video' },
  { id: 'photographer', label: 'Фотограф', background: 'photo' }
];

export const BUSINESS_CARD_TEMPLATE_BY_PROFESSION = {
  host: '/business-card-templates/host-card.webp',
  illusionist: '/business-card-templates/illusionist-card.webp',
  vocalist: '/business-card-templates/vocalist-card.webp',
  organizer: '/business-card-templates/organizer-card.webp',
  decorator: '/business-card-templates/decorator-card.webp',
  videographer: '/business-card-templates/videographer-card.webp',
  photographer: '/business-card-templates/photographer-card.webp'
};

// Облегчённые копии для первого запуска. На экране выбора карточка занимает
// лишь часть ширины телефона, поэтому грузить исходники 1672×941 нет смысла.
// Все семь onboarding-фонов вместе весят меньше одного полного шаблона.
export const BUSINESS_CARD_ONBOARDING_TEMPLATE_BY_PROFESSION = {
  host: '/business-card-templates/onboarding/host-card.webp',
  illusionist: '/business-card-templates/onboarding/illusionist-card.webp',
  vocalist: '/business-card-templates/onboarding/vocalist-card.webp',
  organizer: '/business-card-templates/onboarding/organizer-card.webp',
  decorator: '/business-card-templates/onboarding/decorator-card.webp',
  videographer: '/business-card-templates/onboarding/videographer-card.webp',
  photographer: '/business-card-templates/onboarding/photographer-card.webp'
};

export function businessCardTemplateUrl(profession) {
  return BUSINESS_CARD_TEMPLATE_BY_PROFESSION[String(profession || '')]
    || BUSINESS_CARD_TEMPLATE_BY_PROFESSION.host;
}

export function businessCardOnboardingTemplateUrl(profession) {
  return BUSINESS_CARD_ONBOARDING_TEMPLATE_BY_PROFESSION[String(profession || '')]
    || BUSINESS_CARD_ONBOARDING_TEMPLATE_BY_PROFESSION.host;
}

// Один и тот же профиль можно показывать в разных точках, но для артиста
// важно понимать, что реально даёт обращения. Каналы остаются намеренно
// короткими: это не отдельные лендинги, а подпись к персональному QR.
export const CARD_QR_CHANNELS = [
  { id: 'card', label: 'Визитка', note: 'Для печати и показа с телефона' },
  { id: 'venue', label: 'Площадка', note: 'Для банкетного зала или стойки' },
  { id: 'instagram', label: 'Instagram', note: 'Для шапки профиля и сторис' },
  { id: 'agency', label: 'Агентство', note: 'Для партнёров и организаторов' }
];

const CARD_QR_CHANNEL_IDS = new Set(CARD_QR_CHANNELS.map((item) => item.id));

export const SOCIAL_TYPES = [
  'instagram', 'telegram', 'whatsapp', 'vk', 'youtube',
  'tiktok', 'linkedin', 'behance', 'dribbble', 'threads',
  'twitter', 'website'
];

// Галерея хранится вместе с визиткой в Redis. 68 КБ на файл оставляют запас
// для шести фото, обложки и текстовых данных в общем лимите публикации 1 МБ.
export const BUSINESS_CARD_GALLERY_MAX_BYTES = 68 * 1024;

export const DEFAULT_BUSINESS_CARD = {
  id: CARD_ID,
  theme: 'gold',
  profession: '',
  name: '',
  role: '',
  company: '',
  city: '',
  headline: 'Event-профессионал',
  tagline: '',
  bio: '',
  highlights: '',
  phone: '',
  email: '',
  telegram: '',
  vk: '',
  max: '',
  website: '',
  portfolioUrl: '',
  videoUrl: '',
  services: '',
  priceFrom: '',
  responseTime: 'в течение дня',
  servicePackages: [],     // [{ title, price, description }] до 3 пакетов
  socials: [],            // [{type, url}]
  avatarPhoto: '',        // legacy: новые визитки используют только обложку
  coverPhoto: '',         // data:image/jpeg;base64,...
  coverPosition: 'top',   // 'top' | 'center' | 'bottom'
  galleryPhotos: [],      // data:image/jpeg;base64,... до 6 фото
  galleryCaptions: [],    // подписи к кейсам, индекс совпадает с galleryPhotos
  cardMode: 'landing',    // 'landing' | 'leadgen' | 'contact'
  ctaText: 'Оставить заявку',
  leadEnabled: true,
  leadTitle: 'Расскажите о событии',
  leadSubtitle: 'Я отвечу и подготовлю предложение',
  crmEnabled: false,      // встроенная заявка и CRM доступны только в Pro
  crmModeSynced: false,   // локальный маркер миграции старых публикаций
  leadKey: '',
  showSchedule: false,   // показывать график занятости на публичной визитке
  kioskMode: false,      // режим витрины: иконка открывает сразу present с QR
  publishedSlug: '',
  publishedAt: null
};

function clean(value, max = 240) {
  const text = String(value ?? '').trim();
  return text.length > max ? text.slice(0, max) : text;
}

function cleanUrl(value) {
  const text = clean(value, 260);
  if (!text) return '';
  if (/^https?:\/\//i.test(text)) return text;
  return `https://${text.replace(/^\/+/, '')}`;
}

function cleanEmail(value) {
  const text = clean(value, 120).toLowerCase();
  if (!text) return '';
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text) ? text : '';
}

// SVG может содержать встроенный <script>, поэтому разрешаем только
// растровые форматы. Регулярка совпадает с серверной валидацией.
const SAFE_DATA_URL_RE = /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/;

function cleanDataUrl(value, maxBytes = 320 * 1024) {
  const text = String(value || '');
  if (!SAFE_DATA_URL_RE.test(text)) return '';
  // Грубая оценка размера: длина base64 ≈ 4/3 от размера в байтах.
  if (text.length > maxBytes * 1.4) return '';
  return text;
}

function cleanGallery(input) {
  if (!Array.isArray(input)) return [];
  return input
    .filter((x) => typeof x === 'string' && SAFE_DATA_URL_RE.test(x))
    .map((x) => cleanDataUrl(x, BUSINESS_CARD_GALLERY_MAX_BYTES))
    .filter(Boolean)
    .slice(0, 6);
}

function cleanGalleryCaptions(input) {
  if (!Array.isArray(input)) return [];
  return input.slice(0, 6).map((value) => clean(value, 100));
}

function cleanServicePackages(input) {
  if (!Array.isArray(input)) return [];
  return input
    .filter((item) => item && typeof item === 'object')
    .map((item) => ({
      title: clean(item.title, 80),
      price: clean(item.price, 40),
      description: clean(item.description, 180)
    }))
    .filter((item) => item.title || item.price || item.description)
    .slice(0, 3);
}

function cleanSocials(input, { keepDrafts = true } = {}) {
  if (!Array.isArray(input)) return [];
  const seen = new Set();
  const out = [];
  for (const item of input) {
    if (!item || typeof item !== 'object') continue;
    const type = String(item.type || '').toLowerCase();
    if (!SOCIAL_TYPES.includes(type) || seen.has(type)) continue;
    const url = cleanUrl(item.url);
    if (!url) {
      if (!keepDrafts) continue;
      seen.add(type);
      out.push({ type, url: '' });
      if (out.length >= 10) break;
      continue;
    }
    seen.add(type);
    out.push({ type, url });
    if (out.length >= 10) break;
  }
  return out;
}

export function createLeadKey() {
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function normalizeBusinessCard(input = {}) {
  // Один фирменный визуальный язык: тёплый графит и золото из иконки.
  // Старые карточки с альтернативными темами автоматически обновляются.
  const theme = DEFAULT_BUSINESS_CARD.theme;
  const professionIds = new Set(BUSINESS_CARD_PROFESSIONS.map((item) => item.id));
  const profession = professionIds.has(String(input.profession || '')) ? String(input.profession) : '';
  const leadKey = /^[a-f0-9]{32}$/i.test(String(input.leadKey || '')) ? String(input.leadKey).toLowerCase() : '';
  return {
    ...DEFAULT_BUSINESS_CARD,
    ...input,
    id: CARD_ID,
    theme,
    profession,
    name: clean(input.name, 80),
    role: clean(input.role, 80),
    company: clean(input.company, 80),
    city: clean(input.city, 80),
    headline: clean(input.headline, 120),
    tagline: clean(input.tagline, 90),
    bio: clean(input.bio, 800),
    highlights: clean(input.highlights, 600),
    phone: normalizePhone(input.phone),
    email: cleanEmail(input.email),
    telegram: normalizeTelegram(input.telegram),
    vk: normalizeVk(input.vk),
    max: normalizeMax(input.max),
    website: cleanUrl(input.website),
    portfolioUrl: cleanUrl(input.portfolioUrl),
    videoUrl: cleanUrl(input.videoUrl),
    services: clean(input.services, 800),
    priceFrom: clean(input.priceFrom, 40),
    responseTime: clean(input.responseTime, 60) || DEFAULT_BUSINESS_CARD.responseTime,
    servicePackages: cleanServicePackages(input.servicePackages),
    socials: cleanSocials(input.socials),
    avatarPhoto: '',
    coverPhoto: cleanDataUrl(input.coverPhoto, 320 * 1024),
    coverPosition: ['top', 'center', 'bottom'].includes(String(input.coverPosition || ''))
      ? String(input.coverPosition)
      : DEFAULT_BUSINESS_CARD.coverPosition,
    galleryPhotos: cleanGallery(input.galleryPhotos),
    galleryCaptions: cleanGalleryCaptions(input.galleryCaptions),
    cardMode: ['landing', 'leadgen', 'contact'].includes(String(input.cardMode || '')) ? String(input.cardMode) : 'landing',
    ctaText: clean(input.ctaText, 40) || DEFAULT_BUSINESS_CARD.ctaText,
    leadEnabled: input.leadEnabled !== false,
    leadTitle: clean(input.leadTitle, 70) || DEFAULT_BUSINESS_CARD.leadTitle,
    leadSubtitle: clean(input.leadSubtitle, 130) || DEFAULT_BUSINESS_CARD.leadSubtitle,
    crmEnabled: input.crmEnabled === true,
    crmModeSynced: input.crmModeSynced === true,
    leadKey,
    showSchedule: input.showSchedule === true,
    kioskMode: input.kioskMode === true,
    publishedSlug: /^[a-z0-9_-]{6,32}$/i.test(String(input.publishedSlug || '')) ? String(input.publishedSlug) : '',
    publishedAt: Number.isFinite(Number(input.publishedAt)) ? Number(input.publishedAt) : null
  };
}



export function publicCardPayload(card, scheduleGrid = null) {
  const c = normalizeBusinessCard(card);
  return {
    theme: c.theme,
    profession: c.profession,
    name: c.name,
    role: c.role,
    company: c.company,
    city: c.city,
    headline: c.headline,
    tagline: c.tagline,
    bio: c.bio,
    highlights: c.highlights,
    phone: c.phone,
    email: c.email,
    telegram: c.telegram,
    vk: c.vk,
    max: c.max,
    website: c.website,
    portfolioUrl: c.portfolioUrl,
    videoUrl: c.videoUrl,
    services: c.services,
    priceFrom: c.priceFrom,
    responseTime: c.responseTime,
    servicePackages: c.servicePackages,
    socials: c.socials,
    avatarPhoto: '',
    coverPhoto: c.coverPhoto,
    coverPosition: c.coverPosition,
    galleryPhotos: c.galleryPhotos,
    galleryCaptions: c.galleryCaptions,
    cardMode: c.cardMode,
    ctaText: c.ctaText,
    leadEnabled: c.leadEnabled,
    leadTitle: c.leadTitle,
    leadSubtitle: c.leadSubtitle,
    crmEnabled: c.crmEnabled,
    showSchedule: c.showSchedule,
    schedule: c.showSchedule && Array.isArray(scheduleGrid) ? scheduleGrid : null
  };
}

// Канонный прод-домен публичной визитки. QR и внешние ссылки ВСЕГДА ведут сюда,
// независимо от того, с какого деплоя открыто приложение (staging/превью/прод).
// Иначе QR, сгенерированный со staging-домена, вёл клиента на мёртвый адрес.
export const CARD_PUBLIC_ORIGIN = 'https://eventory-mvp.vercel.app';

// Внешние ссылки используют чистый путь: он короче и выглядит как обычная
// персональная страница. Старые ссылки с #/v/ продолжают поддерживаться роутером.
export function cardPublicUrl(slug, source = '') {
  const cleanSlug = String(slug || '').trim();
  if (!cleanSlug) return '';
  const cleanSource = String(source || '').trim().toLowerCase();
  const url = `${CARD_PUBLIC_ORIGIN}/v/${encodeURIComponent(cleanSlug)}`;
  return CARD_QR_CHANNEL_IDS.has(cleanSource)
    ? `${url}?src=${encodeURIComponent(cleanSource)}`
    : url;
}

// Внутренняя навигация в приложении — хеш-роут, не триггерит перезагрузку.
export function cardAppUrl(slug) {
  const cleanSlug = String(slug || '').trim();
  return cleanSlug ? `#/v/${encodeURIComponent(cleanSlug)}` : '';
}

// Экран для показа с телефона: визуальная карточка с QR. Используется
// в «Командах» и быстрых действиях, поэтому адрес всегда ведёт на прод.
export function cardPresentationUrl(slug) {
  const cleanSlug = String(slug || '').trim();
  return cleanSlug ? `${CARD_PUBLIC_ORIGIN}/#/qr/${encodeURIComponent(cleanSlug)}` : '';
}

// Стабильный id устройства визитки. Нужен для партнёрки (идентифицировать
// приглашённого артиста при публикации) и device-rate-limit. Тот же ключ, что
// у Eventory; генерируем при первом обращении, если ещё нет.
function getDeviceIdSafe() {
  try {
    let id = localStorage.getItem('eventory:device-id');
    if (!id) {
      id = (crypto.randomUUID?.() || String(Math.random()).slice(2) + Date.now()).replace(/-/g, '').slice(0, 32);
      localStorage.setItem('eventory:device-id', id);
    }
    return id;
  } catch { return ''; }
}

export function cardDeviceId() {
  return getDeviceIdSafe();
}

export async function publishBusinessCard(card, { crmEnabled } = {}) {
  const source = normalizeBusinessCard({
    ...card,
    leadKey: card?.leadKey || createLeadKey(),
    crmEnabled: typeof crmEnabled === 'boolean' ? crmEnabled : card?.crmEnabled
  });
  const scheduleGrid = source.showSchedule ? await buildScheduleGrid() : null;
  const payload = publicCardPayload(source, scheduleGrid);
  const res = await fetch('/api/card-publish', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      slug: source.publishedSlug || '',
      leadKey: source.leadKey,
      card: payload,
      deviceId: getDeviceIdSafe()
    })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.ok) throw new Error(data?.error || `publish_${res.status}`);
  const saved = await saveBusinessCard({
    ...source,
    crmModeSynced: true,
    leadKey: data.leadKey || source.leadKey,
    publishedSlug: data.slug,
    publishedAt: Date.now()
  });
  return { card: saved, url: data.url || cardPublicUrl(data.slug) };
}

// Ротация leadKey (защита если ключ утёк). Возвращает обновлённую карточку
// с новым leadKey. Если карточка не опубликована или ключ не совпал — throws.
export async function rotateBusinessCardLeadKey(card) {
  const source = normalizeBusinessCard(card);
  if (!source.publishedSlug || !source.leadKey) {
    throw new Error('not_published');
  }
  const res = await fetch('/api/card-publish?action=rotate-key', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slug: source.publishedSlug, leadKey: source.leadKey })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.ok) throw new Error(data?.error || `rotate_${res.status}`);
  const saved = await saveBusinessCard({ ...source, leadKey: data.leadKey });
  return saved;
}

export async function fetchBusinessCardLeads(card) {
  const c = normalizeBusinessCard(card);
  if (!c.publishedSlug || !c.leadKey) return { leads: [], count: 0, sources: {}, metrics: {} };
  const qs = new URLSearchParams({ slug: c.publishedSlug });
  const res = await fetch(`/api/card-lead?${qs.toString()}`, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${c.leadKey}`
    }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.ok) throw new Error(data?.error || `leads_${res.status}`);
  return {
    leads: Array.isArray(data.leads) ? data.leads : [],
    count: Number(data.count || 0),
    sources: data.sources && typeof data.sources === 'object' ? data.sources : {},
    metrics: data.metrics && typeof data.metrics === 'object' ? data.metrics : {}
  };
}

export async function updateBusinessCardLeadStatus(card, leadId, status) {
  const c = normalizeBusinessCard(card);
  if (!c.publishedSlug || !c.leadKey || !leadId) throw new Error('invalid_request');
  const res = await fetch('/api/card-lead?action=lead-status', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${c.leadKey}`
    },
    body: JSON.stringify({ slug: c.publishedSlug, leadId: String(leadId), status: String(status) })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.ok) throw new Error(data?.error || `lead_status_${res.status}`);
  return data.lead;
}

// Артист запрашивает ссылку на отзыв для завершённого заказа. Возвращает URL.
// Бросает 'already_reviewed', если по этому заказу отзыв уже оставлен.
export async function requestReviewLink(card, orderId) {
  const c = normalizeBusinessCard(card);
  if (!c.publishedSlug || !c.leadKey) throw new Error('not_published');
  if (!orderId) throw new Error('invalid_request');
  const res = await fetch('/api/card-lead?action=review-token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${c.leadKey}`
    },
    body: JSON.stringify({ slug: c.publishedSlug, orderId: String(orderId) })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.ok) throw new Error(data?.error || `review_token_${res.status}`);
  return { url: data.url, telegramUrl: data.telegramUrl || '', token: data.token };
}

// Публичное чтение отзывов визитки (для публичной страницы и формы отзыва).
export async function fetchCardReviews(slug) {
  const safe = String(slug || '').trim();
  if (!safe) return { reviews: [], count: 0, average: 0 };
  const res = await fetch(`/api/card-lead?action=reviews&slug=${encodeURIComponent(safe)}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.ok) return { reviews: [], count: 0, average: 0 };
  return {
    reviews: Array.isArray(data.reviews) ? data.reviews : [],
    count: Number(data.count || 0),
    average: Number(data.average || 0)
  };
}

// Публикация отзыва посетителем по одноразовому токену.
// auth — сырые OAuth-данные ({ provider:'telegram', telegram:<widgetUser> } или
// { provider:'vk' }). Сервер их проверяет и сам ставит author/verified.
export async function submitCardReview(token, review, auth) {
  const res = await fetch('/api/card-lead?action=review', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, review, auth })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.ok) throw new Error(data?.error || `review_${res.status}`);
  return data.review;
}

// Забирает проверенное VK-имя после redirect (callback положил во временный ключ).
export async function claimVkReviewAuth(token) {
  const res = await fetch(`/api/card-lead?action=review-vk-claim&token=${encodeURIComponent(token)}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.ok) return null;
  return { author: data.author };
}

// Сжимает картинку через canvas. Возвращает data:image/jpeg base64.
// Лимит размера нужен, чтобы изображение прошло проверку и сохранилось, а не
// исчезло из визитки после загрузки большого файла с телефона.
export async function compressImage(file, { maxDim = 1200, quality = 0.85, maxBytes = 280 * 1024 } = {}) {
  if (!file || !file.type?.startsWith('image/')) throw new Error('not_image');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('image_load_failed'));
      i.src = url;
    });
    let { width, height } = img;
    if (width > maxDim || height > maxDim) {
      const scale = Math.min(maxDim / width, maxDim / height);
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    }
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    let outputWidth = width;
    let outputHeight = height;
    let outputQuality = quality;
    let result = '';

    for (let attempt = 0; attempt < 14; attempt += 1) {
      canvas.width = outputWidth;
      canvas.height = outputHeight;
      ctx.fillStyle = '#0a0a0c';
      ctx.fillRect(0, 0, outputWidth, outputHeight);
      ctx.drawImage(img, 0, 0, outputWidth, outputHeight);
      result = canvas.toDataURL('image/jpeg', outputQuality);
      const estimatedBytes = Math.ceil((result.length - result.indexOf(',') - 1) * 0.75);
      if (!maxBytes || estimatedBytes <= maxBytes) return result;

      if (attempt % 2 === 0 && outputQuality > 0.46) {
        outputQuality = Math.max(0.46, outputQuality - 0.09);
      } else {
        const longestEdge = Math.max(outputWidth, outputHeight);
        const scale = longestEdge > 240 ? Math.max(240 / longestEdge, 0.84) : 1;
        outputWidth = Math.max(1, Math.round(outputWidth * scale));
        outputHeight = Math.max(1, Math.round(outputHeight * scale));
      }
    }
    throw new Error('image_too_large');
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Формирует vCard 3.0 для скачивания "В контакты".
export function buildVCard(card) {
  const c = normalizeBusinessCard(card);
  const esc = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
  const lines = ['BEGIN:VCARD', 'VERSION:3.0'];
  if (c.name) lines.push(`FN:${esc(c.name)}`);
  if (c.name) {
    const parts = c.name.trim().split(/\s+/);
    const last = parts.slice(1).join(' ');
    const first = parts[0] || '';
    lines.push(`N:${esc(last)};${esc(first)};;;`);
  }
  if (c.company) lines.push(`ORG:${esc(c.company)}`);
  if (c.role) lines.push(`TITLE:${esc(c.role)}`);
  if (c.phone) lines.push(`TEL;TYPE=CELL:${esc(c.phone)}`);
  if (c.email) lines.push(`EMAIL;TYPE=INTERNET:${esc(c.email)}`);
  if (c.website) lines.push(`URL:${esc(c.website)}`);
  if (c.telegram) {
    const tg = String(c.telegram).replace(/^https?:\/\/t\.me\//i, '').replace(/^@/, '');
    lines.push(`URL;TYPE=Telegram:https://t.me/${esc(tg)}`);
  }
  if (c.vk) lines.push(`URL;TYPE=VK:${esc(String(c.vk))}`);
  if (c.max) lines.push(`URL;TYPE=MAX:${esc(String(c.max))}`);
  if (c.city) lines.push(`ADR;TYPE=WORK:;;${esc(c.city)};;;;`);
  if (c.bio) lines.push(`NOTE:${esc(c.bio)}`);
  lines.push('END:VCARD');
  return lines.join('\r\n');
}

export function downloadVCard(card) {
  const vcf = buildVCard(card);
  const blob = new Blob([vcf], { type: 'text/vcard;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const filename = (card.name || 'contact').replace(/[^a-z0-9_-]/gi, '_') || 'contact';
  a.download = `${filename}.vcf`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 1000);
}

// Лейблы и иконки для соцсетей. Используются на public-странице.
export const SOCIAL_META = {
  instagram: { label: 'Instagram', color: '#E1306C' },
  telegram: { label: 'Telegram', color: '#2AABEE' },
  whatsapp: { label: 'WhatsApp', color: '#25D366' },
  vk: { label: 'VK', color: '#4C75A3' },
  youtube: { label: 'YouTube', color: '#FF0000' },
  tiktok: { label: 'TikTok', color: '#000' },
  linkedin: { label: 'LinkedIn', color: '#0A66C2' },
  behance: { label: 'Behance', color: '#053EFF' },
  dribbble: { label: 'Dribbble', color: '#EA4C89' },
  threads: { label: 'Threads', color: '#000' },
  twitter: { label: 'X / Twitter', color: '#000' },
  website: { label: 'Сайт', color: '#888' }
};
