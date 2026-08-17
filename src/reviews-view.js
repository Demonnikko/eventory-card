// Показ видеоотзывов на визитке.
//
// Кружки лежат горизонтальной лентой — формат знаком по мессенджерам,
// поэтому объяснять ничего не нужно. Тап разворачивает отзыв во весь
// экран со звуком: до этого кружки идут беззвучно, чтобы страница не
// заговорила сама по себе.
import { escapeHtml, escapeAttr } from './shared/lib/html.js';
import { renderIcon } from './shared/components/icons.js';

function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '';
  return ((parts[0][0] || '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

// Видео в Blob отдаётся с blob.vercel-storage.com — этот домен заблокирован
// в РФ, поэтому гоним файл через свой прокси (ветка ?video в card-review).
// Локальные превью (blob:/data:) и уже завёрнутые ссылки оставляем как есть.
export function proxiedVideo(url) {
  const src = String(url || '');
  if (!src.includes('.blob.vercel-storage.com')) return src;
  return `/api/card-review?video=${encodeURIComponent(src)}`;
}

// Сколько отзывов показываем крупными «героями» перед тем, как остальные
// уходят в компактный хвост. Четыре — максимум, который на экране iPhone
// ещё помещается витриной, не превращаясь в безликую ленту.
const HERO_COUNT = 4;

function reelMarkup(r, i, small) {
  return `
    <button type="button" class="cp-reel${small ? ' cp-reel--sm' : ''}" role="listitem"
      data-reel="${escapeAttr(r.id)}"
      style="--reel-order:${i}">
      <span class="cp-reel-ring" aria-hidden="true"></span>
      <span class="cp-reel-media">
        <video class="cp-reel-video"
          src="${escapeAttr(proxiedVideo(r.videoUrl))}"
          muted loop playsinline preload="metadata"
          ${r.posterUrl ? `poster="${escapeAttr(r.posterUrl)}"` : ''}></video>
        <span class="cp-reel-fallback">${escapeHtml(initials(r.author))}</span>
        <span class="cp-reel-play" aria-hidden="true">${renderIcon('chevron-right')}</span>
      </span>
      <span class="cp-reel-name">${escapeHtml(r.author || '')}</span>
      ${r.role ? `<span class="cp-reel-role">${escapeHtml(r.role)}</span>` : ''}
    </button>
  `;
}

// «Ещё 1 отзыв / 2 отзыва / 5 отзывов» — русское склонение по числу хвоста.
function tailLabel(n) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  let word = 'отзывов';
  if (mod10 === 1 && mod100 !== 11) word = 'отзыв';
  else if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) word = 'отзыва';
  return `Ещё ${n} ${word}`;
}

export function renderReviewsSection(reviews) {
  if (!Array.isArray(reviews) || !reviews.length) return '';

  // Мало отзывов — показываем всех крупно, без деления.
  if (reviews.length <= HERO_COUNT) {
    return `
    <section class="cp-block cp-reviews" data-reviews>
      <h2 class="cp-block-title">Отзывы</h2>
      <div class="cp-reels" role="list">
        ${reviews.map((r, i) => reelMarkup(r, i, false)).join('')}
      </div>
    </section>
  `;
  }

  // Много — первые четыре героями, остальные компактным хвостом со счётчиком,
  // чтобы клиент сразу видел общий объём отзывов.
  const heroes = reviews.slice(0, HERO_COUNT);
  const tail = reviews.slice(HERO_COUNT);

  return `
    <section class="cp-block cp-reviews" data-reviews>
      <h2 class="cp-block-title">Отзывы</h2>
      <div class="cp-reels" role="list">
        ${heroes.map((r, i) => reelMarkup(r, i, false)).join('')}
      </div>
      <div class="cp-reels-divider">
        <span class="cp-reels-divider-label">${escapeHtml(tailLabel(tail.length))}</span>
        <span class="cp-reels-divider-line" aria-hidden="true"></span>
      </div>
      <div class="cp-reels cp-reels--tail" role="list">
        ${tail.map((r, i) => reelMarkup(r, HERO_COUNT + i, true)).join('')}
      </div>
    </section>
  `;
}

