import test from 'node:test';
import assert from 'node:assert/strict';
import {
  OCCASIONS,
  enabledOccasions,
  occasionBySlug,
  occasionInSeason,
  occasionTitle
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

test('сезоны: зима — корпоративы и Новый год, лето — выпускные и свадьбы, юбилеи вне сезона', () => {
  const byId = Object.fromEntries(OCCASIONS.map((item) => [item.id, item]));
  assert.equal(occasionInSeason(byId.corporate, DECEMBER), true);
  assert.equal(occasionInSeason(byId.newyear, DECEMBER), true);
  assert.equal(occasionInSeason(byId.graduation, DECEMBER), false);
  assert.equal(occasionInSeason(byId.graduation, JUNE), true);
  assert.equal(occasionInSeason(byId.wedding, JUNE), true);
  assert.equal(occasionInSeason(byId.jubilee, DECEMBER), false);
  assert.equal(occasionInSeason(byId.jubilee, JUNE), false);
});

test('корпоратив в сезон называется новогодним, летом — просто корпоративом', () => {
  const corporate = occasionBySlug('korporativ');
  assert.equal(occasionTitle(corporate, DECEMBER), 'Новогодний корпоратив');
  assert.equal(occasionTitle(corporate, JUNE), 'Корпоратив');
});

test('включённые праздники идут в порядке каталога, сезонный — первым', () => {
  const card = {
    occasions: {
      corporate: { on: true },
      wedding: { on: true },
      jubilee: { on: true },
      newyear: { on: false }
    }
  };
  assert.deepEqual(enabledOccasions(card, DECEMBER).map((item) => item.id), ['corporate', 'wedding', 'jubilee']);
  assert.deepEqual(enabledOccasions(card, JUNE).map((item) => item.id), ['wedding', 'corporate', 'jubilee']);
  assert.deepEqual(enabledOccasions({}, JUNE), []);
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
    occasions: { corporate: { on: true }, wedding: { on: false } }
  });
  assert.deepEqual(Object.keys(payload.occasions), ['corporate']);
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

    const leads = await store.listLeads('demo-card');
    assert.deepEqual(leads.map((item) => item.name), ['Олег', 'Анна']);
  });
});
