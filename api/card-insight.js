// Метки показов, узнавание вернувшихся и ночные вопросы — одна функция.
//
// Разделено по action, а не по эндпоинтам: на Hobby-плане функции лимитированы,
// а операции здесь мелкие и однородные.
//
//   GET  ?slug=…&key=…                 — сводка для владельца (метки, диалоги)
//   POST action=tag-create|tag-delete  — владелец заводит/убирает метку события
//   POST action=track                  — гость открыл визитку (общий итог + метка)
//   POST action=greet                  — узнавание вернувшегося гостя
//   POST action=ask                    — вопрос от гостя, ответ визитки
//   POST action=dialogs-read           — владелец прочитал диалоги
import {
  storeConfigured,
  listTags, saveTag, deleteTag, readTagStats,
  readCardStats, trackCardOpen, trackTagOpen, readVisitor, saveVisitor,
  saveDialog, listDialogs, markDialogsRead,
  saveLead, listLeads, markLeadsRead, isOwnerPro
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

/* ─────────── Автоответы ─────────── */

// Визитка отвечает на три вопроса, которые задают всегда: свободен ли,
// сколько стоит, что входит. Это не чат-бот: если вопрос не из этих трёх,
// честно говорим, что ответит человек, и сохраняем вопрос владельцу.
function buildAnswer(question, card) {
  const q = String(question || '').toLowerCase();

  const asksPrice = /(сколько|цена|стоит|стоимость|прайс|бюджет|ценник)/.test(q);
  const asksDate = /(свободн|занят|дата|число|когда|график|календар)/.test(q);
  const asksIncluded = /(что вход|что включ|входит ли|включен|программ|как проход)/.test(q);

  if (asksDate) {
    // Календарь живёт в CRM — здесь честно говорим, что дату подтвердит человек.
    return {
      kind: 'date',
      text: card.responseTime
        ? `Уточню по календарю и отвечу ${card.responseTime}. Напишите, пожалуйста, дату и город — так отвечу точнее.`
        : 'Уточню по календарю и вернусь с ответом. Напишите, пожалуйста, дату и город.'
    };
  }

  if (asksPrice) {
    if (card.priceFrom) {
      return {
        kind: 'price',
        text: `Работа от ${card.priceFrom}. Итог зависит от формата, площадки и длительности — расскажите про событие, и я посчитаю точнее.`
      };
    }
    return {
      kind: 'price',
      text: 'Стоимость зависит от формата и длительности. Расскажите про событие — вернусь с точной цифрой.'
    };
  }

  if (asksIncluded) {
    const services = String(card.services || '')
      .split('\n').map((s) => s.trim()).filter(Boolean);
    if (services.length) {
      return {
        kind: 'included',
        text: `Обычно это: ${services.slice(0, 4).join(', ')}. Под ваше событие соберу программу отдельно.`
      };
    }
  }

  return {
    kind: 'other',
    text: card.responseTime
      ? `Отвечу лично ${card.responseTime}. Оставьте контакт — свяжусь с вами.`
      : 'Отвечу лично в ближайшее время. Оставьте контакт — свяжусь с вами.'
  };
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
    const ownerPro = await isOwnerPro(String(req.query?.key || ''));
    const rawLeads = await listLeads(slug);
    // Pro-барьер: у не-Pro режем ВСЕ контактные поля (contact + phone/vk/telegram),
    // иначе новые поля утекут мимо барьера.
    const leads = ownerPro
      ? rawLeads
      : rawLeads.map(({ contact, phone, vk, telegram, ...rest }) => rest);

    return res.status(200).json({
      ok: true,
      summary: await readCardStats(slug),
      tags: withStats,
      dialogs: await listDialogs(slug),
      leads,
      ownerPro
    });
  }

  if (req.method !== 'POST') return fail(res, 405, 'method_not_allowed');

  const body = await readBody(req);
  const action = String(body.action || '').trim();
  const slug = normalizeSlug(body.slug);
  if (!slug) return fail(res, 400, 'invalid_slug');

  const limits = {
    track: { limit: 180, windowSeconds: 60 },
    greet: { limit: 60, windowSeconds: 60 },
    ask: { limit: 8, windowSeconds: 3600 },
    lead: { limit: 8, windowSeconds: 3600 },
    'tag-create': { limit: 30, windowSeconds: 3600 },
    'tag-delete': { limit: 30, windowSeconds: 3600 },
    'dialogs-read': { limit: 120, windowSeconds: 60 },
    'leads-read': { limit: 120, windowSeconds: 60 }
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

  /* ─────────── Гость открыл визитку ─────────── */
  if (action === 'track') {
    const rawTagId = String(body.tag || '').trim();
    const tagId = /^[a-f0-9]{8}$/i.test(rawTagId) ? rawTagId.toLowerCase() : '';
    const rawVisitorId = String(body.visitor || '').trim();
    const visitorId = /^[a-z0-9_-]{8,64}$/i.test(rawVisitorId) ? rawVisitorId : '';
    const event = String(body.event || 'open');
    if (!['open', 'contact'].includes(event)) return fail(res, 400, 'invalid_event');
    await trackCardOpen(slug, visitorId, event);
    if (tagId) {
      await trackTagOpen(slug, tagId, visitorId, event);
    }
    // Запоминаем визит независимо от метки — для узнавания при возврате.
    if (visitorId) {
      await saveVisitor(slug, visitorId, { tagId, interest: body.interest });
    }
    return res.status(200).json({ ok: true });
  }

  /* ─────────── Узнавание вернувшегося ─────────── */
  if (action === 'greet') {
    const rawVisitorId = String(body.visitor || '').trim();
    const visitorId = /^[a-z0-9_-]{8,64}$/i.test(rawVisitorId) ? rawVisitorId : '';
    if (!visitorId) return fail(res, 400, 'invalid_visitor');
    const seen = await readVisitor(slug, visitorId);
    // Первый визит — не здороваемся «снова», это выглядело бы фальшиво.
    if (!seen || (Number(seen.visits) || 0) < 2) {
      return res.status(200).json({ ok: true, returning: false });
    }
    return res.status(200).json({
      ok: true,
      returning: true,
      visits: seen.visits,
      lastAt: seen.lastAt,
      interest: seen.interest || ''
    });
  }

  /* ─────────── Вопрос от гостя ─────────── */
  if (action === 'ask') {
    const data = await readPublicCard(slug);
    if (!data) return fail(res, 404, 'card_not_found');

    const question = String(body.question || '').trim().slice(0, 300);
    if (!question) return fail(res, 400, 'empty_question');
    const contact = String(body.contact || '').trim().slice(0, 120);
    if (!contact) return fail(res, 400, 'empty_contact');
    if (!/(@[a-z0-9_]{5,32}|\+?[0-9][0-9()\s-]{6,}|[^\s@]+@[^\s@]+\.[^\s@]+)/i.test(contact)) {
      return fail(res, 400, 'invalid_contact');
    }

    const answer = buildAnswer(question, data.card || {});
    await saveDialog(slug, {
      question,
      answer: answer.text,
      kind: answer.kind,
      contact,
      tagId: /^[a-f0-9]{8}$/i.test(String(body.tag || '').trim()) ? String(body.tag).trim().toLowerCase() : ''
    });
    return res.status(200).json({ ok: true, answer: answer.text, kind: answer.kind });
  }

  /* ─────────── Заявка «Узнать цену» от гостя ─────────── */
  if (action === 'lead') {
    const data = await readPublicCard(slug);
    if (!data) return fail(res, 404, 'card_not_found');

    const name = String(body.name || '').trim().slice(0, 80);
    if (!name) return fail(res, 400, 'empty_name');
    const phone = String(body.phone || '').trim().slice(0, 30);
    const vk = String(body.vk || '').trim().slice(0, 120);
    const telegram = String(body.telegram || '').trim().slice(0, 40);
    // Телефон обязателен.
    if (!/\+?[0-9][0-9()\s-]{6,}/.test(phone)) return fail(res, 400, 'invalid_phone');
    // Работаем в мессенджерах — нужен хотя бы один: ВКонтакте или Telegram.
    if (!vk && !telegram) return fail(res, 400, 'messenger_required');
    // Читаемая строка контакта — её показываем Pro-владельцу (совместимость).
    const contact = String(body.contact || '').trim().slice(0, 200)
      || [phone && `☎ ${phone}`, vk && `ВК: ${vk}`, telegram && `TG: ${telegram}`].filter(Boolean).join(' · ');
    // Дата события — необязательна: кто торопится, отправляет без неё.
    const eventDate = String(body.eventDate || '').trim().slice(0, 20);

    const tag = /^[a-f0-9]{8}$/i.test(String(body.tag || '').trim())
      ? String(body.tag).trim().toLowerCase() : '';
    const saved = await saveLead(slug, { name, contact, phone, vk, telegram, eventDate, tagId: tag });
    // Не прячем сбой хранилища: если заявка не записалась — говорим об этом,
    // иначе клиент думает «отправлено», а владелец её никогда не увидит.
    if (!saved) return fail(res, 503, 'lead_not_saved');

    // Счётчик «обращений» на экране «Отклик» = contacts в аналитике. Инкрементим
    // здесь, иначе цифра всегда 0 при живых заявках. По метке — ещё и в её стат.
    await trackCardOpen(slug, '', 'contact');
    if (tag) await trackTagOpen(slug, tag, '', 'contact');

    // Тихо уведомляем владельца в Telegram (если он подключил). leadKey берём
    // из карточки на сервере — гостю он не виден. Контакт клиента НЕ шлём (он
    // под Pro-барьером): в уведомлении только имя и дата. Fire-and-forget —
    // заявка сохранена в любом случае, сбой Telegram гостя не касается.
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

  /* ─────────── Владелец прочитал диалоги ─────────── */
  if (action === 'dialogs-read') {
    const owner = await assertOwner(slug, String(body.key || ''));
    if (!owner) return fail(res, 403, 'forbidden');
    await markDialogsRead(slug);
    return res.status(200).json({ ok: true });
  }

  return fail(res, 400, 'unknown_action');
}
