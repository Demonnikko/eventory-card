import { normalizePhone, normalizeTelegram, normalizeVk, normalizeMax } from './profile.js';
import {
  OCCASIONS,
  CUSTOM_OCCASION_RE,
  OCCASION_SLUG_RE,
  MAX_CUSTOM_OCCASIONS,
  OCCASION_TITLE_MAX,
  isOccasionId
} from './occasions.js';

const CARD_ID = 'business-card';

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

// Галерея хранится вместе с визиткой в Redis. 68 КБ на файл оставляют запас
// для шести фото, обложки и текстовых данных в общем лимите публикации 1 МБ.
export const BUSINESS_CARD_GALLERY_MAX_BYTES = 68 * 1024;

export const DEFAULT_BUSINESS_CARD = {
  id: CARD_ID,
  theme: 'gold',
  profession: '',
  name: '',
  role: '',
  company: '',            // бренд над именем: «KOSTYUK PROJECT»
  city: '',
  tagline: '',
  bio: '',                // не показывается на визитке, уходит в сохранённый контакт
  phone: '',
  email: '',
  telegram: '',
  vk: '',
  max: '',
  website: '',
  videoUrl: '',           // ссылка на выступление: кнопка «Смотреть выступление»
  avatarPhoto: '',        // legacy: новые визитки используют только обложку
  coverPhoto: '',         // data:image/jpeg;base64,...
  coverPosition: 'top',   // 'top' | 'center' | 'bottom'
  galleryPhotos: [],      // номера и работы: data:image/jpeg;base64,... до 6 фото
  galleryCaptions: [],    // название номера, индекс совпадает с galleryPhotos
  // Номер на странице праздника — отдельный экран, как слайд презентации:
  // продающий заголовок («Один бросок. Та самая карта») и пара строк.
  galleryHeadlines: [],
  galleryTexts: [],
  // Доверие: короткие факты («10 лет» · «на сцене») и строка клиентов.
  facts: [],              // [{ value, label }] до 3
  clients: '',
  credentials: '',        // регалии на экране «Артист»: «Автор шоу „Секрет“…»
  // Форматы выступления без цены: «20 минут · Сценический блок».
  formats: [],            // [{ minutes, title, description }] до 4
  // Что нужно от площадки — снимает страх организатора.
  requirements: [],       // [{ title, text }] до 4
  requirementsNote: '',
  included: [],           // [{ text }] до 4 — что входит в цену: «Реквизит», «Логотип в номере»
  quotes: [],             // [{ text, author, occasion }] до 3 — отзыв можно привязать к празднику
  // Праздники: { [id]: { on, note, headline, text, photo, video,
  // momentTitle, momentText, momentPhoto, acts, highlightTitle, highlightText,
  // highlightPhoto, urgency } }. Каталог — shared/data/occasions.js, свои
  // праздники — customOccasions: [{ id, title, slug }].
  occasions: {},
  customOccasions: [],
  leadEnabled: true,
  crmEnabled: false,      // встроенная заявка и CRM доступны только в Pro
  crmModeSynced: false,   // локальный маркер миграции старых публикаций
  leadKey: '',
  kioskMode: false,       // режим витрины: иконка открывает сразу present с QR
  publishedSlug: '',
  publishedAt: null
};

