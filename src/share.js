// Экран «Ссылка и QR-код» — то, ради чего визитку публикуют.
// Всё здесь бесплатно: ссылка, QR, сохранение контакта.
import { escapeHtml, escapeAttr } from './shared/lib/html.js';
import { renderIcon } from './shared/components/icons.js';
import { toast } from './shared/components/toast.js';
import { qrSvg } from './shared/data/qr.js';
import { getCard, cardPublicUrl } from './card-data.js';
import { downloadVCard } from './vcard.js';
import { fetchOwnReviews, createInvite, approveReview, removeReview } from './reviews-data.js';
import { activeUpsell, upsellHref } from './crm-upsell.js';

const state = { card: null, reviews: [], reviewsBusy: false };

function renderUpsell(pointId) {
  const point = activeUpsell(pointId);
  if (!point) return '';
  return `
    <a class="ca-upsell" href="${escapeAttr(upsellHref(pointId))}" target="_blank" rel="noopener">
      <span class="ca-upsell-eyebrow">${escapeHtml(point.eyebrow)}</span>
      <span class="ca-upsell-title">${escapeHtml(point.title)}</span>
      <span class="ca-upsell-text">${escapeHtml(point.text)}</span>
      <span class="ca-upsell-cta">${escapeHtml(point.cta)} ${renderIcon('chevron-right')}</span>
    </a>
  `;
}

// Видеоотзывы: владелец отправляет ссылку заказчику, потом подтверждает
// присланное. Неподтверждённые видны только ему.
function renderReviewsBlock() {
  const pending = state.reviews.filter((r) => !r.approved);
  const published = state.reviews.filter((r) => r.approved);

  return `
    <section class="ca-reviews">
      <div class="ca-reviews-head">
        <span class="ca-reviews-title">Видеоотзывы</span>
        ${state.reviews.length
          ? `<span class="ca-reviews-count">${published.length} на визитке</span>`
          : ''}
      </div>

      ${pending.length ? `
        <div class="ca-reviews-pending">
          <span class="ca-reviews-badge">${pending.length}</span>
          <span>Новые отзывы ждут подтверждения</span>
        </div>
      ` : ''}

      ${state.reviews.length ? `
        <div class="ca-reviews-list">
          ${state.reviews.map((r) => `
            <div class="ca-review${r.approved ? ' is-approved' : ''}">
              <video class="ca-review-thumb" src="${escapeAttr(r.videoUrl)}" muted playsinline preload="metadata"></video>
              <div class="ca-review-info">
                <span class="ca-review-author">${escapeHtml(r.author || 'Без имени')}</span>
                ${r.role ? `<span class="ca-review-role">${escapeHtml(r.role)}</span>` : ''}
                <span class="ca-review-status">${r.approved ? 'На визитке' : 'Ждёт подтверждения'}</span>
              </div>
              <div class="ca-review-actions">
                <button type="button" class="ca-review-btn${r.approved ? '' : ' is-primary'}"
                  data-review-toggle="${escapeAttr(r.id)}" data-approved="${r.approved ? '1' : '0'}">
                  ${r.approved ? 'Скрыть' : 'Показать'}
                </button>
                <button type="button" class="ca-review-btn is-danger" data-review-delete="${escapeAttr(r.id)}">
                  Удалить
                </button>
              </div>
            </div>
          `).join('')}
        </div>
      ` : `
        <p class="ca-reviews-empty">Живой отзыв убеждает сильнее описаний.
          Отправьте заказчику ссылку — он запишет короткое видео.</p>
      `}

      <button type="button" class="ca-btn ca-btn--ghost" data-invite ${state.reviewsBusy ? 'disabled' : ''}>
        ${renderIcon('share')} ${state.reviewsBusy ? 'Готовим ссылку…' : 'Запросить видеоотзыв'}
      </button>
    </section>
  `;
}

function renderContent() {
  const card = state.card;
  if (!card) return '<div class="ca-loading">Загружаем…</div>';

  if (!card.publishedSlug) {
    return `
      <div class="ca-empty">
        <p class="ca-empty-title">Визитка ещё не опубликована</p>
        <p class="ca-empty-text">Опубликуйте её — появится ссылка и QR-код.</p>
        <a class="ca-btn ca-btn--primary" href="#/editor">Вернуться к визитке</a>
      </div>
    `;
  }

  const url = cardPublicUrl(card.publishedSlug);
  return `
    <div class="ca-share">
      <!-- Главное действие при живом знакомстве: показать визитку в руке.
           Стоит первым — им пользуются чаще, чем копированием ссылки. -->
      <a class="ca-present-cta" href="#/present">
        <span class="ca-present-art" aria-hidden="true">
          <span class="ca-present-card"></span>
        </span>
        <span class="ca-present-copy">
          <span class="ca-present-title">Показать визитку</span>
          <span class="ca-present-text">QR уже на карточке — просто покажите её собеседнику</span>
        </span>
        ${renderIcon('chevron-right')}
      </a>

      <div class="ca-qr-card">
        <div class="ca-qr">${qrSvg(url, { className: 'ca-qr-svg', title: 'QR-код визитки' })}</div>
        <p class="ca-qr-hint">Покажите этот код — визитка откроется на телефоне клиента</p>
      </div>

      <div class="ca-link">
        <span class="ca-link-value">${escapeHtml(url)}</span>
        <button type="button" class="ca-btn ca-btn--ghost" data-copy="${escapeAttr(url)}">
          ${renderIcon('copy')} Скопировать
        </button>
      </div>

      <div class="ca-share-actions">
        <button type="button" class="ca-btn ca-btn--primary" data-share="${escapeAttr(url)}">
          ${renderIcon('share')} Поделиться
        </button>
        <a class="ca-btn ca-btn--ghost" href="#/preview" >
          ${renderIcon('search')} Посмотреть как клиент
        </a>
        <button type="button" class="ca-btn ca-btn--ghost" data-vcard>
          ${renderIcon('download')} Сохранить контакт
        </button>
      </div>

      ${renderReviewsBlock()}

      ${renderUpsell('analytics')}
      ${renderUpsell('calendar')}
    </div>
  `;
}

