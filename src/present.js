// Режим предъявления — карточка, которую протягивают в руке.
//
// Смысл экрана: это не страница, которую скроллят, а предмет. Человек
// поворачивает телефон горизонтально, показывает визитку собеседнику,
// тот берёт телефон — и жест выходит ровно таким же, как с бумажной
// карточкой. Тап переворачивает её на обратную сторону с QR: собеседник
// наводит камеру и забирает контакт за пару секунд.
//
// Поэтому здесь нет интерфейса: ни шапки, ни таббара, ни кнопок поверх.
// Только карточка, подсказка и выход.
import { escapeHtml, escapeAttr } from './shared/lib/html.js';
import { renderIcon } from './shared/components/icons.js';
import { qrSvg } from './shared/data/qr.js';
import { businessCardTemplateUrl } from './shared/data/businessCard.js';
import { hapticLight, hapticMedium } from './shared/lib/haptic.js';
import { getCard, cardPublicUrl } from './card-data.js';

const state = {
  card: null,
  flipped: false,
  hintSeen: false
};

const HINT_KEY = 'eventory-card:present-hint';

function splitName(full) {
  const parts = String(full || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { first: '', last: '' };
  return { first: parts[0], last: parts.slice(1).join(' ') };
}

// Лицевая сторона: имя, роль, город на тиснёной бумаге направления.
function renderFront(card) {
  const { first, last } = splitName(card.name);
  const meta = [card.role, card.city].filter(Boolean).join(' · ');
  const template = card.profession ? businessCardTemplateUrl(card.profession) : '';

  return `
    <div class="pr-face pr-face--front${template ? ' has-template' : ''}"
      ${template ? `style="--pr-template:url('${escapeAttr(template)}')"` : ''}>
      <span class="pr-face-bg" aria-hidden="true"></span>
      <span class="pr-sheen-clip" aria-hidden="true"><span class="pr-face-sheen"></span></span>
      <div class="pr-face-copy">
        <strong class="pr-name">${escapeHtml(first || 'Ваше имя')}</strong>
        ${last ? `<span class="pr-surname">${escapeHtml(last)}</span>` : ''}
        ${meta ? `<em class="pr-meta">${escapeHtml(meta)}</em>` : ''}
      </div>
      <span class="pr-face-edge" aria-hidden="true"></span>
    </div>
  `;
}

// Обратная сторона: крупный QR на той же бумаге. Единственная задача —
// чтобы собеседник навёл камеру и не промахнулся.
function renderBack(card, url) {
  const template = card.profession ? businessCardTemplateUrl(card.profession) : '';
  return `
    <div class="pr-face pr-face--back${template ? ' has-template' : ''}"
      ${template ? `style="--pr-template:url('${escapeAttr(template)}')"` : ''}>
      <span class="pr-face-bg" aria-hidden="true"></span>
      <span class="pr-face-edge" aria-hidden="true"></span>
      <div class="pr-back-inner">
        ${url ? `
          <div class="pr-qr">${qrSvg(url, { className: 'pr-qr-svg', title: 'QR-код визитки' })}</div>
          <span class="pr-qr-caption">Наведите камеру</span>
        ` : `
          <div class="pr-qr-empty">
            <span>Опубликуйте визитку —<br />здесь появится QR-код</span>
          </div>
        `}
      </div>
    </div>
  `;
}

function renderContent() {
  const card = state.card;
  if (!card) return '<div class="pr-loading"></div>';

  const url = card.publishedSlug ? cardPublicUrl(card.publishedSlug) : '';

  return `
    <div class="pr-screen${state.flipped ? ' is-flipped' : ''}" data-present>
      <button type="button" class="pr-exit" data-exit aria-label="Закрыть">
        ${renderIcon('x')}
      </button>

      <div class="pr-stage">
        <div class="pr-card" data-card role="button" tabindex="0"
          aria-label="${state.flipped ? 'Показать лицевую сторону' : 'Показать QR-код'}">
          ${renderFront(card)}
          ${renderBack(card, url)}
        </div>
      </div>

      <p class="pr-hint${state.hintSeen ? ' is-quiet' : ''}" data-hint>
        ${state.flipped ? 'Коснитесь, чтобы вернуть визитку' : 'Коснитесь — покажется QR-код'}
      </p>

      <!-- Подсказка про поворот: только пока телефон вертикально -->
      <p class="pr-rotate" data-rotate>
        ${renderIcon('navigation')}
        <span>Поверните телефон — визитка станет во весь экран</span>
      </p>
    </div>
  `;
}

export const present = {
  id: 'present',
  title: '',
  render() {
    return '<div class="pr-loading"></div>';
  },
  async mount(node) {
    state.card = await getCard();
    state.flipped = false;
    try {
      state.hintSeen = localStorage.getItem(HINT_KEY) === '1';
    } catch {
      state.hintSeen = false;
    }

    node.innerHTML = renderContent();
    bind(node);
  }
};

function bind(node) {
  const screen = node.querySelector('[data-present]');
  const card = node.querySelector('[data-card]');
  if (!screen || !card) return;

  function flip() {
    state.flipped = !state.flipped;
    screen.classList.toggle('is-flipped', state.flipped);
    hapticMedium();

    const hint = node.querySelector('[data-hint]');
    if (hint) {
      hint.textContent = state.flipped
        ? 'Коснитесь, чтобы вернуть визитку'
        : 'Коснитесь — покажется QR-код';
      // Подсказка нужна один раз: дальше жест уже понятен.
      if (!state.hintSeen) {
        state.hintSeen = true;
        hint.classList.add('is-quiet');
        try { localStorage.setItem(HINT_KEY, '1'); } catch { /* приватный режим */ }
      }
    }
    card.setAttribute('aria-label', state.flipped ? 'Показать лицевую сторону' : 'Показать QR-код');
  }

  card.addEventListener('click', flip);
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      flip();
    }
  });

  const exit = node.querySelector('[data-exit]');
  if (exit) {
    exit.addEventListener('click', () => {
      hapticLight();
      window.location.hash = '#/share';
    });
  }

  // Наклон телефона — карточка слегка ведёт за рукой, блик ползёт по
  // тиснению. Это то, из-за чего экран показывают соседу. На iOS датчик
  // требует явного разрешения, поэтому просим его по первому касанию.
  setupTilt(node, card);
}

