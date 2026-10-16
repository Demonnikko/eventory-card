// Публичная визитка /v/<визитка> и страница праздника /v/<визитка>/<праздник>
// — то, что открывает клиент по ссылке из Sales или по QR.
//
// Единственный экран, который видят посторонние люди, поэтому здесь:
// ненавязчивая подпись о продукте внизу и никакого интерфейса владельца.
// Переход «главная ↔ праздник» идёт без перезагрузки (history API): гость
// листает визитку как приложение, а адрес в строке остаётся настоящим —
// его можно переслать, и превью в мессенджере покажет нужный праздник.
import { renderCardView, cleanupRevealHints } from './card-view.js';
import { watchFx } from './occasion-fx.js';
import { injectReviews } from './reviews-view.js';
import { fetchReviews } from './reviews-data.js';
import { openDateRequest, resetDateRequest } from './date-request.js';
import { downloadVCard } from './vcard.js';
import { trackOpen, trackSection, readTagFromUrl, readSourceFromUrl } from './insight-data.js';
import { upsellHref } from './crm-upsell.js';
import { findOccasion, occasionTitle } from './shared/data/occasions.js';
import { toast } from './shared/components/toast.js';
import { openVideoModal, closeVideoModal } from './video-modal.js';
import { openActModal, closeActModal } from './act-modal.js';

