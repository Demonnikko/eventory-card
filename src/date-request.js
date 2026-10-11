// «Проверить дату» — единственная заявка визитки.
//
// Раньше у гостя было три входа: «Быстрый вопрос», «Узнать цену» и всплывающее
// спецпредложение. Они спорили друг с другом, а первый вопрос любого заказчика
// один и тот же — свободен ли артист на его дату. Поэтому кнопка одна, а
// шторка спрашивает ровно то, без чего владелец не назовёт цену: дату, город,
// формат и как связаться. Праздник подставляется сам, если гость пришёл со
// страницы повода.
import './styles/date-request.css';
import { escapeHtml, escapeAttr } from './shared/lib/html.js';
import { renderIcon } from './shared/components/icons.js';
import { toast } from './shared/components/toast.js';
import { hapticLight, hapticSuccess } from './shared/lib/haptic.js';
import { enabledOccasions, occasionById, occasionTitle } from './shared/data/occasions.js';
import { sendLead } from './insight-data.js';
import { fitSheetToKeyboard } from './shared/lib/sheet-keyboard.js';

const UNKNOWN_FORMAT = 'Пока не знаю';
const OTHER_OCCASION = 'other';

// Введённое переживает закрытие шторки в пределах визита: гость закрыл её,
// чтобы ещё раз посмотреть номера, — и не должен печатать всё заново.
const state = {
  occasion: '',
  eventDate: '',
  city: '',
  format: '',
  name: '',
  phone: '',
  messenger: '',
  busy: false,
  sent: false,
  errors: {}
};

export function resetDateRequest() {
  Object.assign(state, {
    occasion: '', eventDate: '', city: '', format: '', name: '', phone: '',
    messenger: '', busy: false, sent: false, errors: {}
  });
}

function formatDay(iso) {
  if (!iso) return '';
  const date = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}

function todayIso() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function chips(name, label, options, selected) {
  return `
    <fieldset class="dr-group">
      <legend class="dr-label">${escapeHtml(label)}</legend>
      <div class="dr-chips">
        ${options.map((o) => `
          <label class="dr-chip${o.value === selected ? ' is-on' : ''}">
            <input type="radio" name="${escapeAttr(name)}" value="${escapeAttr(o.value)}"
              ${o.value === selected ? 'checked' : ''} />
            <span>${escapeHtml(o.label)}</span>
          </label>
        `).join('')}
      </div>
    </fieldset>
  `;
}

function field({ name, label, type = 'text', value, placeholder = '', autocomplete = 'off', inputmode = '', max = 0, extra = '' }) {
  const error = state.errors[name];
  const id = `dr-${name}`;
  const input = `
      <input class="dr-input${error ? ' is-invalid' : ''}" id="${id}" name="${escapeAttr(name)}"
        type="${escapeAttr(type)}" value="${escapeAttr(value)}"
        ${placeholder ? `placeholder="${escapeAttr(placeholder)}"` : ''}
        autocomplete="${escapeAttr(autocomplete)}"
        ${inputmode ? `inputmode="${escapeAttr(inputmode)}"` : ''}
        ${max ? `maxlength="${max}"` : ''}
        ${error ? `aria-invalid="true" aria-describedby="${id}-error"` : ''} ${extra} />`;
  // Дата — с подсказкой поверх пустого поля (её видно только на iPhone,
  // см. .dr-date в date-request.css).
  const control = type === 'date'
    ? `<span class="dr-date" data-empty="${value ? 'false' : 'true'}">${input}
        <span class="dr-date-hint" aria-hidden="true">${renderIcon('calendar', { size: 18 })}Выбрать</span>
      </span>`
    : input;
  return `
    <label class="dr-field" for="${id}">
      <span class="dr-label">${escapeHtml(label)}</span>
      ${control}
      ${error ? `<span class="dr-error" id="${id}-error" role="alert">${escapeHtml(error)}</span>` : ''}
    </label>
  `;
}

function contextTitle(card, fixedOccasion) {
  const occasion = occasionById(fixedOccasion || state.occasion);
  return occasion ? occasionTitle(occasion) : '';
}

