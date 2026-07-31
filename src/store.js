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
    let req;
    try {
      req = indexedDB.open(DB_NAME, SCHEMA_VERSION);
    } catch (err) {
      reject(err);
      return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('idb_blocked'));
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
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return memory().get(id) || null;
  }
}

export async function putRecord(value) {
  try {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(value);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
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