export const CARD_LIMITS = {
  facts: 3,
  formats: 4,
  requirements: 4,
  included: 4,
  quotes: 3,
  gallery: 6,
  customOccasions: MAX_CUSTOM_OCCASIONS
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

// Подписи номеров идут параллельно фото: индекс строки = индекс снимка.
function cleanGalleryTexts(input, max) {
  if (!Array.isArray(input)) return [];
  return input.slice(0, CARD_LIMITS.gallery).map((value) => clean(value, max));
}

// Списки (факты, форматы, требования, цитаты) в редакторе живут построчно:
// человек нажал «Добавить» и ещё не начал печатать — пустая строка должна
// пережить автосохранение. Поэтому здесь пустые строки сохраняются, а
// отбрасываются только при публикации (см. filled в publicCardPayload).
function cleanList(input, limit, shape) {
  if (!Array.isArray(input)) return [];
  return input
    .filter((item) => item && typeof item === 'object')
    .slice(0, limit)
    .map(shape);
}

const cleanFacts = (input) => cleanList(input, CARD_LIMITS.facts, (item) => ({
  value: clean(item.value, 12),
  label: clean(item.label, 24)
}));

const cleanFormats = (input) => cleanList(input, CARD_LIMITS.formats, (item) => ({
  minutes: clean(item.minutes, 6),
  title: clean(item.title, 48),
  description: clean(item.description, 90)
}));

const cleanRequirements = (input) => cleanList(input, CARD_LIMITS.requirements, (item) => ({
  title: clean(item.title, 24),
  text: clean(item.text, 70)
}));

const cleanQuotes = (input) => cleanList(input, CARD_LIMITS.quotes, (item) => ({
  text: clean(item.text, 220),
  author: clean(item.author, 60),
  // Отзыв заказчика корпоратива сильнее показать на странице корпоратива.
  occasion: isOccasionId(item.occasion) ? String(item.occasion) : ''
}));

const cleanIncluded = (input) => cleanList(input, CARD_LIMITS.included, (item) => ({
  text: clean(item.text, 80)
}));

// Номер фото для праздника: -1 — обложка визитки, 0…5 — фото из «Номеров».
function cleanPhotoIndex(value) {
  const n = Number(value);
  return Number.isInteger(n) && n >= -1 && n < CARD_LIMITS.gallery ? n : -1;
}

// Какие номера показать на странице праздника: null — все, массив — выбор
// владельца в его порядке (на выпускном одни номера, на свадьбе другие).
function cleanActsPick(value) {
  if (!Array.isArray(value)) return null;
  const seen = new Set();
  for (const raw of value) {
    const n = Number(raw);
    if (Number.isInteger(n) && n >= 0 && n < CARD_LIMITS.gallery) seen.add(n);
  }
  return [...seen];
}

// Свои праздники: { id, title, slug }. Адрес не меняется после создания —
// ссылка уже могла уйти клиентам. Дубли и пересечения с каталогом отбрасываем.
function cleanCustomOccasions(input) {
  if (!Array.isArray(input)) return [];
  const ids = new Set();
  const slugs = new Set(OCCASIONS.map((item) => item.slug));
  const out = [];
  for (const item of input) {
    if (!item || typeof item !== 'object') continue;
    const id = String(item.id || '');
    const slug = String(item.slug || '').toLowerCase();
    const title = clean(item.title, OCCASION_TITLE_MAX);
    if (!CUSTOM_OCCASION_RE.test(id) || ids.has(id)) continue;
    if (!OCCASION_SLUG_RE.test(slug) || slug.length > 30 || slugs.has(slug) || !title) continue;
    ids.add(id);
    slugs.add(slug);
    out.push({ id, title, slug });
    if (out.length >= CARD_LIMITS.customOccasions) break;
  }
  return out;
}

// «Новый год» и «Юбилеи» были в каталоге v2.0.0. Каталог стал сезонным, а
// включённые страницы этих праздников переезжают в свои — с теми же адресами,
// чтобы уже разосланные ссылки продолжали открываться.
const LEGACY_OCCASIONS = {
  newyear: { id: 'cnewyar', title: 'Новый год', slug: 'novyy-god' },
  jubilee: { id: 'cjubile', title: 'Юбилеи', slug: 'yubiley' }
};

function withLegacyOccasions(occasions, customOccasions) {
  const source = occasions && typeof occasions === 'object' && !Array.isArray(occasions) ? occasions : {};
  let custom = Array.isArray(customOccasions) ? customOccasions : [];
  let next = source;
  for (const [legacyId, def] of Object.entries(LEGACY_OCCASIONS)) {
    const item = source[legacyId];
    if (!item || typeof item !== 'object' || item.on !== true) continue;
    if (custom.some((c) => c && (c.id === def.id || c.slug === def.slug))) continue;
    custom = [...custom, { ...def }];
    next = { ...next, [def.id]: item };
  }
  return { occasions: next, customOccasions: custom };
}

// Настройки праздников. Ключи — только каталог и свои праздники визитки:
// чужой ключ не должен превращаться в страницу.
function cleanOccasions(input, customOccasions) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const ids = [...OCCASIONS.map((item) => item.id), ...customOccasions.map((item) => item.id)];
  const out = {};
  for (const id of ids) {
    const item = source[id];
    if (!item || typeof item !== 'object') continue;
    out[id] = {
      on: item.on === true,
      note: clean(item.note, 60),
      headline: clean(item.headline, 90),
      text: clean(item.text, 220),
      photo: cleanPhotoIndex(item.photo),
      video: cleanUrl(item.video),
      momentTitle: clean(item.momentTitle, 60),
      momentText: clean(item.momentText, 160),
      momentPhoto: cleanPhotoIndex(item.momentPhoto),
      acts: cleanActsPick(item.acts),
      highlightTitle: clean(item.highlightTitle, 40),
      highlightText: clean(item.highlightText, 140),
      highlightPhoto: cleanPhotoIndex(item.highlightPhoto),
      urgency: clean(item.urgency, 120)
    };
  }
  return out;
}

// Публикуются только заполненные строки: пустая заготовка из редактора не
// должна превращаться в пустую плитку на визитке клиента.
const filled = (list, key) => list.filter((item) => String(item[key] || '').trim());

function publicOccasions(occasions) {
  const out = {};
  for (const [id, item] of Object.entries(occasions)) {
    if (item.on) out[id] = item;
  }
  return out;
}

