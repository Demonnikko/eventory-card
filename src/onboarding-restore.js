// «У меня уже есть визитка» на первом экране. Новый телефон или приложение
// переустановили: человек вводит адрес визитки, получает код в Telegram, куда
// приходят заявки, и визитка возвращается целиком — с сервера, вместе с
// доступом к заявкам и отзывам. Без файлов и паролей.
import { escapeAttr } from './shared/lib/html.js';
import { toast } from './shared/components/toast.js';
import { adoptPublishedCard } from './card-data.js';
import { RESTORE_ERRORS, openRestoreBot, redeemRestoreCode } from './editor-restore.js';

// Человек уходит в Telegram за кодом, и iPhone может выгрузить приложение.
// Запоминаем адрес на 15 минут: вернувшись, он сразу попадёт на ввод кода.
const PENDING_KEY = 'eventory-card:restore-pending';
const PENDING_TTL = 15 * 60 * 1000;

export function pendingRestoreSlug() {
  try {
    const saved = JSON.parse(localStorage.getItem(PENDING_KEY) || 'null');
    return saved && Date.now() - saved.at < PENDING_TTL ? String(saved.slug || '') : '';
  } catch {
    return '';
  }
}

function rememberSlug(slug) {
  try {
    if (slug) localStorage.setItem(PENDING_KEY, JSON.stringify({ slug, at: Date.now() }));
    else localStorage.removeItem(PENDING_KEY);
  } catch { /* приватный режим — адрес введут ещё раз */ }
}

function cleanSlug(value) {
  return String(value || '')
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/^(www\.)?tadacard\.ru\/v\//i, '')
    .split(/[/?#]/)[0]
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '')
    .slice(0, 32);
}

export function renderRestoreStep(slug = '') {
  return `
    <div class="ob-step ob-step--restore" data-step="restore">
      <div class="ob-copy">
        <p class="ob-kicker">Уже есть визитка</p>
        <h1 class="ob-title">Вернём вашу<br />визитку</h1>
        <p class="ob-lead">Введите адрес визитки и получите код в Telegram, куда приходят заявки.</p>
      </div>

      <div class="ob-restore">
        <label class="ob-restore-field">
          <span class="ob-restore-prefix">tadacard.ru/v/</span>
          <input class="ca-input" value="${escapeAttr(slug)}" placeholder="адрес" autocomplete="off"
            autocapitalize="off" spellcheck="false" inputmode="url" aria-label="Адрес визитки" data-restore-slug />
        </label>
        <button type="button" class="ob-btn ob-btn--ghost" data-restore-bot>Получить код в Telegram</button>
        <input class="ca-input ob-restore-code" inputmode="numeric" autocomplete="one-time-code" maxlength="6"
          placeholder="6 цифр из Telegram" aria-label="Код из Telegram" data-restore-code />
        <button type="button" class="ob-btn ob-btn--primary" data-restore-go>
          <span>Вернуть визитку</span>
          <span class="ob-btn-sheen" aria-hidden="true"></span>
        </button>
        <button type="button" class="ob-btn ob-btn--plain" data-next="welcome">Назад</button>
      </div>
    </div>
  `;
}

// onSlug — запомнить адрес между перерисовками (человек уходит в Telegram и
// возвращается); onDone — визитка на телефоне, можно открывать редактор.
export function bindRestoreStep(node, { onSlug, onDone }) {
  const slugInput = node.querySelector('[data-restore-slug]');
  const codeInput = node.querySelector('[data-restore-code]');
  const slug = () => cleanSlug(slugInput?.value);

  slugInput?.addEventListener('input', () => onSlug(slugInput.value));
  codeInput?.addEventListener('input', () => {
    const digits = codeInput.value.replace(/\D/g, '').slice(0, 6);
    if (codeInput.value !== digits) codeInput.value = digits;
  });

  node.querySelector('[data-restore-bot]')?.addEventListener('click', async () => {
    if (slug().length < 3) {
      toast.show('Введите адрес визитки');
      slugInput?.focus();
      return;
    }
    try {
      rememberSlug(slug());
      await openRestoreBot(slug());
    } catch (err) {
      toast.show(RESTORE_ERRORS[err?.message] || 'Не удалось открыть Telegram', { error: true });
    }
  });

  const go = node.querySelector('[data-restore-go]');
  go?.addEventListener('click', async () => {
    const code = codeInput?.value || '';
    if (slug().length < 3) {
      toast.show('Введите адрес визитки');
      return;
    }
    if (code.length !== 6) {
      toast.show('Введите 6 цифр из Telegram');
      return;
    }
    go.disabled = true;
    try {
      const leadKey = await redeemRestoreCode(slug(), code);
      await adoptPublishedCard(slug(), leadKey);
      rememberSlug('');
      toast.show('Визитка на месте', { ok: true });
      onDone();
    } catch (err) {
      go.disabled = false;
      toast.show(RESTORE_ERRORS[err?.message] || 'Не удалось вернуть визитку. Попробуйте ещё раз', { error: true });
    }
  });
}
