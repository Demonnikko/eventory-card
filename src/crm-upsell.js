// Точки перехода из бесплатной визитки в основной продукт — Eventory.
//
// Правило продукта: визитка полностью бесплатна и самодостаточна. Eventory
// показываем не как рекламу, а как логичное продолжение: человек уже упёрся
// в задачу (заявки теряются, нужен расчёт, календарь), и мы показываем, что
// в Eventory это уже решено. Тон спокойный, без давления и восклицаний.
export const CRM_NAME = 'Eventory';
export const CRM_URL = 'https://eventory-mvp.vercel.app/';

// Каждая точка включается/выключается отдельно. Состав ещё не финализирован,
// поэтому здесь один переключатель, а не правки по всему коду.
export const UPSELL_POINTS = {
  // Заявка пришла — вести её дальше (воронка, история) естественно в Eventory.
  leads: {
    enabled: true,
    eyebrow: 'Заявки',
    title: 'Чтобы заявки не терялись',
    text: 'Клиенты пишут и звонят, а держать их в голове и переписке тяжело. В Eventory заявки идут по этапам — от первого сообщения до заказа.',
    cta: 'Показать в Eventory'
  },
  // Из заявки — расчёт и КП. Главный сценарий Eventory.
  quote: {
    enabled: true,
    eyebrow: 'Расчёт и КП',
    title: 'Смета и КП за минуты',
    text: 'Посчитать стоимость, собрать коммерческое и выставить счёт — всё это в Eventory, без таблиц и ручных подсчётов.',
    cta: 'Как это в Eventory'
  },
  // Календарь занятости.
  calendar: {
    enabled: true,
    eyebrow: 'Календарь',
    title: 'Даты под контролем',
    text: 'Бронь, предоплаты и напоминания легко упустить. В Eventory занятость и деньги по датам видны в одном календаре.',
    cta: 'Открыть Eventory'
  },
  // Подпись на публичной визитке — её видит клиент владельца, а не он сам.
  // Самая деликатная точка: текст нейтральный, без давления.
  public: {
    enabled: true,
    eyebrow: '',
    title: '',
    text: '',
    cta: ''
  },
  // Аналитика просмотров: в визитке — общий счётчик, детали в Eventory.
  analytics: {
    enabled: true,
    eyebrow: 'Аналитика',
    title: 'Кто и откуда приходит',
    text: 'Визитка показывает счётчик, но не путь клиента. В Eventory видно, с какого мероприятия пришёл человек и дошёл ли до заявки.',
    cta: 'Показать в Eventory'
  }
};

export function upsellHref(pointId) {
  // utm — чтобы в CRM было видно, какая точка визитки реально приводит людей.
  const url = new URL(CRM_URL);
  url.searchParams.set('utm_source', 'card-app');
  url.searchParams.set('utm_medium', 'upsell');
  url.searchParams.set('utm_campaign', pointId);
  return url.toString();
}

export function activeUpsell(pointId) {
  const point = UPSELL_POINTS[pointId];
  return point?.enabled ? point : null;
}
