import test from 'node:test';
import assert from 'node:assert/strict';
import {
  OCCASIONS,
  enabledOccasions,
  findOccasion,
  occasionBySlug,
  occasionInSeason,
  occasionTemplate,
  occasionTitle,
  occasionFx,
  slugify,
  uniqueOccasionSlug
} from '../src/shared/data/occasions.js';
import { normalizeBusinessCard, publicCardPayload } from '../src/shared/data/businessCard.js';
import { cardPublicUrl, cardCompletion, DEFAULT_BUSINESS_CARD } from '../src/card-data.js';

const DECEMBER = new Date(2026, 11, 5);
const JUNE = new Date(2026, 5, 10);

// Фальшивый Upstash: хранит hash и строки в памяти и понимает только те
// команды, которые шлёт _tags-store.
function fakeRedis() {
  const hashes = new Map();
  const strings = new Map();
  return {
    hashes,
    fetch: async (_url, options) => {
      const [op, key, ...args] = JSON.parse(options.body);
      let result = null;
      if (op === 'HINCRBY') {
        const hash = hashes.get(key) || new Map();
        const next = Number(hash.get(args[0]) || 0) + Number(args[1] || 0);
        hash.set(args[0], next);
        hashes.set(key, hash);
        result = next;
      } else if (op === 'HGETALL') {
        result = Array.from(hashes.get(key) || []).flatMap(([field, value]) => [field, String(value)]);
      } else if (op === 'GET') {
        result = strings.get(key) || null;
      } else if (op === 'SET') {
        strings.set(key, args[0]);
        result = 'OK';
      } else if (op === 'EXPIRE') {
        result = 1;
      }
      return new Response(JSON.stringify({ result }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  };
}

async function withRedis(run) {
  const originalFetch = globalThis.fetch;
  const redis = fakeRedis();
  process.env.UPSTASH_REDIS_REST_URL = 'https://redis.test';
  process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';
  globalThis.fetch = redis.fetch;
  try {
    const store = await import(`../api/_tags-store.js?occasions=${Date.now()}-${Math.random()}`);
    await run(store, redis);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test('у каждого праздника уникальный id и адрес латиницей', () => {
  const ids = new Set(OCCASIONS.map((item) => item.id));
  const slugs = new Set(OCCASIONS.map((item) => item.slug));
  assert.equal(ids.size, OCCASIONS.length);
  assert.equal(slugs.size, OCCASIONS.length);
  for (const item of OCCASIONS) assert.match(item.slug, /^[a-z-]+$/);
  assert.equal(occasionBySlug('KORPORATIV')?.id, 'corporate');
  assert.equal(occasionBySlug('nope'), null);
});

test('в каталоге три сезонных праздника: новогодние корпоративы, выпускные, свадьбы', () => {
  assert.deepEqual(OCCASIONS.map((item) => item.id), ['corporate', 'graduation', 'wedding']);
  const byId = Object.fromEntries(OCCASIONS.map((item) => [item.id, item]));
  assert.equal(occasionInSeason(byId.corporate, DECEMBER), true);
  assert.equal(occasionInSeason(byId.graduation, DECEMBER), false);
  assert.equal(occasionInSeason(byId.graduation, JUNE), true);
  assert.equal(occasionInSeason(byId.wedding, JUNE), true);
  assert.equal(occasionInSeason(byId.wedding, DECEMBER), false);
  assert.ok(OCCASIONS.every((item) => item.months.length > 0));
});

test('корпоратив в сезон называется новогодним, летом — просто корпоративом', () => {
  const corporate = occasionBySlug('korporativ');
  assert.equal(occasionTitle(corporate, DECEMBER), 'Новогодний корпоратив');
  assert.equal(occasionTitle(corporate, JUNE), 'Корпоратив');
});

test('включённые праздники: каталог, затем свои, сезонный — первым', () => {
  const card = {
    customOccasions: [{ id: 'cabcdef', title: 'Юбилей', slug: 'yubiley' }],
    occasions: {
      corporate: { on: true },
      wedding: { on: true },
      cabcdef: { on: true },
      graduation: { on: false }
    }
  };
  assert.deepEqual(enabledOccasions(card, DECEMBER).map((item) => item.id), ['corporate', 'wedding', 'cabcdef']);
  assert.deepEqual(enabledOccasions(card, JUNE).map((item) => item.id), ['wedding', 'corporate', 'cabcdef']);
  assert.deepEqual(enabledOccasions({}, JUNE), []);
  assert.equal(findOccasion(card, { slug: 'yubiley' })?.id, 'cabcdef');
  assert.equal(findOccasion(card, { id: 'cabcdef' })?.custom, true);
  assert.equal(findOccasion(card, { slug: 'nope' }), null);
});

test('адрес своего праздника — русская латиница и без повторов', () => {
  assert.equal(slugify('Юбилей'), 'yubiley');
  assert.equal(slugify('8 Марта'), '8-marta');
  assert.equal(slugify('Детский праздник!'), 'detskiy-prazdnik');
  assert.equal(slugify('!!!'), 'prazdnik');
  const card = { customOccasions: [{ id: 'cabcdef', title: 'Юбилей', slug: 'yubiley' }] };
  assert.equal(uniqueOccasionSlug(card, 'Юбилей'), 'yubiley-2');
  assert.equal(uniqueOccasionSlug(card, 'Свадьба'), 'svadba-2', 'адрес каталога тоже занят');
});

test('свои праздники чистятся: чужие id, дубли адресов и лимит', () => {
  const card = normalizeBusinessCard({
    customOccasions: [
      { id: 'cabcdef', title: 'Юбилей', slug: 'yubiley' },
      { id: 'cabcdef', title: 'Дубль id', slug: 'dubl' },
      { id: 'c111111', title: 'Дубль адреса', slug: 'yubiley' },
      { id: 'c222222', title: 'Как каталог', slug: 'svadba' },
      { id: 'x', title: 'Плохой id', slug: 'plokhoy' },
      { id: 'c333333', title: '', slug: 'pusto' },
      { id: 'c444444', title: '8 Марта', slug: '8-marta' },
      { id: 'c555555', title: 'Выпускной в детском саду', slug: 'sad' },
      { id: 'c666666', title: 'Детский', slug: 'detskiy' },
      { id: 'c777777', title: 'Пятый', slug: 'pyatyy' }
    ],
    occasions: { cabcdef: { on: true }, c999999: { on: true } }
  });
  assert.deepEqual(card.customOccasions.map((item) => item.id), ['cabcdef', 'c444444', 'c555555', 'c666666']);
  assert.deepEqual(Object.keys(card.occasions), ['cabcdef'], 'настройки без своего праздника не живут');
});

test('«Новый год» и «Юбилеи» из старой версии переезжают в свои с прежними адресами', () => {
  const card = normalizeBusinessCard({
    occasions: { newyear: { on: true, headline: 'Ночь чудес' }, jubilee: { on: false } }
  });
  assert.deepEqual(card.customOccasions, [{ id: 'cnewyar', title: 'Новый год', slug: 'novyy-god' }]);
  assert.equal(card.occasions.cnewyar.headline, 'Ночь чудес');
  assert.equal(card.occasions.newyear, undefined);
  assert.equal(findOccasion(card, { slug: 'novyy-god' })?.id, 'cnewyar');
});

test('глубина страницы: момент, номера, срочность, видео — с лимитами', () => {
  const card = normalizeBusinessCard({
    galleryPhotos: [],
    galleryHeadlines: ['x'.repeat(100)],
    galleryTexts: ['y'.repeat(300)],
    credentials: 'z'.repeat(400),
    included: [{ text: 'Реквизит' }, { text: '' }, {}, {}, {}],
    occasions: {
      corporate: {
        on: true, momentTitle: 'Момент', momentPhoto: 3, acts: [4, 4, 1, 9, 'x'],
        urgency: 'u'.repeat(200), video: 'vk.com/video1'
      }
    }
  });
  assert.equal(card.galleryHeadlines[0].length, 60);
  assert.equal(card.galleryTexts[0].length, 160);
  assert.equal(card.credentials.length, 220);
  assert.equal(card.included.length, 4);
  const corporate = card.occasions.corporate;
  assert.deepEqual(corporate.acts, [4, 1]);
  assert.equal(corporate.momentPhoto, 3);
  assert.equal(corporate.urgency.length, 120);
  assert.equal(corporate.video, 'https://vk.com/video1');
  assert.equal(normalizeBusinessCard({ occasions: { corporate: { on: true } } }).occasions.corporate.acts, null, 'не выбрано — значит все номера');
});

test('своя обложка праздника — только ссылка из своего хранилища, анимация — из списка', () => {
  const good = 'https://abc123.public.blob.vercel-storage.com/covers/demo-card/0123456789abcdef01.jpg';
  const card = normalizeBusinessCard({
    occasions: {
      corporate: { on: true, cover: good, coverPosition: 'center', fx: 'garland' },
      wedding: { on: true, cover: 'https://evil.example/covers/demo-card/0123456789abcdef01.jpg', fx: 'fireworks' },
      graduation: { on: true, cover: 'javascript:alert(1)', coverPosition: 'sideways' }
    }
  });
  assert.equal(card.occasions.corporate.cover, good);
  assert.equal(card.occasions.corporate.coverPosition, 'center');
  assert.equal(card.occasions.corporate.fx, 'garland');
  assert.equal(card.occasions.wedding.cover, '');
  assert.equal(card.occasions.wedding.fx, 'auto');
  assert.equal(card.occasions.graduation.cover, '');
  assert.equal(card.occasions.graduation.coverPosition, 'top');
});

test('анимация по празднику: гирлянда зимой, конфетти на выпускной, лепестки на свадьбу', () => {
  const byId = Object.fromEntries(OCCASIONS.map((item) => [item.id, item]));
  assert.equal(occasionFx(byId.corporate, {}, DECEMBER), 'garland');
  assert.equal(occasionFx(byId.corporate, {}, JUNE), 'sparkles');
  assert.equal(occasionFx(byId.graduation, { fx: 'auto' }, JUNE), 'confetti');
  assert.equal(occasionFx(byId.wedding, {}, JUNE), 'petals');
  assert.equal(occasionFx(byId.wedding, { fx: 'snow' }, JUNE), 'snow', 'выбор владельца важнее');
  assert.equal(occasionFx({ id: 'cabcdef', title: 'Новый год', custom: true }, {}), 'garland');
  assert.equal(occasionFx({ id: 'cabcdef', title: 'Юбилей', custom: true }, {}), 'confetti');
  assert.equal(occasionFx({ id: 'cabcdef', title: 'Открытие салона', custom: true }, {}), 'sparkles');
});

test('загрузка обложки принимает только свою папку визитки и картинку', async () => {
  const { validCoverPathname } = await import('../api/card-cover-upload.js');
  assert.equal(validCoverPathname('covers/demo-card/0123456789abcdef01.jpg', 'demo-card', 'image/jpeg'), true);
  assert.equal(validCoverPathname('covers/other-card/0123456789abcdef01.jpg', 'demo-card', 'image/jpeg'), false);
  assert.equal(validCoverPathname('covers/demo-card/../x/0123456789abcdef01.jpg', 'demo-card', 'image/jpeg'), false);
  assert.equal(validCoverPathname('covers/demo-card/0123456789abcdef01.webp', 'demo-card', 'image/jpeg'), false);
  assert.equal(validCoverPathname('covers/demo-card/0123456789abcdef01.svg', 'demo-card', 'image/svg+xml'), false);
});

test('образец продающих текстов есть у каждого праздника и влезает в поля', () => {
  const limits = { headline: 90, text: 220, momentTitle: 60, momentText: 160, highlightTitle: 40, highlightText: 140, urgency: 120 };
  const occasions = [...OCCASIONS, { id: 'cabcdef', title: 'Юбилей', custom: true }];
  for (const occasion of occasions) {
    const template = occasionTemplate(occasion);
    for (const [key, max] of Object.entries(limits)) {
      assert.ok(template[key], `${occasion.id}.${key}`);
      assert.ok(template[key].length <= max, `${occasion.id}.${key} длиннее ${max}`);
    }
  }
});

test('нормализация отбрасывает чужие праздники, режет поля и чинит номер фото', () => {
  const card = normalizeBusinessCard({
    occasions: {
      corporate: { on: true, headline: 'x'.repeat(200), photo: 9, highlightPhoto: 2 },
      birthday: { on: true },
      wedding: 'yes'
    }
  });
  assert.deepEqual(Object.keys(card.occasions), ['corporate']);
  assert.equal(card.occasions.corporate.headline.length, 90);
  assert.equal(card.occasions.corporate.photo, -1);
  assert.equal(card.occasions.corporate.highlightPhoto, 2);
});

test('старые поля визитки вычищаются при чтении', () => {
  const card = normalizeBusinessCard({
    name: 'Дмитрий',
    priceFrom: '30 000',
    servicePackages: [{ title: 'Пакет' }],
    offerText: 'Скидка',
    socials: [{ type: 'vk' }]
  });
  for (const key of ['priceFrom', 'servicePackages', 'offerText', 'socials']) {
    assert.equal(key in card, false, key);
  }
  assert.equal(card.name, 'Дмитрий');
});

test('списки держат лимиты, пустая строка живёт в черновике, но не публикуется', () => {
  const draft = normalizeBusinessCard({
    facts: [{ value: '12 лет', label: 'на сцене' }, { value: '', label: '' }, {}, {}, {}],
    formats: [{ title: 'Close-up', minutes: '40' }, { title: '  ' }],
    quotes: [{ text: '«Гости до сих пор вспоминают»', author: 'HR' }, { text: '' }]
  });
  assert.equal(draft.facts.length, 3);
  assert.equal(draft.formats.length, 2);

  const payload = publicCardPayload(draft);
  assert.deepEqual(payload.facts, [{ value: '12 лет', label: 'на сцене' }]);
  assert.deepEqual(payload.formats.map((item) => item.title), ['Close-up']);
  assert.equal(payload.quotes.length, 1);
});

test('на сервер уходят только включённые праздники и никаких ключей владельца', () => {
  const payload = publicCardPayload({
    name: 'Дмитрий',
    leadKey: '0123456789abcdef0123456789abcdef',
    kioskMode: true,
    customOccasions: [
      { id: 'cabcdef', title: 'Юбилей', slug: 'yubiley' },
      { id: 'c111111', title: 'Черновик', slug: 'chernovik' }
    ],
    occasions: { corporate: { on: true }, wedding: { on: false }, cabcdef: { on: true }, c111111: { on: false } }
  });
  assert.deepEqual(Object.keys(payload.occasions), ['corporate', 'cabcdef']);
  assert.deepEqual(payload.customOccasions.map((item) => item.slug), ['yubiley']);
  for (const key of ['leadKey', 'kioskMode', 'publishedSlug', 'priceFrom']) {
    assert.equal(key in payload, false, key);
  }
});

test('ссылка на праздник и канал собирается без лишних частей', () => {
  assert.equal(cardPublicUrl(''), '');
  assert.equal(cardPublicUrl('abc123'), '/v/abc123');
  assert.equal(cardPublicUrl('abc123', { occasionSlug: 'svadba' }), '/v/abc123/svadba');
  assert.equal(cardPublicUrl('abc123', { occasionSlug: 'korporativ', source: 'vk' }), '/v/abc123/korporativ?src=vk');
});

test('чек-лист засчитывает доверие и праздники', () => {
  const base = { ...DEFAULT_BUSINESS_CARD, name: 'Дмитрий', role: 'Иллюзионист', phone: '+79000000000', profession: 'illusionist' };
  const before = cardCompletion(base);
  assert.ok(before.missing.some((item) => item.id === 'trust'));
  assert.ok(before.missing.some((item) => item.id === 'offer'));

  const after = cardCompletion({
    ...base,
    facts: [{ value: '500+', label: 'шоу' }],
    occasions: { corporate: { on: true } }
  });
  assert.equal(after.missing.some((item) => item.id === 'trust'), false);
  assert.equal(after.missing.some((item) => item.id === 'offer'), false);
});

test('«Отклик» считает праздники и каналы, но не чужие значения', async () => {
  await withRedis(async (store) => {
    await store.trackCardReach('demo-card', { occasion: 'corporate', source: 'vk' });
    await store.trackCardReach('demo-card', { occasion: 'corporate', source: 'qr' });
    await store.trackCardReach('demo-card', { occasion: 'wedding', countDay: false });
    const stats = await store.readCardStats('demo-card');
    const days = await store.readCardDays('demo-card', 7);

    assert.deepEqual(stats.occasions, { corporate: 2, wedding: 1 });
    assert.deepEqual(stats.sources, { vk: 1, qr: 1 });
    assert.equal(days.length, 7);
    assert.equal(days.at(-1).opens, 2);
    assert.equal(days[0].opens, 0);
  });
});

test('свои праздники попадают в «Отклик», но подставные id не раздувают статистику', async () => {
  await withRedis(async (store) => {
    await store.trackCardReach('demo-card', { occasion: 'cabcdef', countDay: false });
    await store.trackCardReach('demo-card', { occasion: 'cabcdef', countDay: false });
    for (let i = 0; i < 20; i += 1) {
      await store.trackCardReach('demo-card', { occasion: `cz${String(i).padStart(5, '0')}`, countDay: false });
    }
    await store.trackCardReach('demo-card', { occasion: 'cabcdef', countDay: false });
    const stats = await store.readCardStats('demo-card');
    assert.equal(stats.occasions.cabcdef, 3, 'уже известный праздник считается и после лимита');
    assert.equal(Object.keys(stats.occasions).length, 12);
  });
});

test('заявка сохраняет праздник, канал, город и формат, а мусор отбрасывает', async () => {
  await withRedis(async (store) => {
    const good = await store.saveLead('demo-card', {
      name: 'Анна',
      phone: '+79001112233',
      messenger: '@anna',
      eventDate: '2026-12-26',
      city: 'Ярославль',
      format: 'Сценическое шоу',
      occasion: 'corporate',
      source: 'sales'
    });
    assert.equal(good.occasion, 'corporate');
    assert.equal(good.source, 'sales');
    assert.equal(good.city, 'Ярославль');
    assert.equal(good.format, 'Сценическое шоу');

    const bad = await store.saveLead('demo-card', { name: 'Олег', occasion: 'birthday', source: 'spam' });
    assert.equal(bad.occasion, '');
    assert.equal(bad.source, '');

    const custom = await store.saveLead('demo-card', { name: 'Ира', occasion: 'cabcdef', occasionTitle: 'Юбилей' });
    assert.equal(custom.occasion, 'cabcdef');
    assert.equal(custom.occasionTitle, 'Юбилей');

    const leads = await store.listLeads('demo-card');
    assert.deepEqual(leads.map((item) => item.name), ['Ира', 'Олег', 'Анна']);
  });
});
