// «Посмотреть как клиент» — предпросмотр локального черновика.
// Работает до публикации и без сети: рисуем ту же разметку, что видит клиент.
import { escapeHtml, escapeAttr } from './shared/lib/html.js';
import { renderIcon } from './shared/components/icons.js';
import { getCard } from './card-data.js';
import { renderCardView, cleanupRevealHints } from './card-view.js';
import { activeUpsell, upsellHref } from './crm-upsell.js';

const state = { card: null };

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
  const card = state.card;
  if (!card) return '<div class="ca-loading">Готовим предпросмотр…</div>';
  return `
    <div class="ca-preview">
      <div class="ca-preview-bar">
        <span>Так визитку видит клиент</span>
        <a class="ca-preview-back" href="#/editor">Редактировать</a>
      </div>
      ${renderCardView(card, { interactive: false })}
      ${renderUpsell('leads')}
    </div>
  `;
}

export const preview = {
  id: 'preview',
  title: 'Просмотр',
  render() {
    return renderContent();
  },
  async mount(node) {
    state.card = await getCard();
    node.innerHTML = renderContent();
    cleanupRevealHints(node);
  }
};
