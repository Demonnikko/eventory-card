// Показ видеоотзывов на визитке.
//
// Кружки лежат горизонтальной лентой — формат знаком по мессенджерам,
// поэтому объяснять ничего не нужно. Тап разворачивает отзыв во весь
// экран со звуком: до этого кружки идут беззвучно, чтобы страница не
// заговорила сама по себе.
import { escapeHtml, escapeAttr } from './shared/lib/html.js';
import { renderIcon } from './shared/components/icons.js';
import { mediaUrl } from './shared/lib/media-url.js';

function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '';
  return ((parts[0][0] || '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

// Видео в Blob отдаётся с blob.vercel-storage.com — этот домен заблокирован
// в РФ. На своём сервере файл идёт через /media/ (media-url.js), на Vercel —
// через прокси-ветку ?video в card-review.
// Локальные превью (blob:/data:) и уже завёрнутые ссылки оставляем как есть.
export function proxiedVideo(url) {
  const src = String(url || '');
  if (!src.includes('.blob.vercel-storage.com')) return src;
  const local = mediaUrl(src);
  return local !== src ? local : `/api/card-review?video=${encodeURIComponent(src)}`;
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
          ${r.posterUrl ? `poster="${escapeAttr(mediaUrl(r.posterUrl))}"` : ''}></video>
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

// Кружки отзывов для секции «Отзывы» визитки. Мало отзывов — все крупно;
// много — первые четыре героями, остальные компактным хвостом со счётчиком,
// чтобы клиент сразу видел общий объём.
function renderReels(reviews) {
  if (!Array.isArray(reviews) || !reviews.length) return '';
  if (reviews.length <= HERO_COUNT) {
    return `<div class="cp-reels" role="list">${reviews.map((r, i) => reelMarkup(r, i, false)).join('')}</div>`;
  }
  const heroes = reviews.slice(0, HERO_COUNT);
  const tail = reviews.slice(HERO_COUNT);
  return `
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
  `;
}

// Модалка просмотра — формат кружка в стиле Telegram с размытием визитки и чистым звуком.
// Экспортируется для экрана визитки и экрана «Поделиться».
export function openViewer(reviews, startId) {
  let index = Math.max(0, reviews.findIndex((r) => r.id === startId));
  let isMuted = false;
  let audioCtx = null;
  let gainNode = null;

  const overlay = document.createElement('div');
  overlay.className = 'cp-viewer';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Просмотр видеоотзыва');

  const multiple = reviews.length > 1;

  overlay.innerHTML = `
    <div class="cp-viewer-backdrop" data-close></div>
    <div class="cp-viewer-card">
      <div class="cp-viewer-header">
        <div class="cp-viewer-bars"${multiple ? '' : ' style="display:none;"'}>
          ${reviews.map((_, i) => `
            <div class="cp-viewer-bar"><span class="cp-viewer-bar-fill" data-bar="${i}"></span></div>
          `).join('')}
        </div>
        <div class="cp-viewer-top-row">
          <div class="cp-viewer-author-box">
            <span class="cp-viewer-name"></span>
            <span class="cp-viewer-role"></span>
          </div>
          <div class="cp-viewer-actions">
            <button type="button" class="cp-viewer-btn" data-sound aria-label="Включить или выключить звук">
              <span data-sound-icon>${renderIcon('volume', { size: 20 })}</span>
            </button>
            <button type="button" class="cp-viewer-btn cp-viewer-btn--close" data-close aria-label="Закрыть">
              ${renderIcon('x', { size: 22 })}
            </button>
          </div>
        </div>
      </div>

      <div class="cp-viewer-stage">
        <div class="cp-viewer-circle-wrap" data-circle-wrap role="button" aria-label="Пауза / Воспроизведение">
          <svg class="cp-viewer-ring" viewBox="0 0 100 100" aria-hidden="true">
            <circle class="cp-viewer-ring-bg" cx="50" cy="50" r="48" />
            <circle class="cp-viewer-ring-bar" data-ring-bar cx="50" cy="50" r="48" />
          </svg>
          <video class="cp-viewer-video" playsinline webkit-playsinline loop preload="auto"></video>
          <div class="cp-viewer-play-center" data-playicon aria-hidden="true">
            ${renderIcon('play', { size: 36 })}
          </div>
        </div>
      </div>

      <div class="cp-viewer-footer"${multiple ? '' : ' style="visibility:hidden;"'}>
        <button type="button" class="cp-viewer-arrow" data-prev aria-label="Предыдущий">${renderIcon('arrow-left', { size: 18 })}</button>
        <span class="cp-viewer-count"></span>
        <button type="button" class="cp-viewer-arrow" data-next aria-label="Следующий">${renderIcon('chevron-right', { size: 18 })}</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';

  const video = overlay.querySelector('.cp-viewer-video');
  video.playsInline = true;
  video.setAttribute('playsinline', '');
  video.setAttribute('webkit-playsinline', '');
  video.crossOrigin = 'anonymous';

  const stage = overlay.querySelector('.cp-viewer-stage');
  const circleWrap = overlay.querySelector('[data-circle-wrap]');
  const ringBar = overlay.querySelector('[data-ring-bar]');
  const bars = overlay.querySelectorAll('.cp-viewer-bar-fill');
  const nameEl = overlay.querySelector('.cp-viewer-name');
  const roleEl = overlay.querySelector('.cp-viewer-role');
  const countEl = overlay.querySelector('.cp-viewer-count');
  const prevBtn = overlay.querySelector('[data-prev]');
  const nextBtn = overlay.querySelector('[data-next]');
  const soundBtn = overlay.querySelector('[data-sound]');
  const soundIcon = overlay.querySelector('[data-sound-icon]');

  function initAudioBoost() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      if (!audioCtx) {
        audioCtx = new AudioCtx();
      }
      if (audioCtx.state === 'suspended') {
        audioCtx.resume().catch(() => {});
      }
      if (!video.__audioBoosted) {
        const source = audioCtx.createMediaElementSource(video);
        const compressor = audioCtx.createDynamicsCompressor();
        compressor.threshold.setValueAtTime(-18, audioCtx.currentTime);
        compressor.knee.setValueAtTime(10, audioCtx.currentTime);
        compressor.ratio.setValueAtTime(4, audioCtx.currentTime);
        compressor.attack.setValueAtTime(0.003, audioCtx.currentTime);
        compressor.release.setValueAtTime(0.25, audioCtx.currentTime);

        gainNode = audioCtx.createGain();
        gainNode.gain.setValueAtTime(2.2, audioCtx.currentTime);

        source.connect(compressor);
        compressor.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        video.__audioBoosted = true;
      }
    } catch {
      // Фолбэк на нативное аудио
    }
  }

  // Запускаем AudioContext сразу на клике открытия
  initAudioBoost();

  function updateSoundIcon() {
    if (soundIcon) {
      soundIcon.innerHTML = isMuted
        ? renderIcon('volume-x', { size: 20 })
        : renderIcon('volume', { size: 20 });
    }
  }

  function paintProgress() {
    if (!video.duration || !Number.isFinite(video.duration)) return;
    const pct = Math.min(100, Math.max(0, (video.currentTime / video.duration) * 100));
    const currentBar = bars[index];
    if (currentBar) {
      currentBar.style.width = `${pct}%`;
    }
    if (ringBar) {
      const dash = 301.6;
      ringBar.style.strokeDashoffset = String(dash - (dash * pct) / 100);
    }
  }
  video.addEventListener('timeupdate', paintProgress);
  video.addEventListener('play', () => stage.classList.add('is-playing'));
  video.addEventListener('pause', () => stage.classList.remove('is-playing'));

  function show(i) {
    index = (i + reviews.length) % reviews.length;
    const r = reviews[index];

    bars.forEach((bar, idx) => {
      if (idx < index) bar.style.width = '100%';
      else bar.style.width = '0%';
    });
    if (ringBar) {
      ringBar.style.strokeDashoffset = '301.6';
    }

    video.pause();
    video.src = proxiedVideo(r.videoUrl);
    video.defaultMuted = isMuted;
    video.muted = isMuted;
    video.volume = 1.0;
    video.load();
    updateSoundIcon();

    nameEl.textContent = r.author || 'Отзыв';
    roleEl.textContent = r.role || '';
    roleEl.style.display = r.role ? 'block' : 'none';
    countEl.textContent = `${index + 1} из ${reviews.length}`;

    const single = reviews.length < 2;
    prevBtn.hidden = single;
    nextBtn.hidden = single;

    const playPromise = video.play();
    if (playPromise !== undefined) {
      playPromise.catch(() => {
        // Если Safari заблокировал звук автовоспроизведения без тапа,
        // включаем muted и показываем иконку
        isMuted = true;
        video.defaultMuted = true;
        video.muted = true;
        updateSoundIcon();
        video.play().catch(() => {});
      });
    }
  }

  // Переключение звука по кнопке
  soundBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    initAudioBoost();
    isMuted = !isMuted;
    video.muted = isMuted;
    video.defaultMuted = isMuted;
    video.volume = 1.0;
    updateSoundIcon();
    if (!isMuted && video.paused) {
      video.play().catch(() => {});
    }
  });

  // Тап по кружку — пауза/пуск и разблокировка звука
  circleWrap.addEventListener('click', (e) => {
    e.stopPropagation();
    initAudioBoost();
    if (isMuted) {
      isMuted = false;
      video.muted = false;
      video.defaultMuted = false;
      video.volume = 1.0;
      updateSoundIcon();
    }
    if (video.paused) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  });

  function close() {
    video.pause();
    video.removeAttribute('src');
    if (audioCtx) {
      audioCtx.close().catch(() => {});
      audioCtx = null;
    }
    overlay.remove();
    document.body.style.overflow = '';
    document.removeEventListener('keydown', onKey);
  }

  function onKey(e) {
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowRight') show(index + 1);
    if (e.key === 'ArrowLeft') show(index - 1);
    if (e.key === ' ' || e.key === 'k') {
      if (video.paused) video.play().catch(() => {});
      else video.pause();
    }
  }

  // Закрытие по кнопкам [data-close] и по клику на размытый фон
  overlay.querySelectorAll('[data-close]').forEach((btn) => btn.addEventListener('click', close));
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || e.target.classList.contains('cp-viewer-backdrop')) close();
  });
  prevBtn.addEventListener('click', (e) => { e.stopPropagation(); show(index - 1); });
  nextBtn.addEventListener('click', (e) => { e.stopPropagation(); show(index + 1); });

  // Свайпы: вниз — закрыть, влево/вправо — переключить отзыв
  let touchStartY = 0;
  let touchStartX = 0;
  overlay.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) {
      touchStartY = e.touches[0].clientY;
      touchStartX = e.touches[0].clientX;
    }
  }, { passive: true });

  overlay.addEventListener('touchend', (e) => {
    if (e.changedTouches.length === 1) {
      const deltaY = e.changedTouches[0].clientY - touchStartY;
      const deltaX = e.changedTouches[0].clientX - touchStartX;
      if (deltaY > 60 && deltaY > Math.abs(deltaX) * 1.3) {
        close();
      } else if (Math.abs(deltaX) > 50 && Math.abs(deltaX) > Math.abs(deltaY) * 1.3 && reviews.length > 1) {
        if (deltaX < 0) show(index + 1);
        else show(index - 1);
      }
    }
  }, { passive: true });

  // Досмотрел до конца — сразу следующий отзыв
  video.addEventListener('ended', () => {
    if (reviews.length > 1 && index < reviews.length - 1) {
      show(index + 1);
    } else if (reviews.length > 1) {
      show(0);
    }
  });
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
// весь #app заново — карточка мигала. Здесь кружки встают в уже готовую
// секцию «Отзывы» ([data-reels-host]), ничего больше не трогая: экран не
// мигает, отзывы просто «доезжают» на своё место. Секция без текстовых
// цитат до этого момента скрыта — теперь ей есть что показать.
export function injectReviews(node, reviews) {
  if (!Array.isArray(reviews) || !reviews.length) return;
  const host = node.querySelector('[data-reels-host]');
  if (!host || host.childElementCount) return;
  host.innerHTML = renderReels(reviews);
  const slot = host.closest('[data-reviews-slot]');
  if (slot) slot.hidden = false;
  bindReviews(node, reviews);
}
