// Ночные вопросы и узнавание вернувшихся — то, что видит гость.
//
// Смысл блока: человек открыл визитку в час ночи, у него один конкретный
// вопрос, и он не хочет писать в пустоту. Визитка отвечает сразу по тому,
// что владелец уже заполнил, а сам вопрос ложится владельцу — утром он
// видит готовый диалог, а не пропущенный контакт.
import { escapeHtml, escapeAttr } from './shared/lib/html.js';
import { renderIcon } from './shared/components/icons.js';
import { toast } from './shared/components/toast.js';
import { askQuestion } from './insight-data.js';

// Три вопроса, которые задают всегда. Показываем их кнопками — так человеку
// не нужно придумывать формулировку.
const QUICK = [
  { id: 'date', label: 'Свободны на мою дату?', text: 'Свободны ли вы на мою дату?' },
  { id: 'price', label: 'Сколько стоит?', text: 'Сколько стоит ваша работа?' },
  { id: 'included', label: 'Что входит?', text: 'Что входит в работу?' }
];

const state = {
  slug: '',
  tagId: '',
  card: null,
  open: false,
  busy: false,
  contact: '',
  sent: false,
  thread: []   // [{ from: 'guest'|'card', text }]
};

export function renderGreeting(greeting) {
  if (!greeting) return '';
  const when = formatWhen(greeting.lastAt);
  return `
    <div class="cp-greet" data-greet>
      <span class="cp-greet-mark" aria-hidden="true">${renderIcon('user')}</span>
      <span class="cp-greet-copy">
        <span class="cp-greet-title">Рады видеть снова</span>
        <span class="cp-greet-text">Вы уже смотрели эту визитку${when ? ` ${when}` : ''}.</span>
      </span>
    </div>
  `;
}

function formatWhen(ts) {
  const time = Number(ts);
  if (!time) return '';
  const days = Math.floor((Date.now() - time) / 86400000);
  if (days <= 0) return 'сегодня';
  if (days === 1) return 'вчера';
  if (days < 7) return `${days} дня назад`;
  if (days < 31) return `${Math.floor(days / 7)} нед. назад`;
  return `${Math.floor(days / 30)} мес. назад`;
}

// Персональный текст оффера по интересу гостя. Названия разделов из трекинга
// («Работы», «Цены», «Услуги») переводим в человеческую фразу о том, что он
// смотрел — чтобы оффер звучал как «вижу твой интерес», а не как реклама.
function offerLine(interest) {
  const map = {
    'Работы': 'вам понравились мои работы',
    'Цены': 'вас интересует стоимость',
    'Услуги': 'вы присматриваетесь к услугам',
    'Отзывы': 'вы читали отзывы'
  };
  return map[interest] || 'вас заинтересовала визитка';
}

// Умный оффер: горячему вернувшемуся гостю показываем персональное предложение
// оставить контакт — ловим клиента в момент интереса, пока он ещё думает.
// Кнопка ведёт в ту же форму «Узнать цену». Данные берём из greeting (visits,
// interest). Показ — забота вызывающего (один раз за сессию, не назойливо).
export function renderSmartOffer(greeting) {
  if (!greeting || !greeting.returning) return '';
  const interest = String(greeting.interest || '').trim();
  return `
    <div class="cp-offer" data-offer>
      <span class="cp-offer-badge">${renderIcon('user')} Персонально для вас</span>
      <span class="cp-offer-title">Похоже, ${offerLine(interest)}</span>
      <span class="cp-offer-text">Оставьте контакт — вернусь с предложением и свободными датами. Отвечу лично.</span>
      <button type="button" class="cp-offer-btn" data-offer-cta>Получить предложение</button>
    </div>
  `;
}

