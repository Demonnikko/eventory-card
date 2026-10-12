export function normalizePhone(raw) {
  const v = String(raw ?? '').trim();
  if (!v) return '';
  const digits = v.replace(/[^\d+]/g, '');
  if (!digits) return '';
  if (digits.startsWith('+')) return digits;
  if (digits.startsWith('8') && digits.length === 11) return '+7' + digits.slice(1);
  if (digits.startsWith('7') && digits.length === 11) return '+' + digits;
  return '+' + digits;
}

export function phoneHref(raw) {
  const n = normalizePhone(raw);
  return n ? `tel:${n}` : '';
}

export function normalizeTelegram(raw) {
  let v = String(raw ?? '').trim();
  if (!v) return '';
  v = v.replace(/^https?:\/\//i, '').replace(/^www\./i, '');
  v = v.replace(/^t\.me\//i, '').replace(/^telegram\.me\//i, '');
  v = v.replace(/^@/, '');
  v = v.replace(/\/+$/, '');
  if (!v) return '';
  return `https://t.me/${v}`;
}

export function normalizeVk(raw) {
  let v = String(raw ?? '').trim();
  if (!v) return '';
  v = v.replace(/^https?:\/\//i, '').replace(/^www\./i, '');
  v = v.replace(/^vk\.com\//i, '').replace(/^m\.vk\.com\//i, '');
  v = v.replace(/^@/, '');
  v = v.replace(/\/+$/, '');
  if (!v) return '';
  return `https://vk.com/${v}`;
}

// MAX — российский мессенджер. Профиль: max.ru/u/<username>. Принимаем
// полную ссылку, домен без протокола и голый username.
export function normalizeMax(raw) {
  let v = String(raw ?? '').trim();
  if (!v) return '';
  v = v.replace(/^https?:\/\//i, '').replace(/^www\./i, '');
  v = v.replace(/^max\.ru\/(u\/)?/i, '');
  v = v.replace(/^@/, '');
  v = v.replace(/\/+$/, '');
  if (!v) return '';
  return `https://max.ru/u/${v}`;
}

export function vkLabel(raw) {
  const href = normalizeVk(raw);
  if (!href) return '';
  return 'vk.com/' + href.replace(/^https?:\/\/vk\.com\//, '');
}
