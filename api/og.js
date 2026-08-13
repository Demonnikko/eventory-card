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
import { readPublicCard, normalizeSlug } from './_card-access.js';

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
  // Обложка — если есть; иначе фирменная заглушка бренда.
  const image = card?.coverPhoto
    ? (String(card.coverPhoto).startsWith('http') ? card.coverPhoto : `${origin}${card.coverPhoto}`)
    : `${origin}/og-default.png`;

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
  if (slug) {
    try { card = await readPublicCard(slug); } catch { /* нет данных — общие теги */ }
  }

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
