// Роутер и оболочка PWA-визитки.
// Экранов немного, поэтому вместо общего роутера CRM здесь свой минимальный.
//
// Каждый экран грузится ЛЕНИВО (import() по требованию): открыв визитку,
// клиент тянет только код публичной карточки — без редактора, записи видео
// и аналитики, которые ему не нужны. Vite режет их на отдельные чанки, и
// первый экран стартует заметно быстрее, чем когда весь код лежал в одном
// бандле. isOnboarded читает localStorage — держим статически, чтобы
// parseRoute оставался синхронным и не ждал загрузки чанка онбординга.
import { isOnboarded } from './onboarding.js';
import { mirrorRead } from './store.js';
import { renderIcon, renderTabIcon } from './shared/components/icons.js';

// Режим витрины читаем синхронно из localStorage-зеркала карточки: parseRoute
// обязан оставаться синхронным (не ждать IndexedDB), а зеркало пишется при
// каждом сохранении карточки. Нет зеркала — режим выключен.
function isKioskMode() {
  try {
    return mirrorRead()?.kioskMode === true;
  } catch {
    return false;
  }
}

const TABS = [
  { id: 'editor', label: 'Визитка', icon: 'card' },
  { id: 'share', label: 'Поделиться', icon: 'qr' },
  { id: 'insight', label: 'Отклик', icon: 'pulse' },
  { id: 'preview', label: 'Просмотр', icon: 'eye' }
];

// Загрузчики экранов. Функция вызывается только когда на экран переходят,
// и возвращает нужный view из динамически подгруженного модуля.
const VIEW_LOADERS = {
  editor: () => import('./editor.js').then((m) => m.editor),
  share: () => import('./share.js').then((m) => m.share),
  preview: () => import('./preview.js').then((m) => m.preview),
  insight: () => import('./insight.js').then((m) => m.insight),
  privacy: () => import('./privacy.js').then((m) => m.privacy),
  onboarding: () => import('./onboarding.js').then((m) => m.onboarding),
  present: () => import('./present.js').then((m) => m.present),
  'review-record': () => import('./review-record.js').then((m) => m.reviewRecord),
  'card-public': () => import('./public-card.js').then((m) => m.publicCard)
};

