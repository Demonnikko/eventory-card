// Предпросмотр локального черновика.
// Работает до публикации и без сети. Узнавание гостя сюда не подмешиваем:
// это личное для каждого посетителя. А вот подтверждённые отзывы показываем —
// иначе человек публикует отзыв и не находит его ни на одном экране.
import { getCard } from './card-data.js';
import { renderCardView, cleanupRevealHints } from './card-view.js';
import { bindReviews } from './reviews-view.js';
import { fetchReviews } from './reviews-data.js';

const state = { card: null, reviews: [] };

function renderContent() {
  const card = state.card;
  if (!card) return '<div class="ca-loading">Готовим предпросмотр…</div>';
  return `
    <div class="ca-preview">
      <div class="ca-preview-bar">
        <span>Предпросмотр визитки</span>
        <a class="ca-preview-back" href="#/editor">Редактировать</a>
      </div>
      ${renderCardView(card, { interactive: false, reviews: state.reviews })}
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
    state.reviews = [];
    node.innerHTML = renderContent();
    cleanupRevealHints(node);

    // Отзывы живут на сервере и приходят позже карточки: до публикации их
    // просто нет, поэтому экран не должен их ждать.
    if (!state.card.publishedSlug) return;
    const reviews = await fetchReviews(state.card.publishedSlug);
    if (!reviews.length) return;
    state.reviews = reviews;
    node.innerHTML = renderContent();
    cleanupRevealHints(node);
    bindReviews(node, state.reviews);
  }
};
