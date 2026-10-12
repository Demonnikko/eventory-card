// Адреса фото, видео и загрузок — через домен самой визитки.
//
// Файлы лежат в Vercel Blob, а *.blob.vercel-storage.com и vercel.com/api/blob
// в РФ без VPN не открываются: у гостей не грузились обложки и кружки, а у
// владельца — загрузка. Поэтому в браузер отдаём свои пути: /media/… и
// /blob-api/…; их разворачивает nginx на российском сервере (tadacard.ru)
// и rewrite в vercel.json (eventory-card.vercel.app). В данных визитки
// по-прежнему хранится исходная ссылка Blob — её проверяет сервер.

const BLOB_PUBLIC_RE = /^https:\/\/([a-z0-9]{8,40})\.public\.blob\.vercel-storage\.com\/([^?#]+)$/i;
const BLOB_API_PREFIX = 'https://vercel.com/api/blob';

// Публичный файл Blob → /media/<store>/<путь>. Остальное (data:, blob:,
// свои пути, чужие ссылки) возвращаем как есть.
export function mediaUrl(url) {
  const src = String(url || '');
  const match = BLOB_PUBLIC_RE.exec(src);
  if (!match) return src;
  return `/media/${match[1].toLowerCase()}/${match[2]}`;
}

// Адрес для PUT-загрузки, выданный сервером, → /blob-api/…
export function uploadUrl(url) {
  const src = String(url || '');
  if (!src.startsWith(`${BLOB_API_PREFIX}/`) && !src.startsWith(`${BLOB_API_PREFIX}?`)) return src;
  return `/blob-api${src.slice(BLOB_API_PREFIX.length)}`;
}
