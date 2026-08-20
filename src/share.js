// Экран «Ссылка и QR-код» — то, ради чего визитку публикуют.
// Всё здесь бесплатно: ссылка, QR, сохранение контакта.
import { escapeHtml, escapeAttr } from './shared/lib/html.js';
import { renderIcon } from './shared/components/icons.js';
import { toast } from './shared/components/toast.js';
import { qrSvg } from './shared/data/qr.js';
import { getCard, saveCard, cardPublicUrl } from './card-data.js';
import { downloadVCard } from './vcard.js';
import { fetchOwnReviews, createInvite, approveReview, removeReview } from './reviews-data.js';
import { openViewer, proxiedVideo } from './reviews-view.js';
import { activeUpsell, upsellHref } from './crm-upsell.js';
import { referralLink, referralStats } from './insight-data.js';

const state = {
  card: null,
  reviews: [],
  reviewsBusy: false,
  referral: { needed: 3, invited: 0, earned: 0 }
};

function renderUpsell(pointId) {
  const point = activeUpsell(pointId);
  if (!point) return '';
  return `
    <a class="ca-upsell" href="${escapeAttr(upsellHref(pointId, state.card?.leadKey))}" target="_blank" rel="noopener">
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
              <button type="button" class="ca-review-thumb-btn" data-review-play="${escapeAttr(r.id)}"
                aria-label="Посмотреть отзыв${r.author ? `: ${escapeAttr(r.author)}` : ''}">
                <video class="ca-review-thumb" src="${escapeAttr(proxiedVideo(r.videoUrl))}" muted playsinline preload="metadata"
                  ${r.posterUrl ? `poster="${escapeAttr(r.posterUrl)}"` : ''}></video>
                <span class="ca-review-thumb-play" aria-hidden="true">${renderIcon('chevron-right')}</span>
              </button>
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

// Партнёрка: приведи 3 артистов → месяц Pro бесплатно. Ссылка = визитка
// владельца с меткой приглашения; приглашённый видит визитку-пример и, когда
// опубликует свою, засчитается пригласившему.
function renderReferral() {
  const card = state.card;
  if (!card?.publishedSlug || !card?.leadKey) return '';
  const link = referralLink(card);
  const { needed, invited, earned } = state.referral;
  const dots = Array.from({ length: needed }, (_, i) =>
    `<span class="ca-ref-dot${i < invited ? ' is-on' : ''}"></span>`).join('');

  return `
    <div class="ca-ref">
      <div class="ca-ref-head">
        <span class="ca-ref-title">Приведите артистов — получите Pro</span>
        <span class="ca-ref-sub">${needed} артиста с визиткой = месяц Eventory Pro бесплатно.</span>
      </div>
      <div class="ca-ref-progress">
        <div class="ca-ref-dots">${dots}</div>
        <span class="ca-ref-count">${invited} из ${needed}</span>
      </div>
      ${earned ? `<p class="ca-ref-earned">Уже заработано месяцев Pro: ${earned}</p>` : ''}
      <div class="ca-ref-link">
        <span class="ca-ref-link-value">${escapeHtml(link)}</span>
        <button type="button" class="ca-ref-copy" data-ref-copy="${escapeAttr(link)}">
          ${renderIcon('copy')}
        </button>
      </div>
      <button type="button" class="ca-ref-share" data-ref-share="${escapeAttr(link)}">
        ${renderIcon('share')} Пригласить артиста
      </button>
    </div>
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

      <button type="button" class="ca-kiosk" role="switch"
        aria-checked="${state.card?.kioskMode ? 'true' : 'false'}"
        data-kiosk-toggle>
        <span class="ca-kiosk-copy">
          <span class="ca-kiosk-title">Режим витрины</span>
          <span class="ca-kiosk-text">Приложение открывается сразу визиткой с QR. Выход — долгое удержание левого верхнего угла.</span>
        </span>
        <span class="ca-kiosk-switch" aria-hidden="true"><span class="ca-kiosk-knob"></span></span>
      </button>

      ${renderReferral()}

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
    // Статистику партнёрки грузим ВМЕСТЕ с картой — плашка «Приведите артистов»
    // рисуется сразу с верным числом (1 из 3), а не прыгает с дефолтного 0 из 3
    // после отдельного дозапроса. Своя защита в referralStats → дефолт при сбое,
    // поэтому await безопасен и экран не залипнет.
    if (state.card.publishedSlug) {
      try { state.referral = await referralStats(); }
      catch { /* нет сети — плашка покажет дефолт, не критично */ }
    }
    node.innerHTML = renderContent();
    bind(node);

    // Отзывы догружаем после отрисовки: они внизу экрана, их появление не видно
    // как прыжок, а ждать сеть ради них не нужно.
    if (state.card.publishedSlug) {
      try {
        state.reviews = await fetchOwnReviews();
        if (state.reviews.length) refreshReviewsBlock(node);
      } catch { /* нет отзывов или нет сети — блок останется пустым */ }
    }
  }
};