// Клиенту нужны только свои праздники, страницы которых включены.
function publicCustomOccasions(custom, occasions) {
  return custom.filter((item) => occasions[item.id]?.on);
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

// Поля прежних версий визитки, у которых больше нет ни экрана, ни места на
// публичной странице: цена «от», услуги и пакеты (их заменили праздники и
// форматы), спецпредложение и быстрые вопросы (их заменила одна заявка
// «Проверить дату»), соцсети и график из CRM. Убираем при чтении, чтобы
// они не жили в данных мёртвым грузом и не уезжали в резервные копии.
const RETIRED_FIELDS = [
  'headline', 'highlights', 'portfolioUrl', 'services', 'priceFrom',
  'responseTime', 'servicePackages', 'socials', 'cardMode', 'ctaText',
  'offerText', 'leadTitle', 'leadSubtitle', 'showSchedule', 'schedule'
];

function withoutRetired(input) {
  const rest = { ...input };
  for (const key of RETIRED_FIELDS) delete rest[key];
  return rest;
}

export function normalizeBusinessCard(input = {}) {
  // Один фирменный визуальный язык: графит и шампань.
  // Старые карточки с альтернативными темами автоматически обновляются.
  const theme = DEFAULT_BUSINESS_CARD.theme;
  const professionIds = new Set(BUSINESS_CARD_PROFESSIONS.map((item) => item.id));
  const profession = professionIds.has(String(input.profession || '')) ? String(input.profession) : '';
  const leadKey = /^[a-f0-9]{32}$/i.test(String(input.leadKey || '')) ? String(input.leadKey).toLowerCase() : '';
  const legacy = withLegacyOccasions(input.occasions, input.customOccasions);
  const customOccasions = cleanCustomOccasions(legacy.customOccasions);
  return {
    ...DEFAULT_BUSINESS_CARD,
    ...withoutRetired(input),
    id: CARD_ID,
    theme,
    profession,
    name: clean(input.name, 80),
    role: clean(input.role, 80),
    company: clean(input.company, 40),
    city: clean(input.city, 80),
    tagline: clean(input.tagline, 90),
    bio: clean(input.bio, 800),
    phone: normalizePhone(input.phone),
    email: cleanEmail(input.email),
    telegram: normalizeTelegram(input.telegram),
    vk: normalizeVk(input.vk),
    max: normalizeMax(input.max),
    website: cleanUrl(input.website),
    videoUrl: cleanUrl(input.videoUrl),
    avatarPhoto: '',
    coverPhoto: cleanDataUrl(input.coverPhoto, 320 * 1024),
    coverPosition: ['top', 'center', 'bottom'].includes(String(input.coverPosition || ''))
      ? String(input.coverPosition)
      : DEFAULT_BUSINESS_CARD.coverPosition,
    galleryPhotos: cleanGallery(input.galleryPhotos),
    galleryCaptions: cleanGalleryTexts(input.galleryCaptions, 100),
    galleryHeadlines: cleanGalleryTexts(input.galleryHeadlines, 60),
    galleryTexts: cleanGalleryTexts(input.galleryTexts, 160),
    facts: cleanFacts(input.facts),
    clients: clean(input.clients, 160),
    credentials: clean(input.credentials, 220),
    formats: cleanFormats(input.formats),
    requirements: cleanRequirements(input.requirements),
    requirementsNote: clean(input.requirementsNote, 120),
    included: cleanIncluded(input.included),
    quotes: cleanQuotes(input.quotes),
    occasions: cleanOccasions(legacy.occasions, customOccasions),
    customOccasions,
    leadEnabled: input.leadEnabled !== false,
    crmEnabled: input.crmEnabled === true,
    crmModeSynced: input.crmModeSynced === true,
    leadKey,
    kioskMode: input.kioskMode === true,
    publishedSlug: /^[a-z0-9_-]{6,32}$/i.test(String(input.publishedSlug || '')) ? String(input.publishedSlug) : '',
    publishedAt: Number.isFinite(Number(input.publishedAt)) ? Number(input.publishedAt) : null
  };
}

// Что уходит на сервер и видит клиент. Только то, что рисует визитка, плюс
// bio — оно не показывается, но попадает в сохранённый гостем контакт.
export function publicCardPayload(card) {
  const c = normalizeBusinessCard(card);
  return {
    theme: c.theme,
    profession: c.profession,
    name: c.name,
    role: c.role,
    company: c.company,
    city: c.city,
    tagline: c.tagline,
    bio: c.bio,
    phone: c.phone,
    email: c.email,
    telegram: c.telegram,
    vk: c.vk,
    max: c.max,
    website: c.website,
    videoUrl: c.videoUrl,
    avatarPhoto: '',
    coverPhoto: c.coverPhoto,
    coverPosition: c.coverPosition,
    galleryPhotos: c.galleryPhotos,
    galleryCaptions: c.galleryCaptions,
    galleryHeadlines: c.galleryHeadlines,
    galleryTexts: c.galleryTexts,
    facts: filled(c.facts, 'value'),
    clients: c.clients,
    credentials: c.credentials,
    formats: filled(c.formats, 'title'),
    requirements: filled(c.requirements, 'title'),
    requirementsNote: c.requirementsNote,
    included: filled(c.included, 'text'),
    quotes: filled(c.quotes, 'text'),
    occasions: publicOccasions(c.occasions),
    customOccasions: publicCustomOccasions(c.customOccasions, c.occasions),
    leadEnabled: c.leadEnabled,
    crmEnabled: c.crmEnabled
  };
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
