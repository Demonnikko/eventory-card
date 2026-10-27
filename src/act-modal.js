import './styles/act-modal.css';
import { escapeHtml, escapeAttr } from './shared/lib/html.js';
import { renderIcon } from './shared/components/icons.js';
import { hapticLight } from './shared/lib/haptic.js';
import { getActData } from './shared/lib/act-data.js';

export { getActData };

let activeActOverlay = null;

export function closeActModal() {
  if (!activeActOverlay) return;
  const overlay = activeActOverlay;
  activeActOverlay = null;
  overlay.classList.remove('is-open');
  const finish = () => {
    overlay.remove();
    if (!document.querySelector('[data-date-sheet]') && !document.querySelector('.vm-overlay.is-open')) {
      document.documentElement.style.overflow = '';
    }
  };
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    finish();
  } else {
    window.setTimeout(finish, 260);
  }
}

/**
 * Открывает детальное окно («окошечко») номера.
 * @param {object} params
 * @param {object} params.card
 * @param {number} params.index
 * @param {function} [params.onBook] — колбэк при клике на главную кнопку
 * @param {string} [params.bookLabel] — её надпись (в КП партнёра — «К предложению»)
 */
export function openActModal({ card, index, onBook, bookLabel = 'Проверить дату' }) {
  closeActModal();
  const act = getActData(card, index);
  hapticLight();

  const overlay = document.createElement('div');
  overlay.className = 'am-overlay';
  overlay.setAttribute('data-act-modal', '');
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', act.title);

  overlay.innerHTML = `
    <div class="am-backdrop" data-am-close></div>
    <div class="am-sheet">
      <div class="am-handle" aria-hidden="true"></div>
      <button type="button" class="am-close-btn" data-am-close aria-label="Закрыть">${renderIcon('x', { size: 18 })}</button>
      
      <div class="am-scroll-body">
        ${act.photo ? `
          <div class="am-photo-wrap">
            <img class="am-photo" src="${escapeAttr(act.photo)}" alt="${escapeAttr(act.title)}" />
          </div>
        ` : ''}

        <div class="am-content">
          <div class="am-header">
            <h3 class="am-title">${escapeHtml(act.title)}</h3>
            <div class="am-duration-badge">
              <span class="am-duration-icon" aria-hidden="true">⏱️</span>
              <span>${escapeHtml(act.duration)}</span>
            </div>
          </div>

          <div class="am-section am-section--result">
            <div class="am-section-label">Что вы получаете</div>
            <p class="am-result-text">${escapeHtml(act.whatYouGet)}</p>
          </div>

          <div class="am-section am-section--includes">
            <div class="am-section-label">Что входит</div>
            <ul class="am-includes-list">
              ${act.includes.map((item) => `
                <li class="am-include-item">
                  <span class="am-check-icon" aria-hidden="true">✓</span>
                  <span>${escapeHtml(item)}</span>
                </li>
              `).join('')}
            </ul>
          </div>

          <div class="am-cta-wrap">
            <button type="button" class="am-cta-btn" data-am-book>${escapeHtml(bookLabel)}</button>
          </div>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  activeActOverlay = overlay;
  document.documentElement.style.overflow = 'hidden';

  requestAnimationFrame(() => {
    overlay.classList.add('is-open');
  });

  function onKey(e) {
    if (e.key === 'Escape') {
      window.removeEventListener('keydown', onKey);
      closeActModal();
    }
  }
  window.addEventListener('keydown', onKey);

  overlay.querySelectorAll('[data-am-close]').forEach((btn) => {
    btn.addEventListener('click', () => {
      window.removeEventListener('keydown', onKey);
      closeActModal();
    });
  });

  overlay.querySelector('[data-am-book]')?.addEventListener('click', () => {
    window.removeEventListener('keydown', onKey);
    closeActModal();
    if (typeof onBook === 'function') {
      onBook(act);
    }
  });
}
