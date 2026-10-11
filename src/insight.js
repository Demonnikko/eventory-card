// «Отклик» — экран владельца: кто открывал визитку, какой праздник смотрят,
// откуда пришли и кто оставил заявку.
//
// Главная мысль экрана: визитка перестаёт быть картинкой и начинает
// приносить данные. Ссылки праздников из Sales и QR в режиме показа
// подписаны каналом — поэтому видно, что реально приводит клиентов.
import { escapeHtml, escapeAttr } from './shared/lib/html.js';
import { renderIcon } from './shared/components/icons.js';
import { toast } from './shared/components/toast.js';
import { qrSvg } from './shared/data/qr.js';
import { hapticLight, hapticSuccess } from './shared/lib/haptic.js';
import { getCard } from './card-data.js';
import { fetchInsight, createTag, deleteTag, deleteLead, setLeadTag, markLeadsRead, taggedUrl, telegramLink, telegramStatus, telegramUnlink } from './insight-data.js';
import { activeUpsell, upsellHref } from './crm-upsell.js';
import { occasionsOf, findOccasion, occasionTitle } from './shared/data/occasions.js';

const state = {
  card: null,
  summary: { opens: 0, visitors: 0, contacts: 0, lastAt: 0, occasions: {}, sources: {} },
  days: [],
  tags: [],
  leads: [],
  hot: [],           // горячие гости без заявки («Догони»)
  ownerPro: false,
  tgConnected: false,
  loading: true,
  loaded: false,     // экран уже показывали — при возврате рисуем сразу, без «Загружаем…»
  loadedFor: '',     // для какой визитки загружены данные (slug:ключ)
  busy: false,
  form: false,       // открыта форма новой метки
  qrFor: ''          // id метки, для которой показан QR
};

// Бесшовный Pro: визитка запоминает, до какой даты подписка активна, и до неё
// показывает Pro-контент СРАЗУ, не переспрашивая сервер. Сервер сверяется тихо
// в фоне и продлевает срок. Владельцу не нужно каждый раз подтверждать Pro.
const PRO_UNTIL_KEY = 'eventory-card:pro-until';

function readLocalProUntil() {
  try {
    return Number(localStorage.getItem(PRO_UNTIL_KEY)) || 0;
  } catch {
    return 0;
  }
}

function writeLocalProUntil(ts) {
  try {
    const val = Number(ts) || 0;
    if (val > Date.now()) localStorage.setItem(PRO_UNTIL_KEY, String(val));
    else localStorage.removeItem(PRO_UNTIL_KEY);
  } catch { /* приватный режим — не критично, просто без памяти */ }
}

function localProActive() {
  return readLocalProUntil() > Date.now();
}

function formatDate(ts) {
  const time = Number(ts);
  if (!time) return '';
  return new Date(time).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}

function formatEventDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}

