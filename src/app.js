// Роутер и оболочка PWA-визитки.
// Экранов немного, поэтому вместо общего роутера CRM здесь свой минимальный.
import { editor } from './editor.js';
import { share } from './share.js';
import { preview } from './preview.js';
import { publicCard } from './public-card.js';
import { onboarding, isOnboarded } from './onboarding.js';
import { present } from './present.js';
import { reviewRecord } from './review-record.js';
import { insight } from './insight.js';
import { privacy } from './privacy.js';
import { renderIcon } from './shared/components/icons.js';

const TABS = [
  { id: 'editor', label: 'Визитка', icon: 'edit' },
  { id: 'share', label: 'Поделиться', icon: 'share' },
  { id: 'insight', label: 'Отклик', icon: 'pulse' },
  { id: 'preview', label: 'Просмотр', icon: 'eye' }
];

const VIEWS = {
  editor,
  share,
  preview,
  insight,
  privacy,
  onboarding,
  present,
  'review-record': reviewRecord,
  'card-public': publicCard
};

function parseRoute() {
  // Публичная ссылка — чистый путь /v/<slug>: её открывают из мессенджера и
  // сканируют с QR, поэтому хэш в ней недопустим. SPA-fallback отдаёт
  // index.html, а маршрут разбираем здесь.
  const pathParts = window.location.pathname.split('/').filter(Boolean);
  if (pathParts[0] === 'v' && pathParts[1]) {
    return { id: 'card-public', params: { id: decodeURIComponent(pathParts[1]) } };
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
    return { id: 'card-public', params: { id: decodeURIComponent(parts[1]) } };
  }
  if (parts[0] === 'r' && parts[1]) {
    return { id: 'review-record', params: { id: decodeURIComponent(parts[1]) } };
  }
  const id = parts[0] || 'editor';
  const resolved = VIEWS[id] ? id : 'editor';

  // Первый вход — показываем приветствие. Клиента, пришедшего по публичной
  // ссылке, оно не касается: ветка /v/<slug> отработала выше.
  if (resolved === 'editor' && !isOnboarded()) {
    return { id: 'onboarding', params: {} };
  }
  return { id: resolved, params: {} };
}

function renderTabbar(activeId) {
  // На публичной визитке таббар не нужен: её смотрит клиент, а не владелец.
  if (activeId === 'card-public') return '';
  return TABS.map((tab) => `
    <button type="button" role="tab" aria-selected="${tab.id === activeId ? 'true' : 'false'}"
      class="ca-tab${tab.id === activeId ? ' is-active' : ''}" data-tab="${tab.id}">
      ${renderIcon(tab.icon)}
      <span>${tab.label}</span>
    </button>
  `).join('');
}

export function mountApp() {
  const app = document.getElementById('app');
  const tabbar = document.getElementById('tabbar');
  let currentView = null;

  async function route() {
    const { id, params } = parseRoute();
    const view = VIEWS[id];
    document.body.dataset.route = id;
    if (view.title) {
      document.title = id === 'editor' ? 'Визитка' : `${view.title} — Визитка`;
    } else if (id === 'review-record') {
      document.title = 'Видеоотзыв — Визитка';
    } else if (id !== 'card-public') {
      document.title = 'Визитка';
    }

    // Экран записи держит камеру — её нужно отпустить при уходе.
    if (currentView && currentView !== view && typeof currentView.unmount === 'function') {
      try { await currentView.unmount(); } catch { /* уход не должен ломать переход */ }
    }
    currentView = view;

    app.innerHTML = typeof view.render === 'function' ? view.render() : '';
    if (typeof view.mount === 'function') {
      await view.mount(app, {
        routeId: id,
        params,
        // Онбординг завершился — перерисовываем маршрут, а не меняем хэш:
        // хэш и так '#/editor', hashchange бы не сработал.
        onDone: () => route()
      });
    }

    // Проявление — только здесь, на смене маршрута. Класс висит на #app и
    // снимается по окончании анимации, поэтому внутренние перерисовки экранов
    // (editor rerender, обновление превью) уже ничего не запускают и не мигают.
    app.classList.remove('ca-screen-enter');
    void app.offsetWidth; // рестарт анимации, если маршруты сменились быстро
    app.classList.add('ca-screen-enter');
    const clearEnter = () => app.classList.remove('ca-screen-enter');
    app.addEventListener('animationend', clearEnter, { once: true });
    setTimeout(clearEnter, 600); // страховка, если animationend не придёт

    const chromeless = id === 'card-public' || id === 'onboarding'
      || id === 'present' || id === 'review-record' || id === 'privacy';
    tabbar.innerHTML = chromeless ? '' : renderTabbar(id);
    tabbar.hidden = chromeless;
    window.scrollTo(0, 0);
  }

  tabbar.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-tab]');
    if (!btn) return;
    window.location.hash = `#/${btn.dataset.tab}`;
  });

  window.addEventListener('hashchange', route);
  route();
}
