// Метки показов, автоответы и узнавание вернувшихся.
//
// Метка показа — это ответ на вопрос «откуда приходят клиенты». Владелец
// заводит метку под конкретное событие («Свадьба Ани, 12 апреля»), получает
// для неё отдельную ссылку и QR. Дальше каждое открытие визитки по этой
// ссылке пишется в счётчик метки — и через месяц видно, какое мероприятие
// действительно принесло обращения, а какое только время.
import crypto from 'node:crypto';

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

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

const TAGS_KEY = (slug) => `eventory:card:${slug}:tags`;
const TAG_STATS_KEY = (slug, tag) => `eventory:card:${slug}:tag:${tag}`;
const CARD_STATS_KEY = (slug) => `eventory:card:${slug}:stats`;
const VISITOR_KEY = (slug, visitor) => `eventory:card:${slug}:visitor:${visitor}`;
const DIALOG_KEY = (slug) => `eventory:card:${slug}:dialogs`;
const LEADS_KEY = (slug) => `eventory:card:${slug}:leads`;
// Индекс «горячих» гостей карточки (для «Догони»): Sorted Set, score = lastAt.
// Только заинтересованные гости, не все анонимы — иначе индекс раздувается.
const HOT_KEY = (slug) => `eventory:card:${slug}:hot`;
const HOT_MAX = 50; // держим последних 50 горячих, старых вытесняем

export const MAX_TAGS = 40;
const YEAR = 60 * 60 * 24 * 365;

export function createTagId() {
  // Короткий код: он попадает в ссылку и на печатный QR, длинный неудобен.
  return crypto.randomBytes(4).toString('hex');
}

/* ─────────── Метки показов ─────────── */

function sanitizeTag(input = {}) {
  const clean = (v, max) => String(v ?? '').trim().slice(0, max);
  return {
    id: clean(input.id, 16),
    label: clean(input.label, 80),        // «Свадьба Ани»
    place: clean(input.place, 80),        // «Барвиха»
    date: clean(input.date, 24),          // ISO-дата события
    createdAt: Number(input.createdAt) || Date.now()
  };
}

export async function listTags(slug) {
  if (!storeConfigured()) return [];
  const raw = await redis(['GET', TAGS_KEY(slug)]);
  if (!raw) return [];
  try {
    const items = JSON.parse(raw);
    return Array.isArray(items) ? items.map(sanitizeTag) : [];
  } catch {
    return [];
  }
}

export async function saveTag(slug, tag) {
  if (!storeConfigured()) return null;
  const all = await listTags(slug);
  if (all.length >= MAX_TAGS) return null;
  const item = sanitizeTag({ ...tag, id: tag.id || createTagId() });
  if (!item.label) return null;
  await redis(['SET', TAGS_KEY(slug), JSON.stringify([item, ...all])]);
  return item;
}

export async function deleteTag(slug, id) {
  if (!storeConfigured()) return false;
  const all = await listTags(slug);
  const next = all.filter((t) => t.id !== id);
  if (next.length === all.length) return false;
  await redis(['SET', TAGS_KEY(slug), JSON.stringify(next)]);
  await redis(['DEL', TAG_STATS_KEY(slug, id)]);
  return true;
}

// Статистика метки: открытия, уникальные посетители, переходы в контакты.
async function readStats(key) {
  if (!storeConfigured()) return { opens: 0, visitors: 0, contacts: 0, lastAt: 0 };
  const raw = await redis(['HGETALL', key]);
  const out = {};
  if (Array.isArray(raw)) {
    for (let i = 0; i < raw.length; i += 2) out[String(raw[i])] = Number(raw[i + 1] || 0);
  } else if (raw && typeof raw === 'object') {
    Object.entries(raw).forEach(([k, v]) => { out[k] = Number(v || 0); });
  }
  return {
    opens: out.opens || 0,
    visitors: out.visitors || 0,
    contacts: out.contacts || 0,
    lastAt: out.lastAt || 0
  };
}

export function readTagStats(slug, tagId) {
  return readStats(TAG_STATS_KEY(slug, tagId));
}

export function readCardStats(slug) {
  return readStats(CARD_STATS_KEY(slug));
}

