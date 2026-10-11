// Предпросмотр локального черновика — визитка глазами клиента.
// Работает до публикации и без сети. Страницы праздников открываются здесь же
// (#/preview/<праздник>), а шторку «Проверить дату» можно открыть и
// посмотреть — заявка из предпросмотра не уходит. Подтверждённые видеоотзывы
// показываем — иначе человек публикует отзыв и не находит его ни на одном экране.
import { getCard } from './card-data.js';
import { renderCardView, cleanupRevealHints } from './card-view.js';
import { injectReviews } from './reviews-view.js';
import { fetchReviews } from './reviews-data.js';
import { openDateRequest, resetDateRequest } from './date-request.js';
import { occasionBySlug } from './shared/data/occasions.js';
import { toast } from './shared/components/toast.js';

const state = { card: null, occasion: null, reviews: [] };

function renderContent() {
  const card = state.card;
  if (!card) return '<div class="ca-loading">Готовим предпросмотр…</div>';
  return `
    <div class="ca-preview">
      <div class="ca-preview-bar">
        <span>Так визитку видит клиент</span>
        <a class="ca-preview-back" href="#/editor">Редактировать</a>
      </div>
      ${renderCardView(card, { interactive: false, occasion: state.occasion })}
    </div>
  `;
}

function bind(node) {
  node.querySelector('[data-date-open]')?.addEventListener('click', () => {
    openDateRequest({
      card: state.card,
      slug: state.card.publishedSlug,
      occasion: state.occasion && state.card.occasions?.[state.occasion.id]?.on ? state.occasion.id : '',
      interactive: false,
      onSaveContact: () => toast.show('В предпросмотре контакт не сохраняется')
    });
  });
}

export const preview = {
  id: 'preview',
  title: 'Просмотр',
  render() {
    return renderContent();
  },
  unmount() {
    document.querySelector('[data-date-sheet]')?.remove();
  },
  async mount(node, ctx = {}) {
    state.card = await getCard();
    state.occasion = occasionBySlug(ctx.params?.occasion || '');
    resetDateRequest();
    node.innerHTML = renderContent();
    cleanupRevealHints(node);
    bind(node);

    // Отзывы живут на сервере и приходят позже карточки: до публикации их
    // просто нет, поэтому экран не должен их ждать.
    if (!state.card.publishedSlug) return;
    state.reviews = await fetchReviews(state.card.publishedSlug);
    if (!state.reviews.length) return;
    injectReviews(node, state.reviews);
  }
};
