// «Отклик» — экран владельца: откуда приходят люди и что они спрашивали.
//
// Главная мысль экрана: визитка перестаёт быть картинкой и начинает
// приносить данные. Владелец заводит метку под мероприятие, раздаёт по ней
// ссылку или QR — и через месяц видит, какое событие реально дало клиентов.
import { escapeHtml, escapeAttr } from './shared/lib/html.js';
import { renderIcon } from './shared/components/icons.js';
import { toast } from './shared/components/toast.js';
import { qrSvg } from './shared/data/qr.js';
import { hapticLight, hapticSuccess } from './shared/lib/haptic.js';
import { getCard } from './card-data.js';
import { fetchInsight, createTag, deleteTag, markDialogsRead, taggedUrl } from './insight-data.js';
import { activeUpsell, upsellHref } from './crm-upsell.js';

const state = {
  card: null,
  tags: [],
  dialogs: [],
  loading: true,
  busy: false,
  form: false,       // открыта форма новой метки
  qrFor: ''          // id метки, для которой показан QR
};

function formatDate(ts) {
  const time = Number(ts);
  if (!time) return '';
  return new Date(time).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}

function formatEventDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}

/* ─────────── Метки ─────────── */

function renderTag(tag) {
  const s = tag.stats || {};
  const meta = [formatEventDate(tag.date), tag.place].filter(Boolean).join(' · ');
  const url = taggedUrl(state.card.publishedSlug, tag.id);
  const showQr = state.qrFor === tag.id;

  return `
    <div class="in-tag${showQr ? ' is-open' : ''}">
      <div class="in-tag-head">
        <div class="in-tag-titles">
          <span class="in-tag-label">${escapeHtml(tag.label)}</span>
          ${meta ? `<span class="in-tag-meta">${escapeHtml(meta)}</span>` : ''}
        </div>
        <button type="button" class="in-tag-more" data-tag-qr="${escapeAttr(tag.id)}"
          aria-label="Ссылка и QR">${renderIcon(showQr ? 'x' : 'share')}</button>
      </div>

      <div class="in-stats">
        <div class="in-stat">
          <span class="in-stat-value">${s.opens || 0}</span>
          <span class="in-stat-label">открытий</span>
        </div>
        <div class="in-stat">
          <span class="in-stat-value">${s.visitors || 0}</span>
          <span class="in-stat-label">человек</span>
        </div>
        <div class="in-stat${s.contacts ? ' is-hot' : ''}">
          <span class="in-stat-value">${s.contacts || 0}</span>
          <span class="in-stat-label">обращений</span>
        </div>
      </div>

      ${s.lastAt ? `<p class="in-tag-last">Последний раз — ${escapeHtml(formatDate(s.lastAt))}</p>` : ''}

      ${showQr ? `
        <div class="in-tag-share">
          <div class="in-tag-qr">${qrSvg(url, { className: 'in-qr-svg', title: 'QR метки' })}</div>
          <p class="in-tag-url">${escapeHtml(url)}</p>
          <div class="in-tag-actions">
            <button type="button" class="ca-btn ca-btn--ghost" data-tag-copy="${escapeAttr(url)}">
              ${renderIcon('copy')} Скопировать
            </button>
            <button type="button" class="ca-btn ca-btn--ghost" data-tag-share="${escapeAttr(url)}">
              ${renderIcon('share')} Отправить
            </button>
          </div>
          <button type="button" class="in-tag-delete" data-tag-delete="${escapeAttr(tag.id)}">
            Удалить метку
          </button>
        </div>
      ` : ''}
    </div>
  `;
}

function renderForm() {
  if (!state.form) {
    return `
      <button type="button" class="ca-btn ca-btn--primary" data-tag-new>
        Новое мероприятие
      </button>
    `;
  }
  return `
    <div class="in-form">
      <input class="ca-input" type="text" placeholder="Например: Свадьба Ани"
        maxlength="80" data-field-label />
      <input class="ca-input" type="text" placeholder="Место (Барвиха)"
        maxlength="80" data-field-place />
      <input class="ca-input" type="date" data-field-date />
      <div class="in-form-actions">
        <button type="button" class="ca-btn ca-btn--primary" data-tag-save ${state.busy ? 'disabled' : ''}>
          ${state.busy ? 'Создаём…' : 'Создать'}
        </button>
        <button type="button" class="ca-btn ca-btn--ghost" data-tag-cancel>Отмена</button>
      </div>
    </div>
  `;
}

/* ─────────── Диалоги ─────────── */

function renderDialogs() {
  if (!state.dialogs.length) return '';
  const unread = state.dialogs.filter((d) => !d.read).length;

  return `
    <section class="in-section">
      <div class="in-section-head">
        <span class="in-section-title">Спрашивали</span>
        ${unread ? `<span class="in-badge">${unread}</span>` : ''}
      </div>
      <p class="in-section-sub">Визитка ответила сама — вы можете продолжить лично.</p>

      <div class="in-dialogs">
        ${state.dialogs.slice(0, 12).map((d) => `
          <div class="in-dialog${d.read ? '' : ' is-new'}">
            <p class="in-dialog-q">${escapeHtml(d.question)}</p>
            <p class="in-dialog-a">${escapeHtml(d.answer)}</p>
            <span class="in-dialog-time">${escapeHtml(formatDate(d.createdAt))}</span>
          </div>
        `).join('')}
      </div>
    </section>
  `;
}

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

