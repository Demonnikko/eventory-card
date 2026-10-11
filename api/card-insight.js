// Метки показов, статистика и заявки — одна функция.
//
// Разделено по action, а не по эндпоинтам: на Hobby-плане функции лимитированы,
// а операции здесь мелкие и однородные.
//
//   GET  ?slug=…&key=…                 — сводка для владельца (метки, заявки)
//   POST action=tag-create|tag-delete  — владелец заводит/убирает метку события
//   POST action=track                  — гость открыл визитку (итог, праздник, канал)
//   POST action=lead                   — заявка «Проверить дату»
import {
  storeConfigured,
  listTags, saveTag, deleteTag, readTagStats,
  readCardStats, readCardDays, trackCardOpen, trackCardReach, trackTagOpen,
  readVisitor, saveVisitor, listHotVisitors,
  saveLead, listLeads, markLeadsRead, deleteLead, setLeadTag, ownerProStatus,
  OCCASION_IDS, SOURCE_IDS
} from './_tags-store.js';
import { readPublicCard, leadKeyMatches, normalizeSlug } from './_card-access.js';
import { enforceRateLimit } from './_rate-limit.js';

function fail(res, status, error) {
  return res.status(status).json({ ok: false, error });
}

// Уведомление о заявке владельцу в Telegram. Отправку делает основной проект
// (там токен бота и связка card→chat), визитка лишь дёргает его эндпоинт.
// Fire-and-forget: заявка уже сохранена, Telegram — приятный бонус.
function notifyOwnerTelegram(leadKey, name, eventDate) {
  const key = String(leadKey || '').trim().toLowerCase();
  if (!/^[a-f0-9]{32}$/.test(key)) return;
  fetch('https://eventory-mvp.vercel.app/api/promo?service=card-link&action=notify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cardKey: key, name, eventDate })
  }).catch(() => { /* не критично: заявка сохранена, уведомление best-effort */ });
}

async function assertOwner(slug, key) {
  const data = await readPublicCard(slug);
  if (!data) return null;
  return leadKeyMatches(data, key) ? data : null;
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return {};
  }
}

function pick(value, allowed) {
  const id = String(value || '').trim().toLowerCase();
  return allowed.includes(id) ? id : '';
}

