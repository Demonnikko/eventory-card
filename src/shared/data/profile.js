
const PROFILE_ID = 'profile';

export function defaultProfile() {
  return {
    id: PROFILE_ID,
    name: '',
    stageName: '',
    phone: '',
    telegram: '',
    vk: '',
    signature: '',
    prepayDetails: '',
    cardBrand: '', // Pro: свой текст в подвале карточки КП вместо «Создано в Eventory»
    // Авто для расчёта бензина на выезд (новый калькулятор). 0 = не задано.
    fuelConsumption: 0, // расход, л/100км
    fuelPrice: 0        // цена топлива, ₽/л
  };
}



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

export function telegramLabel(raw) {
  const href = normalizeTelegram(raw);
  if (!href) return '';
  return '@' + href.replace(/^https?:\/\/t\.me\//, '');
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

export function vkLabel(raw) {
  const href = normalizeVk(raw);
  if (!href) return '';
  return 'vk.com/' + href.replace(/^https?:\/\/vk\.com\//, '');
}
