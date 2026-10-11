// Выдаёт короткоживущее разрешение на прямую загрузку видео в Vercel Blob.
// Большой бинарный файл не проходит через Function: сюда приходит только
// маленький JSON, а браузер отправляет сам ролик напрямую в Blob.
import {
  storeConfigured,
  blobConfigured,
  readInvite,
  MAX_VIDEO_BYTES,
  MAX_POSTER_BYTES
} from './_reviews-store.js';
import { enforceRateLimit } from './_rate-limit.js';
import { normalizeUploadContentType, validReviewPathname } from './_review-upload-policy.js';
import { presignBlobUpload, readJsonBody } from './_blob-upload.js';

function fail(res, status, error) {
  return res.status(status).json({ ok: false, error });
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  if (req.method === 'GET') {
    const metadata = storeConfigured();
    const video = blobConfigured();
    return res.status(metadata && video ? 200 : 503).json({
      ok: metadata && video,
      metadata,
      video
    });
  }
  if (req.method !== 'POST') return fail(res, 405, 'method_not_allowed');
  if (!storeConfigured()) return fail(res, 503, 'store_not_configured');
  if (!blobConfigured()) return fail(res, 503, 'video_storage_not_configured');

  const body = await readJsonBody(req);
  const invite = String(body.invite || '').trim();
  if (!/^[a-f0-9]{32}$/i.test(invite)) return fail(res, 400, 'invalid_invite');
  if (!await enforceRateLimit(req, res, {
    scope: 'review-upload-authorize', identifier: invite, limit: 8, windowSeconds: 3600
  })) return;

  const slug = await readInvite(invite);
  if (!slug) return fail(res, 404, 'invite_not_found');

  const contentType = normalizeUploadContentType(body.contentType);
  const size = Number(body.size);
  const pathname = String(body.pathname || '').trim();
  if (!contentType) return fail(res, 400, 'invalid_video');
  if (!Number.isFinite(size) || size <= 0) return fail(res, 400, 'invalid_video');
  // Обложка — один кадр, ей хватает доли лимита ролика.
  const maxBytes = contentType === 'image/jpeg' ? MAX_POSTER_BYTES : MAX_VIDEO_BYTES;
  if (size > maxBytes) return fail(res, 413, 'video_too_large');
  if (!validReviewPathname(pathname, slug, contentType)) return fail(res, 400, 'invalid_video_path');

  try {
    const uploadUrl = await presignBlobUpload({ pathname, contentType, maxBytes });
    return res.status(200).json({ ok: true, uploadUrl });
  } catch (error) {
    console.error('[card-review-upload] authorization failed', {
      error: error instanceof Error ? error.message : String(error)
    });
    return fail(res, 502, 'upload_authorization_failed');
  }
}

export const config = {
  api: { bodyParser: { sizeLimit: '64kb' } }
};