export function renderAskBlock(card) {
  // Карточку держим в состоянии: перерисовка блока происходит без участия
  // родительской вьюхи, и данные должны быть под рукой.
  if (card) state.card = card;
  const c = state.card || {};
  // Без контактов отвечать некуда — блок не показываем.
  if (!c.phone && !c.telegram && !c.email) return '';

  return `
    <section class="cp-ask${state.open ? ' is-open' : ''}" data-ask>
      <button type="button" class="cp-ask-head" data-ask-toggle>
        <span class="cp-ask-titles">
          <span class="cp-ask-title">Быстрый вопрос</span>
          <span class="cp-ask-sub">Отвечу сразу — даже ночью</span>
        </span>
        <span class="cp-ask-chevron" aria-hidden="true">${renderIcon('chevron-right')}</span>
      </button>

      <div class="cp-ask-body" ${state.open ? '' : 'hidden'}>
        <div class="cp-thread" data-thread>
          ${state.thread.map(renderBubble).join('')}
        </div>

        ${state.thread.length ? '' : `
          <div class="cp-ask-quick">
            ${QUICK.map((q) => `
              <button type="button" class="cp-ask-chip" data-quick="${escapeAttr(q.text)}">
                ${escapeHtml(q.label)}
              </button>
            `).join('')}
          </div>
        `}

        <div class="cp-ask-fields">
          <div class="cp-ask-form">
            <input class="cp-ask-input" type="text" placeholder="Свой вопрос…"
              maxlength="300" data-ask-input ${state.busy ? 'disabled' : ''} />
            <button type="button" class="cp-ask-send" data-ask-send
              aria-label="Отправить" ${state.busy ? 'disabled' : ''}>
              ${renderIcon('chevron-right')}
            </button>
          </div>
          <input class="cp-ask-input cp-ask-contact" type="text"
            value="${escapeAttr(state.contact)}"
            placeholder="Телефон или @telegram для ответа"
            maxlength="120" autocomplete="tel" data-ask-contact ${state.busy ? 'disabled' : ''} />
          <span class="cp-ask-privacy">Контакт не публикуется — он нужен владельцу для ответа.
            <a href="/#/privacy" target="_blank" rel="noopener">Подробнее</a></span>
        </div>

        ${state.sent ? `
          <p class="cp-ask-note">Вопрос и контакт отправлены — с вами свяжутся лично.</p>
        ` : ''}
      </div>
    </section>
  `;
}

function renderBubble(msg) {
  return `
    <div class="cp-bubble cp-bubble--${msg.from === 'guest' ? 'guest' : 'card'}">
      ${escapeHtml(msg.text)}
    </div>
  `;
}

export function bindAsk(node, { slug, tagId }) {
  state.slug = slug;
  state.tagId = tagId;

  const toggle = node.querySelector('[data-ask-toggle]');
  if (toggle) {
    toggle.addEventListener('click', () => {
      state.open = !state.open;
      rerender(node);
      if (state.open) node.querySelector('[data-ask-input]')?.focus();
    });
  }

  node.querySelectorAll('[data-quick]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const input = node.querySelector('[data-ask-input]');
      if (input) input.value = btn.dataset.quick;
      node.querySelector('[data-ask-contact]')?.focus();
    });
  });

  const input = node.querySelector('[data-ask-input]');
  const contact = node.querySelector('[data-ask-contact]');
  if (contact) {
    contact.addEventListener('input', () => {
      state.contact = contact.value;
    });
  }
  const sendBtn = node.querySelector('[data-ask-send]');
  if (sendBtn && input) {
    sendBtn.addEventListener('click', () => send(node, input.value, contact?.value));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (contact && !contact.value.trim()) contact.focus();
        else send(node, input.value, contact?.value);
      }
    });
    contact?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        send(node, input.value, contact.value);
      }
    });
  }
}

// Перерисовываем только сам блок: страница визитки вокруг не должна
// дёргаться, пока человек ведёт диалог.
function rerender(root) {
  const host = root.querySelector('[data-ask]');
  if (!host) return;
  host.outerHTML = renderAskBlock(state.card);
  bindAsk(root, { slug: state.slug, tagId: state.tagId });
  const thread = root.querySelector('[data-thread]');
  if (thread) thread.scrollTop = thread.scrollHeight;
}

async function send(node, raw, rawContact) {
  const question = String(raw || '').trim();
  const contact = String(rawContact || '').trim();
  if (!question || state.busy) return;
  if (!contact) {
    toast.show('Оставьте телефон или Telegram для ответа');
    node.querySelector('[data-ask-contact]')?.focus();
    return;
  }
  if (!/(@[a-z0-9_]{5,32}|\+?[0-9][0-9()\s-]{6,}|[^\s@]+@[^\s@]+\.[^\s@]+)/i.test(contact)) {
    toast.show('Укажите телефон, @telegram или email');
    node.querySelector('[data-ask-contact]')?.focus();
    return;
  }

  state.contact = contact;
  state.sent = false;
  state.thread.push({ from: 'guest', text: question });
  state.busy = true;
  rerender(node);

  try {
    const data = await askQuestion(state.slug, { question, contact, tagId: state.tagId });
    state.thread.push({ from: 'card', text: data.answer });
    state.sent = true;
  } catch {
    state.thread.push({
      from: 'card',
      text: 'Не получилось отправить. Напишите, пожалуйста, напрямую — контакты выше.'
    });
  } finally {
    state.busy = false;
    rerender(node);
  }
}

export function resetAsk() {
  state.open = false;
  state.busy = false;
  state.contact = '';
  state.sent = false;
  state.thread = [];
}