function renderContent() {
  if (state.loading) return '<div class="ca-loading">Загружаем…</div>';

  if (!state.card?.publishedSlug) {
    return `
      <div class="ca-empty">
        <p class="ca-empty-title">Сначала опубликуйте визитку</p>
        <p class="ca-empty-text">После публикации здесь появится статистика: кто открывал визитку и с какого мероприятия.</p>
        <a class="ca-btn ca-btn--primary" href="#/editor">К визитке</a>
      </div>
    `;
  }

  const total = state.tags.reduce((sum, t) => sum + (t.stats?.opens || 0), 0);

  return `
    <div class="in-page">
      ${total ? `
        <div class="in-total">
          <span class="in-total-value">${total}</span>
          <span class="in-total-label">открытий визитки всего</span>
        </div>
      ` : ''}

      <section class="in-section">
        <div class="in-section-head">
          <span class="in-section-title">Мероприятия</span>
        </div>
        <p class="in-section-sub">Заведите метку под событие и раздавайте визитку по её ссылке —
          увидите, какое мероприятие приносит клиентов.</p>

        ${state.tags.length
          ? `<div class="in-tags">${state.tags.map(renderTag).join('')}</div>`
          : '<p class="in-empty-hint">Пока ни одного мероприятия.</p>'}

        ${renderForm()}
      </section>

      ${renderDialogs()}
      ${renderUpsell('analytics')}
    </div>
  `;
}

/* ─────────── Экран ─────────── */

export const insight = {
  id: 'insight',
  title: 'Отклик',
  render() {
    return '<div class="ca-loading">Загружаем…</div>';
  },
  async mount(node) {
    state.loading = true;
    state.form = false;
    state.qrFor = '';
    state.card = await getCard();

    node.innerHTML = renderContent();

    if (state.card.publishedSlug) {
      try {
        const data = await fetchInsight();
        state.tags = data.tags || [];
        state.dialogs = data.dialogs || [];
        // Владелец увидел вопросы — снимаем пометку «новое».
        if (state.dialogs.some((d) => !d.read)) markDialogsRead().catch(() => {});
      } catch { /* нет сети — покажем пустой экран, без ошибки на весь экран */ }
    }

    state.loading = false;
    node.innerHTML = renderContent();
    bind(node);
  }
};

function rerender(node) {
  node.innerHTML = renderContent();
  bind(node);
}

function bind(node) {
  const newBtn = node.querySelector('[data-tag-new]');
  if (newBtn) {
    newBtn.addEventListener('click', () => {
      state.form = true;
      rerender(node);
      node.querySelector('[data-field-label]')?.focus();
    });
  }

  const cancel = node.querySelector('[data-tag-cancel]');
  if (cancel) {
    cancel.addEventListener('click', () => {
      state.form = false;
      rerender(node);
    });
  }

  const save = node.querySelector('[data-tag-save]');
  if (save) {
    save.addEventListener('click', async () => {
      const label = node.querySelector('[data-field-label]')?.value?.trim() || '';
      if (!label) {
        toast.show('Назовите мероприятие');
        return;
      }
      state.busy = true;
      rerender(node);
      try {
        const tag = await createTag({
          label,
          place: node.querySelector('[data-field-place]')?.value || '',
          date: node.querySelector('[data-field-date]')?.value || ''
        });
        state.tags = [{ ...tag, stats: { opens: 0, visitors: 0, contacts: 0 } }, ...state.tags];
        state.form = false;
        hapticSuccess();
        toast.show('Метка создана — раздавайте визитку по её ссылке', { ok: true });
      } catch {
        toast.show('Не удалось создать', { error: true });
      } finally {
        state.busy = false;
        rerender(node);
      }
    });
  }

  node.querySelectorAll('[data-tag-qr]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.tagQr;
      state.qrFor = state.qrFor === id ? '' : id;
      hapticLight();
      rerender(node);
    });
  });

  node.querySelectorAll('[data-tag-copy]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(btn.dataset.tagCopy);
        toast.show('Ссылка скопирована', { ok: true });
      } catch {
        toast.show('Скопируйте ссылку вручную');
      }
    });
  });

  node.querySelectorAll('[data-tag-share]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const url = btn.dataset.tagShare;
      if (navigator.share) {
        await navigator.share({ url }).catch(() => {});
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

  node.querySelectorAll('[data-tag-delete]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!window.confirm('Удалить метку? Статистика по ней будет потеряна.')) return;
      const id = btn.dataset.tagDelete;
      try {
        await deleteTag(id);
        state.tags = state.tags.filter((t) => t.id !== id);
        state.qrFor = '';
        rerender(node);
        toast.show('Метка удалена');
      } catch {
        toast.show('Не удалось удалить', { error: true });
      }
    });
  });
}
