// Режим предъявления — готовая визитка с QR-кодом на лицевой стороне.
// Карточка появляется один раз и остаётся неподвижной: никаких переворотов,
// гироскопа и разрешений датчика. По касанию увеличивается только QR-код.
import { escapeHtml, escapeAttr } from './shared/lib/html.js';
import { renderIcon } from './shared/components/icons.js';
import { qrSvg } from './shared/data/qr.js';
import { businessCardTemplateUrl } from './shared/data/businessCard.js';
import { hapticLight } from './shared/lib/haptic.js';
import { getCard, cardPublicUrl } from './card-data.js';

const state = { card: null };

// Координаты измерены по исходным шаблонам 1672×941. QR заполняет внутреннюю
// часть декоративной рамки, а встроенная в SVG quiet zone сохраняет
// считываемость кода. У организатора отдельной рамки нет — для него создаём
// спокойную площадку в свободной правой части композиции.
const QR_LAYOUT_BY_PROFESSION = {
  host: { left: '64.6%', top: '29.0%', size: '25.3%' },
  illusionist: { left: '67.0%', top: '34.2%', size: '18.8%' },
  vocalist: { left: '64.3%', top: '28.4%', size: '23.3%' },
  organizer: { left: '66.0%', top: '30.0%', size: '22.5%', framed: true },
  decorator: { left: '66.1%', top: '31.0%', size: '19.6%' },
  videographer: { left: '64.2%', top: '33.5%', size: '20.7%' },
  photographer: { left: '69.0%', top: '39.7%', size: '21.8%' }
};

function splitName(full) {
  const parts = String(full || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { first: '', last: '' };
  return { first: parts[0], last: parts.slice(1).join(' ') };
}

function qrLayout(profession) {
  return QR_LAYOUT_BY_PROFESSION[profession] || QR_LAYOUT_BY_PROFESSION.host;
}

function qrLayoutStyle(profession) {
  const layout = qrLayout(profession);
  return [
    `--pr-qr-left:${layout.left}`,
    `--pr-qr-top:${layout.top}`,
    `--pr-qr-size:${layout.size}`
  ].join(';');
}

function renderInlineQr(card, url) {
  const layout = qrLayout(card.profession);
  const classes = `pr-inline-qr${layout.framed ? ' is-framed' : ''}`;
  const style = qrLayoutStyle(card.profession);

  if (!url) {
    return `
      <span class="${classes} is-empty" style="${escapeAttr(style)}" aria-label="QR-код появится после публикации">
        <small>После<br />публикации</small>
      </span>
    `;
  }

  return `
    <button type="button" class="${classes}" style="${escapeAttr(style)}"
      data-qr-open aria-label="Увеличить QR-код визитки">
      ${qrSvg(url, { className: 'pr-inline-qr-svg', title: 'QR-код визитки' })}
    </button>
  `;
}

function renderCard(card, url) {
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
      ${renderInlineQr(card, url)}
      <span class="pr-face-edge" aria-hidden="true"></span>
    </div>
  `;
}

function renderQrDialog(url) {
  if (!url) return '';
  return `
    <div class="pr-qr-dialog" data-qr-dialog role="dialog" aria-modal="true"
      aria-labelledby="pr-qr-dialog-title" hidden>
      <div class="pr-qr-dialog-panel">
        <button type="button" class="pr-qr-dialog-close" data-qr-close aria-label="Закрыть QR-код">
          ${renderIcon('x')}
        </button>
        <div class="pr-qr-dialog-code">
          ${qrSvg(url, { className: 'pr-qr-dialog-svg', title: 'Увеличенный QR-код визитки' })}
        </div>
        <strong id="pr-qr-dialog-title">Наведите камеру</strong>
        <span>Визитка откроется на телефоне клиента</span>
      </div>
    </div>
  `;
}

function renderContent() {
  const card = state.card;
  if (!card) return '<div class="pr-loading"></div>';

  const url = card.publishedSlug ? cardPublicUrl(card.publishedSlug) : '';
  // Витрина: приложение открылось сразу визиткой для показа клиенту. Карточка
  // повёрнута крупно на весь экран, видимой кнопки выхода нет — клиент видит
  // только визитку. Владелец выходит долгим удержанием ЦЕНТРА карточки (2 сек):
  // край экрана на iOS перехватывают системные жесты, а центр — нет, и палец
  // до него всегда дотянется. Клиент карточку не держит, случайно не выйдет.
  const kiosk = card.kioskMode === true;

  return `
    <div class="pr-screen${kiosk ? ' pr-screen--kiosk' : ''}" data-present ${kiosk ? 'data-kiosk' : ''}>
      ${kiosk ? '' : `
        <button type="button" class="pr-exit" data-exit aria-label="Закрыть">
          ${renderIcon('x')}
        </button>
      `}

      <div class="pr-stage">
        <div class="pr-card${kiosk ? ' pr-card--hold' : ''}" data-card
          ${kiosk ? 'data-escape' : ''} aria-label="Визитка с QR-кодом">
          ${renderCard(card, url)}
          ${kiosk ? '<span class="pr-hold-ring" data-hold-ring aria-hidden="true"></span>' : ''}
        </div>
      </div>

      ${kiosk ? '' : `
        <p class="pr-hint">
          ${url ? 'QR уже на визитке · коснитесь, чтобы увеличить' : 'QR появится здесь после публикации визитки'}
        </p>

        <p class="pr-rotate">
          ${renderIcon('navigation')}
          <span>В горизонтальном положении визитка станет крупнее</span>
        </p>
      `}

      ${renderQrDialog(url)}
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
    node.innerHTML = renderContent();
    bind(node);
  }
};

