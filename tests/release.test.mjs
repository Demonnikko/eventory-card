import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { createCardDraft } from '../src/editor-draft.js';
import { DEFAULT_BUSINESS_CARD, cardCompletion } from '../src/card-data.js';
import { renderAskBlock, resetAsk } from '../src/card-ask.js';
import { createEncryptedBackup, restoreEncryptedBackup } from '../src/card-backup.js';
import {
  BUSINESS_CARD_PROFESSIONS,
  businessCardOnboardingTemplateUrl,
  normalizeBusinessCard
} from '../src/shared/data/businessCard.js';
import {
  normalizeVideoContentType,
  validReviewPathname
} from '../api/_review-upload-policy.js';

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

test('все старые цветовые темы переходят в единую палитру визитки', () => {
  for (const theme of ['gold', 'blue', 'platinum', 'graphite']) {
    assert.equal(normalizeBusinessCard({ theme }).theme, 'gold');
  }
});

test('прямая загрузка видео принимает только безопасный путь и формат', () => {
  const slug = 'card1234';
  assert.equal(normalizeVideoContentType('video/mp4;codecs=avc1'), 'video/mp4');
  assert.equal(normalizeVideoContentType('video/webm;codecs=vp9'), 'video/webm');
  assert.equal(normalizeVideoContentType('text/html'), '');
  assert.equal(validReviewPathname('reviews/card1234/0123456789abcdef01.mp4', slug, 'video/mp4'), true);
  assert.equal(validReviewPathname('reviews/other/0123456789abcdef01.mp4', slug, 'video/mp4'), false);
  assert.equal(validReviewPathname('reviews/card1234/0123456789abcdef01.webm', slug, 'video/mp4'), false);
});

