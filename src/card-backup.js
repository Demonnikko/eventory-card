// Зашифрованная резервная копия визитки.
//
// Внутри лежит leadKey — ключ владельца опубликованной карточки. Поэтому
// обычный JSON небезопасен: тот, кто получил файл, мог бы управлять отзывами
// и аналитикой. Шифруем весь снимок AES-GCM, ключ выводим из пароля через
// PBKDF2. Формат версионирован, чтобы будущие версии можно было мигрировать.
import { normalizeBusinessCard } from './card-data.js';

export const BACKUP_TYPE = 'eventory-card-backup';
export const BACKUP_VERSION = 2;
export const BACKUP_MAX_BYTES = 2 * 1024 * 1024;
const PBKDF2_ITERATIONS = 210000;

function requireCrypto() {
  if (!globalThis.crypto?.subtle || !globalThis.crypto?.getRandomValues) {
    throw new Error('crypto_unavailable');
  }
  return globalThis.crypto;
}

function toBase64(bytes) {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function fromBase64(value) {
  try {
    const binary = atob(String(value || ''));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    throw new Error('backup_invalid');
  }
}

async function deriveKey(password, salt, iterations) {
  const cryptoApi = requireCrypto();
  const material = await cryptoApi.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return cryptoApi.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

function validatePassword(password) {
  const value = String(password || '');
  if (value.length < 8) throw new Error('password_short');
  return value;
}

export async function createEncryptedBackup(card, password) {
  const cryptoApi = requireCrypto();
  const passphrase = validatePassword(password);
  const salt = cryptoApi.getRandomValues(new Uint8Array(16));
  const iv = cryptoApi.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt, PBKDF2_ITERATIONS);
  const payload = JSON.stringify({
    type: BACKUP_TYPE,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    card: normalizeBusinessCard(card)
  });
  const encrypted = await cryptoApi.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(payload)
  );
  return JSON.stringify({
    type: BACKUP_TYPE,
    version: BACKUP_VERSION,
    cipher: 'AES-GCM',
    kdf: 'PBKDF2-SHA256',
    iterations: PBKDF2_ITERATIONS,
    salt: toBase64(salt),
    iv: toBase64(iv),
    data: toBase64(new Uint8Array(encrypted))
  });
}

export async function restoreEncryptedBackup(raw, password) {
  const passphrase = validatePassword(password);
  const text = String(raw || '');
  if (!text || new TextEncoder().encode(text).byteLength > BACKUP_MAX_BYTES) {
    throw new Error('backup_too_large');
  }

  let wrapper;
  try {
    wrapper = JSON.parse(text);
  } catch {
    throw new Error('backup_invalid');
  }
  if (wrapper?.type !== BACKUP_TYPE || wrapper?.version !== BACKUP_VERSION
    || wrapper?.cipher !== 'AES-GCM' || wrapper?.kdf !== 'PBKDF2-SHA256') {
    throw new Error('backup_invalid');
  }
  const iterations = Number(wrapper.iterations);
  if (!Number.isInteger(iterations) || iterations < 100000 || iterations > 1000000) {
    throw new Error('backup_invalid');
  }

  try {
    const salt = fromBase64(wrapper.salt);
    const iv = fromBase64(wrapper.iv);
    const encrypted = fromBase64(wrapper.data);
    if (salt.length !== 16 || iv.length !== 12 || !encrypted.length) throw new Error('backup_invalid');
    const key = await deriveKey(passphrase, salt, iterations);
    const decrypted = await requireCrypto().subtle.decrypt({ name: 'AES-GCM', iv }, key, encrypted);
    const payload = JSON.parse(new TextDecoder().decode(decrypted));
    if (payload?.type !== BACKUP_TYPE || payload?.version !== BACKUP_VERSION || !payload?.card) {
      throw new Error('backup_invalid');
    }
    return normalizeBusinessCard(payload.card);
  } catch (err) {
    if (err?.message === 'backup_invalid') throw err;
    throw new Error('backup_password');
  }
}

export function downloadBackupFile(contents, cardName = '') {
  const blob = new Blob([contents], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const safeName = String(cardName || 'vizitka')
    .trim().toLowerCase().replace(/[^a-zа-яё0-9_-]+/gi, '-').replace(/^-+|-+$/g, '') || 'vizitka';
  a.href = url;
  a.download = `${safeName}.eventory-card`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(url);
  }, 1000);
}
