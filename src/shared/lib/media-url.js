// Адреса фото, видео и загрузок — через домен самой визитки.
//
// Файлы лежат в Vercel Blob, а *.blob.vercel-storage.com и vercel.com/api/blob
// в РФ без VPN не открываются: у гостей не грузились обложки и кружки, а у
// владельца — загрузка. На российском сервере (tadacard.ru) браузер получает
// свои пути /media/… и /blob-api/…, их разворачивает nginx
// (deploy/nginx/tadacard-locations.conf). На *.vercel.app и локально ничего
// не меняется — там адреса остаются прежними. В данных визитки по-прежнему
// хранится исходная ссылка Blob — её проверяет сервер.

const BLOB_PUBLIC_RE = /^https:\/\/([a-z0-9]{8,40})\.public\.blob\.vercel-storage\.com\/([^?#]+)$/i;
const BLOB_API_PREFIX = 'https://vercel.com/api/blob';
const DIRECT_HOST_RE = /(^|\.)vercel\.app$|^localhost$|^127\.|^\[?::1\]?$/i;

// Открыта ли страница через свой сервер (а не через Vercel или локально).
export function behindOwnServer(hostname = globalThis.location?.hostname) {
  return Boolean(hostname) && !DIRECT_HOST_RE.test(hostname);
}

// Публичный файл Blob → /media/<store>/<путь>. Остальное (data:, blob:,
// свои пути, чужие ссылки) возвращаем как есть.
export function mediaUrl(url, proxy = behindOwnServer()) {
  const src = String(url || '');
  if (!proxy) return src;
  const match = BLOB_PUBLIC_RE.exec(src);
  if (!match) return src;
  return `/media/${match[1].toLowerCase()}/${match[2]}`;
}

// Адрес для PUT-загрузки, выданный сервером, → /blob-api/…
export function uploadUrl(url, proxy = behindOwnServer()) {
  const src = String(url || '');
  if (!proxy) return src;
  if (!src.startsWith(`${BLOB_API_PREFIX}/`) && !src.startsWith(`${BLOB_API_PREFIX}?`)) return src;
  return `/blob-api${src.slice(BLOB_API_PREFIX.length)}`;
}
