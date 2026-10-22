// Обновление приложения — так же, как в Eventory.
//
// Раньше визитка обновлялась через механизм Service Worker: скачай новый
// воркер, дождись установки, переключи. На iPhone он застревает: телефон
// скачивает новый sw.js и молча не ставит его, а кнопка «Обновить» вечно
// «проверяет». Теперь один простой путь, от iOS не зависящий:
//   1. Сверяем свою версию с /version.json сервера (при открытии, при
//      возврате в приложение, при появлении сети и раз в 30 минут).
//   2. Версия другая — показываем плашку «Доступна новая версия».
//   3. «Обновить» — удаляем Service Worker и весь кэш и перезагружаемся с
//      меткой в адресе: браузер обязан взять свежий код с сервера.
// Service Worker остаётся только ради работы без интернета.
import { toast } from './shared/components/toast.js';
import { APP_VERSION } from './app-version.js';

const CHECK_INTERVAL = 30 * 60 * 1000;
const FIRST_CHECK_DELAY = 2000;

let checking = false;
let updating = false;

function ui() {
  return {
    banner: document.querySelector('[data-pwa-update-banner]'),
    action: document.querySelector('[data-pwa-update-action]'),
    status: document.querySelector('[data-pwa-update-status]')
  };
}

// { version } с сервера или null, если проверить нельзя (нет сети и т.п.).
async function fetchServerVersion() {
  try {
    const res = await fetch(`/version.json?t=${Date.now()}`, {
      cache: 'no-store',
      headers: { Accept: 'application/json' }
    });
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    return data?.version ? String(data.version) : null;
  } catch {
    return null;
  }
}

function showBanner() {
  const { banner, status, action } = ui();
  if (status) status.textContent = 'Доступна новая версия визитки';
  if (action) {
    action.disabled = false;
    action.textContent = 'Обновить';
  }
  if (banner) banner.hidden = false;
}

export async function checkForUpdate() {
  if (checking || updating) return false;
  checking = true;
  try {
    const version = await fetchServerVersion();
    const available = Boolean(version) && version !== APP_VERSION;
    if (available) showBanner();
    return available;
  } finally {
    checking = false;
  }
}

export async function performUpdate() {
  if (updating) return;
  updating = true;
  const { action, status } = ui();
  if (action) {
    action.disabled = true;
    action.textContent = 'Обновляем…';
  }
  if (status) status.textContent = 'Загружаем новую версию…';

  // 1. Старый Service Worker больше не отдаёт файлы из кэша.
  try {
    const registrations = await navigator.serviceWorker?.getRegistrations?.() || [];
    await Promise.all(registrations.map((registration) => registration.unregister()));
  } catch { /* нет Service Worker — и не нужно */ }

  // 2. Кэш приложения целиком: даже если воркер что-то оставил.
  // Визитка, фото и ключ лежат в IndexedDB и localStorage — их это не трогает.
  try {
    if (typeof caches !== 'undefined') {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }
  } catch { /* кэша нет */ }

  // 3. Перезагрузка с меткой: браузер обязан забрать свежий index.html.
  try {
    const url = new URL(window.location.href);
    url.searchParams.set('_v', String(Date.now()));
    window.location.replace(url.toString());
  } catch {
    window.location.reload();
  }
}

function registerOfflineWorker() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' })
    .catch((error) => {
      // Старые Safari не знали updateViaCache — повторяем без него.
      if (error instanceof TypeError) return navigator.serviceWorker.register('/sw.js');
      return null;
    })
    .catch(() => { /* без Service Worker приложение просто не работает офлайн */ });
}

// Метку _v после обновления убираем из адреса, чтобы она не попадала в
// закладки и ссылки.
function cleanUpdateMark() {
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has('_v')) return;
    url.searchParams.delete('_v');
    window.history.replaceState(window.history.state, '', url.toString());
  } catch { /* не критично */ }
}

export function initPwaUpdates() {
  if (typeof window === 'undefined') return;
  cleanUpdateMark();
  registerOfflineWorker();

  ui().action?.addEventListener('click', () => {
    performUpdate().catch(() => {
      updating = false;
      toast.show('Не удалось обновить. Закройте и откройте приложение', { error: true });
    });
  });

  const check = () => { checkForUpdate().catch(() => {}); };
  setTimeout(check, FIRST_CHECK_DELAY);
  setInterval(check, CHECK_INTERVAL);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') check();
  });
  window.addEventListener('online', check, { passive: true });
}
