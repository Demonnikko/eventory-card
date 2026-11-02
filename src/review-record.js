// Запись видеоотзыва — экран для заказчика.
//
// Человек попал сюда по ссылке от исполнителя, записывает один кружок и
// уходит. Он не пользователь приложения, поэтому: ни регистрации, ни
// объяснений про продукт — камера, кнопка, отправка.
import { escapeHtml, escapeAttr } from './shared/lib/html.js';
import { renderIcon } from './shared/components/icons.js';
import { toast } from './shared/components/toast.js';
import { hapticLight, hapticSuccess, hapticError } from './shared/lib/haptic.js';
import { genitiveFullName, dativeFullName } from './shared/lib/declension.js';
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
  blobUrl: '',
  uploadedUrl: '',
  seconds: 0,
  startedAt: 0,
  timer: 0,
  busy: false,
  error: '',
  author: '',
  role: '',
  consent: false,
  // Поля для индикатора микрофона:
  audioCtx: null,
  analyser: null,
  meterStream: null,
  meterRaf: 0,
  silentWarned: false
};

function revokeBlobUrl() {
  if (state.blobUrl) {
    URL.revokeObjectURL(state.blobUrl);
    state.blobUrl = '';
  }
}

function stopAudioMeter() {
  if (state.meterRaf) {
    cancelAnimationFrame(state.meterRaf);
    state.meterRaf = 0;
  }
  if (state.meterStream) {
    state.meterStream.getTracks().forEach((t) => t.stop());
    state.meterStream = null;
  }
  if (state.audioCtx) {
    state.audioCtx.close().catch(() => {});
    state.audioCtx = null;
    state.analyser = null;
  }
}

function startAudioMeter(node) {
  stopAudioMeter();
  if (!state.stream) return;

  const audioTrack = state.stream.getAudioTracks()[0];
  if (!audioTrack || audioTrack.readyState !== 'live') {
    toast.show('Микрофон недоступен или отключён', { error: true });
    return;
  }

  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return;

  try {
    state.audioCtx = new AudioCtx();
    if (state.audioCtx.state === 'suspended') {
      state.audioCtx.resume().catch(() => {});
    }

    // Клонируем трек, чтобы AnalyserNode не влиял на MediaRecorder в iOS WebKit
    const clonedTrack = audioTrack.clone ? audioTrack.clone() : audioTrack;
    state.meterStream = new MediaStream([clonedTrack]);

    const source = state.audioCtx.createMediaStreamSource(state.meterStream);
    const analyser = state.audioCtx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.65;
    source.connect(analyser); // ВАЖНО: к destination НЕ подключаем!
    state.analyser = analyser;

    const buffer = new Uint8Array(analyser.fftSize);
    let smoothed = 0;
    let silentSince = performance.now();

    const tick = () => {
      if (!state.analyser) return;

      // Если iOS усыпил AudioContext до клика по «Записать» — будим при записи
      if (state.audioCtx?.state === 'suspended' && state.recorder?.state === 'recording') {
        state.audioCtx.resume().catch(() => {});
      }

      state.analyser.getByteTimeDomainData(buffer);

      // Считаем RMS (среднеквадратичную амплитуду голоса)
      let sumSquares = 0;
      for (let i = 0; i < buffer.length; i++) {
        const normalized = (buffer[i] - 128) / 128;
        sumSquares += normalized * normalized;
      }
      const rms = Math.sqrt(sumSquares / buffer.length);

      // Нормализуем под человеческий голос (обычная речь даёт RMS 0.03–0.25)
      const rawLevel = Math.min(1, Math.max(0, (rms - 0.008) * 5.5));
      smoothed = smoothed * 0.7 + rawLevel * 0.3;

      // Обновляем CSS-переменную напрямую, без перерисовки DOM
      const meterEl = node.querySelector('[data-mic-meter]');
      if (meterEl) {
        meterEl.style.setProperty('--mic-level', smoothed.toFixed(3));
        meterEl.classList.toggle('is-speaking', smoothed > 0.08);
      }

      // Детектор тишины: если идёт запись 4+ сек, а сигнал нулевой
      if (state.recorder?.state === 'recording') {
        if (rms > 0.012) {
          silentSince = performance.now();
        } else if (!state.silentWarned && performance.now() - silentSince > 4000) {
          state.silentWarned = true;
          toast.show('Вас почти не слышно — проверьте, не закрыт ли микрофон');
        }
      } else {
        silentSince = performance.now();
      }

      state.meterRaf = requestAnimationFrame(tick);
    };

    state.meterRaf = requestAnimationFrame(tick);
  } catch {
    // Если браузер заблокировал Web Audio API — запись видео всё равно продолжится
  }
}

