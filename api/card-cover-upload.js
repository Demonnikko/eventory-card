// Разрешение владельцу загрузить свою обложку праздника в Vercel Blob.
//
// В самой визитке обложкам места нет (публикация ограничена 1 МБ), поэтому
// фото лежит в Blob, а в визитке — только ссылка. Грузить может лишь
// владелец: проверяем ключ опубликованной визитки, как у заявок.
import { storeConfigured, blobConfigured } from './_reviews-store.js';
import { readPublicCard, leadKeyMatches, normalizeSlug } from './_card-access.js';
import { enforceRateLimit } from './_rate-limit.js';
import { presignBlobUpload, readJsonBody } from './_blob-upload.js';

// Обложка ужимается в браузере до ~450 КБ; запас на случай редкого кадра.
const MAX_COVER_BYTES = 700 * 1024;
const EXT = { 'image/jpeg': 'jpg', 'image/webp': 'webp' };

function fail(res, status, error) {
  return res.status(status).json({ ok: false, error });
}

export function validCoverPathname(pathname, slug, contentType) {
  const ext = EXT[contentType];
  if (!ext) return false;
  const prefix = `covers/${slug}/`;
  const value = String(pathname || '');
  return value.startsWith(prefix)
    && new RegExp(`^[a-f0-9]{18}\\.${ext}$`).test(value.slice(prefix.length));
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  if (req.method !== 'POST') return fail(res, 405, 'method_not_allowed');
  if (!storeConfigured()) return fail(res, 503, 'store_not_configured');
  if (!blobConfigured()) return fail(res, 503, 'media_storage_not_configured');

  const body = await readJsonBody(req);
  const slug = normalizeSlug(body.slug);
  if (!slug) return fail(res, 400, 'invalid_slug');
  if (!await enforceRateLimit(req, res, {
    scope: 'cover-upload', identifier: slug, limit: 20, windowSeconds: 3600
  })) return;

  const card = await readPublicCard(slug);
  if (!card) return fail(res, 404, 'card_not_found');
  if (!leadKeyMatches(card, body.key)) return fail(res, 403, 'forbidden');

  const contentType = String(body.contentType || '').split(';')[0].trim().toLowerCase();
  const size = Number(body.size);
  const pathname = String(body.pathname || '').trim();
  if (!EXT[contentType]) return fail(res, 400, 'invalid_image');
  if (!Number.isFinite(size) || size <= 0) return fail(res, 400, 'invalid_image');
  if (size > MAX_COVER_BYTES) return fail(res, 413, 'image_too_large');
  if (!validCoverPathname(pathname, slug, contentType)) return fail(res, 400, 'invalid_image_path');

  try {
    const uploadUrl = await presignBlobUpload({ pathname, contentType, maxBytes: MAX_COVER_BYTES });
    return res.status(200).json({ ok: true, uploadUrl });
  } catch (error) {
    console.error('[card-cover-upload] authorization failed', {
      error: error instanceof Error ? error.message : String(error)
    });
    return fail(res, 502, 'upload_authorization_failed');
  }
}

export const config = {
  api: { bodyParser: { sizeLimit: '16kb' } }
};
