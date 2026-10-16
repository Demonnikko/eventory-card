// Предпросмотр локального черновика — визитка глазами клиента.
// Работает до публикации и без сети. Страницы праздников открываются здесь же
// (#/preview/<праздник>), а шторку «Проверить дату» можно открыть и
// посмотреть — заявка из предпросмотра не уходит. Подтверждённые видеоотзывы
// показываем — иначе человек публикует отзыв и не находит его ни на одном экране.
import { getCard } from './card-data.js';
import { renderCardView, cleanupRevealHints } from './card-view.js';
import { watchFx } from './occasion-fx.js';
import { injectReviews } from './reviews-view.js';
import { fetchReviews } from './reviews-data.js';
import { openDateRequest, resetDateRequest } from './date-request.js';
import { findOccasion } from './shared/data/occasions.js';
import { toast } from './shared/components/toast.js';
import { openVideoModal, closeVideoModal } from './video-modal.js';

const state = { card: null, occasion: null, reviews: [] };
let stopFx = () => {};

function renderContent() {
  const card = state.card;
  if (!card) return '<div class="ca-loading">Готовим предпросмотр…</div>';
  return `
    <div class="ca-preview">
      <div class="ca-preview-bar">
        <span>Так визитку видит клиент</span>
        <a class="ca-preview-back" href="#/editor">Редактировать</a>
      </div>
      ${renderCardView(card, {
        interactive: false,
        occasion: state.occasion,
        // Владельцу нужна дорога назад к главной визитке, клиент из Sales её
        // не увидит — у него страница праздника самостоятельная.
        fromMain: true
      })}
    </div>
  `;
}

function bind(node) {
  node.querySelectorAll('[data-date-open]').forEach((btn) => btn.addEventListener('click', () => {
    openDateRequest({
      card: state.card,
      slug: state.card.publishedSlug,
      occasion: state.occasion && state.card.occasions?.[state.occasion.id]?.on ? state.occasion.id : '',
      interactive: false,
      onSaveContact: () => toast.show('В предпросмотре контакт не сохраняется')
    });
  }));

  node.querySelectorAll('[data-video-open]').forEach((btn) => {
    btn.addEventListener('click', (event) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.button) return;
      const url = btn.dataset.videoUrl || btn.getAttribute('href');
      if (url) {
        event.preventDefault();
        const occ = state.occasion;
        const title = occ ? (occ.title || 'Выступление') : 'Видео выступления';
        openVideoModal(url, { title });
      }
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
    stopFx();
    document.querySelector('[data-date-sheet]')?.remove();
    closeVideoModal();
    document.querySelector('.vm-overlay')?.remove();
  },
  async mount(node, ctx = {}) {
    state.card = await getCard();
    state.occasion = findOccasion(state.card, { slug: ctx.params?.occasion || '' });
    resetDateRequest();
    node.innerHTML = renderContent();
    cleanupRevealHints(node);
    bind(node);
    stopFx();
    stopFx = watchFx(node);

    // Отзывы живут на сервере и приходят позже карточки: до публикации их
    // просто нет, поэтому экран не должен их ждать.
    if (!state.card.publishedSlug) return;
    state.reviews = await fetchReviews(state.card.publishedSlug);
    if (!state.reviews.length) return;
    injectReviews(node, state.reviews);
  }
};
