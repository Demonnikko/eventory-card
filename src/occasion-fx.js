// Праздничная анимация в шапке страницы праздника.
//
// Украшение, а не аттракцион: частиц немного, они лежат между фото и
// текстом (заголовок всегда поверх), а когда шапка уходит с экрана, всё
// замирает — батарея гостя не тратится на то, чего он не видит. При
// «уменьшении движения» в настройках телефона остаётся неподвижная гирлянда,
// падающие частицы не показываются вовсе.
//
// Положения частиц детерминированы: одна и та же страница всегда рисуется
// одинаково, перерисовка не «перетасовывает» снег.
import './styles/occasion-fx.css';

export const FX_LABELS = {
  garland: 'Гирлянда',
  snow: 'Снег',
  confetti: 'Конфетти',
  petals: 'Лепестки',
  sparkles: 'Блёстки',
  none: 'Без анимации'
};

// Псевдослучайное число 0…1 по номеру частицы — стабильно между отрисовками.
function rand(i, salt) {
  const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

const round = (n, d = 2) => Number(n.toFixed(d));

/* ─────────── Гирлянда ─────────── */

// Провод неглубоко провисает двумя дугами над верхним рядом шапки: лампочки
// не должны ложиться на бренд и кнопку «Все праздники». Шары висят левее
// бренда (он справа) и по краю, чтобы не закрывать лицо на фото.
const WIRE_HEIGHT = 46;
const WIRE_TOP = 2;
const WIRE_SAG = 22;
const BULBS_PER_ARC = 7;
const BULB_COLORS = ['#f6d58e', '#f3e7cc', '#e8806b', '#8fc9a0', '#f0b45a'];
const BAUBLES = [
  { x: 7, thread: 60, size: 24, tone: 'gold' },
  { x: 21, thread: 92, size: 28, tone: 'red' },
  { x: 49, thread: 52, size: 18, tone: 'silver' }
];

// Точка квадратичной кривой: arc — левая (0) или правая (1) половина.
function wirePoint(arc, t) {
  const x0 = arc * 50;
  const cx = x0 + 25;
  const x2 = x0 + 50;
  const y0 = WIRE_TOP;
  const cy = WIRE_SAG;
  const x = (1 - t) ** 2 * x0 + 2 * (1 - t) * t * cx + t ** 2 * x2;
  const y = (1 - t) ** 2 * y0 + 2 * (1 - t) * t * cy + t ** 2 * y0;
  return { x, y: (y / 40) * WIRE_HEIGHT };
}

function renderGarland() {
  const bulbs = [];
  for (let arc = 0; arc < 2; arc += 1) {
    for (let k = 0; k < BULBS_PER_ARC; k += 1) {
      const i = arc * BULBS_PER_ARC + k;
      const { x, y } = wirePoint(arc, (k + 0.5) / BULBS_PER_ARC);
      const color = BULB_COLORS[i % BULB_COLORS.length];
      bulbs.push(`<span class="fx-bulb" style="--x:${round(x)}%;--y:${round(y, 1)}px;--c:${color};--delay:${round(rand(i, 1) * -2.4)}s;--dur:${round(1.8 + rand(i, 2) * 1.6)}s"></span>`);
    }
  }
  const baubles = BAUBLES.map((b, i) => `
    <span class="fx-bauble fx-bauble--${b.tone}" style="--x:${b.x}%;--thread:${b.thread}px;--size:${b.size}px;--delay:${round(rand(i, 3) * -3)}s">
      <span class="fx-bauble-ball"></span>
    </span>
  `).join('');
  return `
    <svg class="fx-wire" viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true">
      <path d="M0 ${WIRE_TOP} Q25 ${WIRE_SAG} 50 ${WIRE_TOP} Q75 ${WIRE_SAG} 100 ${WIRE_TOP}" fill="none" vector-effect="non-scaling-stroke" />
    </svg>
    ${bulbs.join('')}
    ${baubles}
  `;
}

/* ─────────── Падающие частицы ─────────── */

const FALLING = {
  snow: { count: 22, cls: 'fx-flake', size: [2, 5], dur: [8, 15], drift: 40 },
  confetti: { count: 20, cls: 'fx-confetti', size: [6, 9], dur: [6, 10], drift: 60 },
  petals: { count: 12, cls: 'fx-petal', size: [9, 14], dur: [10, 16], drift: 80 }
};

const CONFETTI_COLORS = ['#f0b25a', '#e8a64a', '#f6d58e', '#c9b38b', '#ffffff'];
const PETAL_COLORS = ['#f4d6d2', '#f3e7cc', '#e9c7b5', '#f7e3df'];

function renderFalling(kind) {
  const spec = FALLING[kind];
  const parts = [];
  for (let i = 0; i < spec.count; i += 1) {
    const size = spec.size[0] + rand(i, 4) * (spec.size[1] - spec.size[0]);
    const dur = spec.dur[0] + rand(i, 5) * (spec.dur[1] - spec.dur[0]);
    const vars = [
      `--x:${round(rand(i, 6) * 100)}%`,
      `--size:${round(size, 1)}px`,
      `--dur:${round(dur)}s`,
      // Отрицательная задержка: частицы уже «в пути» с первого кадра.
      `--delay:${round(-rand(i, 7) * dur)}s`,
      `--drift:${round((rand(i, 8) - 0.5) * spec.drift)}px`,
      `--spin:${Math.round(rand(i, 9) * 720 + 180)}deg`
    ];
    if (kind === 'confetti') vars.push(`--c:${CONFETTI_COLORS[i % CONFETTI_COLORS.length]}`);
    if (kind === 'petals') vars.push(`--c:${PETAL_COLORS[i % PETAL_COLORS.length]}`);
    parts.push(`<span class="${spec.cls}" style="${vars.join(';')}"></span>`);
  }
  return parts.join('');
}

/* ─────────── Блёстки ─────────── */

const SPARKLE_PATH = 'M12 0c.6 6.2 5.8 11.4 12 12-6.2.6-11.4 5.8-12 12-.6-6.2-5.8-11.4-12-12 6.2-.6 11.4-5.8 12-12';

function renderSparkles() {
  const parts = [];
  for (let i = 0; i < 14; i += 1) {
    parts.push(`
      <svg class="fx-sparkle" viewBox="0 0 24 24" aria-hidden="true"
        style="--x:${round(rand(i, 10) * 94 + 3)}%;--y:${round(rand(i, 11) * 62 + 4)}%;--size:${round(8 + rand(i, 12) * 9, 1)}px;--dur:${round(2.6 + rand(i, 13) * 2.4)}s;--delay:${round(-rand(i, 14) * 4)}s">
        <path d="${SPARKLE_PATH}" />
      </svg>
    `);
  }
  return parts.join('');
}

export function renderFx(fx) {
  if (!fx || fx === 'none' || !FX_LABELS[fx]) return '';
  let body = '';
  if (fx === 'garland') body = renderGarland();
  else if (fx === 'sparkles') body = renderSparkles();
  else body = renderFalling(fx);
  return `<div class="vz-fx vz-fx--${fx}" aria-hidden="true" data-fx>${body}</div>`;
}

// Анимация живёт, только пока шапка на экране и вкладка открыта.
export function watchFx(root) {
  const layers = [...root.querySelectorAll('[data-fx]')];
  if (!layers.length) return () => {};
  const visible = new Map();
  const apply = () => {
    layers.forEach((el) => el.classList.toggle('is-paused', document.hidden || !visible.get(el)));
  };
  const observer = typeof IntersectionObserver !== 'undefined'
    ? new IntersectionObserver((entries) => {
      entries.forEach((entry) => visible.set(entry.target, entry.isIntersecting));
      apply();
    }, { threshold: 0 })
    : null;
  layers.forEach((el) => {
    visible.set(el, true);
    observer?.observe(el);
  });
  document.addEventListener('visibilitychange', apply);
  return () => {
    observer?.disconnect();
    document.removeEventListener('visibilitychange', apply);
  };
}
