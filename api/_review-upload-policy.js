export function normalizeVideoContentType(value) {
  const type = String(value || '').split(';')[0].trim().toLowerCase();
  return type === 'video/mp4' || type === 'video/webm' ? type : '';
}

export function validReviewPathname(pathname, slug, contentType) {
  const ext = contentType === 'video/mp4' ? 'mp4' : 'webm';
  const prefix = `reviews/${slug}/`;
  const value = String(pathname || '');
  return value.startsWith(prefix)
    && new RegExp(`^[a-f0-9]{18}\\.${ext}$`, 'i').test(value.slice(prefix.length));
}