// Одно открытие визитки по метке. visitorId — случайный идентификатор,
// который живёт в браузере гостя: он позволяет отличить «шесть открытий
// одним человеком» от «шесть разных людей», не собирая ничего личного.
async function trackStats(key, visitorId, event = 'open') {
  if (!storeConfigured()) return false;

  if (event === 'contact') {
    await redis(['HINCRBY', key, 'contacts', '1']);
  } else {
    await redis(['HINCRBY', key, 'opens', '1']);
    // Уникальность считаем по отметке «этого гостя уже видели».
    if (visitorId) {
      const seenKey = `${key}:seen:${visitorId}`;
      const first = await redis(['SET', seenKey, '1', 'NX', 'EX', String(YEAR)]);
      if (first) await redis(['HINCRBY', key, 'visitors', '1']);
    }
  }
  await redis(['HSET', key, 'lastAt', String(Date.now())]);
  await redis(['EXPIRE', key, String(YEAR)]);
  return true;
}

export function trackTagOpen(slug, tagId, visitorId, event = 'open') {
  return trackStats(TAG_STATS_KEY(slug, tagId), visitorId, event);
}

export function trackCardOpen(slug, visitorId, event = 'open') {
  return trackStats(CARD_STATS_KEY(slug), visitorId, event);
}

/* ─────────── Узнавание вернувшихся ─────────── */

