// Что заказчику разрешено класть в Blob по одноразовому разрешению:
// сам ролик и его обложку — первый кадр, снятый браузером при записи.
const EXT = {
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'image/jpeg': 'jpg'
};

export function normalizeVideoContentType(value) {
  const type = String(value || '').split(';')[0].trim().toLowerCase();
  return type === 'video/mp4' || type === 'video/webm' ? type : '';
}

// Обложка — всегда JPEG: он мал, поддерживается везде и кодируется
// прямо из canvas без дополнительных библиотек.
export function normalizePosterContentType(value) {
  const type = String(value || '').split(';')[0].trim().toLowerCase();
  return type === 'image/jpeg' ? type : '';
}

export function normalizeUploadContentType(value) {
  return normalizeVideoContentType(value) || normalizePosterContentType(value);
}

export function validReviewPathname(pathname, slug, contentType) {
  const ext = EXT[contentType];
  if (!ext) return false;
  const prefix = `reviews/${slug}/`;
  const value = String(pathname || '');
  return value.startsWith(prefix)
    && new RegExp(`^[a-f0-9]{18}\\.${ext}$`, 'i').test(value.slice(prefix.length));
}
