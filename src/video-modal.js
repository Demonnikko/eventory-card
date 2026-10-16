// Встроенный просмотр видео без ухода из визитки.
// Поддерживает:
// - VK Видео (vkvideo.ru, vk.com, video_ext.php)
// - YouTube (youtube.com, youtu.be, shorts, embed)
// - Rutube (rutube.ru/video, rutube.ru/play/embed)
// - Прямые файлы mp4, webm
import './styles/video-modal.css';
import { renderIcon } from './shared/components/icons.js';
import { hapticLight } from './shared/lib/haptic.js';
import { escapeHtml, escapeAttr } from './shared/lib/html.js';

import { parseVideoEmbed } from './shared/lib/video-embed.js';

export { parseVideoEmbed };

let activeModal = null;

export function closeVideoModal() {
  if (activeModal) {
    activeModal.close();
  }
}

export function openVideoModal(url, { title = 'Выступление' } = {}) {
  const embed = parseVideoEmbed(url);
  if (!embed) {
    // Если сервис не распознан, открываем ссылку во внешней вкладке
    if (url && typeof window !== 'undefined') {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
    return null;
  }

  if (activeModal) {
    activeModal.close();
  }

  try {
    hapticLight();
  } catch {
    // ignore
  }

  const opener = document.activeElement;
  const overlay = document.createElement('div');
  overlay.className = 'vm-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', title);

  const mediaHtml = embed.type === 'video'
    ? `<video class="vm-player" src="${escapeAttr(embed.src)}" controls autoplay playsinline preload="auto"></video>`
    : `<iframe class="vm-iframe" src="${escapeAttr(embed.src)}" allow="${escapeAttr(embed.allow || '')}" allowfullscreen></iframe>`;

  overlay.innerHTML = `
    <div class="vm-backdrop" data-vm-close></div>
    <div class="vm-container">
      <div class="vm-header">
        <div class="vm-title">${escapeHtml(title)}</div>
        <button type="button" class="vm-close" data-vm-close aria-label="Закрыть видео">
          ${renderIcon('x', { size: 20 })}
        </button>
      </div>
      <div class="vm-frame-wrapper">
        ${mediaHtml}
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const previousOverflow = document.documentElement.style.overflow;
  document.documentElement.style.overflow = 'hidden';

  requestAnimationFrame(() => {
    overlay.classList.add('is-open');
  });

  function close() {
    if (!overlay.parentNode) return;
    overlay.classList.remove('is-open');
    document.removeEventListener('keydown', onKey);

    // Мгновенно останавливаем звук и воспроизведение видео
    const iframe = overlay.querySelector('iframe');
    if (iframe) iframe.src = 'about:blank';
    const video = overlay.querySelector('video');
    if (video) {
      try {
        video.pause();
        video.src = '';
      } catch {}
    }

    const finish = () => {
      overlay.remove();
      document.documentElement.style.overflow = previousOverflow;
      if (opener && typeof opener.focus === 'function') {
        opener.focus({ preventScroll: true });
      }
      if (activeModal?.overlay === overlay) activeModal = null;
    };

    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      finish();
    } else {
      setTimeout(finish, 220);
    }
  }

  function onKey(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  }

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay || event.target.closest('[data-vm-close]')) {
      event.preventDefault();
      close();
    }
  });

  document.addEventListener('keydown', onKey);

  activeModal = { close, overlay };
  return activeModal;
}
