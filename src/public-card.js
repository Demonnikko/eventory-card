// Публичная визитка /v/<slug> — то, что открывает клиент по ссылке или QR.
//
// Единственный экран, который видят посторонние люди, поэтому здесь:
// ненавязчивая подпись о CRM внизу и никакого интерфейса владельца.
import { renderCardView, cleanupRevealHints } from './card-view.js';
import { bindReviews, injectReviews } from './reviews-view.js';
import { fetchReviews } from './reviews-data.js';
import { renderAskBlock, bindAsk, resetAsk } from './card-ask.js';
import { renderPriceRequest, bindPriceRequest, resetPriceRequest } from './price-request.js';
import { downloadVCard } from './vcard.js';
import { trackOpen, trackSection, greetReturning, readTagFromUrl } from './insight-data.js';
import { upsellHref } from './crm-upsell.js';

const state = {
  card: null, error: '', loading: true, reviews: [],
  greeting: null, tagId: '', slug: ''
};

// Кэш: по ссылке часто заходят из мессенджера с плохой сетью.
const CACHE_PREFIX = 'card_view_';

function readCache(slug) {
  try {
    const raw = localStorage.getItem(`${CACHE_PREFIX}${slug}`);
    return raw ? JSON.parse(raw)?.card || null : null;
  } catch {
    return null;
  }
}

function writeCache(slug, card) {
  try {
    localStorage.setItem(`${CACHE_PREFIX}${slug}`, JSON.stringify({ card, cachedAt: Date.now() }));
  } catch { /* квота переполнена — не критично */ }
}

// Подпись под визиткой. Это единственная реклама на публичной странице:
// клиент пришёл смотреть человека, а не наш продукт.
function renderFooter() {
  return `
    <footer class="cp-footer">
      <a class="cp-footer-brand" href="${upsellHref('public')}" target="_blank" rel="noopener">by Eventory</a>
      <a class="cp-footer-privacy" href="/#/privacy" target="_blank" rel="noopener">Конфиденциальность</a>
    </footer>
  `;
}

function renderContent() {
  if (state.loading) return '<div class="ca-loading">Открываем визитку…</div>';
  if (state.error || !state.card) {
    return `
      <div class="ca-empty">
        <p class="ca-empty-title">Визитка недоступна</p>
        <p class="ca-empty-text">${state.error === 'network'
          ? 'Нет соединения. Проверьте интернет и обновите страницу.'
          : 'Возможно, ссылка устарела или визитку удалили.'}</p>
      </div>
    `;
  }
  return `<div class="cp-page">${renderCardView(state.card, {
    interactive: true,
    reviews: state.reviews,
    greeting: state.greeting,
    priceRequest: renderPriceRequest(state.card),
    ask: renderAskBlock(state.card)
  })}${renderFooter()}</div>`;
}

function updateMeta(card) {
  const name = card?.name || 'Визитка';
  document.title = card?.role ? `${name} — ${card.role}` : name;
}

// Наблюдатель разделов: раздел засчитываем в интерес, только если гость держал
// его на экране дольше порога — так «пролистнул мимо» не путается с «изучал».
// Каждый раздел шлём один раз за визит, чтобы один экран не накручивал счётчик.
const SECTION_DWELL_MS = 2000;

function observeSections(node, slug, tagId) {
  if (typeof IntersectionObserver === 'undefined') return;
  // Только ещё не подключённые секции — функцию можно звать повторно (после
  // догрузки отзывов), не боясь задвоить наблюдение одного раздела.
  const sections = node.querySelectorAll('[data-section]:not([data-section-seen])');
  if (!sections.length) return;

  const timers = new WeakMap();
  const sent = new Set();

  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      const el = entry.target;
      const name = el.getAttribute('data-section') || '';
      if (!name || sent.has(name)) return;

      if (entry.isIntersecting) {
        // Появился на экране — запускаем отсчёт «досмотра».
        if (!timers.has(el)) {
          const t = setTimeout(() => {
            sent.add(name);
            trackSection(slug, tagId, name);
            io.unobserve(el);
          }, SECTION_DWELL_MS);
          timers.set(el, t);
        }
      } else {
        // Ушёл с экрана раньше порога — отсчёт сбрасываем.
        const t = timers.get(el);
        if (t) { clearTimeout(t); timers.delete(el); }
      }
    });
  }, { threshold: 0.5 });

  sections.forEach((el) => {
    el.setAttribute('data-section-seen', '1');
    io.observe(el);
  });
}