// Обновляем ТОЛЬКО секцию отзывов, не перерисовывая весь экран: раньше
// полный node.innerHTML заново рисовал QR, ссылку и кнопки — переход
// «подтягивался» рывком. Теперь заменяется одна секция и её обработчики.
function refreshReviewsBlock(node) {
  const current = node.querySelector('.ca-reviews');
  if (!current) return;
  const tpl = document.createElement('template');
  tpl.innerHTML = renderReviewsBlock().trim();
  const fresh = tpl.content.firstElementChild;
  if (fresh) current.replaceWith(fresh);
  bindReviewActions(node);
}

function bindReferral(node) {
  const copyBtn = node.querySelector('[data-ref-copy]');
  if (copyBtn) {
    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(copyBtn.dataset.refCopy);
        toast.show('Ссылка скопирована — отправьте артисту', { ok: true });
      } catch {
        toast.show('Скопируйте ссылку вручную');
      }
    });
  }
  const shareBtn = node.querySelector('[data-ref-share]');
  if (shareBtn) {
    shareBtn.addEventListener('click', async () => {
      const url = shareBtn.dataset.refShare;
      if (navigator.share) {
        await navigator.share({
          title: 'Сделай визитку в Eventory',
          text: 'Бесплатная электронная визитка с QR — попробуй.',
          url
        }).catch(() => {});
        return;
      }
      try {
        await navigator.clipboard.writeText(url);
        toast.show('Ссылка скопирована — отправьте артисту', { ok: true });
      } catch {
        toast.show('Скопируйте ссылку вручную');
      }
    });
  }
}

function bind(node) {
  bindReferral(node);
  const kioskToggle = node.querySelector('[data-kiosk-toggle]');
  if (kioskToggle) {
    kioskToggle.addEventListener('click', async () => {
      const next = kioskToggle.getAttribute('aria-checked') !== 'true';
      // Обновляем вид сразу — сохранение в фоне, экран не должен «залипать».
      kioskToggle.setAttribute('aria-checked', next ? 'true' : 'false');
      state.card = { ...state.card, kioskMode: next };
      try {
        await saveCard(state.card);
        toast.show(next
          ? 'Витрина включена — иконка открывает визитку'
          : 'Витрина выключена', { ok: true });
      } catch {
        // Откатываем переключатель, если сохранить не удалось.
        kioskToggle.setAttribute('aria-checked', next ? 'false' : 'true');
        state.card = { ...state.card, kioskMode: !next };
        toast.show('Не удалось сохранить настройку');
      }
    });
  }

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
      refreshReviewsBlock(node);
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
        refreshReviewsBlock(node);
      }
    });
  }

  // Отзыв нужно посмотреть до публикации: на визитку идут чужие слова.
  node.querySelectorAll('[data-review-play]').forEach((btn) => {
    // Без обложки браузер не декодирует кадр и кружок остаётся пустым —
    // перематываем на полсекунды, чтобы показать лицо, а не чёрный круг.
    const video = btn.querySelector('.ca-review-thumb');
    if (video && !video.getAttribute('poster')) {
      video.addEventListener('loadedmetadata', () => {
        if (!video.duration || !Number.isFinite(video.duration)) return;
        try { video.currentTime = Math.min(0.5, video.duration / 2); } catch { /* не критично */ }
      }, { once: true });
    }

    btn.addEventListener('click', () => {
      openViewer(state.reviews, btn.dataset.reviewPlay);
    });
  });

  node.querySelectorAll('[data-review-toggle]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.reviewToggle;
      const next = btn.dataset.approved !== '1';
      btn.disabled = true;
      try {
        await approveReview(id, next);
        const item = state.reviews.find((r) => r.id === id);
        if (item) item.approved = next;
        refreshReviewsBlock(node);
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
        refreshReviewsBlock(node);
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
