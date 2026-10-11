// Праздники визитки — отдельные страницы под повод.
//
// Человек из рассылки Sales попадает не на «витрину артиста», а сразу на свой
// повод: корпоратив, выпускной, свадьбу. Каталог общий для всех артистов —
// так адреса страниц одинаковые (/v/<визитка>/korporativ), и Sales может
// собирать ссылку сам, не спрашивая владельца.
//
// months — месяцы, когда повод бронируют (0 = январь). В этот период его
// плитка на визитке становится главной, а у корпоратива меняется название
// на «Новогодний корпоратив». Пустой список — повод круглый год.
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
    id: 'newyear',
    slug: 'novyy-god',
    title: 'Новый год',
    months: [11, 0],
    note: '31 декабря и каникулы'
  },
  {
    id: 'graduation',
    slug: 'vypusknoy',
    title: 'Выпускные',
    months: [3, 4, 5],
    note: 'Май — июнь'
  },
  {
    id: 'wedding',
    slug: 'svadba',
    title: 'Свадьбы',
    months: [4, 5, 6, 7, 8],
    note: 'Для гостей и молодожёнов'
  },
  {
    id: 'jubilee',
    slug: 'yubiley',
    title: 'Юбилеи',
    months: [],
    note: 'Круглый год'
  }
];

const BY_ID = new Map(OCCASIONS.map((item) => [item.id, item]));
const BY_SLUG = new Map(OCCASIONS.map((item) => [item.slug, item]));

export function occasionById(id) {
  return BY_ID.get(String(id || '')) || null;
}

export function occasionBySlug(slug) {
  return BY_SLUG.get(String(slug || '').toLowerCase()) || null;
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

// Включённые владельцем праздники в порядке каталога. Первым идёт тот, что
// сейчас в сезоне, — он же становится большой плиткой на визитке.
export function enabledOccasions(card, date = new Date()) {
  const settings = card?.occasions || {};
  const list = OCCASIONS.filter((item) => settings[item.id]?.on);
  const seasonal = list.find((item) => occasionInSeason(item, date));
  if (!seasonal) return list;
  return [seasonal, ...list.filter((item) => item !== seasonal)];
}
