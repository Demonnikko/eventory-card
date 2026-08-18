import { cardDeviceId } from './shared/data/businessCard.js';

// Приём партнёрской ссылки визитки: ?ref=<leadKey пригласившего>. При открытии
// визитки фиксируем на сервере «это устройство приглашено кодом» (один раз, NX
// на сервере). Когда артист опубликует свою визитку — приглашение засчитается
// пригласившему, и при 3 приглашённых тот получит месяц Pro.
//
// Идёт через основной проект (там вся логика партнёрки и мост к Pro): визитка
// шлёт leadKey пригласившего + свой deviceId.
export function captureReferralFromUrl() {
  let ref = '';
  try {
    ref = new URLSearchParams(window.location.search).get('ref') || '';
  } catch { /* нет доступа к URL — не критично */ }
  const inviter = String(ref || '').trim().toLowerCase();
  if (!/^[a-f0-9]{32}$/.test(inviter)) return;

  const deviceId = cardDeviceId();
  if (!deviceId) return;

  // Фоново: сбой сети не важен, приглашение попробуем зарегистрировать снова
  // при следующем заходе по ссылке (NX на сервере не даст задвоить).
  fetch('https://eventory-mvp.vercel.app/api/promo?service=referral-card&action=invited', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deviceId, inviter })
  }).catch(() => { /* best-effort */ });
}