export const publicCard = {
  id: 'card-public',
  title: '',
  render() {
    return renderContent();
  },
  async mount(node, ctx = {}) {
    const slug = ctx.params?.id || '';
    state.loading = true;
    state.error = '';
    state.card = null;
    state.reviews = [];
    state.greeting = null;
    state.slug = slug;
    document.title = 'Визитка';
    // Метка события из адреса: по ней считаем, с какого мероприятия гость.
    state.tagId = readTagFromUrl();
    resetAsk();
    resetPriceRequest();

    if (!slug) {
      state.loading = false;
      state.error = 'not_found';
      node.innerHTML = renderContent();
      return;
    }

    // Сначала показываем кэш — страница открывается мгновенно.
    const cached = readCache(slug);
    if (cached) {
      state.card = cached;
      state.loading = false;
      updateMeta(cached);
      node.innerHTML = renderContent();
      cleanupRevealHints(node);
    }

    try {
      const res = await fetch(`/api/card-get?slug=${encodeURIComponent(slug)}`);
      const data = await res.json();
      if (!res.ok || !data?.ok || !data.card) throw new Error('not_found');
      state.card = data.card;
      state.error = '';
      writeCache(slug, data.card);
      updateMeta(data.card);
    } catch (err) {
      // Если кэш уже показан, сетевую ошибку не показываем — человек читает
      // визитку, а не наши сообщения.
      if (!cached) {
        state.error = err?.message === 'not_found' ? 'not_found' : 'network';
      }
    } finally {
      state.loading = false;
      node.innerHTML = renderContent();
    }

    if (!state.card) return;

    // Учёт открытия — тихо, в фоне, не задерживая показ визитки.
    trackOpen(slug, state.tagId);

    // Отзывы и узнавание догружаем параллельно: видео тяжёлое, а карточка
    // должна открыться сразу. Придут — перерисуем страницу один раз.
    const [reviews, greeting] = await Promise.all([
      fetchReviews(slug),
      greetReturning(slug)
    ]);

    state.reviews = reviews;
    state.greeting = greeting;

    if (greeting) {
      // Узнавание вставляется в шапку — проще перерисовать карточку целиком.
      // Случай редкий (только вернувшийся гость), мигание здесь не мешает.
      node.innerHTML = renderContent();
      bindReviews(node, state.reviews);
      cleanupRevealHints(node);
    } else if (reviews.length) {
      // Обычный случай: точечно добавляем отзывы, не перерисовывая визитку.
      injectReviews(node, reviews);
    }

    bindAsk(node, { slug, tagId: state.tagId });
    bindPriceRequest(node, { slug, tagId: state.tagId });

    // Смарт-метрика: следим, какие разделы гость реально досмотрел (не просто
    // проскроллил). По этому строится интерес — что предлагать именно ему.
    observeSections(node, slug, state.tagId);

    // Переход в контакты — отдельный сигнал: он показывает, что визитка
    // сработала, а не просто открылась.
    node.querySelectorAll('.cp-contact, .cp-cta-btn').forEach((el) => {
      el.addEventListener('click', () => {
        trackOpen(slug, state.tagId, { event: 'contact' });
      }, { once: true });
    });

    // Сохранение контакта — самое полезное для гостя действие: он уходит
    // с заполненной карточкой, а не со ссылкой, которую потом не найдёт.
    const saveBtn = node.querySelector('[data-save-contact]');
    if (saveBtn) {
      saveBtn.addEventListener('click', () => {
        downloadVCard({ ...state.card, publishedSlug: slug });
        trackOpen(slug, state.tagId, { event: 'contact' });
      });
    }
  }
};
