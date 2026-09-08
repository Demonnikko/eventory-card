// SSR мета-тегов для публичной визитки /v/<slug>.
//
// Проблема: визитка — SPA, а краулеры мессенджеров (Telegram, WhatsApp,
// VK) не исполняют JS. Запрашивая /v/<slug>, они получают статический
// index.html с общим <title>Визитка</title> и без og-тегов — ссылка в чате
// разворачивается пустой карточкой.
//
// Решение: rewrite направляет /v/<slug> сюда. Функция берёт собранный
// index.html, подставляет в <head> og-теги конкретной визитки (имя, роль,
// фото) и отдаёт всем — и боту, и браузеру. Браузеру теги не мешают: SPA
// поверх отрисуется как раньше.
import { normalizeSlug } from './_card-access.js';

// Данные визитки берём из того же эндпоинта, что и клиент: /api/card-get
// проксируется в основной проект, где лежит карточка. Свой Redis у проекта
// визитки может указывать на другую базу, поэтому напрямую в него не лезем —
// иначе og-теги получают только заглушку, а не имя владельца.
async function fetchCard(origin, slug, timeoutMs = 2000) {
  // Жёсткий таймаут: card-get проксируется в другой проект и читает Redis —
  // цепочка из нескольких прыжков. Если она задержится, НЕЛЬЗЯ держать из-за
  // og-тегов весь HTML и весь запуск приложения. Не успели за 2с — отдаём
  // страницу с базовыми тегами, имя догонит в кэше при следующем заходе.
  // Для отдачи фото таймаут задаётся больше: там ответ заведомо тяжёлый.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${origin}/api/card-get?slug=${encodeURIComponent(slug)}`, {
      signal: ctrl.signal
    });
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    return data?.ok && data.card ? data.card : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Обложка визитки хранится в карточке как data-URI (base64). Мессенджеры
// такие og:image не принимают и показывают заглушку вместо лица владельца —
// ссылка в чате выглядит безлико. Здесь отдаём ту же обложку обычной
// картинкой по HTTP: бот получает нормальный jpeg, формат хранения при этом
// не меняется (миграция данных не нужна, старые визитки работают как есть).
const DATA_URI_RE = /^data:(image\/(?:jpeg|jpg|png|webp|gif));base64,([A-Za-z0-9+/=]+)$/;

async function servePhoto(req, res, origin, slug) {
  if (!slug) return res.status(404).send('no_slug');
  // Карточка тяжёлая (фото внутри JSON) — таймаут щедрее, чем для мета-тегов.
  const card = await fetchCard(origin, slug, 8000);
  const raw = String(card?.coverPhoto || '');
  if (!raw) return res.status(404).send('no_photo');

  // Уже загруженное по http фото отдаём редиректом — незачем гонять через себя.
  if (/^https?:\/\//.test(raw)) {
    res.setHeader('Location', raw);
    return res.status(302).end();
  }

  const match = DATA_URI_RE.exec(raw);
  if (!match) return res.status(404).send('bad_photo');
  const [, mime, base64] = match;
  const body = Buffer.from(base64, 'base64');

  res.setHeader('Content-Type', mime);
  res.setHeader('Content-Length', String(body.length));
  // Визитку могут отредактировать, поэтому не immutable: CDN держит копию
  // час, дальше отдаёт устаревшую и обновляет в фоне — боты и браузеры
  // получают картинку мгновенно, а новое фото доезжает само.
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
  return res.status(200).send(body);
}

function escapeAttr(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

// Абсолютный origin текущего деплоя: og:image и og:url обязаны быть
// абсолютными, иначе мессенджеры их игнорируют.
function originOf(req) {
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const proto = req.headers['x-forwarded-proto'] || 'https';
  return `${proto}://${host}`;
}

// Собранный index.html с хешированными бандлами лежит статикой в том же
// деплое. Читаем его по HTTP у себя же — так мы всегда берём актуальную
// сборку, не завися от путей файловой системы Vercel.
async function loadIndexHtml(origin) {
  const res = await fetch(`${origin}/index.html`, {
    headers: { 'x-og-passthrough': '1' } // на случай будущих rewrite-петель
  });
  if (!res.ok) throw new Error(`index_fetch_${res.status}`);
  return res.text();
}

function buildMetaTags(card, origin, slug) {
  const name = card?.name || 'Электронная визитка';
  const metaParts = [card?.role, card?.city].filter(Boolean);
  const description = card?.tagline
    || (metaParts.length ? metaParts.join(' · ') : 'Контакты, услуги и связь за пару секунд.');
  const url = `${origin}/v/${encodeURIComponent(slug)}`;
  // og:image обязан быть публичным HTTP-URL: мессенджеры не принимают
  // data-URI, а обложка хранится именно так. Поэтому ведём тег на свою же
  // ветку ?photo=cover — она отдаёт ту же обложку обычным jpeg. Реальный
  // http-адрес используем напрямую, а без обложки остаётся заглушка бренда.
  const cover = String(card?.coverPhoto || '');
  const image = /^https?:\/\//.test(cover)
    ? cover
    : (cover
        ? `${origin}/api/og?slug=${encodeURIComponent(slug)}&photo=cover`
        : `${origin}/og-default.png`);

  const title = card?.role ? `${name} — ${card.role}` : name;

  return `
    <title>${escapeAttr(title)}</title>
    <meta name="description" content="${escapeAttr(description)}" />
    <meta property="og:type" content="profile" />
    <meta property="og:title" content="${escapeAttr(title)}" />
    <meta property="og:description" content="${escapeAttr(description)}" />
    <meta property="og:url" content="${escapeAttr(url)}" />
    <meta property="og:image" content="${escapeAttr(image)}" />
    <meta property="og:site_name" content="Eventory · Визитка" />
    <meta property="og:locale" content="ru_RU" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeAttr(title)}" />
    <meta name="twitter:description" content="${escapeAttr(description)}" />
    <meta name="twitter:image" content="${escapeAttr(image)}" />`;
}

export default async function handler(req, res) {
  const origin = originOf(req);
  // Slug приходит из rewrite как query-параметр.
  const slug = normalizeSlug(req.query?.slug);

  // Отдача обложки картинкой (?photo=cover) — на неё указывает og:image.
  if (req.query?.photo) return servePhoto(req, res, origin, slug);

  let html;
  try {
    html = await loadIndexHtml(origin);
  } catch {
    // Не смогли прочитать шаблон — отдаём редирект на SPA, чтобы визитка
    // всё равно открылась в браузере (превью не будет, но страница живёт).
    res.setHeader('Location', slug ? `/#/v/${encodeURIComponent(slug)}` : '/');
    return res.status(302).end();
  }

  let card = null;
  if (slug) card = await fetchCard(origin, slug);

  const meta = buildMetaTags(card, origin, slug);

  // Вставляем перед закрытием </head>, заменив стандартный <title>Визитка</title>.
  const injected = html
    .replace(/<title>[\s\S]*?<\/title>/i, '')
    .replace(/<\/head>/i, `${meta}\n  </head>`);

  // Боты дёргают ссылку часто; браузер получит тот же ответ и отрисует SPA.
  // Кэшируем на уровне CDN, но недолго — визитку могут отредактировать.
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
  return res.status(200).send(injected);
}