function parseRoute() {
  // Публичная ссылка — чистый путь /v/<slug>: её открывают из мессенджера и
  // сканируют с QR, поэтому хэш в ней недопустим. SPA-fallback отдаёт
  // index.html, а маршрут разбираем здесь.
  const pathParts = window.location.pathname.split('/').filter(Boolean);
  if (pathParts[0] === 'v' && pathParts[1]) {
    return {
      id: 'card-public',
      params: { id: decodeURIComponent(pathParts[1]), occasion: decodeURIComponent(pathParts[2] || '') }
    };
  }
  // /r/<token> — приглашение записать видеоотзыв. Открывает заказчик,
  // человек со стороны, поэтому тоже чистый путь без хэша.
  if (pathParts[0] === 'r' && pathParts[1]) {
    return { id: 'review-record', params: { id: decodeURIComponent(pathParts[1]) } };
  }

  const raw = window.location.hash.replace(/^#/, '');
  const [path] = raw.split('?');
  const parts = path.split('/').filter(Boolean);
  if (parts[0] === 'v' && parts[1]) {
    return {
      id: 'card-public',
      params: { id: decodeURIComponent(parts[1]), occasion: decodeURIComponent(parts[2] || '') }
    };
  }
  if (parts[0] === 'r' && parts[1]) {
    return { id: 'review-record', params: { id: decodeURIComponent(parts[1]) } };
  }
  const id = parts[0] || 'editor';
  const resolved = VIEW_LOADERS[id] ? id : 'editor';
  // Предпросмотр страницы праздника: #/preview/<праздник>.
  if (resolved === 'preview') {
    return { id: 'preview', params: { occasion: decodeURIComponent(parts[1] || '') } };
  }

  // Режим витрины: приложение открылось на стартовом экране (пустой хэш или
  // editor) — сразу показываем визитку с QR, минуя редактор. Явный переход на
  // другой экран (#/editor, #/share) не перехватываем: так владелец выходит из
  // витрины долгим удержанием угла (present уводит на #/share) и попадает в
  // настройки, а не обратно в витрину.
  const atStart = !parts.length || parts[0] === 'editor';
  if (atStart && isOnboarded() && isKioskMode()) {
    return { id: 'present', params: {} };
  }

  // Первый вход — показываем приветствие. Клиента, пришедшего по публичной
  // ссылке, оно не касается: ветка /v/<slug> отработала выше.
  if (resolved === 'editor' && !isOnboarded()) {
    return { id: 'onboarding', params: {} };
  }
  return { id: resolved, params: {} };
}

// Плавающая стеклянная панель вкладок и рядом — главное действие артиста:
// круглая кнопка QR. Достал телефон, нажал, показал — без поиска по меню.
function renderTabbar(activeId) {
  // На публичной визитке таббар не нужен: её смотрит клиент, а не владелец.
  if (activeId === 'card-public') return '';
  return `
    <div class="ca-tabs" role="tablist" aria-label="Разделы приложения">
      ${TABS.map((tab) => `
        <button type="button" role="tab" aria-selected="${tab.id === activeId ? 'true' : 'false'}"
          class="ca-tab${tab.id === activeId ? ' is-active' : ''}" data-tab="${tab.id}">
          ${renderTabIcon(tab.icon, { size: 22 })}
          <span>${tab.label}</span>
        </button>
      `).join('')}
    </div>
    <a class="ca-fab" href="#/present" aria-label="Показать QR-код визитки">
      ${renderIcon('qrcode', { size: 26 })}
    </a>
  `;
}

// Переставляет золотую метку на нужную вкладку, не перерисовывая таббар
// целиком. Вызывается синхронно по клику — до ленивой загрузки экрана,
// поэтому индикатор едет одновременно с нажатием, а не в конце перехода.
function markActiveTab(tabbar, activeId) {
  const buttons = tabbar.querySelectorAll('[data-tab]');
  if (!buttons.length) return;
  buttons.forEach((btn) => {
    const active = btn.dataset.tab === activeId;
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-selected', active ? 'true' : 'false');
  });
}

export function mountApp() {
  const app = document.getElementById('app');
  const tabbar = document.getElementById('tabbar');
  let currentView = null;
  // Номер перехода. Быстрые нажатия запускают route() повторно, пока прошлый
  // ещё ждёт чанк или данные. Без номера опоздавший переход дорисовывал СВОЙ
  // экран поверх нового (редактор затирался «Откликом», таб-бар мог спрятаться
  // на обычной вкладке). Теперь устаревший переход просто прекращается.
  let routeSeq = 0;

  function syncTabbar(id) {
    const chromeless = id === 'card-public' || id === 'onboarding'
      || id === 'present' || id === 'review-record' || id === 'privacy';
    if (chromeless) {
      tabbar.innerHTML = '';
    } else if (!tabbar.querySelector('[data-tab]')) {
      // Таббар пуст (первый заход или возврат с полноэкранного экрана) —
      // рисуем кнопки. Между обычными вкладками разметка одинаковая, поэтому
      // НЕ пересоздаём её: активную метку уже переставил markActiveTab, а
      // повторный innerHTML заново проигрывал бы анимацию полоски.
      tabbar.innerHTML = renderTabbar(id);
    } else {
      markActiveTab(tabbar, id);
    }
    tabbar.hidden = chromeless;
  }

  async function route() {
    const seq = ++routeSeq;
    const isCurrent = () => seq === routeSeq;
    const { id, params } = parseRoute();
    // Метку активной вкладки переставляем ДО ленивой загрузки экрана — тогда
    // при навигации через хэш (кнопки браузера, программный переход)
    // индикатор едет сразу, а не в конце перехода. На уже отрисованном
    // таббаре это мгновенно; на первом заходе он ещё пуст — markActiveTab
    // просто ничего не делает, а полный renderTabbar случится ниже.
    markActiveTab(tabbar, id);
    // Лениво подгружаем код нужного экрана. Оболочка (шапка, фон) уже на
    // месте, предыдущий экран виден те миллисекунды, что грузится чанк.
    try {
      const loader = VIEW_LOADERS[id] || VIEW_LOADERS.editor;
      const view = await loader();
      if (!isCurrent()) return;
      document.body.dataset.route = id;
      if (view.title) {
        document.title = id === 'editor' ? 'Визитка' : `${view.title} · Визитка`;
      } else if (id === 'review-record') {
        document.title = 'Видеоотзыв · Визитка';
      } else if (id !== 'card-public') {
        document.title = 'Визитка';
      }

      // Экран записи держит камеру — её нужно отпустить при уходе.
      if (currentView && currentView !== view && typeof currentView.unmount === 'function') {
        try { await currentView.unmount(); } catch { /* уход не должен ломать переход */ }
      }
      if (!isCurrent()) return;
      currentView = view;

      // Таббар зависит только от маршрута, поэтому рисуем его до mount(): экраны
      // с сетевыми данными («Отклик», «Поделиться») ждут ответа внутри mount, и
      // раньше на холодном старте панель появлялась лишь через секунды.
      syncTabbar(id);
      window.scrollTo(0, 0);

      // render() зовём только для экранов без mount() (статичные вроде privacy).
      if (typeof view.mount === 'function') {
        await view.mount(app, {
          routeId: id,
          params,
          // Экран с сетевыми данными сверяется с этим перед тем, как дорисовать
          // пришедший ответ: человек мог уже уйти на другую вкладку.
          isCurrent,
          // Онбординг завершился — перерисовываем маршрут, а не меняем хэш:
          // хэш и так '#/editor', hashchange бы не сработал.
          onDone: () => route()
        });
      } else {
        app.innerHTML = typeof view.render === 'function' ? view.render() : '';
      }
    } catch (err) {
      console.error('Route error for', id, err);
      if (isCurrent()) {
        syncTabbar(id);
        // Защита от чёрного экрана: если mount или загрузка упала, не оставляем пустой экран
        if (!app.innerHTML) {
          app.innerHTML = `
            <div style="padding: 48px 16px; text-align: center; color: var(--text);">
              <p style="font-size: 16px; margin-bottom: 20px; color: var(--muted);">Не удалось загрузить раздел</p>
              <button type="button" class="ca-tab" style="padding: 12px 24px; border-radius: 12px; background: var(--brand-gold-grad, #d9cbb0); color: #060607; font-weight: 600; border: none; cursor: pointer;" onclick="window.location.reload()">
                Обновить
              </button>
            </div>
          `;
        }
      }
    }
  }

  tabbar.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-tab]');
    if (!btn) return;
    // Метку переставляем сразу по клику — не дожидаясь, пока догрузится чанк
    // экрана и данные. Иначе индикатор «прыгал» уже после перехода.
    markActiveTab(tabbar, btn.dataset.tab);
    window.location.hash = `#/${btn.dataset.tab}`;
  });

  window.addEventListener('hashchange', route);
  route();

  // Пока человек смотрит на первый экран, в фоне подгружаем код остальных
  // вкладок. Тогда переключение — мгновенное: чанк уже в памяти, import()
  // не идёт за ним по сети. Делаем в простое, чтобы не мешать первому экрану.
  prefetchTabs();
}

// Тихо прогревает чанки вкладок в фоне. Ошибки глушим: префетч — ускорение,
// а не обязанность; если чанк не догрузился, обычный import() возьмёт его.
function prefetchTabs() {
  const warm = () => {
    ['editor', 'share', 'insight', 'preview'].forEach((id) => {
      VIEW_LOADERS[id]?.().catch(() => { /* префетч не критичен */ });
    });
  };
  if ('requestIdleCallback' in window) {
    requestIdleCallback(warm, { timeout: 2000 });
  } else {
    setTimeout(warm, 800);
  }
}
