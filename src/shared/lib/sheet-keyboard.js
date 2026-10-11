// Нижняя шторка с полями ввода и экранная клавиатура iPhone.
//
// Safari на iOS не подстраивает фиксированные слои под клавиатуру. Без этого
// модуля шторка оставалась внизу «полного» экрана, а если поле стояло там,
// где появится клавиатура, Safari сдвигал весь экран вверх: шторка уезжала,
// а под ней показывалась визитка.
//
// Что делаем:
// 1. Поднимаем шторку к краю видимой части экрана (--dr-lift) и ограничиваем
//    её высоту (--dr-visible) — по visualViewport.
// 2. Не даём Safari сдвигать экран при фокусе: на мгновение уводим поле за
//    верх экрана, и Safari решает, что прокручивать нечего (приём из
//    react-aria, usePreventScroll). Поле в видимую часть шторки прокручиваем
//    сами — внутри шторки, не трогая страницу.

// -webkit-touch-callout поддерживает только Safari на iOS.
const IS_IOS = typeof CSS !== 'undefined' && CSS.supports?.('-webkit-touch-callout', 'none');
const TEXT_TYPES = new Set(['text', 'tel', 'email', 'search', 'url', 'number', 'password']);
const OFFSCREEN = 'translateY(-2000px)';
const MARGIN = 16;
// Сдвиг пальца, после которого касание считается прокруткой, а не нажатием.
const TAP_SLOP = 10;

function opensKeyboard(el) {
  return el instanceof HTMLInputElement && TEXT_TYPES.has(el.type) && !el.readOnly && !el.disabled;
}

// overlay — фиксированный слой шторки, scroller — её прокручиваемое тело.
// Возвращает функцию, которая снимает все обработчики.
export function fitSheetToKeyboard(overlay, scroller) {
  const viewport = window.visualViewport;
  if (!viewport) return () => {};

  function revealFocused() {
    const el = document.activeElement;
    if (!opensKeyboard(el) || !scroller.contains(el)) return;
    const box = scroller.getBoundingClientRect();
    const rect = el.getBoundingClientRect();
    if (rect.bottom > box.bottom - MARGIN) scroller.scrollTop += rect.bottom - box.bottom + MARGIN;
    else if (rect.top < box.top + MARGIN) scroller.scrollTop -= box.top + MARGIN - rect.top;
  }

  function fit() {
    const layoutHeight = document.documentElement.clientHeight;
    const lift = Math.max(0, layoutHeight - viewport.offsetTop - viewport.height);
    overlay.style.setProperty('--dr-lift', `${Math.round(lift)}px`);
    overlay.style.setProperty('--dr-visible', `${Math.round(viewport.height)}px`);
    requestAnimationFrame(revealFocused);
  }

  // Касание поля: фокус ставим сами, пока поле «за экраном». Если палец
  // двигался — это прокрутка шторки, а не нажатие: поле не трогаем.
  let touchStart = null;
  function onTouchStart(event) {
    const touch = event.touches[0];
    touchStart = touch ? { x: touch.clientX, y: touch.clientY } : null;
  }
  function wasTap(event) {
    const touch = event.changedTouches[0];
    if (!touch || !touchStart) return false;
    return Math.hypot(touch.clientX - touchStart.x, touch.clientY - touchStart.y) < TAP_SLOP;
  }
  function onTouchEnd(event) {
    const el = event.target;
    if (!opensKeyboard(el) || el === document.activeElement || !wasTap(event)) return;
    event.preventDefault();
    el.style.transform = OFFSCREEN;
    el.focus();
    requestAnimationFrame(() => { el.style.transform = ''; });
  }

  // Переход стрелками над клавиатурой: здесь достаточно сдвига в момент фокуса.
  function onFocusIn(event) {
    const el = event.target;
    if (!opensKeyboard(el)) return;
    el.style.transform = OFFSCREEN;
    requestAnimationFrame(() => {
      el.style.transform = '';
      requestAnimationFrame(revealFocused);
    });
  }

  fit();
  viewport.addEventListener('resize', fit);
  viewport.addEventListener('scroll', fit);
  if (IS_IOS) {
    overlay.addEventListener('touchstart', onTouchStart, { passive: true });
    overlay.addEventListener('touchend', onTouchEnd, { passive: false });
    overlay.addEventListener('focusin', onFocusIn);
  }

  return () => {
    viewport.removeEventListener('resize', fit);
    viewport.removeEventListener('scroll', fit);
    overlay.removeEventListener('touchstart', onTouchStart);
    overlay.removeEventListener('touchend', onTouchEnd);
    overlay.removeEventListener('focusin', onFocusIn);
  };
}