export const share = {
  id: 'share',
  title: 'Ссылка и QR',
  render() {
    return renderContent();
  },
  async mount(node) {
    state.card = await getCard();
    state.reviews = [];
    node.innerHTML = renderContent();
    bind(node);

    // Отзывы догружаем после отрисовки: экран не должен ждать сеть.
    if (state.card.publishedSlug) {
      try {
        state.reviews = await fetchOwnReviews();
        if (state.reviews.length) rerender(node);
      } catch { /* нет отзывов или нет сети — блок останется пустым */ }
    }
  }
};

function rerender(node) {
  node.innerHTML = renderContent();
  bind(node);
}

function bind(node) {
  const copyBtn = node.querySelector('[data-copy]');
  if (copyBtn) {
    copyBtn.addEventListener('click', async () => {
      const value = copyBtn.dataset.copy;
      try {
        await navigator.clipboard.writeText(value);
        toast.show('Ссылка скопирована', { ok: true });
      } catch {
        // Часть браузеров запрещает clipboard без жеста/https — показываем
        // ссылку для ручного копирования, а не молчим об ошибке.
        toast.show('Скопируйте ссылку вручную');
      }
    });
  }

  const shareBtn = node.querySelector('[data-share]');
  if (shareBtn) {
    shareBtn.addEventListener('click', async () => {
      const url = shareBtn.dataset.share;
      const title = state.card?.name ? `Визитка — ${state.card.name}` : 'Моя визитка';
      if (navigator.share) {
        try {
          await navigator.share({ title, url });
          return;
        } catch {
          return; // пользователь закрыл системный лист — это не ошибка
        }
      }
      try {
        await navigator.clipboard.writeText(url);
        toast.show('Ссылка скопирована', { ok: true });
      } catch {
        toast.show('Скопируйте ссылку вручную');
      }
    });
  }

  const vcardBtn = node.querySelector('[data-vcard]');
  if (vcardBtn) {
    vcardBtn.addEventListener('click', () => downloadVCard(state.card));
  }

  bindReviewActions(node);
}

function bindReviewActions(node) {
  // Запросить отзыв: создаём ссылку и сразу отдаём в системный «поделиться» —
  // владелец отправляет её заказчику в мессенджер одним движением.
  const inviteBtn = node.querySelector('[data-invite]');
  if (inviteBtn) {
    inviteBtn.addEventListener('click', async () => {
      if (state.reviewsBusy) return;
      if (!state.card.publishedSlug) {
        toast.show('Сначала опубликуйте визитку');
        return;
      }
      state.reviewsBusy = true;
      rerender(node);
      try {
        const url = await createInvite();
        const text = `Оставьте, пожалуйста, короткий видеоотзыв: ${url}`;
        if (navigator.share) {
          await navigator.share({ title: 'Видеоотзыв', text, url }).catch(() => {});
        } else {
          await navigator.clipboard.writeText(url);
          toast.show('Ссылка скопирована — отправьте заказчику', { ok: true });
        }
      } catch (err) {
        const message = err?.message === 'not_published'
          ? 'Сначала опубликуйте визитку'
          : err?.message === 'invite_store_failed'
            ? 'Ссылка не сохранилась — попробуйте ещё раз'
            : 'Не удалось создать ссылку';
        toast.show(message, { error: true });
      } finally {
        state.reviewsBusy = false;
        rerender(node);
      }
    });
  }

  node.querySelectorAll('[data-review-toggle]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.reviewToggle;
      const next = btn.dataset.approved !== '1';
      btn.disabled = true;
      try {
        await approveReview(id, next);
        const item = state.reviews.find((r) => r.id === id);
        if (item) item.approved = next;
        rerender(node);
        toast.show(next ? 'Отзыв на визитке' : 'Отзыв скрыт', { ok: true });
      } catch {
        btn.disabled = false;
        toast.show('Не удалось изменить', { error: true });
      }
    });
  });

  node.querySelectorAll('[data-review-delete]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.reviewDelete;
      // Удаление необратимо — видео стирается из хранилища.
      if (!window.confirm('Удалить отзыв? Видео будет стёрто безвозвратно.')) return;
      btn.disabled = true;
      try {
        await removeReview(id);
        state.reviews = state.reviews.filter((r) => r.id !== id);
        rerender(node);
        toast.show('Отзыв удалён');
      } catch (err) {
        btn.disabled = false;
        toast.show(err?.message === 'video_delete_failed'
          ? 'Хранилище видео недоступно — попробуйте позже'
          : 'Не удалось удалить', { error: true });
      }
    });
  });
}
