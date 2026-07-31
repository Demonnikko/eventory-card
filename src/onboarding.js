// Приветствие — первое, что видит человек, открыв приложение.
//
// Задача экрана: за несколько секунд показать, ЧТО он получит. Поэтому в
// центре стоит настоящая карточка с тиснёной бумагой, и она перестраивается
// прямо под пальцем, пока человек выбирает направление. Никаких абстрактных
// иллюстраций «о продукте» — сразу его будущая визитка.
import { escapeHtml, escapeAttr } from './shared/lib/html.js';
import { renderIcon } from './shared/components/icons.js';
import { BUSINESS_CARD_PROFESSIONS, businessCardTemplateUrl } from './shared/data/businessCard.js';
import { getCard, saveCard } from './card-data.js';

const ONBOARDING_KEY = 'eventory-card:onboarded';

export function isOnboarded() {
  try {
    return localStorage.getItem(ONBOARDING_KEY) === '1';
  } catch {
    return false;
  }
}

export function markOnboarded() {
  try {
    localStorage.setItem(ONBOARDING_KEY, '1');
  } catch { /* приватный режим — покажем приветствие ещё раз, не страшно */ }
}

const state = {
  step: 'welcome',       // welcome → profession → name → done
  profession: '',
  name: '',
  card: null,
  busy: false
};

// Текстуры тяжёлые (200–310КБ). Грузим по одной, по мере наведения на плитку,
// чтобы к моменту выбора картинка уже была в кэше браузера.
const preloaded = new Set();
function preloadTemplate(professionId) {
  if (!professionId || preloaded.has(professionId)) return;
  preloaded.add(professionId);
  const img = new Image();
  img.src = businessCardTemplateUrl(professionId);
}

function professionLabel(id) {
  return BUSINESS_CARD_PROFESSIONS.find((p) => p.id === id)?.label || '';
}