// Модалка просмотра — создаётся по требованию, чтобы не держать в DOM
// тяжёлое видео до первого тапа.
// Экспортируется ещё и для экрана «Поделиться»: владелец должен посмотреть
// присланный отзыв целиком, прежде чем решать, публиковать ли его.
export function openViewer(reviews, startId) {
  let index = Math.max(0, reviews.findIndex((r) => r.id === startId));

  const overlay = document.createElement('div');
  overlay.className = 'cp-viewer';
  // Кольцо прогресса по краю круга: длина окружности при r=49 в системе 100×100.
  const RING = 2 * Math.PI * 49;
  overlay.innerHTML = `
    <button type="button" class="cp-viewer-close" aria-label="Закрыть">${renderIcon('x')}</button>
    <div class="cp-viewer-stage">
      <button type="button" class="cp-viewer-player" data-player aria-label="Пуск/пауза">
        <video class="cp-viewer-video" playsinline autoplay></video>
        <svg class="cp-viewer-ring" viewBox="0 0 100 100" aria-hidden="true">
          <circle class="cp-viewer-ring-track" cx="50" cy="50" r="49" />
          <circle class="cp-viewer-ring-bar" cx="50" cy="50" r="49"
            style="stroke-dasharray:${RING};stroke-dashoffset:${RING}" />
        </svg>
        <span class="cp-viewer-play" data-playicon aria-hidden="true">${renderIcon('play')}</span>
      </button>
    </div>
    <div class="cp-viewer-meta">
      <span class="cp-viewer-name"></span>
      <span class="cp-viewer-role"></span>
    </div>
    <div class="cp-viewer-nav">
      <button type="button" class="cp-viewer-arrow" data-prev aria-label="Предыдущий">${renderIcon('arrow-left')}</button>
      <span class="cp-viewer-count"></span>
      <button type="button" class="cp-viewer-arrow" data-next aria-label="Следующий">${renderIcon('chevron-right')}</button>
    </div>
  `;
  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';

  const video = overlay.querySelector('.cp-viewer-video');
  const player = overlay.querySelector('[data-player]');
  const ringBar = overlay.querySelector('.cp-viewer-ring-bar');
  const nameEl = overlay.querySelector('.cp-viewer-name');
  const roleEl = overlay.querySelector('.cp-viewer-role');
  const countEl = overlay.querySelector('.cp-viewer-count');
  const prevBtn = overlay.querySelector('[data-prev]');
  const nextBtn = overlay.querySelector('[data-next]');

  // Кольцо-прогресс по краю круга: дуга открывается по мере воспроизведения.
  function paintRing() {
    if (!video.duration || !Number.isFinite(video.duration)) return;
    ringBar.style.strokeDashoffset = `${RING * (1 - video.currentTime / video.duration)}`;
  }
  video.addEventListener('timeupdate', paintRing);
  // Иконка play видна только на паузе — как в сторис.
  video.addEventListener('play', () => player.classList.add('is-playing'));
  video.addEventListener('pause', () => player.classList.remove('is-playing'));

  function show(i) {
    index = (i + reviews.length) % reviews.length;
    const r = reviews[index];
    ringBar.style.strokeDashoffset = `${RING}`;
    video.src = proxiedVideo(r.videoUrl);
    video.play().catch(() => { /* автовоспроизведение могли запретить */ });
    nameEl.textContent = r.author || '';
    roleEl.textContent = r.role || '';
    countEl.textContent = `${index + 1} из ${reviews.length}`;
    const single = reviews.length < 2;
    prevBtn.hidden = single;
    nextBtn.hidden = single;
  }

  // Тап по кругу — пуск/пауза.
  player.addEventListener('click', () => {
    if (video.paused) video.play().catch(() => {});
    else video.pause();
  });

  function close() {
    video.pause();
    video.src = '';
    overlay.remove();
    document.body.style.overflow = '';
    document.removeEventListener('keydown', onKey);
  }

  function onKey(e) {
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowRight') show(index + 1);
    if (e.key === 'ArrowLeft') show(index - 1);
  }

  overlay.querySelector('.cp-viewer-close').addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    // Клик по фону закрывает, по видео — нет.
    if (e.target === overlay) close();
  });
  prevBtn.addEventListener('click', () => show(index - 1));
  nextBtn.addEventListener('click', () => show(index + 1));
  // Досмотрел до конца — сразу следующий, как в сторис.
  video.addEventListener('ended', () => { if (reviews.length > 1) show(index + 1); });
  document.addEventListener('keydown', onKey);

  show(index);
}

export function bindReviews(node, reviews) {
  if (!Array.isArray(reviews) || !reviews.length) return;

  node.querySelectorAll('[data-reel]').forEach((btn) => {
    const video = btn.querySelector('.cp-reel-video');

    // У отзывов, записанных до появления обложек, poster нет: с preload
    // «metadata» браузер не декодирует ни одного кадра, и кружок остаётся
    // прозрачным — сквозь него видны инициалы. Перемотка на полсекунды
    // заставляет показать настоящий кадр, не запуская воспроизведение.
    if (video && !video.getAttribute('poster')) {
      video.addEventListener('loadedmetadata', () => {
        if (!video.duration || !Number.isFinite(video.duration)) return;
        try { video.currentTime = Math.min(0.5, video.duration / 2); } catch { /* не критично */ }
      }, { once: true });
    }

    // Превью оживает при появлении в кадре — лента «дышит», но звука нет
    // и трафик тратится только на видимые кружки.
    if (video && 'IntersectionObserver' in window) {
      const io = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            video.play().catch(() => { /* экономия батареи — не ошибка */ });
          } else {
            video.pause();
          }
        });
      }, { threshold: 0.55 });
      io.observe(btn);
    }

    btn.addEventListener('click', () => openViewer(reviews, btn.dataset.reel));
  });
}

// Отзывы приходят с сети позже карточки. Раньше их появление перерисовывало
// весь #app заново (node.innerHTML = ...) — карточка мигала. Здесь вставляем
// ТОЛЬКО секцию отзывов в уже отрисованную карточку, ничего больше не трогая:
// экран не мигает, отзывы просто «доезжают» на своё место.
export function injectReviews(node, reviews) {
  if (!Array.isArray(reviews) || !reviews.length) return;
  const card = node.querySelector('.cp-card');
  if (!card) return;
  // Уже вставлено (например, повторный вызов) — не дублируем.
  if (card.querySelector('[data-reviews]')) return;

  const html = renderReviewsSection(reviews);
  if (!html) return;
  const tpl = document.createElement('template');
  tpl.innerHTML = html.trim();
  const section = tpl.content.firstElementChild;
  if (!section) return;

  // Место как в card-view.js: перед ценой, иначе перед CTA/сохранением,
  // иначе просто в конец карточки.
  const anchor = card.querySelector('.cp-price')
    || card.querySelector('.cp-cta')
    || card.querySelector('.cp-save');
  if (anchor) card.insertBefore(section, anchor);
  else card.appendChild(section);

  bindReviews(node, reviews);
}
