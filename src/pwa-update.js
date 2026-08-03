import { toast } from './shared/components/toast.js';
import { APP_VERSION } from './app-version.js';

const CHECK_INTERVAL = 30 * 60 * 1000;
const INSTALL_TIMEOUT = 12000;

let registrationPromise = null;
let watchedRegistration = null;
let waitingWorker = null;
let lastCheckAt = 0;
let reloadRequested = false;
let reloading = false;

function ui() {
  return {
    control: document.querySelector('[data-pwa-update-control]'),
    banner: document.querySelector('[data-pwa-update-banner]'),
    action: document.querySelector('[data-pwa-update-action]'),
    status: document.querySelector('[data-pwa-update-status]')
  };
}

function setChecking(checking) {
  const { control, action } = ui();
  if (control) {
    control.disabled = checking;
    control.textContent = checking ? 'Проверяем…' : 'Обновить';
  }
  if (action) {
    action.disabled = checking;
    action.textContent = checking ? 'Обновляем…' : 'Обновить';
  }
}

function showAvailable(worker = null) {
  waitingWorker = worker || watchedRegistration?.waiting || waitingWorker;
  const { banner, status, control } = ui();
  if (banner) banner.hidden = false;
  if (status) status.textContent = 'Доступна новая версия визитки';
  if (control) {
    control.hidden = false;
    control.classList.add('has-update');
    control.textContent = 'Обновить';
  }
  window.dispatchEvent(new CustomEvent('eventory:pwa-update-available', {
    detail: { version: APP_VERSION }
  }));
}

function hideAvailable() {
  const { banner, control } = ui();
  if (banner) banner.hidden = true;
  if (control) control.classList.remove('has-update');
}

function waitForInstalled(worker) {
  if (!worker || ['installed', 'activated', 'redundant'].includes(worker.state)) {
    return Promise.resolve(worker?.state || 'missing');
  }
  return new Promise((resolve) => {
    let timer = 0;
    const done = () => {
      clearTimeout(timer);
      worker.removeEventListener('statechange', onState);
      resolve(worker.state);
    };
    const onState = () => {
      if (['installed', 'activated', 'redundant'].includes(worker.state)) done();
    };
    worker.addEventListener('statechange', onState);
    timer = setTimeout(done, INSTALL_TIMEOUT);
  });
}

function watchRegistration(registration) {
  if (!registration || watchedRegistration === registration) return;
  watchedRegistration = registration;

  if (registration.waiting && navigator.serviceWorker.controller) {
    showAvailable(registration.waiting);
  }

  registration.addEventListener('updatefound', () => {
    const worker = registration.installing;
    if (!worker) return;
    worker.addEventListener('statechange', () => {
      if (worker.state === 'installed' && navigator.serviceWorker.controller) {
        showAvailable(registration.waiting || worker);
      }
    });
  });
}

export function pwaUpdatesSupported() {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator;
}

export async function registerPwaUpdates() {
  if (!pwaUpdatesSupported()) throw new Error('pwa_unsupported');
  if (!registrationPromise) {
    registrationPromise = navigator.serviceWorker.register('/sw.js', {
      updateViaCache: 'none'
    }).catch((error) => {
      // Старые версии Safari не знали updateViaCache. В этом случае сама
      // регистрация всё равно работает, поэтому повторяем без новой опции.
      if (error instanceof TypeError) return navigator.serviceWorker.register('/sw.js');
      throw error;
    }).then((registration) => {
      watchRegistration(registration);
      const { control } = ui();
      if (control) {
        control.hidden = false;
        control.title = `Версия ${APP_VERSION}. Проверить обновление`;
      }
      return registration;
    }).catch((error) => {
      registrationPromise = null;
      throw error;
    });
  }
  return registrationPromise;
}

export async function checkForPwaUpdate({ silent = false } = {}) {
  const registration = await registerPwaUpdates();
  if (registration.waiting && navigator.serviceWorker.controller) {
    showAvailable(registration.waiting);
    return { available: true };
  }
  if (!navigator.onLine) throw new Error('offline');

  setChecking(true);
  let foundWorker = null;
  const onUpdateFound = () => { foundWorker = registration.installing; };
  registration.addEventListener('updatefound', onUpdateFound);
  try {
    lastCheckAt = Date.now();
    await registration.update();
    foundWorker = foundWorker || registration.installing;
    if (foundWorker) await waitForInstalled(foundWorker);
    const worker = registration.waiting
      || (foundWorker?.state === 'installed' ? foundWorker : null);
    if (worker && navigator.serviceWorker.controller) {
      showAvailable(worker);
      return { available: true };
    }
    if (!silent) toast.show('Установлена последняя версия', { ok: true });
    return { available: false };
  } finally {
    registration.removeEventListener('updatefound', onUpdateFound);
    setChecking(false);
  }
}

export async function applyPwaUpdate() {
  const registration = await registerPwaUpdates();
  const result = registration.waiting || waitingWorker
    ? { available: true }
    : await checkForPwaUpdate();
  const worker = registration.waiting || waitingWorker;
  if (!result.available || !worker) return false;

  reloadRequested = true;
  setChecking(true);
  const { status } = ui();
  if (status) status.textContent = 'Устанавливаем обновление…';
  worker.postMessage({ type: 'SKIP_WAITING' });
  return true;
}

function bindUpdateUi() {
  const { control, action } = ui();
  const run = async () => {
    try {
      if (waitingWorker || watchedRegistration?.waiting) await applyPwaUpdate();
      else {
        const result = await checkForPwaUpdate();
        if (result.available) await applyPwaUpdate();
      }
    } catch (error) {
      setChecking(false);
      toast.show(error?.message === 'offline'
        ? 'Для обновления нужен интернет'
        : 'Не удалось проверить обновление', { error: true });
    }
  };
  control?.addEventListener('click', run);
  action?.addEventListener('click', run);
}

export function initPwaUpdates() {
  if (!pwaUpdatesSupported()) return;
  bindUpdateUi();

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!reloadRequested || reloading) return;
    reloading = true;
    hideAvailable();
    window.location.reload();
  });

  registerPwaUpdates()
    .then(() => checkForPwaUpdate({ silent: true }))
    .catch(() => { /* PWA остаётся рабочей и без Service Worker */ });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (Date.now() - lastCheckAt < CHECK_INTERVAL) return;
    checkForPwaUpdate({ silent: true }).catch(() => {});
  });
}