function stopStream() {
  stopAudioMeter();
  if (state.stream) {
    state.stream.getTracks().forEach((t) => t.stop());
    state.stream = null;
  }
  if (state.timer) {
    clearInterval(state.timer);
    state.timer = 0;
  }
}

function configurePreviewVideo(video, stream) {
  if (!video || !stream) return;
  video.muted = true;
  video.defaultMuted = true;
  video.volume = 0;
  video.playsInline = true;
  video.setAttribute('muted', '');
  video.setAttribute('playsinline', '');
  video.setAttribute('webkit-playsinline', '');
  if (video.srcObject !== stream) {
    video.srcObject = stream;
  }
  video.play().catch(() => {});
}

/* ─────────── Экраны ─────────── */

function renderIntro() {
  const name = state.target?.name || '';
  const role = state.target?.role || '';
  const avatarUrl = state.target?.avatarUrl || '';
  const firstName = name.trim().split(/\s+/)[0] || name || 'Артист';
  const dativeName = name ? dativeFullName(name) : 'исполнителю';

  let initials = '';
  if (name) {
    const parts = name.trim().split(/\s+/);
    initials = parts.length >= 2 ? (parts[0][0] + parts[1][0]).toUpperCase() : name.slice(0, 2).toUpperCase();
  }

  const avatarContent = avatarUrl
    ? `<img class="rv-avatar-img" src="${escapeAttr(avatarUrl)}" alt="${escapeAttr(name)}" />`
    : `<span class="rv-avatar-initials">${escapeHtml(initials)}</span>`;

  return `
    <div class="rv-step rv-step--intro-lux">
      <div class="rv-container">
        <div>
          <!-- Верхний бейдж: минималистично Визитка -->
          <div class="rv-top-bar">
            <span class="rv-badge-label">Визитка</span>
          </div>

          <!-- Карточка артиста: аватарка слева, имя и профессия -->
          <div class="rv-artist-card">
            <div class="rv-artist-avatar">
              ${avatarContent}
            </div>
            <div class="rv-artist-meta">
              <div class="rv-artist-name">${escapeHtml(name)}</div>
              ${role ? `<div class="rv-artist-role">${escapeHtml(role)}</div>` : ''}
            </div>
          </div>

          <!-- Заголовок и обращение -->
          <div class="rv-headline-block">
            <h1 class="rv-headline-title">Поделитесь впечатлениями о событии</h1>
            <p class="rv-headline-subtitle">${escapeHtml(firstName)} будет искренне рад вашему видеоотзыву. Это займет меньше минуты и поможет сделать следующие выступления еще лучше.</p>
          </div>

          <!-- Подсказка: о чем рассказать -->
          <div class="rv-ideas-card">
            <div class="rv-ideas-label">💡 О чем можно рассказать:</div>
            <div class="rv-ideas-chips">
              <span class="rv-idea-chip">Эмоции гостей</span>
              <span class="rv-idea-chip">Любимый номер</span>
              <span class="rv-idea-chip">Атмосфера события</span>
            </div>
          </div>

          <!-- Bento-условия -->
          <div class="rv-bento-grid">
            <div class="rv-bento-item">
              <div class="rv-bento-icon">⏱</div>
              <div class="rv-bento-title">До 60 секунд</div>
              <div class="rv-bento-text">Достаточно пары теплых искренних слов</div>
            </div>

            <div class="rv-bento-item">
              <div class="rv-bento-icon">✨</div>
              <div class="rv-bento-title">Удобный формат</div>
              <div class="rv-bento-text">Запись на камеру или файл из галереи</div>
            </div>
          </div>

          <!-- Гарантия приватности -->
          <div class="rv-trust-strip">
            <div class="rv-trust-icon">🛡</div>
            <div class="rv-trust-text">
              <strong>Полный контроль за вами:</strong> видео поступит лично ${escapeHtml(dativeName)} и появится на визитке только после согласования.
            </div>
          </div>
        </div>

        <!-- Кнопки действий -->
        <div class="rv-actions-box">
          <button type="button" class="rv-btn-gold" data-start>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/></svg>
            <span>Записать видеоотзыв сейчас</span>
          </button>

          <button type="button" class="rv-btn-secondary" data-gallery>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            <span>Выбрать готовое видео из галереи</span>
          </button>
          <input type="file" accept="video/*" class="rv-file-input" style="display:none;" data-file-input />

          <p class="rv-footnote">Откроется в браузере. Устанавливать приложения не требуется.</p>
        </div>
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
          <video class="rv-video rv-video--preview" playsinline muted autoplay data-preview></video>
          <svg class="rv-progress" viewBox="0 0 100 100" aria-hidden="true">
            <circle class="rv-progress-track" cx="50" cy="50" r="48" />
            <circle class="rv-progress-bar" cx="50" cy="50" r="48"
              style="stroke-dasharray:${dash};stroke-dashoffset:${dash - (dash * pct) / 100}" />
          </svg>
        </div>
      </div>

      <!-- Плашка индикатора микрофона поверх превью камеры -->
      <div class="rr-mic-badge" data-mic-meter style="--mic-level: 0">
        <span class="rr-mic-dot"></span>
        <div class="rr-mic-bars">
          <span></span>
          <span></span>
          <span></span>
          <span></span>
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
        <button type="button" class="rv-ring is-done rv-ring--play" data-playback-toggle aria-label="Пуск/пауза">
          <video class="rv-video rv-video--playback" playsinline webkit-playsinline loop data-playback></video>
          <span class="rv-play-icon" data-playicon aria-hidden="true">${renderIcon('play')}</span>
        </button>
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
  const raw = state.target?.name || '';
  const name = raw ? dativeFullName(raw) : 'исполнителю';
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
    revokeBlobUrl();
    state.blob = null;
    state.uploadedUrl = '';
    state.seconds = 0;
    state.startedAt = 0;
    state.silentWarned = false;
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
    revokeBlobUrl();
  }
};

function rerender(node) {
  // Сохраняем живой <video data-preview>, чтобы node.innerHTML не разрушал
  // активный видеопоток камеры в момент старта MediaRecorder на iOS WebKit
  const existingPreview = state.step === 'record' ? node.querySelector('[data-preview]') : null;

  node.innerHTML = renderContent();

  if (existingPreview && state.stream && state.step === 'record') {
    const placeholder = node.querySelector('[data-preview]');
    if (placeholder) placeholder.replaceWith(existingPreview);
  }

  bind(node);

  const preview = node.querySelector('[data-preview]');
  if (preview && state.stream) {
    configurePreviewVideo(preview, state.stream);
  }

  const playback = node.querySelector('[data-playback]');
  if (playback && state.blob) {
    if (!state.blobUrl) {
      state.blobUrl = URL.createObjectURL(state.blob);
    }
    playback.playsInline = true;
    playback.setAttribute('playsinline', '');
    playback.setAttribute('webkit-playsinline', '');
    playback.muted = false;
    playback.defaultMuted = false;
    playback.volume = 1.0;
    playback.src = state.blobUrl;

    // Фикс для WebM (duration === Infinity в Chrome) и отрисовки 1-го кадра в iOS Safari
    playback.onloadedmetadata = () => {
      if (playback.duration === Infinity || Number.isNaN(playback.duration)) {
        playback.currentTime = 1e101;
        playback.ontimeupdate = () => {
          playback.ontimeupdate = null;
          playback.currentTime = 0.001;
        };
      } else if (playback.currentTime === 0) {
        playback.currentTime = 0.001;
      }
    };
    playback.load();
  }

  const playToggle = node.querySelector('[data-playback-toggle]');
  if (playToggle && playback) {
    playToggle.addEventListener('click', () => {
      if (playback.paused) {
        playback.muted = false;
        playback.defaultMuted = false;
        playback.volume = 1.0;
        playback.play().catch(() => {});
      } else {
        playback.pause();
      }
    });
    playback.addEventListener('play', () => playToggle.classList.add('is-playing'));
    playback.addEventListener('pause', () => playToggle.classList.remove('is-playing'));
    playback.addEventListener('ended', () => playToggle.classList.remove('is-playing'));
  }
}

function bind(node) {
  const start = node.querySelector('[data-start]');
  if (start) start.addEventListener('click', () => startCamera(node));

  const galleryBtn = node.querySelector('[data-gallery]');
  const fileInput = node.querySelector('[data-file-input]');
  if (galleryBtn && fileInput) {
    galleryBtn.addEventListener('click', () => {
      fileInput.click();
    });
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (!file.type.startsWith('video/')) {
        toast.show('Пожалуйста, выберите видеофайл', { error: true });
        return;
      }
      if (file.size > 100 * 1024 * 1024) {
        toast.show('Видео слишком большое, выберите файл до 100 МБ', { error: true });
        return;
      }
      stopStream();
      revokeBlobUrl();
      const tempVideo = document.createElement('video');
      tempVideo.preload = 'metadata';
      const objUrl = URL.createObjectURL(file);
      tempVideo.src = objUrl;
      tempVideo.onloadedmetadata = () => {
        URL.revokeObjectURL(objUrl);
        const duration = Math.round(tempVideo.duration) || 10;
        if (duration > 65) {
          toast.show('Видео длиннее 60 секунд. Выберите короткий фрагмент', { error: true });
          return;
        }
        state.seconds = Math.max(MIN_DURATION, duration);
        state.blob = file;
        state.blobUrl = URL.createObjectURL(file);
        state.step = 'review';
        rerender(node);
      };
      tempVideo.onerror = () => {
        URL.revokeObjectURL(objUrl);
        state.seconds = 15;
        state.blob = file;
        state.blobUrl = URL.createObjectURL(file);
        state.step = 'review';
        rerender(node);
      };
    });
  }

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
      revokeBlobUrl();
      state.blob = null;
      state.uploadedUrl = '';
      state.seconds = 0;
      state.startedAt = 0;
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
  stopStream();
  revokeBlobUrl();
  state.blob = null;
  state.error = '';

  try {
    try {
      // Отключаем echoCancellation/noiseSuppression: превью без звука (эха нет),
      // а на iOS это предотвращает включение телефонного фильтра VoiceProcessingIO,
      // который роняет аппаратный AAC-энкодер и сбивает таймкоды видео.
      state.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 720 },
          height: { ideal: 720 },
          frameRate: { ideal: 30, max: 30 }
        },
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: true
        }
      });
    } catch {
      // Фолбэк для устройств со строгими ограничениями драйвера
      state.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user' },
        audio: true
      });
    }

    state.stream.getAudioTracks().forEach((t) => { t.enabled = true; });
    state.stream.getVideoTracks().forEach((t) => { t.enabled = true; });

    state.step = 'record';
    rerender(node);
    startAudioMeter(node);
    if (!silent) hapticLight();
  } catch {
    state.error = 'Нет доступа к камере или микрофону. Разрешите съёмку в настройках браузера и обновите страницу.';
    rerender(node);
  }
}

function startRecording(node) {
  if (!state.stream) return;

  // Убеждаемся, что превью строго заглушено, а треки микрофона активны
  const preview = node.querySelector('[data-preview]');
  configurePreviewVideo(preview, state.stream);
  state.stream.getAudioTracks().forEach((t) => { t.enabled = true; });

  state.silentWarned = false;
  if (state.audioCtx?.state === 'suspended') {
    state.audioCtx.resume().catch(() => {});
  }
  if (!state.analyser) {
    startAudioMeter(node);
  }

  const mimeType = pickMimeType();
  // Не задаём жёсткий audioBitsPerSecond: в iOS Safari 128 kbps на моно-микрофоне
  // выходит за лимит аппаратного AAC-кодека и приводит к немому видео без таймкодов.
  const options = { videoBitsPerSecond: 900_000 };
  if (mimeType) options.mimeType = mimeType;

  try {
    state.recorder = new MediaRecorder(state.stream, options);
  } catch {
    try {
      state.recorder = new MediaRecorder(state.stream, mimeType ? { mimeType } : undefined);
    } catch {
      try {
        state.recorder = new MediaRecorder(state.stream);
      } catch {
        toast.show('Не удалось начать запись', { error: true });
        return;
      }
    }
  }

  state.chunks = [];
  state.seconds = 0;
  state.startedAt = performance.now();

  state.recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) {
      state.chunks.push(e.data);
    }
  };

  state.recorder.onstop = () => {
    const elapsed = state.startedAt
      ? Math.max(1, Math.round((performance.now() - state.startedAt) / 1000))
      : state.seconds;
    state.seconds = Math.min(MAX_DURATION, Math.max(state.seconds, elapsed));

    // Если запись слишком короткая — остаёмся на экране камеры и даём перезаписать
    if (state.seconds < MIN_DURATION || !state.chunks.length) {
      state.chunks = [];
      state.recorder = null;
      state.seconds = 0;
      toast.show('Слишком коротко, расскажите чуть подробнее');
      rerender(node);
      return;
    }

    const actualType =
      state.recorder?.mimeType ||
      state.chunks[0]?.type ||
      mimeType ||
      'video/mp4';

    revokeBlobUrl();
    state.blob = new Blob(state.chunks, { type: actualType });
    state.blobUrl = URL.createObjectURL(state.blob);
    state.recorder = null;

    stopStream();
    state.step = 'review';
    rerender(node);
  };

  // ВАЖНО: вызываем start() БЕЗ timeslice (1000)!
  // Это позволяет Safari/WebKit и Chrome сформировать цельный контейнер
  // с валидным moov-заголовком, длительностью и синхронизированной дорожкой AAC/Opus.
  state.recorder.start();
  hapticLight();
  rerender(node);

  state.timer = setInterval(() => {
    state.seconds = Math.max(
      state.seconds + 1,
      Math.round((performance.now() - state.startedAt) / 1000)
    );
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
  if (state.recorder && state.recorder.state === 'recording') {
    try {
      state.recorder.stop();
    } catch { /* ignore */ }
    hapticLight();
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
      video_too_large: 'Видео слишком большое, запишите покороче',
      reviews_limit: 'У этого исполнителя уже максимум отзывов',
      invite_not_found: 'Ссылка устарела, попросите новую',
      video_storage_not_configured: 'Приём видео временно недоступен',
      upload_authorization_failed: 'Хранилище видео временно недоступно',
      upload_failed: 'Видео не загрузилось. Проверьте интернет и повторите',
      video_verification_failed: 'Видео загрузилось не полностью, отправьте ещё раз',
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
