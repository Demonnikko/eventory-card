// «Узнать цену» — главный крючок визитки, то что видит клиент.
//
// Цену хочет узнать любой — от бедного до богатого, это универсальный триггер
// без обязательств. Поэтому кнопка одна на всех и называется всегда одинаково.
// Форма спрашивает ровно столько, чтобы владелец мог дать осмысленную цену:
// имя, контакт и (необязательно) дату. Больше полей — меньше заявок.
import { escapeHtml, escapeAttr } from './shared/lib/html.js';
import { renderIcon } from './shared/components/icons.js';
import { toast } from './shared/components/toast.js';
import { sendLead } from './insight-data.js';

const state = {
  slug: '',
  tagId: '',
  card: null,
  open: false,
  busy: false,
  name: '',
  contact: '',
  eventDate: '',
  sent: false
};

export function renderPriceRequest(card) {
  if (card) state.card = card;
  const c = state.card || {};
  // Некуда дать цену без контактов владельца — блок не показываем.
  if (!c.phone && !c.telegram && !c.email) return '';

  if (state.sent) {
    return `
      <section class="cp-price-req is-sent" data-price-req>
        <span class="cp-price-req-done" aria-hidden="true">${renderIcon('check')}</span>
        <span class="cp-price-req-done-title">Запрос отправлен</span>
        <span class="cp-price-req-done-text">Скоро назову цену — свяжусь с вами лично.</span>
      </section>
    `;
  }

  return `
    <section class="cp-price-req${state.open ? ' is-open' : ''}" data-price-req>
      <button type="button" class="cp-price-req-cta" data-price-toggle>
        <span class="cp-price-req-cta-label">Узнать цену</span>
        <span class="cp-price-req-cta-icon" aria-hidden="true">${renderIcon('chevron-right')}</span>
      </button>

      <div class="cp-price-req-body" ${state.open ? '' : 'hidden'}>
        <input class="cp-price-req-input" type="text" value="${escapeAttr(state.name)}"
          placeholder="Как вас зовут" maxlength="80" autocomplete="name"
          data-lead-name ${state.busy ? 'disabled' : ''} />
        <input class="cp-price-req-input" type="text" value="${escapeAttr(state.contact)}"
          placeholder="Телефон или @telegram" maxlength="120" autocomplete="tel"
          data-lead-contact ${state.busy ? 'disabled' : ''} />
        <input class="cp-price-req-input" type="date"
          value="${escapeAttr(state.eventDate)}"
          data-lead-date ${state.busy ? 'disabled' : ''} />
        <span class="cp-price-req-hint">Дата — по желанию. Так назову цену точнее.</span>

        <button type="button" class="cp-price-req-send" data-lead-send ${state.busy ? 'disabled' : ''}>
          ${state.busy ? 'Отправляю…' : 'Отправить запрос'}
        </button>
        <span class="cp-price-req-privacy">Контакт не публикуется — нужен только чтобы назвать цену.
          <a href="/#/privacy" target="_blank" rel="noopener">Подробнее</a></span>
      </div>
    </section>
  `;
}

export function bindPriceRequest(node, { slug, tagId }) {
  state.slug = slug;
  state.tagId = tagId;

  const toggle = node.querySelector('[data-price-toggle]');
  if (toggle) {
    toggle.addEventListener('click', () => {
      state.open = !state.open;
      rerender(node);
      if (state.open) node.querySelector('[data-lead-name]')?.focus();
    });
  }

  const nameEl = node.querySelector('[data-lead-name]');
  const contactEl = node.querySelector('[data-lead-contact]');
  const dateEl = node.querySelector('[data-lead-date]');
  // Держим ввод в состоянии, чтобы перерисовка блока его не теряла.
  nameEl?.addEventListener('input', () => { state.name = nameEl.value; });
  contactEl?.addEventListener('input', () => { state.contact = contactEl.value; });
  dateEl?.addEventListener('input', () => { state.eventDate = dateEl.value; });

  const sendBtn = node.querySelector('[data-lead-send]');
  sendBtn?.addEventListener('click', () => send(node));
}

function rerender(root) {
  const host = root.querySelector('[data-price-req]');
  if (!host) return;
  host.outerHTML = renderPriceRequest(state.card);
  bindPriceRequest(root, { slug: state.slug, tagId: state.tagId });
}

async function send(node) {
  if (state.busy) return;
  const name = String(state.name || '').trim();
  const contact = String(state.contact || '').trim();

  if (!name) {
    toast.show('Как вас зовут?');
    node.querySelector('[data-lead-name]')?.focus();
    return;
  }
  if (!contact) {
    toast.show('Оставьте телефон или Telegram для ответа');
    node.querySelector('[data-lead-contact]')?.focus();
    return;
  }
  if (!/(@[a-z0-9_]{5,32}|\+?[0-9][0-9()\s-]{6,}|[^\s@]+@[^\s@]+\.[^\s@]+)/i.test(contact)) {
    toast.show('Укажите телефон, @telegram или email');
    node.querySelector('[data-lead-contact]')?.focus();
    return;
  }

  state.busy = true;
  rerender(node);

  try {
    await sendLead(state.slug, {
      name, contact, eventDate: state.eventDate, tagId: state.tagId
    });
    state.sent = true;
  } catch {
    toast.show('Не получилось отправить. Напишите напрямую — контакты выше.');
  } finally {
    state.busy = false;
    rerender(node);
  }
}

export function resetPriceRequest() {
  state.open = false;
  state.busy = false;
  state.name = '';
  state.contact = '';
  state.eventDate = '';
  state.sent = false;
}