// Что гость смотрел в прошлый раз. Хранится обезличенно: только id визитки,
// случайный id гостя и последний интерес — ни имени, ни контактов.
export async function readVisitor(slug, visitorId) {
  if (!storeConfigured() || !visitorId) return null;
  const raw = await redis(['GET', VISITOR_KEY(slug, visitorId)]);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// Горячие гости карточки для «Догони» — заинтересованные, свежие сверху.
// Возвращаем профили с visitorId, чтобы владелец мог отсеять тех, кто уже
// оставил заявку. limit ограничивает выборку (обычно показываем немного).
export async function listHotVisitors(slug, limit = 20) {
  if (!storeConfigured()) return [];
  // ZRANGE REV — от самых свежих (большой lastAt) к старым.
  const ids = await redis(['ZRANGE', HOT_KEY(slug), '0', String(limit - 1), 'REV']);
  if (!Array.isArray(ids) || !ids.length) return [];
  const out = [];
  for (const id of ids) {
    const v = await readVisitor(slug, id);
    if (v) out.push({ visitorId: id, ...v });
  }
  return out;
}

// Портрет гостя: сколько раз заходил, что смотрел, откуда пришёл. Интересы
// копим ПО РАЗДЕЛАМ как счётчики (interests: {«цены»: 3, «галерея»: 1}) — так
// виден главный интерес и его смена, а не последняя случайная строка.
//   countVisit: true  — новый заход (event=open), инкрементим visits
//   section: 'галерея' — гость посмотрел раздел (event=view), +1 к его счётчику
export async function saveVisitor(slug, visitorId, data = {}) {
  if (!storeConfigured() || !visitorId) return false;
  const prev = await readVisitor(slug, visitorId) || {};

  const interests = (prev.interests && typeof prev.interests === 'object') ? { ...prev.interests } : {};
  const section = String(data.section || data.interest || '').slice(0, 60).trim();
  if (section) interests[section] = (Number(interests[section]) || 0) + 1;

  // Главный интерес — раздел с наибольшим счётчиком (для быстрого показа).
  const topInterest = Object.keys(interests)
    .sort((a, b) => interests[b] - interests[a])[0] || prev.interest || '';

  const next = {
    firstAt: prev.firstAt || Date.now(),
    lastAt: Date.now(),
    visits: (Number(prev.visits) || 0) + (data.countVisit ? 1 : 0),
    interest: String(topInterest).slice(0, 80),
    interests,
    tagId: String(data.tagId || prev.tagId || '').slice(0, 16)
  };
  await redis(['SET', VISITOR_KEY(slug, visitorId), JSON.stringify(next), 'EX', String(YEAR)]);

  // Горячий гость — заходил не раз И смотрел разделы. Кладём в индекс «Догони»,
  // чтобы владелец видел заинтересованных, даже если они не оставили заявку.
  const isHot = next.visits >= 2 && Object.keys(interests).length > 0;
  if (isHot) {
    await redis(['ZADD', HOT_KEY(slug), String(next.lastAt), visitorId]);
    // Держим индекс компактным: оставляем только HOT_MAX самых свежих.
    await redis(['ZREMRANGEBYRANK', HOT_KEY(slug), '0', String(-HOT_MAX - 1)]);
    await redis(['EXPIRE', HOT_KEY(slug), String(YEAR)]);
  }
  return next;
}

/* ─────────── Ночные вопросы ─────────── */

// Клиент спросил ночью — визитка ответила сама, а владелец утром видит
// готовый диалог. Храним и вопрос, и то, что ответила визитка.
export async function saveDialog(slug, entry) {
  if (!storeConfigured()) return null;
  const raw = await redis(['GET', DIALOG_KEY(slug)]);
  let all = [];
  try {
    all = raw ? JSON.parse(raw) : [];
  } catch {
    all = [];
  }
  const item = {
    id: crypto.randomBytes(6).toString('hex'),
    question: String(entry.question || '').slice(0, 300),
    answer: String(entry.answer || '').slice(0, 600),
    kind: String(entry.kind || 'other').slice(0, 20),
    contact: String(entry.contact || '').slice(0, 120),
    tagId: String(entry.tagId || '').slice(0, 16),
    createdAt: Date.now(),
    read: false
  };
  const next = [item, ...(Array.isArray(all) ? all : [])].slice(0, 50);
  await redis(['SET', DIALOG_KEY(slug), JSON.stringify(next), 'EX', String(YEAR)]);
  return item;
}

export async function listDialogs(slug) {
  if (!storeConfigured()) return [];
  const raw = await redis(['GET', DIALOG_KEY(slug)]);
  try {
    const all = raw ? JSON.parse(raw) : [];
    return Array.isArray(all) ? all : [];
  } catch {
    return [];
  }
}

export async function markDialogsRead(slug) {
  if (!storeConfigured()) return false;
  const all = await listDialogs(slug);
  const next = all.map((d) => ({ ...d, read: true }));
  await redis(['SET', DIALOG_KEY(slug), JSON.stringify(next), 'EX', String(YEAR)]);
  return true;
}

/* ─────────── Заявки «Узнать цену» ─────────── */

// Клиент нажал «Узнать цену» на визитке и оставил контакт. Храним по образцу
// диалогов: массив под ключом визитки, TTL год, новые сверху. Контакт клиента —
// «кто это» — владелец видит только в Eventory за Pro (барьер навесим шагом 2);
// здесь просто копим заявки и считаем их.
export async function saveLead(slug, entry) {
  if (!storeConfigured()) return null;
  const raw = await redis(['GET', LEADS_KEY(slug)]);
  let all = [];
  try {
    all = raw ? JSON.parse(raw) : [];
  } catch {
    all = [];
  }
  const item = {
    id: crypto.randomBytes(6).toString('hex'),
    name: String(entry.name || '').slice(0, 80),
    contact: String(entry.contact || '').slice(0, 200),
    // Структурные контакты для sales-системы (работа в VK/Telegram).
    phone: String(entry.phone || '').slice(0, 30),
    vk: String(entry.vk || '').slice(0, 120),
    telegram: String(entry.telegram || '').slice(0, 40),
    eventDate: String(entry.eventDate || '').slice(0, 20),
    tagId: String(entry.tagId || '').slice(0, 16),
    // Связь с профилем гостя: по нему в «Отклике» собираем досье (что смотрел).
    visitorId: String(entry.visitorId || '').slice(0, 64),
    // Крючок «Догони»: если гость пришёл по спецпредложению — храним его текст,
    // чтобы владелец видел в «Отклике», по какому условию клиент оставил контакт.
    offerLabel: String(entry.offerLabel || '').slice(0, 140),
    createdAt: Date.now(),
    read: false
  };
  const next = [item, ...(Array.isArray(all) ? all : [])].slice(0, 100);
  await redis(['SET', LEADS_KEY(slug), JSON.stringify(next), 'EX', String(YEAR)]);
  return item;
}

export async function listLeads(slug) {
  if (!storeConfigured()) return [];
  const raw = await redis(['GET', LEADS_KEY(slug)]);
  try {
    const all = raw ? JSON.parse(raw) : [];
    return Array.isArray(all) ? all : [];
  } catch {
    return [];
  }
}

export async function markLeadsRead(slug) {
  if (!storeConfigured()) return false;
  const all = await listLeads(slug);
  const next = all.map((l) => ({ ...l, read: true }));
  await redis(['SET', LEADS_KEY(slug), JSON.stringify(next), 'EX', String(YEAR)]);
  return true;
}

// Удаление одной заявки по id (спам, ошибка, тест). Возвращаем true, только
// если заявка нашлась и удалена — чтобы владелец видел реальный результат, а не
// «ок» на несуществующем id. TTL переставляем, как при любой записи списка.
export async function deleteLead(slug, id) {
  if (!storeConfigured()) return false;
  const wanted = String(id || '').trim();
  if (!wanted) return false;
  const all = await listLeads(slug);
  const next = all.filter((l) => String(l.id) !== wanted);
  if (next.length === all.length) return false;
  await redis(['SET', LEADS_KEY(slug), JSON.stringify(next), 'EX', String(YEAR)]);
  return true;
}

// Владелец вручную приписывает заявке метку-источник (клиент пришёл не по QR,
// а сказал устно «я со свадьбы 20.05»). tagId='' снимает метку. Возвращает
// false, если заявки с таким id нет.
export async function setLeadTag(slug, id, tagId) {
  if (!storeConfigured()) return false;
  const wanted = String(id || '').trim();
  if (!wanted) return false;
  const all = await listLeads(slug);
  let found = false;
  const next = all.map((l) => {
    if (String(l.id) !== wanted) return l;
    found = true;
    return { ...l, tagId: String(tagId || '').slice(0, 16) };
  });
  if (!found) return false;
  await redis(['SET', LEADS_KEY(slug), JSON.stringify(next), 'EX', String(YEAR)]);
  return true;
}

// Есть ли у владельца карточки активная Pro-подписка Eventory. Мост: карточка
// связана с устройством Eventory (card-link, пишет Eventory при переходе по
// ссылке), а устройство помечено Pro (pro-device, пишет Eventory пока подписка
// активна). Обе отметки живут в ОБЩЕМ Redis (у визитки и Eventory один Upstash).
// Нет связки или нет Pro-отметки — значит не Pro, контакт заявки закрыт.
export async function isOwnerPro(leadKey) {
  if (!storeConfigured()) return false;
  const key = String(leadKey || '').trim().toLowerCase();
  if (!/^[a-f0-9]{32}$/.test(key)) return false;
  const deviceId = await redis(['GET', `eventory:card-link:${key}`]);
  if (!deviceId) return false;
  const pro = await redis(['GET', `eventory:pro-device:${deviceId}`]);
  return pro === '1';
}

// Pro со сроком действия. proUntil — до какой даты подписка активна (по TTL
// отметки pro-device). Визитка запоминает эту дату у себя и до неё показывает
// Pro-контент, не переспрашивая сервер каждый раз — бесшовно для владельца.
export async function ownerProStatus(leadKey) {
  if (!storeConfigured()) return { pro: false, proUntil: 0 };
  const key = String(leadKey || '').trim().toLowerCase();
  if (!/^[a-f0-9]{32}$/.test(key)) return { pro: false, proUntil: 0 };
  const deviceId = await redis(['GET', `eventory:card-link:${key}`]);
  if (!deviceId) return { pro: false, proUntil: 0 };
  const pro = await redis(['GET', `eventory:pro-device:${deviceId}`]);
  if (pro !== '1') return { pro: false, proUntil: 0 };
  // TTL отметки = сколько секунд подписка ещё активна. Переводим в дату.
  const ttl = Number(await redis(['TTL', `eventory:pro-device:${deviceId}`]));
  const proUntil = ttl > 0 ? Date.now() + ttl * 1000 : 0;
  return { pro: true, proUntil };
}
