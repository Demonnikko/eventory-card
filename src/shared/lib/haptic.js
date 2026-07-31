// Native iOS haptics are loaded only inside the Capacitor app. The PWA keeps
// the existing Vibration API fallback and never depends on a native bridge.

let nativeHapticsPromise = null;

function isNativePlatform() {
  try {
    return globalThis.Capacitor?.isNativePlatform?.() === true;
  } catch {
    return false;
  }
}

function safeVibrate(pattern) {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(pattern);
    }
  } catch { /* noop */ }
}

function runHaptic(nativeEffect, webPattern) {
  if (!isNativePlatform()) {
    safeVibrate(webPattern);
    return;
  }

  nativeHapticsPromise ??= import('@capacitor/haptics');
  void nativeHapticsPromise
    .then(nativeEffect)
    .catch(() => safeVibrate(webPattern));
}

export function hapticLight() {
  runHaptic(
    ({ Haptics, ImpactStyle }) => Haptics.impact({ style: ImpactStyle.Light }),
    8
  );
}

export function hapticMedium() {
  runHaptic(
    ({ Haptics, ImpactStyle }) => Haptics.impact({ style: ImpactStyle.Medium }),
    14
  );
}

export function hapticHeavy() {
  runHaptic(
    ({ Haptics, ImpactStyle }) => Haptics.impact({ style: ImpactStyle.Heavy }),
    22
  );
}

export function hapticSuccess() {
  runHaptic(
    ({ Haptics, NotificationType }) => Haptics.notification({ type: NotificationType.Success }),
    [10, 40, 10]
  );
}

export function hapticWarning() {
  runHaptic(
    ({ Haptics, NotificationType }) => Haptics.notification({ type: NotificationType.Warning }),
    [16, 60, 16]
  );
}

export function hapticError() {
  runHaptic(
    ({ Haptics, NotificationType }) => Haptics.notification({ type: NotificationType.Error }),
    [12, 60, 12, 60, 12]
  );
}
