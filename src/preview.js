// Предпросмотр локального черновика.
// Работает до публикации и без сети. Серверные дополнения публичной страницы
// (отзывы, узнавание гостя) сюда не подмешиваем и честно называем экран
// предпросмотром, а не полной копией клиентской страницы.
import { getCard } from './card-data.js';
import { renderCardView, cleanupRevealHints } from './card-view.js';

const state = { card: null };

function renderContent() {
  const card = state.card;
  if (!card) return '<div class="ca-loading">Готовим предпросмотр…</div>';
  return `
    <div class="ca-preview">
      <div class="ca-preview-bar">
        <span>Предпросмотр визитки</span>
        <a class="ca-preview-back" href="#/editor">Редактировать</a>
      </div>
      ${renderCardView(card, { interactive: false })}
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