function splitName(full) {
  const parts = String(full || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { first: '', last: '' };
  return { first: parts[0], last: parts.slice(1).join(' ') };
}

/* ─────────── Карточка-герой ─────────── */

// Та самая «бумажная» визитка: текстура профессии, тиснёное имя, золотая
// фольга. Показывается горизонтально — как настоящая визитка в руке.
function renderPaperCard() {
  const pro = state.profession || '';
  const { first, last } = splitName(state.name);
  const role = professionLabel(pro);
  const template = pro ? businessCardTemplateUrl(pro) : '';

  return `
    <div class="ob-paper${pro ? ' has-template' : ''}" data-paper style="${template ? `--ob-template:url('${escapeAttr(template)}')` : ''}">
      <div class="ob-paper-bg" aria-hidden="true"></div>
      <div class="ob-paper-sheen" aria-hidden="true"></div>
      <div class="ob-paper-copy">
        <strong class="ob-paper-first">${escapeHtml(first || 'Ваше имя')}</strong>
        ${last ? `<span class="ob-paper-last">${escapeHtml(last)}</span>` : ''}
        <em class="ob-paper-role">${escapeHtml(role || 'ваше направление')}</em>
      </div>
      <div class="ob-paper-edge" aria-hidden="true"></div>
    </div>
  `;
}

/* ─────────── Шаги ─────────── */

function renderWelcome() {
  return `
    <div class="ob-step ob-step--welcome" data-step="welcome">
      <div class="ob-stage" data-stage>
        ${renderPaperCard()}
      </div>

      <div class="ob-copy">
        <p class="ob-kicker">Электронная визитка</p>
        <h1 class="ob-title">Ваша визитка<br />за две минуты</h1>
        <p class="ob-lead">Клиент открывает ссылку или сканирует QR — и сразу видит, кто вы и как с вами связаться.</p>
      </div>

      <div class="ob-actions">
        <button type="button" class="ob-btn ob-btn--primary" data-next="profession">
          <span>Начать</span>
          <span class="ob-btn-sheen" aria-hidden="true"></span>
        </button>
        <p class="ob-fineprint">Бесплатно. Без регистрации.</p>
      </div>
    </div>
  `;
}

function renderProfessionStep() {
  const tiles = BUSINESS_CARD_PROFESSIONS.map((p, i) => `
    <button
      type="button"
      class="ob-tile${state.profession === p.id ? ' is-selected' : ''}"
      data-profession="${escapeAttr(p.id)}"
      style="--tile-order:${i}; --ob-tile-art:url('${escapeAttr(businessCardTemplateUrl(p.id))}')"
      aria-pressed="${state.profession === p.id ? 'true' : 'false'}"
    >
      <span class="ob-tile-art" aria-hidden="true"></span>
      <span class="ob-tile-label">${escapeHtml(p.label)}</span>
      ${state.profession === p.id ? `<span class="ob-tile-check" aria-hidden="true">${renderIcon('check', { size: 13 })}</span>` : ''}
    </button>
  `).join('');

  return `
    <div class="ob-step" data-step="profession">
      <div class="ob-stage" data-stage>
        ${renderPaperCard()}
      </div>

      <div class="ob-copy ob-copy--tight">
        <p class="ob-kicker">Шаг 1 из 2</p>
        <h2 class="ob-subtitle">Кто вы?</h2>
        <p class="ob-lead ob-lead--sm">Фон визитки подберётся под ваше направление.</p>
      </div>

      <div class="ob-tiles">${tiles}</div>

      <div class="ob-actions">
        <button type="button" class="ob-btn ob-btn--primary" data-next="name" ${state.profession ? '' : 'disabled'}>
          <span>${state.profession ? 'Дальше' : 'Выберите направление'}</span>
          <span class="ob-btn-sheen" aria-hidden="true"></span>
        </button>
      </div>
    </div>
  `;
}

function renderNameStep() {
  return `
    <div class="ob-step" data-step="name">
      <div class="ob-stage" data-stage>
        ${renderPaperCard()}
      </div>

      <div class="ob-copy ob-copy--tight">
        <p class="ob-kicker">Шаг 2 из 2</p>
        <h2 class="ob-subtitle">Как вас зовут?</h2>
        <p class="ob-lead ob-lead--sm">Имя появится на визитке — можно изменить в любой момент.</p>
      </div>

      <div class="ob-field">
        <input
          class="ob-input"
          type="text"
          name="name"
          value="${escapeAttr(state.name)}"
          placeholder="Имя и фамилия"
          maxlength="80"
          autocomplete="name"
          data-name-input
        />
      </div>

      <div class="ob-actions">
        <button type="button" class="ob-btn ob-btn--primary" data-finish ${state.busy ? 'disabled' : ''}>
          <span>${state.busy ? 'Готовим…' : 'Открыть визитку'}</span>
          <span class="ob-btn-sheen" aria-hidden="true"></span>
        </button>
        <button type="button" class="ob-btn ob-btn--plain" data-skip>Заполню позже</button>
      </div>
    </div>
  `;
}

function renderContent() {
  if (state.step === 'welcome') return renderWelcome();
  if (state.step === 'profession') return renderProfessionStep();
  return renderNameStep();
}

/* ─────────── Экран ─────────── */

export const onboarding = {
  id: 'onboarding',
  title: '',
  render() {
    return '<div class="ob-loading"></div>';
  },
  async mount(node, ctx = {}) {
    state.card = await getCard();
    // Возврат в онбординг с уже заполненной карточкой — показываем её данные.
    state.profession = state.card.profession || '';
    state.name = state.card.name || '';
    state.step = 'welcome';
    state.busy = false;

    node.innerHTML = renderContent();
    bind(node, ctx);
    if (state.profession) preloadTemplate(state.profession);
  }
};

// Перерисовываем только то, что изменилось: карточка-герой не должна
// «мигать» при переключении шага — она общая для всех экранов.
function swapStep(node, ctx) {
  const current = node.querySelector('.ob-step');
  if (!current) {
    node.innerHTML = renderContent();
    bind(node, ctx);
    return;
  }
  current.classList.add('is-leaving');
  const done = () => {
    node.innerHTML = renderContent();
    bind(node, ctx);
  };
  // Ждём конец анимации ухода, но не зависаем, если её отключили системно.
  let called = false;
  const once = () => { if (!called) { called = true; done(); } };
  current.addEventListener('animationend', once, { once: true });
  setTimeout(once, 320);
}

function updatePaper(node) {
  const stage = node.querySelector('[data-stage]');
  if (!stage) return;
  stage.innerHTML = renderPaperCard();
}

function bind(node, ctx = {}) {
  // Переходы между шагами
  node.querySelectorAll('[data-next]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.disabled) return;
      state.step = btn.dataset.next;
      swapStep(node, ctx);
    });
  });

  // Выбор направления — карточка перестраивается сразу, без перезагрузки шага
  node.querySelectorAll('[data-profession]').forEach((tile) => {
    const id = tile.dataset.profession;
    tile.addEventListener('pointerenter', () => preloadTemplate(id), { once: true });
    tile.addEventListener('click', () => {
      state.profession = state.profession === id ? '' : id;
      preloadTemplate(id);

      node.querySelectorAll('[data-profession]').forEach((t) => {
        const active = t.dataset.profession === state.profession;
        t.classList.toggle('is-selected', active);
        t.setAttribute('aria-pressed', active ? 'true' : 'false');
        const check = t.querySelector('.ob-tile-check');
        if (active && !check) {
          t.insertAdjacentHTML('beforeend', `<span class="ob-tile-check" aria-hidden="true">${renderIcon('check', { size: 13 })}</span>`);
        } else if (!active && check) {
          check.remove();
        }
      });

      updatePaper(node);

      const next = node.querySelector('[data-next="name"]');
      if (next) {
        next.disabled = !state.profession;
        next.querySelector('span').textContent = state.profession ? 'Дальше' : 'Выберите направление';
      }
    });
  });

  // Имя — карточка обновляется по мере набора
  const nameInput = node.querySelector('[data-name-input]');
  if (nameInput) {
    nameInput.addEventListener('input', () => {
      state.name = nameInput.value;
      updatePaper(node);
    });
    nameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        finish(node, ctx);
      }
    });
    setTimeout(() => nameInput.focus(), 420);
  }

  const finishBtn = node.querySelector('[data-finish]');
  if (finishBtn) finishBtn.addEventListener('click', () => finish(node, ctx));

  const skipBtn = node.querySelector('[data-skip]');
  if (skipBtn) skipBtn.addEventListener('click', () => finish(node, ctx, { skipName: true }));
}

async function finish(node, ctx, { skipName = false } = {}) {
  if (state.busy) return;
  state.busy = true;

  const patch = { profession: state.profession };
  if (!skipName && state.name.trim()) patch.name = state.name.trim();
  // Направление подставляет и роль — человеку не придётся вводить её руками.
  if (state.profession && !state.card?.role) patch.role = professionLabel(state.profession);

  try {
    await saveCard({ ...state.card, ...patch });
  } catch { /* не блокируем вход: карточку можно заполнить в редакторе */ }

  markOnboarded();
  if (typeof ctx.onDone === 'function') ctx.onDone();
  else window.location.hash = '#/editor';
}
