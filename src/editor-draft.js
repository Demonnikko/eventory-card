// Надёжное автосохранение редактора.
//
// Черновик обновляется синхронно на каждый ввод, а запись в IndexedDB идёт
// с небольшой задержкой и строго по очереди. Поэтому переход между полями
// или экранами не отменяет предыдущее значение и более старая запись не
// может затереть новую.
import { normalizeBusinessCard } from './card-data.js';

export function createCardDraft(initialCard, { save, delay = 350 } = {}) {
  if (typeof save !== 'function') throw new TypeError('save is required');

  let card = normalizeBusinessCard(initialCard);
  let timer = null;
  let queue = Promise.resolve();

  function update(patch = {}) {
    card = normalizeBusinessCard({ ...card, ...patch });
    return card;
  }

  function enqueue(snapshot) {
    // Ошибка одной записи не должна навсегда блокировать очередь. При этом
    // вызывающий persist/flush всё равно получает ошибку текущей операции.
    queue = queue.catch(() => {}).then(() => save(snapshot));
    return queue;
  }

  function clearTimer() {
    if (!timer) return false;
    clearTimeout(timer);
    timer = null;
    return true;
  }

  function schedule(patch) {
    update(patch);
    clearTimer();
    timer = setTimeout(() => {
      timer = null;
      const snapshot = card;
      enqueue(snapshot).catch(() => {
        // Редактор остаётся рабочим; явная запись при смене экрана повторит
        // попытку и уже сможет показать ошибку вызывающему коду.
      });
    }, delay);
    return card;
  }

  async function persist(patch = {}) {
    update(patch);
    clearTimer();
    const snapshot = card;
    await enqueue(snapshot);
    return card;
  }

  async function flush() {
    if (clearTimer()) {
      const snapshot = card;
      await enqueue(snapshot);
    } else {
      try {
        await queue;
      } catch {
        // Фоновая запись могла упасть без уведомления (например, Safari
        // временно заблокировал IndexedDB). Явный flush повторяет актуальный
        // снимок, а не оставляет черновик несохранённым.
        await enqueue(card);
      }
    }
    return card;
  }

  return {
    get card() { return card; },
    schedule,
    persist,
    flush
  };
}
