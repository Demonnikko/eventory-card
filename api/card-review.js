// Видеоотзывы — одна функция на все операции.
//
// Операции разделены по action, а не по отдельным эндпоинтам: у визитки
// свой проект на Vercel, но плодить функции всё равно незачем.
//
//   GET  ?slug=…                  — список подтверждённых отзывов (для клиента)
//   GET  ?slug=…&key=…            — все отзывы, включая новые (для владельца)
//   GET  ?invite=…                — по токену приглашения вернуть карточку
//   POST action=invite            — владелец создаёт ссылку для заказчика
//   POST action=upload            — заказчик присылает записанный кружок
//   POST action=approve|delete    — владелец модерирует
import {
  storeConfigured,
  blobConfigured,
  listReviews,
  addReview,
  updateReview,
  deleteReview,
  saveInvite,
  readInvite,
  createInviteToken,
  uploadVideo,
  deleteVideo,
  MAX_VIDEO_BYTES
} from './_reviews-store.js';
import { readPublicCard, leadKeyMatches, normalizeSlug } from './_card-access.js';

function fail(res, status, error) {
  return res.status(status).json({ ok: false, error });
}

// Владелец доказывает право на карточку тем же leadKey, что и для лидов:
// отдельной авторизации в бесплатном продукте нет.
async function assertOwner(slug, key) {
  const data = await readPublicCard(slug);
  if (!data) return null;
  return leadKeyMatches(data, key) ? data : null;
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export default async function handler(req, res) {
  if (!storeConfigured()) return fail(res, 503, 'store_not_configured');

  /* ─────────── Чтение ─────────── */
  if (req.method === 'GET') {
    const invite = String(req.query?.invite || '').trim();
    if (invite) {
      const slug = await readInvite(invite);
      if (!slug) return fail(res, 404, 'invite_not_found');
      const data = await readPublicCard(slug);
      if (!data) return fail(res, 404, 'card_not_found');
      // Заказчику показываем минимум — чьё имя он подтверждает отзывом.
      return res.status(200).json({
        ok: true,
        slug,
        card: { name: data.card?.name || '', role: data.card?.role || '' }
      });
    }

    const slug = normalizeSlug(req.query?.slug);
    if (!slug) return fail(res, 400, 'invalid_slug');
    const key = String(req.query?.key || '').trim();

    if (key) {
      const owner = await assertOwner(slug, key);
      if (!owner) return fail(res, 403, 'forbidden');
      return res.status(200).json({
        ok: true,
        reviews: await listReviews(slug, { approvedOnly: false })
      });
    }
    return res.status(200).json({
      ok: true,
      reviews: await listReviews(slug, { approvedOnly: true })
    });
  }

  if (req.method !== 'POST') return fail(res, 405, 'method_not_allowed');

  const body = await readBody(req);
  const action = String(body.action || '').trim();

  /* ─────────── Владелец создаёт приглашение ─────────── */
  if (action === 'invite') {
    const slug = normalizeSlug(body.slug);
    if (!slug) return fail(res, 400, 'invalid_slug');
    const owner = await assertOwner(slug, String(body.key || ''));
    if (!owner) return fail(res, 403, 'forbidden');

    const token = createInviteToken();
    const saved = await saveInvite(token, slug);
    if (!saved) return fail(res, 503, 'store_not_configured');
    return res.status(200).json({ ok: true, token });
  }

  /* ─────────── Заказчик присылает кружок ─────────── */
  if (action === 'upload') {
    if (!blobConfigured()) return fail(res, 503, 'video_storage_not_configured');

    const token = String(body.invite || '').trim();
    const slug = await readInvite(token);
    if (!slug) return fail(res, 404, 'invite_not_found');

    const dataUrl = String(body.video || '');
    const match = /^data:(video\/(webm|mp4)[^;]*);base64,(.+)$/.exec(dataUrl);
    if (!match) return fail(res, 400, 'invalid_video');

    const buffer = Buffer.from(match[3], 'base64');
    if (buffer.length > MAX_VIDEO_BYTES) return fail(res, 413, 'video_too_large');

    let videoUrl = '';
    try {
      videoUrl = await uploadVideo(slug, buffer, match[1]);
    } catch {
      return fail(res, 502, 'upload_failed');
    }

    const review = await addReview(slug, {
      author: body.author,
      role: body.role,
      duration: body.duration,
      videoUrl
    });
    if (!review) {
      await deleteVideo(videoUrl);
      return fail(res, 409, 'reviews_limit');
    }
    return res.status(200).json({ ok: true, review });
  }

  /* ─────────── Модерация ─────────── */
  if (action === 'approve' || action === 'delete') {
    const slug = normalizeSlug(body.slug);
    if (!slug) return fail(res, 400, 'invalid_slug');
    const owner = await assertOwner(slug, String(body.key || ''));
    if (!owner) return fail(res, 403, 'forbidden');

    const id = String(body.id || '').trim();
    if (!id) return fail(res, 400, 'invalid_id');

    if (action === 'approve') {
      const next = await updateReview(slug, id, { approved: body.approved !== false });
      if (!next) return fail(res, 404, 'review_not_found');
      return res.status(200).json({ ok: true, review: next });
    }

    // Удаляем и запись, и сам файл — иначе видео останется висеть в Blob.
    const all = await listReviews(slug, { approvedOnly: false });
    const target = all.find((r) => r.id === id);
    const removed = await deleteReview(slug, id);
    if (!removed) return fail(res, 404, 'review_not_found');
    if (target?.videoUrl) await deleteVideo(target.videoUrl);
    return res.status(200).json({ ok: true });
  }

  return fail(res, 400, 'unknown_action');
}

// Кружок приходит как data URL — стандартного лимита 1МБ не хватит.
export const config = {
  api: { bodyParser: { sizeLimit: '20mb' } }
};
