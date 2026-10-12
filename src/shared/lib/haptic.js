// Веб-вибрация. Копия основного haptic.js без нативной iOS-ветки —
// у визитки нет и не будет Capacitor-обёртки.
function safeVibrate(pattern) {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(pattern);
    }
  } catch { /* noop */ }
}

export function hapticLight() { safeVibrate(8); }
export function hapticSuccess() { safeVibrate([10, 40, 10]); }
export function hapticError() { safeVibrate([12, 60, 12, 60, 12]); }
