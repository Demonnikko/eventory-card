// Праздники визитки — отдельные продающие страницы под повод.
//
// Человек из рассылки Sales попадает не на «витрину артиста», а сразу на свой
// повод. Каталог — три сезонных праздника, общих для всех артистов: адреса
// их страниц одинаковые (/v/<визитка>/korporativ), и Sales собирает ссылку
// сам, не спрашивая владельца. Всё остальное (юбилей, 8 Марта, детский
// праздник) артист заводит сам — «свой праздник» со своим адресом.
//
// months — месяцы, когда повод бронируют (0 = январь). В этот период его
// плитка на визитке становится главной, на странице появляется «Сезон ·
// бронируют сейчас», а у корпоратива название меняется на «Новогодний».
export const OCCASIONS = [
  {
    id: 'corporate',
    slug: 'korporativ',
    title: 'Корпоратив',
    seasonTitle: 'Новогодний корпоратив',
    months: [9, 10, 11],
    note: 'Шоу для команды и гостей'
  },
  {
    id: 'graduation',
    slug: 'vypusknoy',
    title: 'Выпускные',
    months: [2, 3, 4, 5],
    note: 'Май и июнь'
  },
  {
    id: 'wedding',
    slug: 'svadba',
    title: 'Свадьбы',
    months: [3, 4, 5, 6, 7, 8],
    note: 'Для гостей и молодожёнов'
  }
];

// Свой праздник: id вида c1a2b3c, адрес — из названия латиницей.
export const CUSTOM_OCCASION_RE = /^c[a-z0-9]{6}$/;
export const OCCASION_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const MAX_CUSTOM_OCCASIONS = 4;
export const OCCASION_TITLE_MAX = 40;
const SLUG_MAX = 30;

const BY_ID = new Map(OCCASIONS.map((item) => [item.id, item]));
const BY_SLUG = new Map(OCCASIONS.map((item) => [item.slug, item]));

// Только каталог — для мест без визитки под рукой (сервер, статистика).
export function occasionBySlug(slug) {
  return BY_SLUG.get(String(slug || '').toLowerCase()) || null;
}

// Повод из каталога или свой — допустимый id для статистики и заявок.
export function isOccasionId(id) {
  const value = String(id || '');
  return BY_ID.has(value) || CUSTOM_OCCASION_RE.test(value);
}

function customToOccasion(item) {
  return {
    id: item.id,
    slug: item.slug,
    title: item.title,
    months: [],
    note: 'По запросу',
    custom: true
  };
}

// Все праздники визитки: каталог, затем свои — в порядке добавления.
export function occasionsOf(card) {
  const custom = Array.isArray(card?.customOccasions) ? card.customOccasions : [];
  return [...OCCASIONS, ...custom.map(customToOccasion)];
}

export function findOccasion(card, { id = '', slug = '' } = {}) {
  const key = id ? String(id) : String(slug || '').toLowerCase();
  if (!key) return null;
  return occasionsOf(card).find((item) => (id ? item.id === key : item.slug === key)) || null;
}

export function occasionInSeason(occasion, date = new Date()) {
  if (!occasion?.months?.length) return false;
  return occasion.months.includes(date.getMonth());
}

// Название, которое видит клиент: в сезон у корпоратива — «Новогодний».
export function occasionTitle(occasion, date = new Date()) {
  if (!occasion) return '';
  return occasion.seasonTitle && occasionInSeason(occasion, date)
    ? occasion.seasonTitle
    : occasion.title;
}

// Включённые владельцем праздники: каталог, потом свои. Первым идёт тот, что
// сейчас в сезоне, — он же становится большой плиткой на визитке.
export function enabledOccasions(card, date = new Date()) {
  const settings = card?.occasions || {};
  const list = occasionsOf(card).filter((item) => settings[item.id]?.on);
  const seasonal = list.find((item) => occasionInSeason(item, date));
  if (!seasonal) return list;
  return [seasonal, ...list.filter((item) => item !== seasonal)];
}

/* ─────────── Обложка и анимация праздника ─────────── */

// Своя обложка праздника лежит в Vercel Blob (в самой визитке места нет:
// публикация ограничена 1 МБ). Принимаем только ссылку из своего хранилища
// и своей папки covers/ — чужой адрес на странице клиента не появится.
export const OCCASION_COVER_RE = /^https:\/\/[a-z0-9-]+\.public\.blob\.vercel-storage\.com\/covers\/[a-z0-9_-]{6,32}\/[a-f0-9]{18}\.(?:jpg|webp)$/i;
export const COVER_POSITIONS = ['top', 'center', 'bottom'];

// Анимация в шапке страницы праздника. auto — по поводу (см. defaultOccasionFx).
export const OCCASION_FX = ['auto', 'none', 'garland', 'snow', 'confetti', 'petals', 'sparkles'];

// Свои праздники угадываем по названию: «Новый год» — гирлянда, «Свадьба» —
// лепестки. Остальным — блёстки: уместно для любого повода.
const CUSTOM_FX = [
  { re: /нов(ый|ого)\s*год|новогод|ёлк|елк|рождеств/i, fx: 'garland' },
  { re: /свад|венча|годовщин/i, fx: 'petals' },
  { re: /выпуск|последний звонок/i, fx: 'confetti' },
  { re: /8\s*марта|весн/i, fx: 'petals' },
  { re: /рожден|юбил|детск|вечерин/i, fx: 'confetti' }
];

