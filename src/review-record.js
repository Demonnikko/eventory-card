// Запись видеоотзыва — экран для заказчика.
//
// Человек попал сюда по ссылке от исполнителя, записывает один кружок и
// уходит. Он не пользователь приложения, поэтому: ни регистрации, ни
// объяснений про продукт — камера, кнопка, отправка.
import { escapeHtml, escapeAttr } from './shared/lib/html.js';
import { renderIcon } from './shared/components/icons.js';
import { toast } from './shared/components/toast.js';
import { hapticLight, hapticSuccess, hapticError } from './shared/lib/haptic.js';
import {
  fetchInvite, uploadReview, pickMimeType, recordingSupported,
  MAX_DURATION, MIN_DURATION
} from './reviews-data.js';

const state = {
  token: '',
  targetSlug: '',
  target: null,      // чью визитку подтверждаем
  step: 'intro',     // intro → record → review → sent
  stream: null,
  recorder: null,
  chunks: [],
  blob: null,
  uploadedUrl: '',
  seconds: 0,
  timer: 0,
  busy: false,
  error: '',
  author: '',
  role: '',
  consent: false
};

function stopStream() {
  if (state.stream) {
    state.stream.getTracks().forEach((t) => t.stop());
    state.stream = null;
  }
  if (state.timer) {
    clearInterval(state.timer);
    state.timer = 0;
  }
}

/* ─────────── Экраны ─────────── */

function renderIntro() {
  const name = state.target?.name || 'исполнителя';
  return `
    <div class="rv-step">
      <div class="rv-ring rv-ring--idle" aria-hidden="true">
        <span class="rv-ring-icon">${renderIcon('user')}</span>
      </div>
      <h1 class="rv-title">Видеоотзыв<br />для ${escapeHtml(name)}</h1>
      <p class="rv-lead">Запишите короткое видео — до ${MAX_DURATION} секунд.
        Расскажите, что понравилось в работе.</p>
      <div class="rv-actions">
        <button type="button" class="rv-btn rv-btn--primary" data-start>
          <span>Включить камеру</span>
        </button>
        <p class="rv-fineprint">Видео увидит ${escapeHtml(name)} и посетители визитки</p>
      </div>
    </div>
  `;
}

function renderRecord() {
  const recording = Boolean(state.recorder && state.recorder.state === 'recording');
  const pct = Math.min(100, (state.seconds / MAX_DURATION) * 100);
  // Обводка-таймер: окружность 2πr при r=48
  const dash = 301.6;

  return `
    <div class="rv-step rv-step--record">
      <div class="rv-stage">
        <div class="rv-ring${recording ? ' is-recording' : ''}">
          <video class="rv-video" playsinline muted autoplay data-preview></video>
          <svg class="rv-progress" viewBox="0 0 100 100" aria-hidden="true">
            <circle class="rv-progress-track" cx="50" cy="50" r="48" />
            <circle class="rv-progress-bar" cx="50" cy="50" r="48"
              style="stroke-dasharray:${dash};stroke-dashoffset:${dash - (dash * pct) / 100}" />
          </svg>
        </div>
      </div>

      <p class="rv-timer">${recording ? formatTime(state.seconds) : 'Готовы?'}</p>
      <p class="rv-hint">${recording
        ? `Осталось ${MAX_DURATION - state.seconds} с`
        : 'Смотрите в камеру и говорите своими словами'}</p>

      <div class="rv-actions">
        <button type="button" class="rv-shutter${recording ? ' is-recording' : ''}" data-toggle
          aria-label="${recording ? 'Остановить запись' : 'Начать запись'}">
          <span class="rv-shutter-inner"></span>
        </button>
      </div>
    </div>
  `;
}

function renderReview() {
  return `
    <div class="rv-step">
      <div class="rv-stage">
        <div class="rv-ring is-done">
          <video class="rv-video rv-video--playback" playsinline loop autoplay controls data-playback></video>
        </div>
      </div>

      <p class="rv-timer">${formatTime(state.seconds)}</p>

      <div class="rv-fields">
        <input class="rv-input" type="text" name="author" placeholder="Как вас зовут"
          value="${escapeAttr(state.author)}" maxlength="60" autocomplete="name" data-author />
        <input class="rv-input" type="text" name="role" placeholder="Например: невеста, заказчик"
          value="${escapeAttr(state.role)}" maxlength="80" data-role />
        <label class="rv-consent">
          <input type="checkbox" data-consent ${state.consent ? 'checked' : ''} />
          <span>Согласен отправить видео владельцу и на публикацию после его подтверждения.
            <a href="/#/privacy" target="_blank" rel="noopener">Как используются данные</a></span>
        </label>
      </div>

      <div class="rv-actions">
        <button type="button" class="rv-btn rv-btn--primary" data-send ${state.busy ? 'disabled' : ''}>
          <span>${state.busy ? 'Загружаем видео…' : 'Отправить отзыв'}</span>
        </button>
        <button type="button" class="rv-btn rv-btn--plain" data-retake ${state.busy ? 'disabled' : ''}>
          Записать заново
        </button>
      </div>
    </div>
  `;
}