function bind(node) {
  const exit = node.querySelector('[data-exit]');
  const escape = node.querySelector('[data-escape]');
  const qrOpen = node.querySelector('[data-qr-open]');
  const dialog = node.querySelector('[data-qr-dialog]');
  const qrClose = node.querySelector('[data-qr-close]');

  if (exit) {
    exit.addEventListener('click', () => {
      hapticLight();
      window.location.hash = '#/share';
    });
  }

  // Витрина: выход в настройки — долгое удержание карточки (2 сек). В этом
  // режиме увеличение QR по тапу отключено, чтобы не мешать удержанию: клиент
  // сканирует код, а не тыкает в него. Поэтому дальше QR-диалог не подключаем.
  if (escape) {
    const ring = node.querySelector('[data-hold-ring]');
    bindEscape(escape, ring);
    return;
  }

  if (!qrOpen || !dialog || !qrClose) return;

  function openDialog() {
    hapticLight();
    dialog.hidden = false;
    requestAnimationFrame(() => {
      dialog.classList.add('is-open');
      qrClose.focus({ preventScroll: true });
    });
  }

  function closeDialog() {
    if (dialog.hidden) return;
    dialog.classList.remove('is-open');
    const finish = () => {
      dialog.hidden = true;
      qrOpen.focus({ preventScroll: true });
    };
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      finish();
    } else {
      window.setTimeout(finish, 250);
    }
  }

  qrOpen.addEventListener('click', openDialog);
  qrClose.addEventListener('click', closeDialog);
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) closeDialog();
  });
  dialog.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeDialog();
    if (event.key === 'Tab') {
      event.preventDefault();
      qrClose.focus({ preventScroll: true });
    }
  });
}

// Время удержания карточки до выхода из витрины. Достаточно долго, чтобы
// случайное касание не выкинуло из показа при клиенте, но не утомительно.
const ESCAPE_HOLD_MS = 2000;

// Выход из витрины по долгому удержанию карточки. На iOS Safari в PWA
// pointer-события для касаний срабатывают ненадёжно, поэтому слушаем и touch-,
// и pointer-события, а от двойного старта защищаемся флагом holding.
function bindEscape(escape, ring) {
  let timer = null;
  let holding = false;

  const cancel = () => {
    holding = false;
    if (timer) { clearTimeout(timer); timer = null; }
    escape.classList.remove('is-charging');
  };

  const start = (event) => {
    // Правый клик и мультитач игнорируем; повторный старт не перезапускаем.
    if (event.type === 'pointerdown' && event.button && event.button !== 0) return;
    if (holding) return;
    // Гасим системный скролл/свайп, иначе iOS прервёт удержание.
    if (event.cancelable) event.preventDefault();
    holding = true;
    escape.classList.add('is-charging');
    if (ring) {
      // Перезапуск CSS-анимации кольца: сбрасываем и включаем заново.
      ring.style.animation = 'none';
      void ring.offsetWidth;
      ring.style.animation = '';
    }
    timer = window.setTimeout(() => {
      cancel();
      hapticLight();
      window.location.hash = '#/share';
    }, ESCAPE_HOLD_MS);
  };

  escape.addEventListener('pointerdown', start);
  escape.addEventListener('pointerup', cancel);
  escape.addEventListener('pointercancel', cancel);
  escape.addEventListener('pointerleave', cancel);
  escape.addEventListener('touchstart', start, { passive: false });
  escape.addEventListener('touchend', cancel);
  escape.addEventListener('touchcancel', cancel);
  // Долгий тап на мобильном вызывает контекстное меню/выделение — гасим.
  escape.addEventListener('contextmenu', (event) => event.preventDefault());
}
