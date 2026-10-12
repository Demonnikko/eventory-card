// Отдельное хранилище PWA-визитки.
//
// ВАЖНО: база НЕ пересекается с базой основного приложения ('eventory').
// Визитка — самостоятельный продукт на своём домене, её данные не должны
// ни читать, ни перезаписывать данные CRM. Своя база = ноль риска для
// пользователя, у которого установлены оба приложения.
const DB_NAME = 'eventory-card';
const SCHEMA_VERSION = 1; // НИКОГДА не понижать: IndexedDB не откроет базу
const STORE = 'settings';

let dbPromise = null;
let memoryFallback = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    // В iOS WebKit (standalone PWA) indexedDB.open на холодном старте может
    // зависать в pending без вызова onerror/onsuccess. Таймаут 800мс предотвращает
    // вечный чёрный экран и переводит приложение на резервное хранилище (localStorage).
    let timer = setTimeout(() => {
      dbPromise = null;
      reject(new Error('idb_timeout'));
    }, 800);

    let req;
    try {
      req = indexedDB.open(DB_NAME, SCHEMA_VERSION);
    } catch (err) {
      clearTimeout(timer);
      dbPromise = null;
      reject(err);
      return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => {
      clearTimeout(timer);
      resolve(req.result);
    };
    req.onerror = () => {
      clearTimeout(timer);
      dbPromise = null;
      reject(req.error);
    };
    req.onblocked = () => {
      clearTimeout(timer);
      dbPromise = null;
      reject(new Error('idb_blocked'));
    };
  });
  return dbPromise;
}

// Приватный режим Safari и часть встроенных браузеров блокируют IndexedDB.
// Визитка обязана работать и там — иначе пользователь теряет карточку прямо
// во время редактирования. Падаем в память, чтобы сессия не ломалась.
function memory() {
  if (!memoryFallback) memoryFallback = new Map();
  return memoryFallback;
}

export async function getRecord(id) {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('idb_tx_timeout')), 800);
      try {
        const tx = db.transaction(STORE, 'readonly');
        const req = tx.objectStore(STORE).get(id);
        req.onsuccess = () => {
          clearTimeout(timer);
          resolve(req.result || null);
        };
        req.onerror = () => {
          clearTimeout(timer);
          reject(req.error);
        };
      } catch (err) {
        clearTimeout(timer);
        reject(err);
      }
    });
  } catch {
    return memory().get(id) || null;
  }
}

export async function putRecord(value) {
  try {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('idb_tx_timeout')), 1000);
      try {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(value);
        tx.oncomplete = () => {
          clearTimeout(timer);
          resolve();
        };
        tx.onerror = () => {
          clearTimeout(timer);
          reject(tx.error);
        };
        tx.onabort = () => {
          clearTimeout(timer);
          reject(tx.error);
        };
      } catch (err) {
        clearTimeout(timer);
        reject(err);
      }
    });
    return value;
  } catch {
    memory().set(value.id, value);
    return value;
  }
}

// Резервная копия в localStorage: IndexedDB на iOS может быть вычищена
// системой при нехватке места. Карточка маленькая, дублировать её дёшево.
const MIRROR_KEY = 'eventory-card:mirror';

export function mirrorSave(card) {
  try {
    localStorage.setItem(MIRROR_KEY, JSON.stringify(card));
  } catch { /* переполнение квоты не должно ломать сохранение */ }
}

export function mirrorRead() {
  try {
    const raw = localStorage.getItem(MIRROR_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