function renderForm(card, fixedOccasion) {
  const occasions = fixedOccasion ? [] : enabledOccasions(card);
  const formats = (card.formats || []).filter((f) => f.title);
  const chipTitle = contextTitle(card, fixedOccasion);
  return `
    <div class="dr-head">
      ${chipTitle ? `<span class="vz-chip">${escapeHtml(chipTitle)}</span>` : '<span></span>'}
      <button type="button" class="dr-close" data-dr-close aria-label="Закрыть">${renderIcon('x', { size: 18 })}</button>
    </div>
    <h2 class="dr-title" id="dr-title" tabindex="-1">Проверим вашу дату</h2>
    <form class="dr-form" data-dr-form novalidate>
      ${occasions.length ? chips('occasion', 'Праздник', [
        ...occasions.map((o) => ({ value: o.id, label: occasionTitle(o) })),
        { value: OTHER_OCCASION, label: 'Другое' }
      ], state.occasion) : ''}
      <div class="dr-row">
        ${field({ name: 'eventDate', label: 'Дата', type: 'date', value: state.eventDate, extra: `min="${todayIso()}"` })}
        ${field({ name: 'city', label: 'Город', value: state.city, placeholder: card.city || 'Город', autocomplete: 'address-level2', max: 60 })}
      </div>
      ${formats.length ? chips('format', 'Формат', [
        ...formats.map((f) => ({ value: f.title, label: f.minutes ? `${f.title} · ${f.minutes} мин` : f.title })),
        { value: UNKNOWN_FORMAT, label: UNKNOWN_FORMAT }
      ], state.format) : ''}
      ${field({ name: 'name', label: 'Как вас зовут', value: state.name, autocomplete: 'name', max: 80 })}
      ${field({ name: 'phone', label: 'Телефон', type: 'tel', value: state.phone, placeholder: '+7 900 000-00-00', autocomplete: 'tel', inputmode: 'tel', max: 30 })}
      ${field({ name: 'messenger', label: 'Telegram или ВКонтакте — по желанию', value: state.messenger, placeholder: '@ник или ссылка', max: 120 })}
      <button type="submit" class="vz-cta dr-submit" ${state.busy ? 'disabled' : ''}>
        ${state.busy ? 'Отправляю…' : 'Проверить дату'}
      </button>
      <p class="dr-privacy">Контакт не публикуется — нужен только чтобы ответить.
        <a href="/#/privacy" target="_blank" rel="noopener">Подробнее</a></p>
    </form>
  `;
}

function summaryRows(card, fixedOccasion) {
  const occasion = contextTitle(card, fixedOccasion);
  return [
    ['Праздник', occasion],
    ['Дата', formatDay(state.eventDate)],
    ['Город', state.city],
    ['Формат', state.format && state.format !== UNKNOWN_FORMAT ? state.format : '']
  ].filter(([, value]) => value);
}

function renderDone(card, fixedOccasion) {
  const day = formatDay(state.eventDate);
  const rows = summaryRows(card, fixedOccasion);
  const channel = state.messenger ? 'в мессенджере или по телефону' : 'по телефону';
  return `
    <div class="dr-head">
      <span></span>
      <button type="button" class="dr-close" data-dr-close aria-label="Закрыть">${renderIcon('x', { size: 18 })}</button>
    </div>
    <div class="dr-done">
      <span class="dr-done-ring" aria-hidden="true">${renderIcon('check', { size: 36 })}</span>
      <h2 class="dr-title" id="dr-title" tabindex="-1">Дата у меня</h2>
      <p class="dr-done-text">${day ? `Проверю ${escapeHtml(day)} и отвечу ${channel}.` : `Скоро отвечу ${channel}.`}</p>
      ${rows.length ? `
        <dl class="dr-summary">
          ${rows.map(([k, v]) => `<div><dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd></div>`).join('')}
        </dl>
      ` : ''}
      <button type="button" class="vz-cta" data-dr-save>
        ${renderIcon('download', { size: 20 })} Сохранить контакт
      </button>
      <button type="button" class="dr-text-btn" data-dr-close>Вернуться к визитке</button>
    </div>
  `;
}

function validate() {
  const errors = {};
  if (!state.name.trim()) errors.name = 'Как к вам обращаться?';
  if (!/\+?[0-9][0-9()\s-]{6,}/.test(state.phone.trim())) errors.phone = 'Укажите телефон — по нему отвечу';
  state.errors = errors;
  return Object.keys(errors)[0] || '';
}

