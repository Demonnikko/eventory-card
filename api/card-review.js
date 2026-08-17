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
  verifyUploadedVideo,
  deleteVideo,
  MAX_VIDEO_BYTES
} from './_reviews-store.js';
import { readPublicCard, leadKeyMatches, normalizeSlug } from './_card-access.js';
import { enforceRateLimit } from './_rate-limit.js';

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

// Пускаем через прокси только реальные адреса Blob — иначе функция стала бы
// открытым прокси, через который можно гонять любой трафик за счёт аккаунта.
function allowedBlobUrl(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  if (!url.hostname.endsWith('.blob.vercel-storage.com')) return null;
  return url;
}

// Видео отзывов лежит в Vercel Blob и отдаётся с blob.vercel-storage.com —
// этот домен заблокирован в РФ, без VPN кружки не грузятся. Стримим файл
// через домен визитки (он не заблокирован), пробрасывая Range для перемотки.
// Живёт внутри card-review, потому что только этот путь исключён из rewrite
// на основной проект в vercel.json — отдельная функция /api/blob уехала бы
// туда и вернула 404.
async function proxyVideo(req, res, rawUrl) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return fail(res, 405, 'method_not_allowed');
  }
  const target = allowedBlobUrl(rawUrl);
  if (!target) return fail(res, 400, 'bad_url');

  const headers = {};
  if (req.headers.range) headers.range = req.headers.range;

  let upstream;
  try {
    upstream = await fetch(target.href, { headers });
  } catch {
    return fail(res, 502, 'upstream_unreachable');
  }
  if (!upstream.ok && upstream.status !== 206) {
    return fail(res, upstream.status, 'upstream_error');
  }

  res.status(upstream.status);
  const pass = ['content-type', 'content-length', 'content-range', 'accept-ranges', 'etag', 'last-modified'];
  for (const name of pass) {
    const value = upstream.headers.get(name);
    if (value) res.setHeader(name, value);
  }
  // Имя файла со случайным суффиксом — контент неизменяем, кэшируем надолго.
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');

  if (req.method === 'HEAD' || !upstream.body) return res.end();

  const reader = upstream.body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(Buffer.from(value));
    }
  } catch {
    // Клиент закрыл вкладку на середине — это не ошибка сервера.
  }
  return res.end();
}

