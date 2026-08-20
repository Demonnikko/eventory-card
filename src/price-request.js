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
  phone: '',
  vk: '',
  telegram: '',
  eventDate: '',
  offerLabel: '',
  sent: false
};

// Гость открыл форму через «крючок» (спецпредложение) — запоминаем показанный
// текст, чтобы пришить его к заявке. Владелец в «Отклике» увидит, по какому
// предложению пришёл клиент. Переживает перерисовку формы (state — модульный).
export function markOfferContext(label) {
  state.offerLabel = String(label || '').slice(0, 140);
}

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
        <input class="cp-price-req-input" type="tel" value="${escapeAttr(state.phone)}"
          placeholder="Телефон" maxlength="30" autocomplete="tel" inputmode="tel"
          data-lead-phone ${state.busy ? 'disabled' : ''} />
        <input class="cp-price-req-input" type="text" value="${escapeAttr(state.vk)}"
          placeholder="Ссылка ВКонтакте или id" maxlength="120" autocomplete="off"
          data-lead-vk ${state.busy ? 'disabled' : ''} />
        <input class="cp-price-req-input" type="text" value="${escapeAttr(state.telegram)}"
          placeholder="@telegram" maxlength="40" autocomplete="off"
          data-lead-telegram ${state.busy ? 'disabled' : ''} />
        <span class="cp-price-req-hint">Телефон обязателен. И укажите ВКонтакте или Telegram — так свяжусь быстрее.</span>
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
  const phoneEl = node.querySelector('[data-lead-phone]');
  const vkEl = node.querySelector('[data-lead-vk]');
  const tgEl = node.querySelector('[data-lead-telegram]');
  const dateEl = node.querySelector('[data-lead-date]');
  // Держим ввод в состоянии, чтобы перерисовка блока его не теряла.
  nameEl?.addEventListener('input', () => { state.name = nameEl.value; });
  phoneEl?.addEventListener('input', () => { state.phone = phoneEl.value; });
  vkEl?.addEventListener('input', () => { state.vk = vkEl.value; });
  tgEl?.addEventListener('input', () => { state.telegram = tgEl.value; });
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
  const phone = String(state.phone || '').trim();
  const vk = String(state.vk || '').trim();
  const telegram = String(state.telegram || '').trim();

  if (!name) {
    toast.show('Как вас зовут?');
    node.querySelector('[data-lead-name]')?.focus();
    return;
  }
  // Телефон обязателен: базовый контакт, есть у всех.
  if (!/\+?[0-9][0-9()\s-]{6,}/.test(phone)) {
    toast.show('Укажите телефон для связи');
    node.querySelector('[data-lead-phone]')?.focus();
    return;
  }
  // Работаем в мессенджерах — нужен хотя бы один: ВКонтакте или Telegram.
  if (!vk && !telegram) {
    toast.show('Укажите ВКонтакте или Telegram — так свяжусь быстрее');
    node.querySelector('[data-lead-vk]')?.focus();
    return;
  }

  state.busy = true;
  rerender(node);

  try {
    await sendLead(state.slug, {
      name, phone, vk, telegram, eventDate: state.eventDate, tagId: state.tagId,
      offerLabel: state.offerLabel
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
  state.phone = '';
  state.vk = '';
  state.telegram = '';
  state.eventDate = '';
  state.sent = false;
}