// Открывает шторку поверх визитки.
//   card       — публичные данные визитки (форматы, праздники, контакты)
//   occasion   — id праздника, если гость пришёл со страницы повода
//   interactive=false — предпросмотр владельца: шторку видно, заявка не уходит
export function openDateRequest({ card, slug, tagId = '', source = '', occasion = '', interactive = true, onSaveContact }) {
  if (document.querySelector('[data-date-sheet]')) return;
  const opener = document.activeElement;
  hapticLight();

  const overlay = document.createElement('div');
  overlay.className = 'dr-overlay';
  overlay.setAttribute('data-date-sheet', '');
  overlay.innerHTML = `
    <section class="dr-sheet" role="dialog" aria-modal="true" aria-labelledby="dr-title">
      <span class="dr-handle" aria-hidden="true"></span>
      <div class="dr-body" data-dr-body></div>
    </section>
  `;
  document.body.appendChild(overlay);
  const previousOverflow = document.documentElement.style.overflow;
  document.documentElement.style.overflow = 'hidden';
  requestAnimationFrame(() => overlay.classList.add('is-open'));

  const body = overlay.querySelector('[data-dr-body]');
  const releaseKeyboard = fitSheetToKeyboard(overlay, body);

  function close() {
    overlay.classList.remove('is-open');
    document.removeEventListener('keydown', onKey);
    releaseKeyboard();
    const finish = () => {
      overlay.remove();
      document.documentElement.style.overflow = previousOverflow;
      if (opener && typeof opener.focus === 'function') opener.focus({ preventScroll: true });
    };
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) finish();
    else window.setTimeout(finish, 260);
  }

  function focusables() {
    return [...overlay.querySelectorAll('button, input, a[href]')].filter((el) => !el.disabled);
  }

  function onKey(event) {
    if (event.key === 'Escape') close();
    if (event.key !== 'Tab') return;
    const list = focusables();
    if (!list.length) return;
    const first = list[0];
    const last = list[list.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function render({ focus = '' } = {}) {
    body.innerHTML = state.sent ? renderDone(card, occasion) : renderForm(card, occasion);
    bind();
    const target = focus ? body.querySelector(`[name="${focus}"]`) : null;
    if (target) target.focus();
  }

  async function submit() {
    if (state.busy) return;
    const invalid = validate();
    if (invalid) {
      render({ focus: invalid });
      return;
    }
    if (!interactive) {
      toast.show('Это предпросмотр — заявки принимает опубликованная визитка');
      return;
    }
    state.busy = true;
    render();
    try {
      await sendLead(slug, {
        name: state.name.trim(),
        phone: state.phone.trim(),
        messenger: state.messenger.trim(),
        eventDate: state.eventDate,
        city: state.city.trim(),
        format: state.format === UNKNOWN_FORMAT ? '' : state.format,
        occasion: occasion || (state.occasion === OTHER_OCCASION ? '' : state.occasion),
        source,
        tagId
      });
      state.sent = true;
      hapticSuccess();
    } catch {
      toast.show('Не получилось отправить. Позвоните или напишите — контакты на визитке.', { error: true });
    } finally {
      state.busy = false;
      render();
      body.querySelector('.dr-title')?.focus?.();
    }
  }

  function bind() {
    body.querySelectorAll('[data-dr-close]').forEach((btn) => btn.addEventListener('click', close));
    body.querySelector('[data-dr-save]')?.addEventListener('click', () => onSaveContact?.());
    const form = body.querySelector('[data-dr-form]');
    if (!form) return;
    form.addEventListener('input', (event) => {
      const el = event.target;
      if (!(el.name in state)) return;
      state[el.name] = el.value;
      if (el.type === 'date') el.closest('.dr-date')?.setAttribute('data-empty', el.value ? 'false' : 'true');
      // Ошибку поля снимаем, как только человек начал её исправлять.
      if (state.errors[el.name]) {
        delete state.errors[el.name];
        el.classList.remove('is-invalid');
        el.removeAttribute('aria-invalid');
        el.closest('.dr-field')?.querySelector('.dr-error')?.remove();
      }
    });
    form.addEventListener('change', (event) => {
      const el = event.target;
      if (el.type !== 'radio') return;
      state[el.name] = el.value;
      form.querySelectorAll(`input[name="${el.name}"]`).forEach((input) => {
        input.closest('.dr-chip')?.classList.toggle('is-on', input.checked);
      });
      hapticLight();
    });
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      submit();
    });
  }

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) close();
  });
  document.addEventListener('keydown', onKey);
  render();
  // На телефоне клавиатура закрыла бы половину шторки — фокус ставим только
  // там, где есть физическая клавиатура (точный указатель).
  if (window.matchMedia?.('(pointer: fine)').matches) {
    body.querySelector('input')?.focus({ preventScroll: true });
  } else {
    body.querySelector('.dr-close')?.focus({ preventScroll: true });
  }
}