const state = {
  card: null, error: '', loading: true, reviews: [],
  slug: '', occasionSlug: '', tagId: '', source: '', query: '',
  // Пришёл ли человек на праздник с главной визитки: только тогда у страницы
  // есть «Все праздники». По прямой ссылке из Sales она самостоятельна.
  fromMain: false,
  // Обложка, ужатая под аватарку контакта (см. prepareVcardPhoto).
  vcardPhoto: '',
  // Разделы, уже засчитанные в интерес за этот визит. Живёт на уровне визита,
  // а не одного наблюдателя: карточку перерисовывают (кэш → свежие данные,
  // переход на праздник), и без общей памяти раздел засчитался бы дважды.
  sentSections: new Set(),
  node: null
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

// Праздник из адреса существует только если владелец его включил. Иначе
// показываем главную — ссылка из старой рассылки не должна вести в пустоту.
// Ищем по визитке: свои праздники (юбилей, 8 Марта) живут только в ней.
function activeOccasion() {
  const occasion = findOccasion(state.card, { slug: state.occasionSlug });
  return occasion && state.card?.occasions?.[occasion.id]?.on ? occasion : null;
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
    occasion: activeOccasion(),
    fromMain: state.fromMain,
    slug: state.slug,
    query: state.query
  })}${renderFooter()}</div>`;
}

function updateMeta(card) {
  const name = card?.name || 'Визитка';
  const occasion = activeOccasion();
  if (occasion) document.title = `${occasionTitle(occasion)} · ${name}`;
  else document.title = card?.role ? `${name} · ${card.role}` : name;
  allowZoom();
}

// В index.html зум выключен намеренно: у владельца визитка стоит на экране как
// приложение, и щипок/двойной тап там читаются как сбой, а не как масштаб.
// Но публичную визитку клиент открывает обычной ссылкой в браузере — это
// страница, а не приложение, и запрет масштаба лишает возможности увеличить
// текст тех, кто плохо видит. Поэтому на публичном экране возвращаем зум —
// точечно, не трогая режим владельца.
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
let sectionObserver = null;

function observeSections(node) {
  sectionObserver?.disconnect();
  if (typeof IntersectionObserver === 'undefined') return;
  const sections = node.querySelectorAll('[data-section]');
  if (!sections.length) return;

  const timers = new WeakMap();
  const sent = state.sentSections;
  const occasion = activeOccasion();

  sectionObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      const el = entry.target;
      const base = el.getAttribute('data-section') || '';
      // На странице праздника интерес подписываем праздником: «Форматы ·
      // Корпоратив» владельцу понятнее, чем просто «Форматы».
      const name = occasion ? `${base} · ${occasionTitle(occasion)}` : base;
      if (!base || sent.has(name)) {
        sectionObserver?.unobserve(el);
        return;
      }
      if (entry.isIntersecting) {
        if (!timers.has(el)) {
          timers.set(el, setTimeout(() => {
            if (sent.has(name) || !el.isConnected) return;
            sent.add(name);
            trackSection(state.slug, state.tagId, name.slice(0, 60));
            sectionObserver?.unobserve(el);
          }, SECTION_DWELL_MS));
        }
      } else {
        const t = timers.get(el);
        if (t) { clearTimeout(t); timers.delete(el); }
      }
    });
  }, { threshold: 0.4 });

  sections.forEach((el) => sectionObserver.observe(el));
}

function saveContact() {
  downloadVCard({
    ...state.card,
    coverPhoto: state.vcardPhoto || state.card.coverPhoto,
    publishedSlug: state.slug
  });
  trackOpen(state.slug, state.tagId, { event: 'contact' });
}

async function shareCard() {
  const url = window.location.href.split('#')[0];
  const title = document.title;
  if (navigator.share) {
    await navigator.share({ title, url }).catch(() => {});
    return;
  }
  try {
    await navigator.clipboard.writeText(url);
    toast.show('Ссылка скопирована', { ok: true });
  } catch {
    toast.show('Скопируйте ссылку из адресной строки');
  }
}

// Переход между главной и праздником без перезагрузки страницы.
function navigateTo(occasionSlug, { push = true, fromMain = false } = {}) {
  const occasion = findOccasion(state.card, { slug: occasionSlug });
  state.occasionSlug = occasion?.slug || '';
  state.fromMain = fromMain;
  if (push) {
    const path = occasion
      ? `/v/${encodeURIComponent(state.slug)}/${encodeURIComponent(occasion.slug)}`
      : `/v/${encodeURIComponent(state.slug)}`;
    window.history.pushState({ occasion: occasion?.slug || '', fromMain }, '', `${path}${state.query}`);
  }
  updateMeta(state.card);
  renderAndBind(state.node);
  window.scrollTo(0, 0);
  // Повод засчитываем как интерес и как праздник визита, но не как новое
  // открытие визитки: человек уже здесь.
  const active = activeOccasion();
  if (active) trackSection(state.slug, state.tagId, `Праздник · ${occasionTitle(active)}`, active.id);
}

function onPopState() {
  const parts = window.location.pathname.split('/').filter(Boolean);
  if (parts[0] !== 'v' || decodeURIComponent(parts[1] || '') !== state.slug) return;
  navigateTo(decodeURIComponent(parts[2] || ''), {
    push: false,
    fromMain: Boolean(window.history.state?.fromMain)
  });
}

// Всё, чем гость пользуется на визитке, привязываем СРАЗУ после отрисовки:
// отзывы догружаются отдельно, и кнопки не должны их ждать.
function bindInteractive(node) {
  if (!state.card) return;

  // Кнопка «Проверить дату» есть на панели внизу и в финале страницы праздника.
  node.querySelectorAll('[data-date-open]').forEach((btn) => btn.addEventListener('click', () => {
    openDateRequest({
      card: state.card,
      slug: state.slug,
      tagId: state.tagId,
      source: state.source,
      occasion: activeOccasion()?.id || '',
      onSaveContact: saveContact
    });
  }));

  node.querySelectorAll('[data-save-contact]').forEach((btn) => {
    btn.addEventListener('click', saveContact);
  });

  // Переход в контакты — отдельный сигнал: он показывает, что визитка
  // сработала, а не просто открылась.
  node.querySelectorAll('[data-contact]').forEach((el) => {
    el.addEventListener('click', () => {
      trackOpen(state.slug, state.tagId, { event: 'contact' });
    }, { once: true });
  });

  node.querySelector('[data-share-card]')?.addEventListener('click', shareCard);

  node.querySelectorAll('[data-video-open]').forEach((btn) => {
    btn.addEventListener('click', (event) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.button) return;
      const url = btn.dataset.videoUrl || btn.getAttribute('href');
      if (url) {
        event.preventDefault();
        const occ = activeOccasion();
        const title = occ ? occasionTitle(occ) : 'Видео выступления';
        openVideoModal(url, { title });
      }
    });
  });

  node.querySelectorAll('[data-act-open]').forEach((btn) => {
    btn.addEventListener('click', (event) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.button) return;
      event.preventDefault();
      const index = Number(btn.dataset.actOpen);
      if (!Number.isNaN(index)) {
        openActModal({
          card: state.card,
          index,
          onBook: () => {
            openDateRequest({
              card: state.card,
              slug: state.slug,
              tagId: state.tagId,
              source: state.source,
              occasion: activeOccasion()?.id || '',
              onSaveContact: saveContact
            });
          }
        });
      }
    });
    btn.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        btn.click();
      }
    });
  });

  node.querySelectorAll('[data-occasion-link]').forEach((link) => {
    link.addEventListener('click', (event) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.button) return;
      event.preventDefault();
      navigateTo(link.dataset.occasionLink, { fromMain: true });
    });
  });

  node.querySelector('[data-occasion-back]')?.addEventListener('click', (event) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button) return;
    event.preventDefault();
    // Пришли на праздник с главной — шаг назад по истории; по прямой ссылке
    // истории нет, тогда просто переходим на главную.
    if (window.history.state && 'occasion' in window.history.state) window.history.back();
    else navigateTo('');
  });

  observeSections(node);
}

// Праздничная анимация шапки замирает, когда шапка не на экране.
let stopFx = () => {};

function renderAndBind(node) {
  stopFx();
  node.innerHTML = renderContent();
  cleanupRevealHints(node);
  bindInteractive(node);
  stopFx = watchFx(node);
  if (state.reviews.length) injectReviews(node, state.reviews);
}

// Фото для сохранённого контакта. В лёгкой карточке обложка — ссылка, а vCard
// принимает только встроенную картинку. Готовим её заранее, в фоне: файл по
// кнопке должен скачаться сразу, пока жест гостя свеж (iOS отменяет загрузку,
// начатую после паузы на сеть). Заодно ужимаем до размера аватарки контакта.
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
    stopFx();
    sectionObserver?.disconnect();
    window.removeEventListener('popstate', onPopState);
    document.querySelector('[data-date-sheet]')?.remove();
    closeVideoModal();
    document.querySelector('.vm-overlay')?.remove();
    closeActModal();
    document.querySelector('[data-act-modal]')?.remove();
  },
  async mount(node, ctx = {}) {
    const slug = ctx.params?.id || '';
    Object.assign(state, {
      loading: true, error: '', card: null, reviews: [], slug,
      occasionSlug: String(ctx.params?.occasion || '').toLowerCase(),
      // Перезагрузка страницы праздника, открытого с главной, сохраняет «назад».
      fromMain: Boolean(window.history.state?.fromMain),
      vcardPhoto: '', sentSections: new Set(), node,
      // Метка события и канал из адреса: по ним считаем, откуда гость.
      tagId: readTagFromUrl(),
      source: readSourceFromUrl(),
      query: window.location.search || ''
    });
    document.title = 'Визитка';
    resetDateRequest();
    window.removeEventListener('popstate', onPopState);
    window.addEventListener('popstate', onPopState);

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
    if (state.slug !== slug) return;
    const fresh = data?.ok && data.card ? data.card : null;

    state.loading = false;
    if (fresh) {
      // Та же карточка, что уже показана из кэша, — не перерисовываем: иначе
      // заново проигрываются анимации появления, а гость, успевший открыть
      // шторку, теряет введённое.
      const unchanged = Boolean(cached) && sameCard(cached, fresh);
      state.card = fresh;
      state.error = '';
      writeCache(slug, fresh);
      updateMeta(fresh);
      if (!unchanged) renderAndBind(node);
    } else if (!cached) {
      // Если кэш уже показан, сетевую ошибку не показываем — человек читает
      // визитку, а не наши сообщения.
      const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
      state.error = offline ? 'network' : 'not_found';
      node.innerHTML = renderContent();
    }

    if (!state.card) return;

    // Учёт открытия — тихо, в фоне, не задерживая показ визитки.
    trackOpen(slug, state.tagId, { occasion: activeOccasion()?.id || '', source: state.source });
    prepareVcardPhoto(state.card, slug);

    // Видеоотзывы догружаем отдельно: видео тяжёлое, а визитка уже на экране
    // и полностью работает. Придут — встанут на своё место.
    const reviews = await fetchReviews(slug);
    if (state.slug !== slug || !reviews.length) return;
    state.reviews = reviews;
    injectReviews(node, reviews);
  }
};
