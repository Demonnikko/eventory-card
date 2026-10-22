// «Восстановить доступ» в резервной копии. Ключ визитки живёт только на
// телефоне; если он сбился или телефон новый, заявки и отзывы закрываются.
// Код присылает Telegram-бот — только в чат, привязанный к визитке, — и в
// обмен на него телефон получает новый ключ. Про ключ человеку знать не нужно.
import { renderIcon } from './shared/components/icons.js';
import { toast } from './shared/components/toast.js';

const ERRORS = {
  restore_code_wrong: 'Код не подошёл, проверьте цифры',
  restore_code_expired: 'Код устарел, получите новый',
  rate_limited: 'Слишком много попыток, попробуйте через час',
  telegram_not_configured: 'Telegram временно недоступен'
};

async function post(action, body) {
  const res = await fetch(`/api/card-publish?action=${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.ok) throw new Error(data?.error || 'request_failed');
  return data;
}

export function renderRestore(card) {
  if (!card?.publishedSlug) return '';
  return `
    <div class="ca-restore">
      <p class="ca-restore-title">Восстановить доступ</p>
      <p class="ca-note">Если заявки или отзывы пишут «нет доступа», получите код в Telegram, куда приходят заявки.</p>
      <button type="button" class="ca-btn ca-btn--ghost" data-restore-link>${renderIcon('share')} Получить код в Telegram</button>
      <div class="ca-restore-row">
        <input class="ca-input" inputmode="numeric" autocomplete="one-time-code" maxlength="6"
          placeholder="6 цифр" aria-label="Код из Telegram" data-restore-code />
        <button type="button" class="ca-btn ca-btn--primary" data-restore-submit>Восстановить</button>
      </div>
    </div>
  `;
}

// getCard/setCard — состояние редактора: после успеха он сохраняет карточку
// с новым ключом и перерисовывается.
export function bindRestore(node, { getCard, setCard }) {
  node.querySelector('[data-restore-link]')?.addEventListener('click', async () => {
    try {
      const { url } = await post('restore-link', { slug: getCard().publishedSlug });
      window.location.href = url;
    } catch (err) {
      toast.show(ERRORS[err?.message] || 'Не удалось открыть Telegram', { error: true });
    }
  });

  const input = node.querySelector('[data-restore-code]');
  input?.addEventListener('input', () => {
    const digits = input.value.replace(/\D/g, '').slice(0, 6);
    if (input.value !== digits) input.value = digits;
  });

  const submit = node.querySelector('[data-restore-submit]');
  submit?.addEventListener('click', async () => {
    const code = input?.value || '';
    if (code.length !== 6) {
      toast.show('Введите 6 цифр из Telegram');
      return;
    }
    submit.disabled = true;
    try {
      const card = getCard();
      const { leadKey } = await post('restore', { slug: card.publishedSlug, code, leadKey: card.leadKey });
      await setCard({ ...card, leadKey });
      toast.show('Доступ восстановлен', { ok: true });
    } catch (err) {
      submit.disabled = false;
      toast.show(ERRORS[err?.message] || 'Не удалось восстановить. Попробуйте ещё раз', { error: true });
    }
  });
}