function renderSent() {
  const name = state.target?.name || 'исполнителю';
  return `
    <div class="rv-step rv-step--sent">
      <div class="rv-ring is-sent" aria-hidden="true">
        <span class="rv-ring-check">${renderIcon('check', { size: 34 })}</span>
      </div>
      <h1 class="rv-title">Спасибо!</h1>
      <p class="rv-lead">Отзыв отправлен ${escapeHtml(name)}.<br />Он появится на визитке после подтверждения.</p>
    </div>
  `;
}

function renderError(message) {
  return `
    <div class="rv-step">
      <div class="rv-ring rv-ring--idle" aria-hidden="true">
        <span class="rv-ring-icon">${renderIcon('info')}</span>
      </div>
      <h1 class="rv-title">Не получилось</h1>
      <p class="rv-lead">${escapeHtml(message)}</p>
    </div>
  `;
}

function formatTime(sec) {
  const s = Math.max(0, Math.floor(sec));
  return `0:${String(s).padStart(2, '0')}`;
}

function renderContent() {
  if (state.error) return renderError(state.error);
  if (state.step === 'intro') return renderIntro();
  if (state.step === 'record') return renderRecord();
  if (state.step === 'review') return renderReview();
  return renderSent();
}

/* ─────────── Экран ─────────── */

export const reviewRecord = {
  id: 'review-record',
  title: '',
  render() {
    return '<div class="rv-loading"></div>';
  },
  async mount(node, ctx = {}) {
    state.token = ctx.params?.id || '';
    state.targetSlug = '';
    state.target = null;
    state.step = 'intro';
    state.error = '';
    state.blob = null;
    state.uploadedUrl = '';
    state.seconds = 0;
    state.author = '';
    state.role = '';
    state.consent = false;

    if (!state.token) {
      state.error = 'Ссылка неполная. Попросите отправить её ещё раз.';
      node.innerHTML = renderContent();
      return;
    }
    if (!recordingSupported()) {
      state.error = 'Ваш браузер не умеет записывать видео. Откройте ссылку в Safari или Chrome.';
      node.innerHTML = renderContent();
      return;
    }

    try {
      const data = await fetchInvite(state.token);
      state.targetSlug = data.slug || '';
      state.target = data.card || null;
    } catch (err) {
      state.error = err?.message === 'invite_not_found'
        ? 'Ссылка устарела. Попросите новую.'
        : 'Не удалось открыть страницу. Проверьте интернет.';
    }

    node.innerHTML = renderContent();
    bind(node);
  },
  unmount() {
    stopStream();
  }
};

function rerender(node) {
  node.innerHTML = renderContent();
  bind(node);
  // Видео пропадает при перерисовке — возвращаем поток или запись.
  const preview = node.querySelector('[data-preview]');
  if (preview && state.stream) preview.srcObject = state.stream;
  const playback = node.querySelector('[data-playback]');
  if (playback && state.blob) playback.src = URL.createObjectURL(state.blob);
}

function bind(node) {
  const start = node.querySelector('[data-start]');
  if (start) start.addEventListener('click', () => startCamera(node));

  const toggle = node.querySelector('[data-toggle]');
  if (toggle) {
    toggle.addEventListener('click', () => {
      if (state.recorder?.state === 'recording') stopRecording(node);
      else startRecording(node);
    });
  }

  const retake = node.querySelector('[data-retake]');
  if (retake) {
    retake.addEventListener('click', () => {
      state.blob = null;
      state.uploadedUrl = '';
      state.seconds = 0;
      state.step = 'record';
      rerender(node);
      startCamera(node, { silent: true });
    });
  }

  const send = node.querySelector('[data-send]');
  if (send) send.addEventListener('click', () => send_(node));

  node.querySelector('[data-author]')?.addEventListener('input', (e) => { state.author = e.target.value; });
  node.querySelector('[data-role]')?.addEventListener('input', (e) => { state.role = e.target.value; });
  node.querySelector('[data-consent]')?.addEventListener('change', (e) => { state.consent = e.target.checked; });
}