export default async function handler(req, res) {
  // Прокси видео не зависит от хранилища отзывов — обслуживаем до проверки store.
  if (req.method === 'GET' && req.query?.video) {
    return proxyVideo(req, res, String(req.query.video));
  }

  if (!storeConfigured()) return fail(res, 503, 'store_not_configured');

  /* ─────────── Чтение ─────────── */
  if (req.method === 'GET') {
    const invite = String(req.query?.invite || '').trim();
    if (invite) {
      if (!/^[a-f0-9]{32}$/i.test(invite)) return fail(res, 400, 'invalid_invite');
      if (!await enforceRateLimit(req, res, {
        scope: 'review-invite-read', identifier: invite, limit: 60, windowSeconds: 3600
      })) return;
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
    if (!await enforceRateLimit(req, res, {
      scope: 'review-list', identifier: slug, limit: 120, windowSeconds: 60
    })) return;
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
    if (!await enforceRateLimit(req, res, {
      scope: 'review-invite-create', identifier: slug, limit: 20, windowSeconds: 3600
    })) return;
    const owner = await assertOwner(slug, String(body.key || ''));
    if (!owner) return fail(res, 403, 'forbidden');

    const token = createInviteToken();
    const saved = await saveInvite(token, slug);
    if (!saved) return fail(res, 503, 'invite_store_failed');
    return res.status(200).json({ ok: true, token });
  }

  /* ─────────── Заказчик присылает кружок ─────────── */
  if (action === 'upload') {
    if (!blobConfigured()) return fail(res, 503, 'video_storage_not_configured');
    if (body.consent !== true) return fail(res, 400, 'consent_required');

    const token = String(body.invite || '').trim();
    if (!/^[a-f0-9]{32}$/i.test(token)) return fail(res, 400, 'invalid_invite');
    if (!await enforceRateLimit(req, res, {
      scope: 'review-upload', identifier: token, limit: 5, windowSeconds: 3600
    })) return;
    const slug = await readInvite(token);
    if (!slug) return fail(res, 404, 'invite_not_found');

    const author = String(body.author || '').trim().slice(0, 60);
    const duration = Number(body.duration);
    if (!author) return fail(res, 400, 'invalid_author');
    if (!Number.isFinite(duration) || duration < 2 || duration > 30) return fail(res, 400, 'invalid_duration');

    let videoUrl = '';
    const directUrl = String(body.videoUrl || '').trim();
    if (directUrl) {
      if (!await verifyUploadedVideo(slug, directUrl)) {
        return fail(res, 400, 'video_verification_failed');
      }
      videoUrl = directUrl;
    } else {
      // Совместимость со старыми установленными PWA. Новые версии отправляют
      // ролик прямо в Blob и не упираются в лимит тела Vercel Function.
      const dataUrl = String(body.video || '');
      const match = /^data:(video\/(webm|mp4)[^;]*);base64,(.+)$/.exec(dataUrl);
      if (!match) return fail(res, 400, 'invalid_video');

      const buffer = Buffer.from(match[3], 'base64');
      if (!buffer.length) return fail(res, 400, 'invalid_video');
      if (buffer.length > MAX_VIDEO_BYTES) return fail(res, 413, 'video_too_large');
      try {
        videoUrl = await uploadVideo(slug, buffer, match[1]);
      } catch (error) {
        console.error('[card-review:blob] legacy upload failed', {
          error: error instanceof Error ? error.message : String(error)
        });
        return fail(res, 502, 'upload_failed');
      }
    }

    // Обложка необязательна: без неё кружок покажет инициалы, как раньше.
    // Поэтому непрошедшую проверку просто отбрасываем, а не валим отзыв.
    let posterUrl = '';
    const directPoster = String(body.posterUrl || '').trim();
    if (directPoster && await verifyUploadedVideo(slug, directPoster, 'poster')) {
      posterUrl = directPoster;
    }

    let review;
    try {
      review = await addReview(slug, {
        author,
        role: body.role,
        duration,
        videoUrl,
        posterUrl,
        consentAt: Date.now()
      });
    } catch (error) {
      console.error('[card-review:store] add failed', {
        error: error instanceof Error ? error.message : String(error)
      });
      await deleteVideo(videoUrl);
      return fail(res, 503, 'review_store_failed');
    }
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
    if (!await enforceRateLimit(req, res, {
      scope: 'review-moderation', identifier: slug, limit: 60, windowSeconds: 60
    })) return;
    const owner = await assertOwner(slug, String(body.key || ''));
    if (!owner) return fail(res, 403, 'forbidden');

    const id = String(body.id || '').trim();
    if (!/^[a-f0-9]{18}$/i.test(id)) return fail(res, 400, 'invalid_id');

    if (action === 'approve') {
      const next = await updateReview(slug, id, { approved: body.approved !== false });
      if (!next) return fail(res, 404, 'review_not_found');
      return res.status(200).json({ ok: true, review: next });
    }

    // Удаляем и запись, и сам файл — иначе видео останется висеть в Blob.
    const all = await listReviews(slug, { approvedOnly: false });
    const target = all.find((r) => r.id === id);
    if (!target) return fail(res, 404, 'review_not_found');
    // Пытаемся удалить файл видео, но НЕ блокируем этим удаление отзыва:
    // старые ролики лежат в другом сторе, файл мог быть уже стёрт — и тогда
    // отзыв стал бы неудаляемым. Метаданные удаляем всегда; осиротевший
    // файл в Blob — меньшее зло, чем отзыв, который владелец не может убрать.
    if (target.videoUrl) await deleteVideo(target.videoUrl);
    const removed = await deleteReview(slug, id);
    if (!removed) return fail(res, 404, 'review_not_found');
    return res.status(200).json({ ok: true });
  }

  return fail(res, 400, 'unknown_action');
}

// Кружок приходит как data URL — стандартного лимита 1МБ не хватит.
export const config = {
  api: { bodyParser: { sizeLimit: '20mb' } }
};