export default async function handler(req, res) {
  if (!storeConfigured()) return fail(res, 503, 'store_not_configured');

  /* ─────────── Сводка для владельца ─────────── */
  if (req.method === 'GET') {
    const slug = normalizeSlug(req.query?.slug);
    if (!slug) return fail(res, 400, 'invalid_slug');
    if (!await enforceRateLimit(req, res, {
      scope: 'insight-owner', identifier: slug, limit: 120, windowSeconds: 60
    })) return;
    const owner = await assertOwner(slug, String(req.query?.key || ''));
    if (!owner) return fail(res, 403, 'forbidden');

    const tags = await listTags(slug);
    const withStats = await Promise.all(tags.map(async (tag) => ({
      ...tag,
      stats: await readTagStats(slug, tag.id)
    })));

    // Pro-барьер: «кто оставил заявку» открывается только по подписке Eventory.
    // Контакт режем на СЕРВЕРЕ — не-Pro владелец физически не получает его в
    // ответе, поэтому barrier не обойти через DevTools. Имя и дата остаются:
    // владелец видит, что спрос есть, но чтобы ответить — нужен Pro.
    // Ключ уже прошёл проверку в assertOwner выше — используем его как есть.
    const proStatus = await ownerProStatus(String(req.query?.key || ''));
    const ownerPro = proStatus.pro;
    const rawLeads = await listLeads(slug);

    // Досье клиента — Pro: к каждой заявке приложить профиль гостя (что смотрел,
    // сколько заходил). Только для Pro и только если заявка связана с visitorId.
    // Без Pro — режем контакты И профиль, чтобы ничего не утекло мимо барьера.
    let leads;
    if (ownerPro) {
      leads = await Promise.all(rawLeads.map(async (lead) => {
        if (!lead.visitorId) return lead;
        const visitor = await readVisitor(slug, lead.visitorId);
        if (!visitor) return lead;
        return {
          ...lead,
          profile: {
            visits: Number(visitor.visits) || 0,
            interest: visitor.interest || '',
            interests: visitor.interests || {},
            firstAt: visitor.firstAt || 0,
            lastAt: visitor.lastAt || 0
          }
        };
      }));
    } else {
      leads = rawLeads.map(({ contact, phone, vk, telegram, messenger, visitorId, ...rest }) => rest);
    }

    // «Догони» — Pro: горячие гости, которые смотрели, но заявку НЕ оставили.
    // Вычитаем тех, кто уже в заявках (по visitorId) — их вести уже не нужно.
    let hot = [];
    if (ownerPro) {
      const leadVisitorIds = new Set(rawLeads.map((l) => l.visitorId).filter(Boolean));
      const hotVisitors = await listHotVisitors(slug, 20);
      hot = hotVisitors
        .filter((v) => !leadVisitorIds.has(v.visitorId))
        .map((v) => ({
          visits: Number(v.visits) || 0,
          interest: v.interest || '',
          interests: v.interests || {},
          firstAt: v.firstAt || 0,
          lastAt: v.lastAt || 0,
          tagId: v.tagId || ''
        }));
    }

    return res.status(200).json({
      ok: true,
      summary: await readCardStats(slug),
      days: await readCardDays(slug, 7),
      tags: withStats,
      leads,
      hot,
      ownerPro,
      // Дата, до которой Pro активен — визитка запомнит её и покажет Pro-контент
      // без переспроса сервера до этого срока.
      proUntil: proStatus.proUntil
    });
  }

  if (req.method !== 'POST') return fail(res, 405, 'method_not_allowed');

  const body = await readBody(req);
  const action = String(body.action || '').trim();
  const slug = normalizeSlug(body.slug);
  if (!slug) return fail(res, 400, 'invalid_slug');

  const limits = {
    track: { limit: 180, windowSeconds: 60 },
    // Ключ лимита — IP + визитка. На мероприятии гости часто выходят в сеть
    // через общий Wi-Fi площадки (один IP на всех): 8 в час там упирались в
    // потолок раньше, чем заканчивались желающие проверить дату. 20 по-прежнему
    // режет спам, но не живых гостей.
    lead: { limit: 20, windowSeconds: 3600 },
    'tag-create': { limit: 30, windowSeconds: 3600 },
    'tag-delete': { limit: 30, windowSeconds: 3600 },
    'leads-read': { limit: 120, windowSeconds: 60 },
    'lead-delete': { limit: 60, windowSeconds: 60 }
  };
  const rule = limits[action];
  if (rule && !await enforceRateLimit(req, res, {
    scope: `insight-${action}`, identifier: slug, ...rule
  })) return;

  /* ─────────── Метки: владелец ─────────── */
  if (action === 'tag-create' || action === 'tag-delete') {
    const owner = await assertOwner(slug, String(body.key || ''));
    if (!owner) return fail(res, 403, 'forbidden');

    if (action === 'tag-create') {
      const tag = await saveTag(slug, {
        label: body.label,
        place: body.place,
        date: body.date
      });
      if (!tag) return fail(res, 400, 'invalid_tag');
      return res.status(200).json({ ok: true, tag });
    }

    const removed = await deleteTag(slug, String(body.id || ''));
    if (!removed) return fail(res, 404, 'tag_not_found');
    return res.status(200).json({ ok: true });
  }

  /* ─────────── Гость открыл визитку / посмотрел раздел ─────────── */
  if (action === 'track') {
    const rawTagId = String(body.tag || '').trim();
    const tagId = /^[a-f0-9]{8}$/i.test(rawTagId) ? rawTagId.toLowerCase() : '';
    const rawVisitorId = String(body.visitor || '').trim();
    const visitorId = /^[a-z0-9_-]{8,64}$/i.test(rawVisitorId) ? rawVisitorId : '';
    const event = String(body.event || 'open');
    // view — гость досмотрел раздел (галерея/цены/отзывы/пакет). Не считается за
    // открытие карточки, только копит интерес для смарт-метрики.
    if (!['open', 'contact', 'view'].includes(event)) return fail(res, 400, 'invalid_event');

    if (event === 'view') {
      // Просмотр раздела: интерес есть только при известном разделе и госте.
      const section = String(body.section || '').slice(0, 60).trim();
      if (visitorId && section) {
        await saveVisitor(slug, visitorId, { tagId, section });
      }
      // Гость перешёл на праздник внутри визитки — повод считаем, открытие нет.
      const occasion = pick(body.occasion, OCCASION_IDS);
      if (occasion) await trackCardReach(slug, { occasion, countDay: false });
      return res.status(200).json({ ok: true });
    }

    await trackCardOpen(slug, visitorId, event);
    // Праздник и канал считаем только для открытия: переход в контакты и
    // просмотры разделов не должны удваивать «откуда пришли».
    if (event === 'open') {
      await trackCardReach(slug, {
        occasion: pick(body.occasion, OCCASION_IDS),
        source: pick(body.source, SOURCE_IDS)
      });
    }
    if (tagId) {
      await trackTagOpen(slug, tagId, visitorId, event);
    }
    // Запоминаем визит независимо от метки — для узнавания при возврате.
    // countVisit только для open: contact не должен накручивать счётчик заходов.
    if (visitorId) {
      await saveVisitor(slug, visitorId, { tagId, countVisit: event === 'open' });
    }
    return res.status(200).json({ ok: true });
  }

  /* ─────────── Заявка «Проверить дату» от гостя ─────────── */
  if (action === 'lead') {
    const data = await readPublicCard(slug);
    if (!data) return fail(res, 404, 'card_not_found');

    const name = String(body.name || '').trim().slice(0, 80);
    if (!name) return fail(res, 400, 'empty_name');
    const phone = String(body.phone || '').trim().slice(0, 30);
    // Телефон обязателен: по нему ответят и в WhatsApp, и в MAX.
    if (!/\+?[0-9][0-9()\s-]{6,}/.test(phone)) return fail(res, 400, 'invalid_phone');
    // Мессенджер — по желанию: обязательное второе поле теряло заявки.
    const messenger = String(body.messenger || '').trim().slice(0, 120);
    // Читаемая строка контакта — её показываем Pro-владельцу (совместимость).
    const contact = [phone && `☎ ${phone}`, messenger].filter(Boolean).join(' · ');
    const eventDate = String(body.eventDate || '').trim().slice(0, 20);
    const city = String(body.city || '').trim().slice(0, 60);
    const format = String(body.format || '').trim().slice(0, 60);

    const tag = /^[a-f0-9]{8}$/i.test(String(body.tag || '').trim())
      ? String(body.tag).trim().toLowerCase() : '';
    const rawVisitor = String(body.visitor || '').trim();
    const leadVisitor = /^[a-z0-9_-]{8,64}$/i.test(rawVisitor) ? rawVisitor : '';
    const saved = await saveLead(slug, {
      name, contact, phone, messenger, eventDate, city, format,
      occasion: pick(body.occasion, OCCASION_IDS),
      source: pick(body.source, SOURCE_IDS),
      tagId: tag,
      visitorId: leadVisitor
    });
    // Не прячем сбой хранилища: если заявка не записалась — говорим об этом,
    // иначе клиент думает «отправлено», а владелец её никогда не увидит.
    if (!saved) return fail(res, 503, 'lead_not_saved');

    // Счётчик «обращений» на экране «Отклик» = contacts в аналитике.
    await trackCardOpen(slug, '', 'contact');
    if (tag) await trackTagOpen(slug, tag, '', 'contact');

    // Тихо уведомляем владельца в Telegram (если он подключил). leadKey берём
    // из карточки на сервере — гостю он не виден. Контакт клиента НЕ шлём (он
    // под Pro-барьером): в уведомлении только имя и дата.
    notifyOwnerTelegram(data.leadKey, name, eventDate);

    return res.status(200).json({ ok: true });
  }

  /* ─────────── Владелец прочитал заявки ─────────── */
  if (action === 'leads-read') {
    const owner = await assertOwner(slug, String(body.key || ''));
    if (!owner) return fail(res, 403, 'forbidden');
    await markLeadsRead(slug);
    return res.status(200).json({ ok: true });
  }

  /* ─────────── Владелец удалил заявку ─────────── */
  if (action === 'lead-delete') {
    const owner = await assertOwner(slug, String(body.key || ''));
    if (!owner) return fail(res, 403, 'forbidden');
    const removed = await deleteLead(slug, String(body.id || ''));
    if (!removed) return fail(res, 404, 'lead_not_found');
    return res.status(200).json({ ok: true });
  }

  /* ─── Владелец вручную указал источник заявки (клиент пришёл не по QR) ─── */
  if (action === 'lead-tag') {
    const owner = await assertOwner(slug, String(body.key || ''));
    if (!owner) return fail(res, 403, 'forbidden');
    // tagId: 8 hex — валидная метка, либо пусто — снять источник.
    const rawTag = String(body.tag || '').trim().toLowerCase();
    const tagId = /^[a-f0-9]{8}$/.test(rawTag) ? rawTag : '';
    const updated = await setLeadTag(slug, String(body.id || ''), tagId);
    if (!updated) return fail(res, 404, 'lead_not_found');
    return res.status(200).json({ ok: true });
  }

  return fail(res, 400, 'unknown_action');
}