async function startCamera(node, { silent = false } = {}) {
  try {
    // Фронтальная камера, квадрат — кружок всё равно обрежет края.
    state.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 720 } },
      audio: true
    });
    state.step = 'record';
    rerender(node);
    const preview = node.querySelector('[data-preview]');
    if (preview) preview.srcObject = state.stream;
    if (!silent) hapticLight();
  } catch {
    state.error = 'Нет доступа к камере. Разрешите съёмку в настройках браузера и обновите страницу.';
    rerender(node);
  }
}

function startRecording(node) {
  if (!state.stream) return;
  const mimeType = pickMimeType();
  const options = { videoBitsPerSecond: 900_000, audioBitsPerSecond: 64_000 };
  if (mimeType) options.mimeType = mimeType;
  try {
    state.recorder = new MediaRecorder(state.stream, options);
  } catch {
    try {
      state.recorder = new MediaRecorder(state.stream, mimeType ? { mimeType } : undefined);
    } catch {
      toast.show('Не удалось начать запись', { error: true });
      return;
    }
  }

  state.chunks = [];
  state.seconds = 0;
  state.recorder.ondataavailable = (e) => {
    if (e.data?.size) state.chunks.push(e.data);
  };
  state.recorder.onstop = () => {
    state.blob = new Blob(state.chunks, { type: mimeType || 'video/webm' });
    stopStream();
    state.step = 'review';
    rerender(node);
  };

  state.recorder.start();
  hapticLight();
  rerender(node);

  state.timer = setInterval(() => {
    state.seconds += 1;
    // Жёсткий предел: кружок не должен превращаться в интервью.
    if (state.seconds >= MAX_DURATION) {
      stopRecording(node);
      return;
    }
    updateTimer(node);
  }, 1000);
}

// Обновляем только цифры и обводку — перерисовка убила бы видеопоток.
function updateTimer(node) {
  const timer = node.querySelector('.rv-timer');
  if (timer) timer.textContent = formatTime(state.seconds);
  const hint = node.querySelector('.rv-hint');
  if (hint) hint.textContent = `Осталось ${MAX_DURATION - state.seconds} с`;
  const bar = node.querySelector('.rv-progress-bar');
  if (bar) {
    const dash = 301.6;
    const pct = Math.min(100, (state.seconds / MAX_DURATION) * 100);
    bar.style.strokeDashoffset = String(dash - (dash * pct) / 100);
  }
}

function stopRecording(node) {
  if (state.timer) {
    clearInterval(state.timer);
    state.timer = 0;
  }
  if (state.recorder?.state === 'recording') {
    state.recorder.stop();
    hapticLight();
  }
  if (state.seconds < MIN_DURATION) {
    toast.show('Слишком коротко — расскажите чуть подробнее');
  }
}

async function send_(node) {
  if (state.busy || !state.blob) return;
  if (state.seconds < MIN_DURATION) {
    toast.show('Запись слишком короткая');
    return;
  }

  const author = state.author.trim();
  const role = state.role.trim();
  if (!author) {
    toast.show('Напишите, как вас зовут');
    node.querySelector('[data-author]')?.focus();
    return;
  }
  if (!state.consent) {
    toast.show('Подтвердите согласие на отправку видео');
    node.querySelector('[data-consent]')?.focus();
    return;
  }

  state.busy = true;
  rerender(node);

  try {
    await uploadReview(state.token, {
      blob: state.blob,
      slug: state.targetSlug,
      author,
      role,
      duration: state.seconds,
      consent: state.consent,
      videoUrl: state.uploadedUrl
    });
    state.uploadedUrl = '';
    hapticSuccess();
    state.step = 'sent';
  } catch (err) {
    hapticError();
    const map = {
      video_too_large: 'Видео слишком большое — запишите покороче',
      reviews_limit: 'У этого исполнителя уже максимум отзывов',
      invite_not_found: 'Ссылка устарела — попросите новую',
      video_storage_not_configured: 'Приём видео временно недоступен',
      upload_authorization_failed: 'Хранилище видео временно недоступно',
      upload_failed: 'Видео не загрузилось. Проверьте интернет и повторите',
      video_verification_failed: 'Видео загрузилось не полностью — отправьте ещё раз',
      review_store_failed: 'Видео принято, но отзыв не сохранился. Повторите отправку',
      security_checkpoint: 'Защита сервера остановила запрос. Обновите страницу и повторите'
    };
    state.uploadedUrl = ['security_checkpoint', 'bad_response', 'request_failed'].includes(err?.message)
      ? (err?.videoUrl || state.uploadedUrl)
      : '';
    toast.show(map[err?.message] || 'Не удалось отправить. Попробуйте ещё раз', { error: true });
  } finally {
    state.busy = false;
    rerender(node);
  }
}