test('все фоны выбора профессии облегчены и готовы к предзагрузке', async () => {
  const files = BUSINESS_CARD_PROFESSIONS.map((profession) => {
    const publicPath = businessCardOnboardingTemplateUrl(profession.id);
    assert.match(publicPath, /^\/business-card-templates\/onboarding\/.+\.webp$/);
    return new URL(`../public${publicPath}`, import.meta.url);
  });
  const sizes = await Promise.all(files.map(async (file) => (await stat(file)).size));

  assert.equal(sizes.length, BUSINESS_CARD_PROFESSIONS.length);
  assert.ok(sizes.every((size) => size < 64 * 1024));
  assert.ok(sizes.reduce((total, size) => total + size, 0) < 300 * 1024);
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

test('ссылка на видеоотзыв выдаётся только после проверенной записи токена', async () => {
  const originalFetch = globalThis.fetch;
  const originalError = console.error;
  const strings = new Map();
  const setAttempts = new Map();

  process.env.UPSTASH_REDIS_REST_URL = 'https://redis.test';
  process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';

  globalThis.fetch = async (_url, options) => {
    const [op, key, value] = JSON.parse(options.body);
    let result = null;

    if (op === 'SET') {
      const attempt = (setAttempts.get(key) || 0) + 1;
      setAttempts.set(key, attempt);
      const alwaysFails = key.includes('b'.repeat(32));
      if (!alwaysFails && attempt > 1) {
        strings.set(key, value);
        result = 'OK';
      }
    } else if (op === 'GET') {
      result = strings.get(key) || null;
    }

    return new Response(JSON.stringify({ result }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  };
  console.error = () => {};

  try {
    const store = await import(`../api/_reviews-store.js?invite=${Date.now()}`);
    assert.equal(await store.saveInvite('a'.repeat(32), 'demo-card'), true);
    assert.equal(await store.readInvite('a'.repeat(32)), 'demo-card');
    assert.equal(setAttempts.get(`eventory:card:invite:${'a'.repeat(32)}`), 2);

    assert.equal(await store.saveInvite('b'.repeat(32), 'demo-card'), false);
    assert.equal(setAttempts.get(`eventory:card:invite:${'b'.repeat(32)}`), 2);
  } finally {
    globalThis.fetch = originalFetch;
    console.error = originalError;
  }
});

test('видео уходит напрямую в Blob, а в API передаётся только ссылка', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  const videoUrl = 'https://demo.public.blob.vercel-storage.com/reviews/card1234/0123456789abcdef01.webm';

  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url) === '/api/card-review-upload') {
      return new Response(JSON.stringify({ ok: true, uploadUrl: 'https://blob-upload.test/presigned' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    if (String(url) === 'https://blob-upload.test/presigned') {
      return new Response(JSON.stringify({ url: videoUrl }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    if (String(url) === '/api/card-review') {
      return new Response(JSON.stringify({ ok: true, review: { id: 'review123' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    throw new Error(`unexpected_url:${url}`);
  };

  try {
    const { uploadReview } = await import(`../src/reviews-data.js?direct=${Date.now()}`);
    const review = await uploadReview('a'.repeat(32), {
      blob: new Blob(['short-video'], { type: 'video/webm;codecs=vp8' }),
      slug: 'card1234',
      author: 'Заказчик',
      role: 'Гость',
      duration: 3,
      consent: true
    });

    assert.equal(review.id, 'review123');
    assert.deepEqual(calls.map((item) => item.url), [
      '/api/card-review-upload',
      'https://blob-upload.test/presigned',
      '/api/card-review'
    ]);
    const finalizeBody = JSON.parse(calls[2].options.body);
    assert.equal(finalizeBody.videoUrl, videoUrl);
    assert.equal('video' in finalizeBody, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('релизные UI-контракты остаются включены', async () => {
  const [editor, preview, review, reviewsData, reviewUpload, privacy, pwaUpdate, onboarding, present, cardCss, share, cardView, publicCard, vite, vercel, html] = await Promise.all([
    readFile(new URL('../src/editor.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/preview.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/review-record.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/reviews-data.js', import.meta.url), 'utf8'),
    readFile(new URL('../api/card-review-upload.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/privacy.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/pwa-update.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/onboarding.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/present.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/card-app.css', import.meta.url), 'utf8'),
    readFile(new URL('../src/share.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/card-view.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/public-card.js', import.meta.url), 'utf8'),
    readFile(new URL('../vite.config.js', import.meta.url), 'utf8'),
    readFile(new URL('../vercel.json', import.meta.url), 'utf8'),
    readFile(new URL('../index.html', import.meta.url), 'utf8')
  ]);

  assert.doesNotMatch(editor, /\btoast\s*\(/);
  assert.doesNotMatch(preview, /renderUpsell\(['"]leads['"]\)/);
  assert.match(editor, /data-gallery-input/);
  assert.match(editor, /data-package-add/);
  assert.match(review, /data-consent/);
  assert.match(review, /videoBitsPerSecond:\s*900_000/);
  assert.match(reviewsData, /\/api\/card-review-upload/);
  assert.match(reviewsData, /x-vercel-blob-access/);
  assert.doesNotMatch(reviewsData, /blobToDataUrl/);
  assert.match(reviewUpload, /issueSignedToken/);
  // Лимит по-прежнему уходит в подпись, но зависит от типа: ролик или обложка.
  assert.match(reviewUpload, /maximumSizeInBytes:\s*maxBytes/);
  assert.match(reviewUpload, /MAX_POSTER_BYTES\s*:\s*MAX_VIDEO_BYTES/);
  assert.match(reviewUpload, /metadata\s*&&\s*video\s*\?\s*200\s*:\s*503/);
  assert.match(vercel, /connect-src[^\n]+https:\/\/vercel\.com/);
  assert.match(vercel, /https:\/\/\*\.blob\.vercel-storage\.com/);
  assert.match(privacy, /случайный идентификатор/);
  assert.match(pwaUpdate, /registration\.update\(\)/);
  assert.match(pwaUpdate, /SKIP_WAITING/);
  assert.match(onboarding, /preloadAllTemplates\(['"]high['"]\)/);
  assert.match(onboarding, /businessCardOnboardingTemplateUrl/);
  assert.match(present, /data-qr-open/);
  assert.match(present, /data-qr-dialog/);
  assert.match(present, /QR_LAYOUT_BY_PROFESSION/);
  assert.doesNotMatch(present, /DeviceOrientation|deviceorientation|requestPermission|is-flipped/);
  assert.match(cardCss, /pr-card-settle/);
  assert.match(cardCss, /pr-sheen-pass/);
  assert.doesNotMatch(cardCss, /ca-present-sway|\.pr-screen\.is-flipped/);
  assert.match(share, /QR уже на карточке/);
  assert.match(share, /invite_store_failed/);
  assert.doesNotMatch(editor, /THEME_OPTIONS|renderThemes|data-theme/);
  // Мессенджеры и соцсети в карточке — фирменными цветными иконками
  // (Telegram/VK/MAX). Раньше их тут не было и тест это запрещал; иконки
  // вернули осознанно, поэтому теперь проверяем обратное — что они на месте.
  assert.match(cardView, /renderBrandIcon|hasBrandIcon/);
  assert.match(publicCard, /by Eventory/);
  assert.doesNotMatch(onboarding, /by Eventory/);
  assert.match(cardCss, /--bg:\s*#060607/);
  assert.doesNotMatch(cardCss, /#5d93ff|#6cc8a1|#e26b6b|#7ea8ff|#8edcba|#2d6e52/i);
  assert.match(html, /data-pwa-update-control/);
  assert.match(html, /class="ca-header-mark" src="\/icon-192\.png"/);
  assert.doesNotMatch(html, /by Eventory/);
  // Шаблоны онбординга осознанно НЕ preload'им в HTML (v1.6.2): они нужны
  // только на первом входе владельца, а грузились на каждой странице, включая
  // публичную визитку (~230 КБ впустую). Онбординг сам предзагружает их из JS.
  // Тест защищает эту оптимизацию — preload'а в index.html быть не должно.
  assert.doesNotMatch(html, /onboarding\/illusionist-card\.webp/);
  assert.match(vite, /skipWaiting:\s*false/);
  assert.match(vite, /business-card-templates\/onboarding\/\*\.webp/);
  assert.match(vite, /eventory-card-templates-v1/);
  // Ощущение приложения: двойной тап и щипок не зумят страницу.
  assert.match(html, /user-scalable\s*=\s*no/);
  assert.match(html, /maximum-scale\s*=\s*1/);
});