function setupTilt(node, card) {
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

  let raf = 0;
  function onOrient(e) {
    // beta — наклон вперёд/назад, gamma — вбок. Ограничиваем диапазон,
    // иначе карточка «улетает» при резком движении.
    const clamp = (v, lim) => Math.max(-lim, Math.min(lim, v || 0));
    const x = clamp(e.gamma, 26);
    const y = clamp((e.beta || 0) - 42, 22);
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      card.style.setProperty('--tilt-x', `${(-y * 0.32).toFixed(2)}deg`);
      card.style.setProperty('--tilt-y', `${(x * 0.42).toFixed(2)}deg`);
      // % от ширины самого блика (translateX), не от родителя (left) —
      // left запускал бы layout reflow на каждое событие датчика.
      card.style.setProperty('--tilt-sheen-x', `${(x * 3.864 - 90.91).toFixed(1)}%`);
    });
  }

  function attach() {
    window.addEventListener('deviceorientation', onOrient);
  }

  const Perm = window.DeviceOrientationEvent?.requestPermission;
  if (typeof Perm === 'function') {
    // iOS: разрешение запрашивается только из обработчика жеста.
    const ask = () => {
      Perm.call(window.DeviceOrientationEvent)
        .then((res) => { if (res === 'granted') attach(); })
        .catch(() => { /* отказ — карточка просто останется статичной */ });
    };
    node.addEventListener('click', ask, { once: true });
  } else if ('DeviceOrientationEvent' in window) {
    attach();
  }
}
