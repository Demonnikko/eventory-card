// Метки показов, узнавание вернувшихся и ночные вопросы — одна функция.
//
// Разделено по action, а не по эндпоинтам: на Hobby-плане функции лимитированы,
// а операции здесь мелкие и однородные.
//
//   GET  ?slug=…&key=…                 — сводка для владельца (метки, диалоги)
//   POST action=tag-create|tag-delete  — владелец заводит/убирает метку события
//   POST action=track                  — гость открыл визитку (учёт по метке)
//   POST action=greet                  — узнавание вернувшегося гостя
//   POST action=ask                    — вопрос от гостя, ответ визитки
//   POST action=dialogs-read           — владелец прочитал диалоги
import {
  storeConfigured,
  listTags, saveTag, deleteTag, readTagStats,
  trackTagOpen, readVisitor, saveVisitor,
  saveDialog, listDialogs, markDialogsRead
} from './_tags-store.js';
import { readPublicCard, leadKeyMatches, normalizeSlug } from './_card-access.js';

function fail(res, status, error) {
  return res.status(status).json({ ok: false, error });
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
    const owner = await assertOwner(slug, String(req.query?.key || ''));
    if (!owner) return fail(res, 403, 'forbidden');

    const tags = await listTags(slug);
    const withStats = await Promise.all(tags.map(async (tag) => ({
      ...tag,
      stats: await readTagStats(slug, tag.id)
    })));

    return res.status(200).json({
      ok: true,
      tags: withStats,
      dialogs: await listDialogs(slug)
    });
  }

  if (req.method !== 'POST') return fail(res, 405, 'method_not_allowed');

  const body = await readBody(req);
  const action = String(body.action || '').trim();
  const slug = normalizeSlug(body.slug);
  if (!slug) return fail(res, 400, 'invalid_slug');

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
    const tagId = String(body.tag || '').trim();
    const visitorId = String(body.visitor || '').trim().slice(0, 64);
    if (tagId) {
      await trackTagOpen(slug, tagId, visitorId, String(body.event || 'open'));
    }
    // Запоминаем визит независимо от метки — для узнавания при возврате.
    if (visitorId) {
      await saveVisitor(slug, visitorId, { tagId, interest: body.interest });
    }
    return res.status(200).json({ ok: true });
  }

  /* ─────────── Узнавание вернувшегося ─────────── */
  if (action === 'greet') {
    const visitorId = String(body.visitor || '').trim().slice(0, 64);
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

    const question = String(body.question || '').trim();
    if (!question) return fail(res, 400, 'empty_question');

    const answer = buildAnswer(question, data.card || {});
    await saveDialog(slug, {
      question,
      answer: answer.text,
      kind: answer.kind,
      contact: body.contact,
      tagId: body.tag
    });
    return res.status(200).json({ ok: true, answer: answer.text, kind: answer.kind });
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