function contactHref(raw) {
  const value = String(raw || '').trim();
  if (!value) return '';
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return `mailto:${value}`;
  const telegram = value.replace(/^https?:\/\/t\.me\//i, '').replace(/^@/, '');
  if (/^[a-z0-9_]{5,32}$/i.test(telegram) && (value.startsWith('@') || /t\.me\//i.test(value))) {
    return `https://t.me/${telegram}`;
  }
  const phone = value.replace(/[^\d+]/g, '');
  if (phone.replace(/\D/g, '').length >= 7) return `tel:${phone}`;
  return '';
}

/* ─────────── Метки ─────────── */

function renderTag(tag) {
  const s = tag.stats || {};
  const meta = [formatEventDate(tag.date), tag.place].filter(Boolean).join(' · ');
  const url = taggedUrl(state.card.publishedSlug, tag.id);
  const showQr = state.qrFor === tag.id;

  return `
    <div class="in-tag${showQr ? ' is-open' : ''}">
      <div class="in-tag-head">
        <div class="in-tag-titles">
          <span class="in-tag-label">${escapeHtml(tag.label)}</span>
          ${meta ? `<span class="in-tag-meta">${escapeHtml(meta)}</span>` : ''}
        </div>
        <button type="button" class="in-tag-more" data-tag-qr="${escapeAttr(tag.id)}"
          aria-label="Ссылка и QR">${renderIcon(showQr ? 'x' : 'share')}</button>
      </div>

      <div class="in-stats">
        <div class="in-stat">
          <span class="in-stat-value">${s.opens || 0}</span>
          <span class="in-stat-label">открытий</span>
        </div>
        <div class="in-stat">
          <span class="in-stat-value">${s.visitors || 0}</span>
          <span class="in-stat-label">человек</span>
        </div>
        <div class="in-stat${s.contacts ? ' is-hot' : ''}">
          <span class="in-stat-value">${s.contacts || 0}</span>
          <span class="in-stat-label">обращений</span>
        </div>
      </div>

      ${s.lastAt ? `<p class="in-tag-last">Последний раз — ${escapeHtml(formatDate(s.lastAt))}</p>` : ''}

      ${showQr ? `
        <div class="in-tag-share">
          <div class="in-tag-qr">${qrSvg(url, { className: 'in-qr-svg', title: 'QR метки' })}</div>
          <p class="in-tag-url">${escapeHtml(url)}</p>
          <div class="in-tag-actions">
            <button type="button" class="ca-btn ca-btn--ghost" data-tag-copy="${escapeAttr(url)}">
              ${renderIcon('copy')} Скопировать
            </button>
            <button type="button" class="ca-btn ca-btn--ghost" data-tag-share="${escapeAttr(url)}">
              ${renderIcon('share')} Отправить
            </button>
          </div>
          <button type="button" class="in-tag-delete" data-tag-delete="${escapeAttr(tag.id)}">
            Удалить метку
          </button>
        </div>
      ` : ''}
    </div>
  `;
}

function renderForm() {
  if (!state.form) {
    return `
      <button type="button" class="ca-btn ca-btn--primary" data-tag-new>
        Новое мероприятие
      </button>
    `;
  }
  return `
    <div class="in-form">
      <input class="ca-input" type="text" placeholder="Например: Свадьба Ани"
        maxlength="80" data-field-label />
      <input class="ca-input" type="text" placeholder="Место (Барвиха)"
        maxlength="80" data-field-place />
      <input class="ca-input" type="date" data-field-date />
      <div class="in-form-actions">
        <button type="button" class="ca-btn ca-btn--primary" data-tag-save ${state.busy ? 'disabled' : ''}>
          ${state.busy ? 'Создаём…' : 'Создать'}
        </button>
        <button type="button" class="ca-btn ca-btn--ghost" data-tag-cancel>Отмена</button>
      </div>
    </div>
  `;
}

// Ссылка на профиль ВКонтакте из того, что ввёл клиент: полный URL, vk.com/id
// или короткий id/username.
function vkHref(raw) {
  const value = String(raw || '').trim();
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  const id = value.replace(/^(https?:\/\/)?(m\.)?vk\.com\//i, '').replace(/^@/, '');
  return id ? `https://vk.com/${id}` : '';
}

// «@ник», t.me/…, vk.com/… или номер — ведём туда, куда человек и просил.
function messengerHref(raw) {
  const value = String(raw || '').trim();
  if (!value) return '';
  if (/^@?[a-z0-9_]{5,32}$/i.test(value) && value.startsWith('@')) return `https://t.me/${value.slice(1)}`;
  if (/t\.me\//i.test(value)) return `https://t.me/${value.replace(/^.*t\.me\//i, '')}`;
  if (/vk\.(com|ru)\//i.test(value)) return /^https?:/i.test(value) ? value : `https://${value}`;
  return contactHref(value);
}

// Одна кликабельная строка контакта: иконка + значение (можно тапнуть и выделить
// для копирования). Каждый канал отдельно — чтобы владелец легко проверил клиента.
function leadContactRow(icon, label, value, href) {
  const val = String(value || '').trim();
  if (!val) return '';
  const inner = `<span class="in-lead-row-label">${label}</span><span class="in-lead-row-value">${escapeHtml(val)}</span>`;
  return href
    ? `<a class="in-lead-row is-link" href="${escapeAttr(href)}" target="_blank" rel="noopener">${renderIcon(icon)}${inner}</a>`
    : `<div class="in-lead-row">${renderIcon(icon)}${inner}</div>`;
}

// Контакты заявки для Pro-владельца — раздельными строками (телефон, ВК, Telegram).
function renderLeadContactOpen(lead) {
  const phone = String(lead.phone || '').trim();
  const vk = String(lead.vk || '').trim();
  const tg = String(lead.telegram || '').trim();
  const messenger = String(lead.messenger || '').trim();

  // Старые заявки без структурных полей — показываем строку contact как есть.
  if (!phone && !vk && !tg && !messenger) {
    const value = String(lead.contact || '').trim();
    if (!value) return '<span class="in-lead-contact-open">контакт не указан</span>';
    const href = contactHref(value);
    return href
      ? `<a class="in-lead-contact-open is-link" href="${escapeAttr(href)}" target="_blank" rel="noopener">${escapeHtml(value)}</a>`
      : `<span class="in-lead-contact-open">${escapeHtml(value)}</span>`;
  }

  const tgId = tg.replace(/^@/, '');
  return `
    <div class="in-lead-rows">
      ${leadContactRow('phone', 'Телефон', phone, phone ? `tel:${phone.replace(/[^\d+]/g, '')}` : '')}
      ${leadContactRow('vk', 'ВКонтакте', vk, vkHref(vk))}
      ${leadContactRow('telegram', 'Telegram', tg, tgId ? `https://t.me/${tgId}` : '')}
      ${leadContactRow('share', 'Мессенджер', messenger, messengerHref(messenger))}
    </div>
  `;
}

/* ─────────── Уведомления в Telegram ─────────── */

// Бесплатное подключение: заявки падают в Telegram сразу, чтобы владелец не
// пропустил клиента. Контакт клиента в уведомлении не раскрывается (Pro).
function renderTelegramConnect() {
  if (!state.card?.publishedSlug) return '';
  if (state.tgConnected) {
    return `
      <div class="in-tg is-on">
        <span class="in-tg-icon" aria-hidden="true">${renderIcon('check')}</span>
        <span class="in-tg-copy">
          <span class="in-tg-title">Telegram подключён</span>
          <span class="in-tg-text">Заявки приходят вам в Telegram.</span>
        </span>
        <button type="button" class="in-tg-off" data-tg-unlink>Отключить</button>
      </div>
    `;
  }
  return `
    <button type="button" class="in-tg" data-tg-link>
      <span class="in-tg-icon" aria-hidden="true">${renderIcon('share')}</span>
      <span class="in-tg-copy">
        <span class="in-tg-title">Уведомления в Telegram</span>
        <span class="in-tg-text">Заявки будут приходить сразу — бесплатно.</span>
      </span>
      ${renderIcon('chevron-right')}
    </button>
  `;
}

/* ─────────── Заявки «Узнать цену» ─────────── */

// Русское склонение по числу: plural(2, 'заявка','заявки','заявок') → 'заявки'.
function plural(n, one, few, many) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}

// Название метки-источника по её id. Клиент пришёл по QR метки → заявка несёт
// tagId → показываем владельцу «откуда пришёл этот клиент». tags и leads оба в
// ответе сервера, сопоставляем на клиенте — без запроса и без изменений API.
function tagLabelById(tagId) {
  if (!tagId) return '';
  const tag = state.tags.find((t) => t.id === tagId);
  return tag ? tag.label : '';
}

// Бейдж источника заявки + ручная пометка. Если клиент пришёл по QR — метка
// стоит сама. Если пришёл мимо QR (сказал устно) — владелец выбирает источник
// вручную из своих меток. Выбор показываем только когда метки вообще заведены.
function renderLeadSource(leadId, tagId) {
  const label = tagLabelById(tagId);
  const badge = label ? `<span class="in-lead-src">${renderIcon('qr')} ${escapeHtml(label)}</span>` : '';
  // Нет ни одной метки — выбирать не из чего, показываем только бейдж (если есть).
  if (!state.tags.length) return badge;

  const options = state.tags
    .map((t) => `<option value="${escapeAttr(t.id)}"${t.id === tagId ? ' selected' : ''}>${escapeHtml(t.label)}</option>`)
    .join('');
  // Селект с пустым первым пунктом = «убрать/не указан». Меняет источник заявки.
  const select = `
    <label class="in-lead-srcpick">
      ${renderIcon('qr')}
      <select class="in-lead-srcpick-sel" data-lead-tag="${escapeAttr(leadId)}" aria-label="Источник заявки">
        <option value="">${label ? 'Сменить источник…' : 'Указать источник'}</option>
        ${options}
      </select>
    </label>`;
  // Если метка уже есть — показываем бейдж И даём сменить; если нет — только выбор.
  return badge ? `${badge}${select}` : select;
}

// Градус интереса 0–100: насколько клиент «горячий». Складываем из активности
// (сколько заходил, сколько разделов смотрел) и свежести (недавно = теплее).
// Это подсказка к действию, а не точная наука — важен порядок, не десятые.
function interestScore(profile) {
  if (!profile) return 0;
  const visits = Number(profile.visits) || 0;
  const sections = Object.keys(profile.interests || {}).length;
  const views = Object.values(profile.interests || {}).reduce((s, n) => s + (Number(n) || 0), 0);

  let score = 0;
  score += Math.min(visits, 5) * 8;      // заходы: до 40
  score += Math.min(sections, 4) * 8;    // охват разделов: до 32
  score += Math.min(views, 7) * 4;       // глубина просмотров: до 28

  // Свежесть: заходил в последние 2 дня — полный вес, дальше затухает.
  const days = profile.lastAt ? (Date.now() - profile.lastAt) / 86400000 : 999;
  if (days > 2) score *= days > 14 ? 0.5 : 0.75;

  return Math.max(0, Math.min(100, Math.round(score)));
}

// Словесная температура по градусу — понятнее числа.
function interestLabel(score) {
  if (score >= 70) return { text: 'горячий', cls: 'is-hot' };
  if (score >= 40) return { text: 'тёплый', cls: 'is-warm' };
  return { text: 'смотрел', cls: 'is-cold' };
}

// Досье гостя: что смотрел (по убыванию интереса) + градус + команда к действию.
// Показывается только если заявка связана с профилем гостя (Pro прислал profile).
function renderLeadDossier(lead) {
  const p = lead.profile;
  if (!p) return '';
  const entries = Object.entries(p.interests || {}).sort((a, b) => b[1] - a[1]);
  const score = interestScore(p);
  const temp = interestLabel(score);
  const top = entries[0]?.[0] || p.interest || '';

  const rows = entries.slice(0, 3).map(([name, count], i) => {
    const dots = '●'.repeat(Math.min(count, 3)) + '○'.repeat(Math.max(0, 3 - Math.min(count, 3)));
    return `
      <div class="in-dos-row${i === 0 ? ' is-top' : ''}">
        <span class="in-dos-sec">${escapeHtml(name)}</span>
        <span class="in-dos-dots">${dots}</span>
      </div>`;
  }).join('');

  const action = top
    ? `Смотрел «${escapeHtml(top)}». ${score >= 70 ? 'Звони первым — горячий.' : score >= 40 ? 'Перезвони, интерес есть.' : 'Напиши, пока помнит.'}`
    : '';

  return `
    <div class="in-dossier">
      <div class="in-dos-head">
        <span class="in-dos-title">${renderIcon('pulse')} Что смотрел</span>
        <span class="in-dos-temp ${temp.cls}">${score}° · ${temp.text}</span>
      </div>
      <div class="in-dos-bar"><span style="width:${score}%"></span></div>
      ${rows ? `<div class="in-dos-rows">${rows}</div>` : ''}
      ${p.visits > 1 ? `<div class="in-dos-visits">Заходил ${p.visits} ${plural(p.visits, 'раз', 'раза', 'раз')}</div>` : ''}
      ${action ? `<div class="in-dos-action">${renderIcon('info')} ${action}</div>` : ''}
    </div>`;
}

// «Догони» — горячие гости, которые смотрели, но заявку не оставили. Контакта
// нет (гость его не дал), но видно интерес и активность — владелец понимает,
// что теряет заинтересованного человека. Показываем сортированными по градусу.
function renderHotChase() {
  if (!state.ownerPro || !state.hot.length) return '';
  const rows = state.hot
    .map((v) => ({ v, score: interestScore(v) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map(({ v, score }) => {
      const temp = interestLabel(score);
      const top = Object.entries(v.interests || {}).sort((a, b) => b[1] - a[1])[0]?.[0] || v.interest || '';
      const src = tagLabelById(v.tagId);
      return `
        <div class="in-chase in-chase--${temp.cls.replace('is-', '')}">
          <div class="in-chase-top">
            <span class="in-chase-name">${top ? `Смотрел «${escapeHtml(top)}»` : 'Активный гость'}</span>
            <span class="in-chase-temp ${temp.cls}">${score}°</span>
          </div>
          <div class="in-chase-meta">Заходил ${v.visits} ${plural(v.visits, 'раз', 'раза', 'раз')}${src ? ` · ${escapeHtml(src)}` : ''} · заявку не оставил</div>
        </div>`;
    })
    .join('');
  return `
    <section class="in-section">
      <div class="in-section-head">
        <h2 class="in-section-title">Смотрели, но молчат</h2>
      </div>
      <p class="in-section-sub">Гости без заявки: заходили не раз и изучали визитку. Контакта нет, но интерес виден — стоит напомнить о себе там, где вы с ними общались.</p>
      <div class="in-chases">${rows}</div>
    </section>
  `;
}

const SOURCE_LABELS = {
  vk: { title: 'ВКонтакте', sub: 'рассылка и сообщения' },
  max: { title: 'MAX', sub: 'рассылка и сообщения' },
  wa: { title: 'WhatsApp', sub: 'рассылка и сообщения' },
  tg: { title: 'Telegram', sub: 'рассылка и сообщения' },
  sales: { title: 'Sales', sub: 'автоматическая рассылка' },
  qr: { title: 'QR-код', sub: 'режим показа на телефоне' },
  insta: { title: 'Instagram', sub: 'ссылка в профиле' },
  site: { title: 'Сайт', sub: 'ссылка на сайте' }
};

const WEEKDAYS = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

function leadMeta(lead) {
  return [
    formatEventDate(lead.eventDate),
    lead.city,
    lead.format
  ].filter(Boolean).join(' · ');
}

// Заявки — горячие лиды, поэтому стоят сразу под сводкой. Контакт клиента
// («кто это») — Pro: имя, праздник и дата видны всем, а контакт сервер режет
// для не-Pro и показывается под замком «Открыть в Eventory Pro».
function renderLeads() {
  if (!state.leads.length) {
    return `
      <section class="in-section in-leads-empty">
        <div class="in-section-head">
          <h2 class="in-section-title">Заявки</h2>
        </div>
        <p class="in-section-sub">Здесь появятся люди, которые нажали «Проверить дату»: праздник, дата, город и контакт.</p>
      </section>
    `;
  }
  const unread = state.leads.filter((l) => !l.read).length;

  return `
    <section class="in-section">
      <div class="in-section-head">
        <h2 class="in-section-title">Заявки</h2>
        ${unread ? `<span class="in-badge in-badge--hot">${unread} ${plural(unread, 'новая', 'новые', 'новых')}</span>` : ''}
      </div>

      <div class="in-leads">
        ${state.leads.slice(0, 20).map((l) => {
          // Название — из визитки, а для удалённого своего праздника — из
          // самой заявки: сервер сохранил его в момент отправки.
          const occasion = findOccasion(state.card, { id: l.occasion });
          const occasionName = occasion ? occasionTitle(occasion) : (l.occasionTitle || '');
          const meta = leadMeta(l);
          return `
          <div class="in-lead${l.read ? '' : ' is-new'}">
            <div class="in-lead-top">
              <span class="in-lead-name">${escapeHtml(l.name || 'Без имени')}${occasionName ? ` <span class="in-lead-occ">· ${escapeHtml(occasionName)}</span>` : ''}</span>
              <span class="in-lead-status${l.read ? '' : ' is-new'}">${l.read ? 'Просмотрена' : 'Новая'}</span>
            </div>
            ${meta ? `<p class="in-lead-meta">${escapeHtml(meta)}</p>` : ''}
            ${renderLeadSource(l.id, l.tagId)}
            ${state.ownerPro ? renderLeadContactOpen(l) : `
              <div class="in-lead-contact-lock">
                <span class="in-lead-contact-blur">${escapeHtml(l.contact || 'контакт скрыт')}</span>
                <span class="in-lead-lock">${renderIcon('wallet')} Открыть контакт с Pro</span>
              </div>
            `}
            ${state.ownerPro ? renderLeadDossier(l) : ''}
            <div class="in-lead-foot">
              <span class="in-lead-time">${escapeHtml(formatDate(l.createdAt))}${l.source && SOURCE_LABELS[l.source] ? ` · ${escapeHtml(SOURCE_LABELS[l.source].title)}` : ''}</span>
              <button type="button" class="in-lead-delete" data-lead-delete="${escapeAttr(l.id)}" aria-label="Удалить заявку">${renderIcon('trash')}</button>
            </div>
          </div>
        `;
        }).join('')}
      </div>

      ${state.ownerPro ? '' : `
        <a class="in-lead-pro" href="${escapeAttr(upsellHref('leads', state.card?.leadKey))}" target="_blank" rel="noopener">
          ${renderIcon('wallet')}
          <span class="in-lead-pro-copy">
            <span class="in-lead-pro-title">Открыть контакты клиентов</span>
            <span class="in-lead-pro-note">Оформите Eventory Pro — имя и телефон появятся прямо здесь</span>
          </span>
          ${renderIcon('chevron-right')}
        </a>
      `}
    </section>
  `;
}

/* ─────────── Сводка ─────────── */

function renderSummary() {
  const summary = state.summary || {};
  const days = state.days.length ? state.days : [];
  const week = days.reduce((sum, d) => sum + (d.opens || 0), 0);
  const peak = Math.max(1, ...days.map((d) => d.opens || 0));
  const unread = state.leads.filter((l) => !l.read).length;
  return `
    <div class="in-bento">
      <div class="in-tile in-tile--wide">
        <div class="in-tile-main">
          <span class="in-tile-label">Открыли визитку</span>
          <span class="in-tile-value">${summary.opens || 0}</span>
          <span class="in-tile-note">${week ? `${week} за последние 7 дней` : 'За 7 дней открытий нет'}${summary.visitors ? ` · ${summary.visitors} ${plural(summary.visitors, 'человек', 'человека', 'человек')}` : ''}</span>
        </div>
        ${days.length ? `
          <div class="in-bars" role="img" aria-label="Открытия по дням за неделю">
            ${days.map((d, i) => {
              const h = Math.max(6, Math.round(((d.opens || 0) / peak) * 72));
              const wd = WEEKDAYS[new Date(`${d.day}T12:00:00`).getDay()];
              return `
                <span class="in-bar${i === days.length - 1 ? ' is-today' : ''}">
                  <span class="in-bar-fill" style="height:${h}px"></span>
                  <span class="in-bar-day">${wd}</span>
                </span>
              `;
            }).join('')}
          </div>
        ` : ''}
      </div>
      <div class="in-tile">
        <span class="in-tile-label">Заявки</span>
        <span class="in-tile-value is-accent">${state.leads.length}</span>
        <span class="in-tile-note">${unread ? `${unread} ${plural(unread, 'новая', 'новые', 'новых')}` : 'новых нет'}</span>
      </div>
      <div class="in-tile">
        <span class="in-tile-label">Обращения</span>
        <span class="in-tile-value">${summary.contacts || 0}</span>
        <span class="in-tile-note">звонки, сообщения, контакт</span>
      </div>
    </div>
  `;
}

function renderBars(title, rows, empty) {
  if (!rows.length) {
    return `
      <section class="in-section">
        <div class="in-section-head"><h2 class="in-section-title">${escapeHtml(title)}</h2></div>
        <p class="in-section-sub">${escapeHtml(empty)}</p>
      </section>
    `;
  }
  const total = rows.reduce((sum, r) => sum + r.count, 0) || 1;
  return `
    <section class="in-section">
      <div class="in-section-head"><h2 class="in-section-title">${escapeHtml(title)}</h2></div>
      <div class="in-meter">
        ${rows.map((r, i) => {
          const pct = Math.round((r.count / total) * 100);
          return `
            <div class="in-meter-row">
              <div class="in-meter-top">
                <span class="in-meter-name">${escapeHtml(r.title)}${r.sub ? `<span class="in-meter-sub">${escapeHtml(r.sub)}</span>` : ''}</span>
                <span class="in-meter-count">${r.count}</span>
              </div>
              <div class="in-meter-track" aria-hidden="true"><span class="${i === 0 ? 'is-top' : ''}" style="width:${pct}%"></span></div>
            </div>
          `;
        }).join('')}
      </div>
    </section>
  `;
}

function renderOccasionStats() {
  const counts = state.summary?.occasions || {};
  const rows = occasionsOf(state.card)
    .map((o) => ({ title: occasionTitle(o), count: Number(counts[o.id]) || 0 }))
    .filter((r) => r.count > 0)
    .sort((a, b) => b.count - a.count);
  return renderBars('Какой праздник смотрят', rows, 'Появится, когда люди начнут открывать страницы праздников.');
}

function renderSourceStats() {
  const counts = state.summary?.sources || {};
  const rows = Object.entries(SOURCE_LABELS)
    .map(([id, label]) => ({ title: label.title, sub: label.sub, count: Number(counts[id]) || 0 }))
    .filter((r) => r.count > 0)
    .sort((a, b) => b.count - a.count);
  return renderBars('Откуда пришли', rows, 'Ссылки из Sales и QR в режиме показа подписаны каналом — здесь будет видно, что приводит людей.');
}

function renderUpsell(pointId) {
  const point = activeUpsell(pointId);
  if (!point) return '';
  return `
    <a class="ca-upsell" href="${escapeAttr(upsellHref(pointId, state.card?.leadKey))}" target="_blank" rel="noopener">
      <span class="ca-upsell-eyebrow">${escapeHtml(point.eyebrow)}</span>
      <span class="ca-upsell-title">${escapeHtml(point.title)}</span>
      <span class="ca-upsell-text">${escapeHtml(point.text)}</span>
      <span class="ca-upsell-cta">${escapeHtml(point.cta)} ${renderIcon('chevron-right')}</span>
    </a>
  `;
}

function renderContent() {
  const head = '<div class="ca-page-head"><h1 class="ca-page-title">Отклик</h1></div>';
  if (state.loading) return `${head}<div class="ca-loading">Загружаем…</div>`;

  if (!state.card?.publishedSlug) {
    return `
      ${head}
      <div class="ca-empty">
        <p class="ca-empty-title">Сначала опубликуйте визитку</p>
        <p class="ca-empty-text">После публикации здесь появится статистика: кто открывал визитку, какой праздник смотрят и откуда пришли.</p>
        <a class="ca-btn ca-btn--primary" href="#/editor">К визитке</a>
      </div>
    `;
  }

  return `
    ${head}
    <div class="in-page">
      ${renderSummary()}
      ${renderLeads()}
      ${renderOccasionStats()}
      ${renderSourceStats()}
      ${renderHotChase()}
      ${renderTelegramConnect()}

      <section class="in-section">
        <div class="in-section-head">
          <h2 class="in-section-title">Мероприятия</h2>
        </div>
        <p class="in-section-sub">Метка под событие — своя ссылка и QR. Через месяц видно, какое мероприятие принесло клиентов.</p>

        ${state.tags.length
          ? `<div class="in-tags">${state.tags.map(renderTag).join('')}</div>`
          : ''}

        ${renderForm()}
      </section>

      ${renderUpsell('analytics')}
    </div>
  `;
}

/* ─────────── Экран ─────────── */

export const insight = {
  id: 'insight',
  title: 'Отклик',
  render() {
    return renderContent();
  },
  async mount(node, ctx = {}) {
    const isCurrent = typeof ctx.isCurrent === 'function' ? ctx.isCurrent : () => true;
    state.card = await getCard();
    if (!isCurrent()) return;

    // Возврат на уже открывавшийся экран: данные лежат в state с прошлого раза,
    // поэтому рисуем их сразу — переключение вкладки выглядит мгновенным, как в
    // приложении, а не «пустой экран → загрузка → данные». Свежие цифры
    // подтянутся ниже и тихо заменят показанные. Первый заход, как и раньше,
    // показывает «Загружаем…»: показывать там нечего.
    //
    // Прошлые данные годятся только для той же визитки: после восстановления
    // копии или смены ключа на экране мелькнули бы заявки чужой карточки.
    const cardKey = `${state.card.publishedSlug || ''}:${state.card.leadKey || ''}`;
    if (!state.loaded || state.loadedFor !== cardKey) {
      state.loaded = false;
      state.loading = true;
      state.summary = { opens: 0, visitors: 0, contacts: 0, lastAt: 0, occasions: {}, sources: {} };
      state.days = [];
      state.tags = [];
      state.leads = [];
      state.hot = [];
      state.tgConnected = false;
    }
    // Состояние самого экрана (открытая форма, раскрытый QR) не переносим.
    state.form = false;
    state.qrFor = '';
    // Бесшовный Pro: если визитка помнит активную подписку — показываем Pro
    // сразу, ещё до ответа сервера. Сервер ниже подтвердит и продлит срок.
    state.ownerPro = localProActive();

    node.innerHTML = renderContent();
    // Биндим сразу: на возврате экран уже с данными, и кнопки должны работать
    // до того, как придёт ответ сервера.
    bind(node);

    if (state.card.publishedSlug) {
      try {
        // Данные экрана и статус Telegram грузим ПАРАЛЛЕЛЬНО — ждём оба и рисуем
        // экран один раз, уже с готовой строкой Telegram. Раньше статус летел
        // отдельным запросом с ещё одним rerender — строка «Подключено» прыгала
        // поверх готового экрана. Promise.all не суммирует задержки: ждём
        // максимум из двух, а не последовательно. Статус не роняет весь экран
        // (своя защита в telegramStatus → false), поэтому в общем try безопасен.
        const [data, tgConnected] = await Promise.all([fetchInsight(), telegramStatus()]);
        state.summary = data.summary || state.summary;
        state.days = data.days || [];
        state.tags = data.tags || [];
        state.leads = data.leads || [];
        state.hot = data.hot || [];
        state.tgConnected = tgConnected;
        // Сервер — источник истины (он же режет данные по реальной подписке).
        // Пришёл ответ → синхронизируем и локальную память под него.
        state.ownerPro = data.ownerPro === true;
        writeLocalProUntil(data.ownerPro === true ? data.proUntil : 0);
        // Владелец увидел заявки — снимаем пометку «новое» на сервере. На экране
        // она остаётся до следующего захода: сразу видно, что пришло нового.
        if (state.leads.some((l) => !l.read)) markLeadsRead().catch(() => {});
      } catch { /* нет сети — покажем пустой экран, без ошибки на весь экран */ }
    }

    state.loading = false;
    state.loaded = true;
    state.loadedFor = cardKey;
    // Ответ пришёл, а человек уже на другой вкладке — не трогаем чужой экран.
    // Данные при этом сохранены: при возврате они покажутся сразу.
    if (!isCurrent()) return;
    node.innerHTML = renderContent();
    bind(node);
  }
};

function rerender(node) {
  node.innerHTML = renderContent();
  bind(node);
}

function bind(node) {
  const tgLink = node.querySelector('[data-tg-link]');
  if (tgLink) {
    tgLink.addEventListener('click', async () => {
      try {
        const url = await telegramLink();
        if (url) window.open(url, '_blank', 'noopener');
        // После возврата из бота статус подтянется при следующем открытии
        // экрана; подскажем, что нужно нажать Start.
        toast.show('Нажмите «Начать» в Telegram — заявки пойдут сюда', { ok: true });
      } catch {
        toast.show('Не удалось открыть Telegram', { error: true });
      }
    });
  }

  const tgUnlink = node.querySelector('[data-tg-unlink]');
  if (tgUnlink) {
    tgUnlink.addEventListener('click', async () => {
      try {
        await telegramUnlink();
        state.tgConnected = false;
        rerender(node);
        toast.show('Telegram отключён');
      } catch {
        toast.show('Не удалось отключить', { error: true });
      }
    });
  }

  const newBtn = node.querySelector('[data-tag-new]');
  if (newBtn) {
    newBtn.addEventListener('click', () => {
      state.form = true;
      rerender(node);
      node.querySelector('[data-field-label]')?.focus();
    });
  }

  const cancel = node.querySelector('[data-tag-cancel]');
  if (cancel) {
    cancel.addEventListener('click', () => {
      state.form = false;
      rerender(node);
    });
  }

  const save = node.querySelector('[data-tag-save]');
  if (save) {
    save.addEventListener('click', async () => {
      const label = node.querySelector('[data-field-label]')?.value?.trim() || '';
      if (!label) {
        toast.show('Назовите мероприятие');
        return;
      }
      state.busy = true;
      rerender(node);
      try {
        const tag = await createTag({
          label,
          place: node.querySelector('[data-field-place]')?.value || '',
          date: node.querySelector('[data-field-date]')?.value || ''
        });
        state.tags = [{ ...tag, stats: { opens: 0, visitors: 0, contacts: 0 } }, ...state.tags];
        state.form = false;
        hapticSuccess();
        toast.show('Метка создана — раздавайте визитку по её ссылке', { ok: true });
      } catch {
        toast.show('Не удалось создать', { error: true });
      } finally {
        state.busy = false;
        rerender(node);
      }
    });
  }

  node.querySelectorAll('[data-tag-qr]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.tagQr;
      state.qrFor = state.qrFor === id ? '' : id;
      hapticLight();
      rerender(node);
    });
  });

  node.querySelectorAll('[data-tag-copy]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(btn.dataset.tagCopy);
        toast.show('Ссылка скопирована', { ok: true });
      } catch {
        toast.show('Скопируйте ссылку вручную');
      }
    });
  });

  node.querySelectorAll('[data-tag-share]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const url = btn.dataset.tagShare;
      if (navigator.share) {
        await navigator.share({ url }).catch(() => {});
        return;
      }
      try {
        await navigator.clipboard.writeText(url);
        toast.show('Ссылка скопирована', { ok: true });
      } catch {
        toast.show('Скопируйте ссылку вручную');
      }
    });
  });

  node.querySelectorAll('[data-tag-delete]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!window.confirm('Удалить метку? Статистика по ней будет потеряна.')) return;
      const id = btn.dataset.tagDelete;
      try {
        await deleteTag(id);
        state.tags = state.tags.filter((t) => t.id !== id);
        state.qrFor = '';
        rerender(node);
        toast.show('Метка удалена');
      } catch {
        toast.show('Не удалось удалить', { error: true });
      }
    });
  });

  node.querySelectorAll('[data-lead-delete]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!window.confirm('Удалить заявку? Это действие необратимо.')) return;
      const id = btn.dataset.leadDelete;
      try {
        const ok = await deleteLead(id);
        if (!ok) { toast.show('Не удалось удалить', { error: true }); return; }
        state.leads = state.leads.filter((l) => l.id !== id);
        rerender(node);
        toast.show('Заявка удалена');
      } catch {
        toast.show('Не удалось удалить', { error: true });
      }
    });
  });

  // Ручная пометка источника: владелец выбрал метку для заявки (клиент пришёл
  // не по QR). Пустое значение = снять источник. Обновляем на сервере и в state.
  node.querySelectorAll('[data-lead-tag]').forEach((sel) => {
    sel.addEventListener('change', async () => {
      const id = sel.dataset.leadTag;
      const tagId = sel.value;
      try {
        const ok = await setLeadTag(id, tagId);
        if (!ok) { toast.show('Не удалось сохранить источник', { error: true }); return; }
        const lead = state.leads.find((l) => l.id === id);
        if (lead) lead.tagId = tagId;
        rerender(node);
        toast.show(tagId ? 'Источник указан' : 'Источник убран', { ok: true });
      } catch {
        toast.show('Не удалось сохранить источник', { error: true });
      }
    });
  });
}
