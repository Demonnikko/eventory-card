// Экран «Поделиться» — то, ради чего визитку публикуют: главная ссылка и
// QR, отдельная ссылка на каждый праздник (их рассылает Sales), видеоотзывы
// и режим витрины. Всё здесь бесплатно.
import { escapeHtml, escapeAttr } from './shared/lib/html.js';
import { renderIcon } from './shared/components/icons.js';
import { toast } from './shared/components/toast.js';
import { qrSvg } from './shared/data/qr.js';
import { getCard, saveCard, cardPublicUrl } from './card-data.js';
import { enabledOccasions, occasionTitle } from './shared/data/occasions.js';
import { fetchOwnReviews, createInvite, approveReview, removeReview } from './reviews-data.js';
import { openViewer, proxiedVideo } from './reviews-view.js';
import { mediaUrl } from './shared/lib/media-url.js';
import { activeUpsell, upsellHref } from './crm-upsell.js';
import { referralLink, referralStats } from './insight-data.js';

const state = {
  card: null,
  reviews: [],
  reviewsBusy: false,
  loaded: false,     // экран уже открывали — при возврате рисуем сразу
  loadedFor: '',     // для какой визитки загружены данные (slug:ключ)
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
        <h2 class="sh-h2">Видеоотзывы</h2>
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
                  ${r.posterUrl ? `poster="${escapeAttr(mediaUrl(r.posterUrl))}"` : ''}></video>
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
          Отправьте заказчику ссылку, и он запишет короткое видео.</p>
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
        <span class="ca-ref-title">Приведите артистов и получите Pro</span>
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

// Ссылка на каждый праздник — для Sales и для ответа в переписке: человек
// сразу попадает на свой повод, а превью в мессенджере показывает праздник.
function renderOccasionLinks(card) {
  const list = enabledOccasions(card);
  if (!list.length) {
    return `
      <section class="sh-section">
        <h2 class="sh-h2">Ссылки на праздники</h2>
        <p class="sh-sub">Включите праздники в редакторе, и у каждого появится своя страница и ссылка для рассылки.</p>
        <a class="ca-btn ca-btn--ghost" href="#/editor">Включить праздники</a>
      </section>
    `;
  }
  return `
    <section class="sh-section">
      <h2 class="sh-h2">Ссылки на праздники</h2>
      <p class="sh-sub">Для Sales и переписки: человек сразу попадает на свой праздник.</p>
      <div class="sh-links">
        ${list.map((o) => {
          const url = cardPublicUrl(card.publishedSlug, { occasionSlug: o.slug });
          return `
            <div class="sh-link">
              <span class="sh-link-copy">
                <span class="sh-link-title">${escapeHtml(occasionTitle(o))}</span>
                <span class="sh-link-path">/${escapeHtml(o.slug)}</span>
              </span>
              <button type="button" class="ca-icon-btn" data-copy="${escapeAttr(url)}"
                aria-label="Скопировать ссылку «${escapeAttr(occasionTitle(o))}»">${renderIcon('copy')}</button>
              <button type="button" class="ca-icon-btn" data-share="${escapeAttr(url)}" data-share-title="${escapeAttr(occasionTitle(o))}"
                aria-label="Отправить ссылку «${escapeAttr(occasionTitle(o))}»">${renderIcon('share')}</button>
            </div>
          `;
        }).join('')}
      </div>
    </section>
  `;
}

function renderContent() {
  const card = state.card;
  const head = '<div class="ca-page-head"><h1 class="ca-page-title">Поделиться</h1></div>';
  if (!card) return `${head}<div class="ca-loading">Загружаем…</div>`;

  if (!card.publishedSlug) {
    return `
      ${head}
      <div class="ca-empty">
        <p class="ca-empty-title">Визитка ещё не опубликована</p>
        <p class="ca-empty-text">Опубликуйте её, и появятся ссылки и QR-код.</p>
        <a class="ca-btn ca-btn--primary" href="#/editor">Вернуться к визитке</a>
      </div>
    `;
  }

  const url = cardPublicUrl(card.publishedSlug);
  return `
    ${head}
    <div class="ca-share">
      <section class="sh-qr">
        <div class="sh-qr-code">${qrSvg(url, { className: 'ca-qr-svg', title: 'QR-код визитки' })}</div>
        <p class="sh-qr-url" data-selectable>${escapeHtml(url.replace(/^https?:\/\//, ''))}</p>
        <div class="sh-qr-actions">
          <button type="button" class="ca-btn ca-btn--ghost" data-copy="${escapeAttr(url)}">
            ${renderIcon('copy')} Копировать
          </button>
          <button type="button" class="ca-btn ca-btn--ghost" data-share="${escapeAttr(url)}">
            ${renderIcon('share')} Отправить
          </button>
        </div>
        <a class="ca-btn ca-btn--primary sh-qr-show" href="#/present">Показать QR</a>
        <a class="ca-text-link sh-qr-edit" href="#/editor">Изменить адрес визитки</a>
      </section>

      ${renderOccasionLinks(card)}

      ${renderReviewsBlock()}

      <button type="button" class="ca-kiosk" role="switch"
        aria-checked="${card.kioskMode ? 'true' : 'false'}"
        data-kiosk-toggle>
        <span class="ca-kiosk-copy">
          <span class="ca-kiosk-title">Режим витрины</span>
          <span class="ca-kiosk-text">Приложение открывается сразу визиткой с QR. Чтобы выйти, долго удерживайте карточку.</span>
        </span>
        <span class="ca-kiosk-switch" aria-hidden="true"><span class="ca-kiosk-knob"></span></span>
      </button>

      ${renderReferral()}
      ${renderUpsell('calendar')}
    </div>
  `;
}

export const share = {
  id: 'share',
  title: 'Поделиться',
  render() {
    return renderContent();
  },
  async mount(node, ctx = {}) {
    const isCurrent = typeof ctx.isCurrent === 'function' ? ctx.isCurrent : () => true;
    state.card = await getCard();
    if (!isCurrent()) return;

    // Прошлые данные годятся только для той же визитки (после восстановления
    // копии счётчик партнёрки и отзывы были бы чужими).
    const cardKey = `${state.card.publishedSlug || ''}:${state.card.leadKey || ''}`;
    const warm = state.loaded && state.loadedFor === cardKey;
    if (!warm) {
      state.referral = { needed: 3, invited: 0, earned: 0 };
      state.reviews = [];
    }

    // Первый заход: ждём статистику партнёрки, иначе плашка «Приведите артистов»
    // мигнёт дефолтным «0 из 3» и дёрнется на реальное число.
    // Возврат на экран: число уже известно с прошлого раза — рисуем сразу, а
    // свежее значение подтянем ниже в фоне. Так переключение вкладки мгновенное.
    if (state.card.publishedSlug && !warm) {
      try { state.referral = await referralStats(); }
      catch { /* нет сети — плашка покажет дефолт, не критично */ }
      if (!isCurrent()) return;
    }
    node.innerHTML = renderContent();
    bind(node);
    state.loaded = true;
    state.loadedFor = cardKey;

    // Возврат: обновляем счётчик партнёрки в фоне и трогаем DOM только если
    // число реально изменилось — иначе никакого мелькания на готовом экране.
    // При первом заходе число только что получено — второй запрос не нужен.
    if (state.card.publishedSlug && warm) {
      referralStats().then((fresh) => {
        const same = fresh && state.referral
          && fresh.invited === state.referral.invited
          && fresh.earned === state.referral.earned
          && fresh.needed === state.referral.needed;
        if (same || !fresh) return;
        state.referral = fresh;
        if (isCurrent()) refreshReferralBlock(node);
      }).catch(() => {});
    }

    // Отзывы догружаем после отрисовки: они внизу экрана, их появление не видно
    // как прыжок, а ждать сеть ради них не нужно. Без await: роутер рисует
    // таббар, когда mount() закончился, и ожидание сети прятало бы его.
    if (state.card.publishedSlug) {
      fetchOwnReviews().then((reviews) => {
        state.reviews = reviews;
        if (reviews.length && isCurrent()) refreshReviewsBlock(node);
      }).catch(() => { /* нет отзывов или нет сети — блок останется пустым */ });
    }
  }
};

// Обновляем ТОЛЬКО секцию отзывов, не перерисовывая весь экран: раньше
// полный node.innerHTML заново рисовал QR, ссылку и кнопки — переход
// «подтягивался» рывком. Теперь заменяется одна секция и её обработчики.
// Точечно меняем только плашку партнёрки, не трогая остальной экран: при
// возврате на вкладку счётчик обновляется в фоне, и перерисовывать ради него
// QR со ссылкой было бы заметным рывком.
function refreshReferralBlock(node) {
  const current = node.querySelector('.ca-ref');
  if (!current) return;
  const tpl = document.createElement('template');
  tpl.innerHTML = renderReferral().trim();
  const fresh = tpl.content.firstElementChild;
  if (!fresh) return;
  current.replaceWith(fresh);
  bindReferral(node);
}

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
        toast.show('Ссылка скопирована, отправьте артисту', { ok: true });
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
          text: 'Бесплатная электронная визитка с QR. Попробуй!',
          url
        }).catch(() => {});
        return;
      }
      try {
        await navigator.clipboard.writeText(url);
        toast.show('Ссылка скопирована, отправьте артисту', { ok: true });
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
          ? 'Витрина включена: иконка открывает визитку'
          : 'Витрина выключена', { ok: true });
      } catch {
        // Откатываем переключатель, если сохранить не удалось.
        kioskToggle.setAttribute('aria-checked', next ? 'false' : 'true');
        state.card = { ...state.card, kioskMode: !next };
        toast.show('Не удалось сохранить настройку');
      }
    });
  }

  node.querySelectorAll('[data-copy]').forEach((copyBtn) => {
    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(copyBtn.dataset.copy);
        toast.show('Ссылка скопирована', { ok: true });
      } catch {
        // Часть браузеров запрещает clipboard без жеста/https — подсказываем,
        // а не молчим об ошибке.
        toast.show('Скопируйте ссылку вручную');
      }
    });
  });

  node.querySelectorAll('[data-share]').forEach((shareBtn) => {
    shareBtn.addEventListener('click', async () => {
      const url = shareBtn.dataset.share;
      const name = state.card?.name || 'Визитка';
      const title = shareBtn.dataset.shareTitle ? `${shareBtn.dataset.shareTitle} · ${name}` : name;
      if (navigator.share) {
        await navigator.share({ title, url }).catch(() => { /* закрыли системный лист — не ошибка */ });
        return;
      }
      try {
        await navigator.clipboard.writeText(url);
        toast.show('Ссылка скопирована', { ok: true });
      } catch {
        toast.show('Скопируйте ссылку вручную');
      }
    });
  });

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
        let shared = false;
        if (navigator.share) {
          try {
            await navigator.share({ title: 'Видеоотзыв', text, url });
            shared = true;
          } catch {
            // Пользователь закрыл системное меню или Safari сбросил жест из-за async fetch
          }
        }
        if (!shared) {
          try {
            await navigator.clipboard.writeText(url);
            toast.show('Ссылка скопирована, отправьте заказчику', { ok: true });
          } catch {
            toast.show('Ссылка создана, скопируйте: ' + url, { ok: true });
          }
        }
      } catch (err) {
        const message = err?.message === 'not_published'
          ? 'Сначала опубликуйте визитку'
          : err?.message === 'invite_store_failed'
            ? 'Ссылка не сохранилась, попробуйте ещё раз'
            : err?.message === 'forbidden'
              ? 'Ошибка доступа к визитке. Обновите визитку в редакторе'
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
          ? 'Хранилище видео недоступно, попробуйте позже'
          : 'Не удалось удалить', { error: true });
      }
    });
  });
}