export function defaultOccasionFx(occasion, date = new Date()) {
  if (!occasion) return 'none';
  if (occasion.id === 'corporate') return occasionInSeason(occasion, date) ? 'garland' : 'sparkles';
  if (occasion.id === 'graduation') return 'confetti';
  if (occasion.id === 'wedding') return 'petals';
  const match = CUSTOM_FX.find((item) => item.re.test(occasion.title || ''));
  return match ? match.fx : 'sparkles';
}

// Что показать на странице: выбор владельца или анимация по поводу.
export function occasionFx(occasion, settings, date = new Date()) {
  const chosen = settings?.fx;
  if (chosen && chosen !== 'auto' && OCCASION_FX.includes(chosen)) return chosen;
  return defaultOccasionFx(occasion, date);
}

/* ─────────── Свой праздник ─────────── */

const TRANSLIT = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i',
  й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't',
  у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '',
  э: 'e', ю: 'yu', я: 'ya'
};

// «Юбилей» → yubiley, «8 Марта» → 8-marta. Адрес читается в ссылке, поэтому
// латиница по-русски, а не набор случайных букв.
export function slugify(title) {
  const latin = Array.from(String(title || '').toLowerCase())
    .map((ch) => (ch in TRANSLIT ? TRANSLIT[ch] : ch))
    .join('');
  const slug = latin.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, SLUG_MAX).replace(/-+$/, '');
  return slug || 'prazdnik';
}

// Адрес не должен совпасть ни с каталогом, ни с другими своими праздниками:
// иначе две страницы делили бы одну ссылку.
export function uniqueOccasionSlug(card, title) {
  const base = slugify(title);
  const taken = new Set(occasionsOf(card).map((item) => item.slug));
  if (!taken.has(base)) return base;
  for (let n = 2; n < 100; n += 1) {
    const candidate = `${base.slice(0, SLUG_MAX - 3)}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base.slice(0, SLUG_MAX - 7)}-${Date.now().toString(36).slice(-6)}`;
}

export function createCustomOccasionId() {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = new Uint8Array(6);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  return `c${Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('')}`;
}

/* ─────────── Продающие тексты-образцы ─────────── */

// Подставляются по кнопке в пустые поля праздника — артист правит под себя.
// Тексты без привязки к профессии: визиткой пользуются ведущие, музыканты,
// фокусники. Каждый блок закрывает свой вопрос заказчика: что получит вечер,
// почему это работает, почему сейчас.
const TEMPLATES = {
  corporate: {
    headline: 'Вечер, который команда будет вспоминать весь год',
    text: 'Программа, в которой гости становятся участниками, а не зрителями',
    momentTitle: 'Когда удивление становится общим',
    momentText: 'Один гость выходит к артисту, а весь зал проживает финал вместе с ним.',
    highlightTitle: 'Ваш бренд в программе',
    highlightText: 'Имя и логотип компании становятся частью номера, и гости снимают это на телефоны.',
    urgency: 'Декабрьские даты разбирают в октябре и ноябре. Проверьте свою заранее.'
  },
  graduation: {
    headline: 'Выпускной, который запомнят дольше фотографий',
    text: 'Для выпускников, родителей и учителей: в зале, в ресторане, на теплоходе',
    momentTitle: 'Последний вечер вместе, самый яркий',
    momentText: 'Выпускники становятся частью программы, а родители снимают это на видео.',
    highlightTitle: 'Номер про ваш выпуск',
    highlightText: 'Имена, школа, общие истории: момент, который будет только у вашего класса.',
    urgency: 'Даты на конец мая и июнь бронируют с марта.'
  },
  wedding: {
    headline: 'Гости не заскучают, пока вы на фотосессии',
    text: 'Встреча гостей, фуршет и яркий номер на банкете',
    momentTitle: 'Самый тёплый момент вечера',
    momentText: 'Молодожёны в центре внимания, гости ахают, и это видео потом пересматривают годами.',
    highlightTitle: 'Номер для пары',
    highlightText: 'Отдельный момент для молодожёнов: подарок, который запомнят все гости.',
    urgency: 'Летние субботы разбирают за полгода. Проверьте свою дату.'
  }
};

export function occasionTemplate(occasion) {
  if (!occasion) return {};
  if (TEMPLATES[occasion.id]) return { ...TEMPLATES[occasion.id] };
  // Название праздника стоит строкой выше заголовка, поэтому сам заголовок
  // нейтральный: «Вечеринка, который запомнят» с подставленным названием
  // ломал бы род.
  return {
    headline: 'Праздник, который гости запомнят надолго',
    text: 'Программа под ваш повод, гостей и площадку',
    momentTitle: 'Момент, ради которого зовут артиста',
    momentText: 'Гости перестают смотреть в телефоны и смотрят в одну точку.',
    highlightTitle: 'Деталь под ваш повод',
    highlightText: 'Подстраиваю программу под виновника торжества и гостей.',
    urgency: 'Выходные разбирают заранее. Проверьте свою дату.'
  };
}
