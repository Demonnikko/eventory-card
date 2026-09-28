// Публичная визитка /v/<slug> — то, что открывает клиент по ссылке или QR.
//
// Единственный экран, который видят посторонние люди, поэтому здесь:
// ненавязчивая подпись о CRM внизу и никакого интерфейса владельца.
import { renderCardView, cleanupRevealHints } from './card-view.js';
import { injectReviews } from './reviews-view.js';
import { fetchReviews } from './reviews-data.js';
import { renderAskBlock, bindAsk, resetAsk, renderGreeting, renderSmartOffer } from './card-ask.js';
import { renderPriceRequest, bindPriceRequest, resetPriceRequest, markOfferContext } from './price-request.js';
import { downloadVCard } from './vcard.js';
import { trackOpen, trackSection, greetReturning, readTagFromUrl } from './insight-data.js';
import { upsellHref } from './crm-upsell.js';

const state = {
  card: null, error: '', loading: true, reviews: [],
  greeting: null, tagId: '', slug: '',
  // Обложка, ужатая под аватарку контакта (см. prepareVcardPhoto).
  vcardPhoto: '',
  // Разделы, уже засчитанные в интерес за этот визит. Живёт на уровне визита,
  // а не одного наблюдателя: карточку могут перерисовать (кэш → свежие данные),
  // и без общей памяти один и тот же раздел засчитался бы дважды.
  sentSections: new Set()
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

function sameCard(a, b) {
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
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

function currentOffer() {
  return (offerAllowed() && state.greeting)
    ? { ...state.greeting, offerText: state.card?.offerText || '' }
    : null;
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
    // Крючок: к greeting (visits/interest с сервера) добавляем текст оффера из
    // карточки. Без offerText renderSmartOffer сам вернёт пусто — не показываем.
    offer: currentOffer(),
    priceRequest: renderPriceRequest(state.card),
    ask: renderAskBlock(state.card)
  })}${renderFooter()}</div>`;
}

// Умный оффер показываем горячему гостю ОДИН раз — чтобы не превратить визитку
// в назойливый поп-ап. Отметку о показе храним в браузере гостя на 7 дней.
const OFFER_SEEN_KEY = 'eventory-card:offer-seen';

function offerAllowed() {
  try {
    const seen = Number(localStorage.getItem(OFFER_SEEN_KEY)) || 0;
    return Date.now() - seen > 7 * 86400000;
  } catch {
    return true;
  }
}

function markOfferSeen() {
  try {
    localStorage.setItem(OFFER_SEEN_KEY, String(Date.now()));
  } catch { /* приватный режим — просто покажем снова в следующий раз */ }
}

function updateMeta(card) {
  const name = card?.name || 'Визитка';
  document.title = card?.role ? `${name} — ${card.role}` : name;
  allowZoom();
}

// В index.html зум выключен намеренно: у владельца визитка стоит на экране как
// приложение, и щипок/двойной тап там читаются как сбой, а не как масштаб.
// Но публичную визитку клиент открывает обычной ссылкой в браузере — это
// страница, а не приложение, и запрет масштаба лишает возможности увеличить
// текст (цены, услуги) тех, кто плохо видит. Поэтому на публичном экране
// возвращаем зум — точечно, не трогая режим владельца.
const VIEWPORT_ZOOM = 'width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-visual';
let viewportLocked = '';

function allowZoom() {
  const meta = document.querySelector('meta[name="viewport"]');
  if (!meta || meta.dataset.zoomAllowed) return;
  viewportLocked = meta.getAttribute('content') || '';
  meta.setAttribute('content', VIEWPORT_ZOOM);
  meta.dataset.zoomAllowed = '1';
}

// Уход с публичного экрана внутри приложения владельца — возвращаем запрет,
// иначе режим «как приложение» пропал бы до перезапуска.
function restoreZoom() {
  const meta = document.querySelector('meta[name="viewport"]');
  if (!meta || !meta.dataset.zoomAllowed) return;
  if (viewportLocked) meta.setAttribute('content', viewportLocked);
  delete meta.dataset.zoomAllowed;
}

// Один запрос карточки: сетевой сбой и «не ok» отдаём одинаково — null,
// чтобы вызывающий мог спокойно попробовать запасной адрес.
async function fetchCardJson(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
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
  const sent = state.sentSections;

  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      const el = entry.target;
      const name = el.getAttribute('data-section') || '';
      if (!name || sent.has(name)) {
        io.unobserve(el);
        return;
      }

      if (entry.isIntersecting) {
        // Появился на экране — запускаем отсчёт «досмотра».
        if (!timers.has(el)) {
          const t = setTimeout(() => {
            if (sent.has(name) || !el.isConnected) return;
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

// Кнопка умного оффера открывает ту же форму заявки. Вынесено отдельно: оффер
// может появиться и в первой отрисовке, и позже — когда сервер узнает гостя.
function bindOffer(node) {
  const offerBtn = node.querySelector('[data-offer-cta]');
  if (!offerBtn || offerBtn.dataset.bound) return;
  offerBtn.dataset.bound = '1';
  offerBtn.addEventListener('click', () => {
    markOfferSeen();
    // Запоминаем показанный текст предложения — пришьётся к заявке, чтобы
    // владелец видел, по какому спецусловию пришёл клиент.
    const label = node.querySelector('[data-offer]')?.getAttribute('data-offer-label') || '';
    markOfferContext(label);
    node.querySelector('[data-offer]')?.setAttribute('hidden', '');
    const toggle = node.querySelector('[data-price-toggle]');
    toggle?.click();
    toggle?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
}

// Всё, чем гость пользуется на визитке, привязываем СРАЗУ после отрисовки.
// Раньше это ждало отзывов и узнавания гостя: карточка уже была на экране, а
// «Узнать цену», «Быстрый вопрос» и «Сохранить контакт» молчали — на слабой
// сети секундами, а при зависшем запросе навсегда. Гость жал главную кнопку,
// ничего не происходило, и он уходил.
function bindInteractive(node) {
  if (!state.card) return;
  const { slug, tagId } = state;

  bindAsk(node, { slug, tagId });
  bindPriceRequest(node, { slug, tagId });
  bindOffer(node);

  // Смарт-метрика: следим, какие разделы гость реально досмотрел (не просто
  // проскроллил). По этому строится интерес — что предлагать именно ему.
  observeSections(node, slug, tagId);

  // Переход в контакты — отдельный сигнал: он показывает, что визитка
  // сработала, а не просто открылась.
  node.querySelectorAll('.cp-contact').forEach((el) => {
    el.addEventListener('click', () => {
      trackOpen(slug, tagId, { event: 'contact' });
    }, { once: true });
  });

  // Сохранение контакта — самое полезное для гостя действие: он уходит
  // с заполненной карточкой, а не со ссылкой, которую потом не найдёт.
  const saveBtn = node.querySelector('[data-save-contact]');
  if (saveBtn) {
    saveBtn.addEventListener('click', () => {
      downloadVCard({
        ...state.card,
        coverPhoto: state.vcardPhoto || state.card.coverPhoto,
        publishedSlug: slug
      });
      trackOpen(slug, tagId, { event: 'contact' });
    });
  }
}

function renderAndBind(node) {
  node.innerHTML = renderContent();
  cleanupRevealHints(node);
  bindInteractive(node);
}

// Узнавание гостя приходит с сервера позже карточки. Вставляем только его и
// персональное предложение — каждое на своё место, не перерисовывая визитку:
// вернувшийся гость мог уже начать заполнять форму, и полная перерисовка
// закрыла бы ему клавиатуру и сбила курсор.
function injectGreeting(node) {
  const card = node.querySelector('.cp-card');
  if (!card || !state.greeting) return;

  if (!card.querySelector('[data-greet]')) {
    card.querySelector('.cp-hero')?.insertAdjacentHTML('afterend', renderGreeting(state.greeting));
  }

  const offer = currentOffer();
  const offerHtml = offer ? renderSmartOffer(offer) : '';
  const priceReq = card.querySelector('[data-price-req]');
  // Оффер ведёт в форму заявки — без формы показывать его незачем.
  if (offerHtml && priceReq && !card.querySelector('[data-offer]')) {
    priceReq.insertAdjacentHTML('beforebegin', offerHtml);
    bindOffer(node);
  }
}

// Фото для сохранённого контакта. В лёгкой карточке обложка — ссылка, а vCard
// принимает только встроенную картинку. Готовим её заранее, в фоне: файл по
// кнопке должен скачаться сразу, пока жест гостя свеж (iOS отменяет загрузку,
// начатую после паузы на сеть). Заодно ужимаем до размера аватарки контакта:
// полноразмерная обложка часто не влезала в лимит vCard и терялась.
const VCARD_PHOTO_SIDE = 400;

function prepareVcardPhoto(card, slug) {
  const src = String(card?.coverPhoto || '');
  if (!src || typeof Image === 'undefined') return;
  const img = new Image();
  img.decoding = 'async';
  img.onload = () => {
    if (state.slug !== slug) return;
    try {
      const w0 = img.naturalWidth;
      const h0 = img.naturalHeight;
      if (!w0 || !h0) return;
      const scale = Math.min(1, VCARD_PHOTO_SIDE / Math.max(w0, h0));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(w0 * scale);
      canvas.height = Math.round(h0 * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      state.vcardPhoto = canvas.toDataURL('image/jpeg', 0.82);
    } catch {
      // Картинка с чужого домена «пачкает» холст — сохраним контакт без фото.
    }
  };
  img.src = src;
}

export const publicCard = {
  id: 'card-public',
  title: '',
  render() {
    return renderContent();
  },
  unmount() {
    restoreZoom();
  },
  async mount(node, ctx = {}) {
    const slug = ctx.params?.id || '';
    state.loading = true;
    state.error = '';
    state.card = null;
    state.reviews = [];
    state.greeting = null;
    state.slug = slug;
    state.vcardPhoto = '';
    state.sentSections = new Set();
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
      renderAndBind(node);
    }

    // Лёгкая карточка: фото приходят ссылками, а не base64 внутри JSON —
    // страница появляется сразу, снимки догружаются картинками параллельно.
    // Если лёгкая ветка почему-то недоступна, честно берём полную карточку:
    // визитка клиента не должна зависеть от одной функции.
    let data = await fetchCardJson(`/api/og?card=1&slug=${encodeURIComponent(slug)}`);
    if (!data?.ok || !data.card) {
      data = await fetchCardJson(`/api/card-get?slug=${encodeURIComponent(slug)}`);
    }
    const fresh = data?.ok && data.card ? data.card : null;

    state.loading = false;
    if (fresh) {
      // Та же карточка, что уже показана из кэша, — не перерисовываем: иначе
      // заново проигрываются анимации появления, а гость, успевший открыть
      // форму, теряет курсор.
      const unchanged = Boolean(cached) && sameCard(cached, fresh);
      state.card = fresh;
      state.error = '';
      writeCache(slug, fresh);
      updateMeta(fresh);
      if (!unchanged) renderAndBind(node);
    } else if (!cached) {
      // Если кэш уже показан, сетевую ошибку не показываем — человек читает
      // визитку, а не наши сообщения.
      // Нет сети — честно так и говорим; иначе визитки по этой ссылке нет.
      const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
      state.error = offline ? 'network' : 'not_found';
      node.innerHTML = renderContent();
    }

    if (!state.card) return;

    // Учёт открытия — тихо, в фоне, не задерживая показ визитки.
    trackOpen(slug, state.tagId);
    prepareVcardPhoto(state.card, slug);

    // Отзывы и узнавание догружаем параллельно: видео тяжёлое, а карточка уже
    // на экране и полностью работает. Придут — встанут на свои места.
    const [reviews, greeting] = await Promise.all([
      fetchReviews(slug),
      greetReturning(slug)
    ]);
    if (state.slug !== slug) return;

    state.reviews = reviews;
    state.greeting = greeting;

    if (reviews.length) {
      injectReviews(node, reviews);
      // Отзывы принесли свой раздел — подключаем его к смарт-метрике.
      observeSections(node, slug, state.tagId);
    }
    if (greeting) injectGreeting(node);
  }
};
