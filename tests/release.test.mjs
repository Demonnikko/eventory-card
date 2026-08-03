import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createCardDraft } from '../src/editor-draft.js';
import { DEFAULT_BUSINESS_CARD, cardCompletion } from '../src/card-data.js';
import { renderAskBlock, resetAsk } from '../src/card-ask.js';
import { createEncryptedBackup, restoreEncryptedBackup } from '../src/card-backup.js';

test('автосохранение не теряет быстро заполненные поля', async () => {
  const saved = [];
  const draft = createCardDraft(DEFAULT_BUSINESS_CARD, {
    delay: 50,
    save: async (card) => {
      saved.push(structuredClone(card));
      return card;
    }
  });

  draft.schedule({ city: 'Ярославль' });
  draft.schedule({ bio: 'Шоу для событий' });
  draft.schedule({ services: 'Сценическое шоу' });
  await draft.flush();

  assert.equal(draft.card.city, 'Ярославль');
  assert.equal(draft.card.bio, 'Шоу для событий');
  assert.equal(draft.card.services, 'Сценическое шоу');
  assert.equal(saved.length, 1);
  assert.equal(saved[0].city, 'Ярославль');
  assert.equal(saved[0].bio, 'Шоу для событий');
  assert.equal(saved[0].services, 'Сценическое шоу');
});

test('шаблон профессии считается готовым оформлением', () => {
  const result = cardCompletion({
    ...DEFAULT_BUSINESS_CARD,
    name: 'Дмитрий',
    role: 'Иллюзионист',
    profession: 'illusionist'
  });
  assert.equal(result.missing.some((item) => item.id === 'cover'), false);
});

test('быстрый вопрос запрашивает контакт и объясняет, кто его увидит', () => {
  resetAsk();
  const html = renderAskBlock({ ...DEFAULT_BUSINESS_CARD, telegram: 'demo_eventory' });
  assert.match(html, /data-ask-contact/);
  assert.match(html, /Телефон или @telegram для ответа/);
  assert.match(html, /Контакт не публикуется/);
});

test('явное сохранение повторяет неудачную фоновую запись', async () => {
  let attempts = 0;
  const draft = createCardDraft(DEFAULT_BUSINESS_CARD, {
    delay: 1,
    save: async (card) => {
      attempts += 1;
      if (attempts === 1) throw new Error('temporary_storage_error');
      return card;
    }
  });

  draft.schedule({ city: 'Рыбинск' });
  await new Promise((resolve) => setTimeout(resolve, 10));
  await draft.flush();

  assert.equal(attempts, 2);
  assert.equal(draft.card.city, 'Рыбинск');
});

test('общая аналитика считает обычные открытия и уникальных гостей', async () => {
  const originalFetch = globalThis.fetch;
  const hashes = new Map();
  const strings = new Map();

  process.env.UPSTASH_REDIS_REST_URL = 'https://redis.test';
  process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';

  globalThis.fetch = async (_url, options) => {
    const command = JSON.parse(options.body);
    const [op, key, ...args] = command;
    let result = null;

    if (op === 'HINCRBY') {
      const hash = hashes.get(key) || new Map();
      const next = Number(hash.get(args[0]) || 0) + Number(args[1] || 0);
      hash.set(args[0], next);
      hashes.set(key, hash);
      result = next;
    } else if (op === 'HSET') {
      const hash = hashes.get(key) || new Map();
      hash.set(args[0], args[1]);
      hashes.set(key, hash);
      result = 1;
    } else if (op === 'HGETALL') {
      result = Array.from(hashes.get(key) || []).flatMap(([field, value]) => [field, value]);
    } else if (op === 'SET') {
      const nx = args.includes('NX');
      if (!nx || !strings.has(key)) {
        strings.set(key, args[0]);
        result = 'OK';
      }
    } else if (op === 'EXPIRE') {
      result = 1;
    }

    return new Response(JSON.stringify({ result }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  };

  try {
    const store = await import(`../api/_tags-store.js?release=${Date.now()}`);
    await store.trackCardOpen('demo-card', 'visitor-1', 'open');
    await store.trackCardOpen('demo-card', 'visitor-1', 'open');
    await store.trackCardOpen('demo-card', 'visitor-1', 'contact');
    const stats = await store.readCardStats('demo-card');

    assert.equal(stats.opens, 2);
    assert.equal(stats.visitors, 1);
    assert.equal(stats.contacts, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('резервная копия шифруется и не открывается неверным паролем', async () => {
  const source = {
    ...DEFAULT_BUSINESS_CARD,
    name: 'Дмитрий',
    phone: '+7 900 000-00-00',
    leadKey: '0123456789abcdef0123456789abcdef'
  };
  const encrypted = await createEncryptedBackup(source, 'надёжный-пароль');

  assert.doesNotMatch(encrypted, /Дмитрий|0123456789abcdef/);
  const restored = await restoreEncryptedBackup(encrypted, 'надёжный-пароль');
  assert.equal(restored.name, source.name);
  assert.equal(restored.leadKey, source.leadKey);
  await assert.rejects(
    restoreEncryptedBackup(encrypted, 'неверный-пароль'),
    /backup_password/
  );
});

test('rate limit блокирует запросы сверх заданного окна', async () => {
  const originalFetch = globalThis.fetch;
  let count = 0;
  process.env.UPSTASH_REDIS_REST_URL = 'https://redis.test';
  process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';
  globalThis.fetch = async (_url, options) => {
    const [op] = JSON.parse(options.body);
    if (op === 'INCR') count += 1;
    return new Response(JSON.stringify({ result: op === 'INCR' ? count : 1 }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  };

  try {
    const { checkRateLimit } = await import(`../api/_rate-limit.js?release=${Date.now()}`);
    const options = { scope: 'test', identifier: 'guest', limit: 2, windowSeconds: 60 };
    assert.equal((await checkRateLimit(options)).allowed, true);
    assert.equal((await checkRateLimit(options)).allowed, true);
    assert.equal((await checkRateLimit(options)).allowed, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('релизные UI-контракты остаются включены', async () => {
  const [editor, preview, review, privacy, pwaUpdate, vite, html] = await Promise.all([
    readFile(new URL('../src/editor.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/preview.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/review-record.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/privacy.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/pwa-update.js', import.meta.url), 'utf8'),
    readFile(new URL('../vite.config.js', import.meta.url), 'utf8'),
    readFile(new URL('../index.html', import.meta.url), 'utf8')
  ]);

  assert.doesNotMatch(editor, /\btoast\s*\(/);
  assert.doesNotMatch(preview, /renderUpsell\(['"]leads['"]\)/);
  assert.match(editor, /data-gallery-input/);
  assert.match(editor, /data-package-add/);
  assert.match(review, /data-consent/);
  assert.match(privacy, /случайный идентификатор/);
  assert.match(pwaUpdate, /registration\.update\(\)/);
  assert.match(pwaUpdate, /SKIP_WAITING/);
  assert.match(html, /data-pwa-update-control/);
  assert.match(vite, /skipWaiting:\s*false/);
  assert.doesNotMatch(html, /user-scalable\s*=\s*no|maximum-scale\s*=\s*1/);
});
