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

export function renderReviewsSection(reviews) {
  if (!Array.isArray(reviews) || !reviews.length) return '';

  return `
    <section class="cp-block cp-reviews" data-reviews>
      <h2 class="cp-block-title">Отзывы</h2>
      <div class="cp-reels" role="list">
        ${reviews.map((r, i) => `
          <button type="button" class="cp-reel" role="listitem"
            data-reel="${escapeAttr(r.id)}"
            style="--reel-order:${i}">
            <span class="cp-reel-ring" aria-hidden="true"></span>
            <span class="cp-reel-media">
              <video class="cp-reel-video"
                src="${escapeAttr(r.videoUrl)}"
                muted loop playsinline preload="metadata"
                ${r.posterUrl ? `poster="${escapeAttr(r.posterUrl)}"` : ''}></video>
              <span class="cp-reel-fallback">${escapeHtml(initials(r.author))}</span>
              <span class="cp-reel-play" aria-hidden="true">${renderIcon('chevron-right')}</span>
            </span>
            <span class="cp-reel-name">${escapeHtml(r.author || '')}</span>
            ${r.role ? `<span class="cp-reel-role">${escapeHtml(r.role)}</span>` : ''}
          </button>
        `).join('')}
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
    video.src = r.videoUrl;
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
