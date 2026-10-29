// «Рекомендую для вашего праздника» — артисты команды на визитке организатора
// (режим организатора Eventory, этап 3).
//
// Клиент остаётся на визитке организатора: смотрит промо артиста в шторке,
// добавляет его переключателем, а нижняя панель вместо «Проверить дату»
// показывает, сколько добавлено, и кнопку «Хочу так». Цены — уже под город
// праздника (?city=… в ссылке, иначе город организатора), одной суммой:
// ни базовой цены артиста, ни наценки, ни его контактов здесь нет.
// Данные — Eventory, api/_card-team.js.
import './styles/date-request.css';
import './styles/team-block.css';
import { escapeHtml, escapeAttr } from './shared/lib/html.js';
import { renderIcon } from './shared/components/icons.js';
import { toast } from './shared/components/toast.js';
import { hapticLight, hapticSuccess } from './shared/lib/haptic.js';
import { fitSheetToKeyboard } from './shared/lib/sheet-keyboard.js';
import { openVideoModal } from './video-modal.js';

const API = '/api/promo?service=partners&action=';
const SHEET_CLOSE_MS = 260;

// Выбор клиента живёт в пределах визита: закрыл шторку — ничего не потерял.
let state = freshState();

function freshState() {
  return { slug: '', city: '', members: [], picked: {}, name: '', phone: '', date: '', busy: false, sent: false, interactive: true };
}

function money(value) {
  return `${Math.round(Number(value) || 0).toLocaleString('ru-RU')} ₽`;
}

export function readCityFromUrl() {
  try {
    return String(new URLSearchParams(window.location.search).get('city') || '').trim().slice(0, 80);
  } catch {
    return '';
  }
}

export async function fetchCardTeam(slug, city) {
  try {
    const query = `slug=${encodeURIComponent(slug)}${city ? `&city=${encodeURIComponent(city)}` : ''}`;
    const res = await fetch(`${API}card-team&${query}`);
    const data = await res.json();
    return data?.ok ? { city: data.city || '', members: data.members || [] } : null;
  } catch {
    return null;
  }
}

function member(id) {
  return state.members.find((m) => m.id === id) || null;
}

function pickedService(m) {
  const id = state.picked[m.id];
  return m.services.find((s) => s.id === id) || null;
}

// Что показываем на плитке: выбранная услуга, а пока не выбрано — первая.
function shownService(m) {
  return pickedService(m) || m.services[0];
}

function pickedList() {
  return state.members.filter((m) => state.picked[m.id]).map((m) => ({ m, s: pickedService(m) })).filter((p) => p.s);
}

function avatar(m) {
  const src = m.photo || m.cover;
  return src
    ? `<img class="tb-photo" src="${escapeAttr(src)}" alt="" loading="lazy" />`
    : `<span class="tb-photo is-empty" aria-hidden="true">${escapeHtml((m.name || '·')[0])}</span>`;
}

function renderItem(m) {
  const on = Boolean(state.picked[m.id]);
  const s = shownService(m);
  return `
    <article class="tb-item${on ? ' is-on' : ''}" data-tb-member="${escapeAttr(m.id)}">
      <button type="button" class="tb-open" data-tb-open="${escapeAttr(m.id)}">
        ${avatar(m)}
        <span class="tb-text">
          <span class="tb-name">${escapeHtml(m.name)}</span>
          ${m.role ? `<span class="tb-role">${escapeHtml(m.role)}</span>` : ''}
          <span class="tb-service">${escapeHtml(s.title)}</span>
        </span>
      </button>
      <div class="tb-side">
        <b class="tb-price">+${escapeHtml(money(s.price))}</b>
        <button type="button" class="tb-switch" role="switch" aria-checked="${on}" aria-label="Добавить ${escapeAttr(m.name)}" data-tb-toggle="${escapeAttr(m.id)}"></button>
      </div>
    </article>
  `;
}

function renderSection() {
  return `
    <section class="tb" data-team-block>
      <span class="tb-kicker">Рекомендую для вашего праздника</span>
      <h2 class="tb-title">Соберите праздник целиком</h2>
      <p class="tb-lead">Артисты, с которыми я работаю. Добавьте их к программе, а согласую всё я.${state.city ? ` Цены для города ${escapeHtml(state.city)}.` : ''}</p>
      <div class="tb-list">${state.members.map(renderItem).join('')}</div>
    </section>
  `;
}

function renderBar() {
  const list = pickedList();
  const total = list.reduce((sum, p) => sum + p.s.price, 0);
  const names = list.map((p) => p.m.name).join(', ');
  return `
    <div class="tb-bar" data-tb-bar ${list.length ? '' : 'hidden'}>
      <span class="tb-bar-text">
        <span class="tb-bar-names">${escapeHtml(names)}</span>
        <b>+${escapeHtml(money(total))}</b>
      </span>
      <button type="button" class="vz-cta tb-bar-cta" data-tb-want>Хочу так</button>
    </div>
  `;
}

/* ─────────── Шторка ─────────── */

function openSheet(renderBody, onBind) {
  document.querySelector('[data-tb-sheet]')?.remove();
  hapticLight();
  const overlay = document.createElement('div');
  overlay.className = 'dr-overlay';
  overlay.setAttribute('data-tb-sheet', '');
  overlay.innerHTML = `
    <section class="dr-sheet" role="dialog" aria-modal="true">
      <span class="dr-handle" aria-hidden="true"></span>
      <div class="dr-body" data-tb-body></div>
    </section>
  `;
  document.body.appendChild(overlay);
  const previousOverflow = document.documentElement.style.overflow;
  document.documentElement.style.overflow = 'hidden';
  requestAnimationFrame(() => overlay.classList.add('is-open'));
  const body = overlay.querySelector('[data-tb-body]');
  const releaseKeyboard = fitSheetToKeyboard(overlay, body);

  function close() {
    // Закрывающаяся шторка не должна перехватывать следующее касание.
    overlay.style.pointerEvents = 'none';
    overlay.classList.remove('is-open');
    releaseKeyboard();
    window.setTimeout(() => {
      overlay.remove();
      document.documentElement.style.overflow = previousOverflow;
    }, SHEET_CLOSE_MS);
  }
  function render() {
    body.innerHTML = renderBody();
    body.querySelectorAll('[data-tb-close]').forEach((btn) => btn.addEventListener('click', close));
    onBind(body, { close, render });
  }
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  render();
}

function sheetHead(title) {
  return `
    <div class="dr-head">
      <span class="tb-kicker">${escapeHtml(title)}</span>
      <button type="button" class="dr-close" data-tb-close aria-label="Закрыть">${renderIcon('x', { size: 18 })}</button>
    </div>
  `;
}

function renderPromo(m, chosenId) {
  const chosen = m.services.find((s) => s.id === chosenId) || shownService(m);
  const on = Boolean(state.picked[m.id]);
  return `
    ${sheetHead('Рекомендую')}
    <div class="tb-promo">
      ${m.cover ? `<img class="tb-cover" src="${escapeAttr(m.cover)}" alt="" />` : ''}
      <h2 class="dr-title">${escapeHtml(m.name)}</h2>
      ${m.role ? `<p class="tb-role">${escapeHtml(m.role)}</p>` : ''}
      ${m.tagline ? `<p class="tb-tagline">${escapeHtml(m.tagline)}</p>` : ''}
      ${m.videoUrl ? `<button type="button" class="tb-video" data-tb-video>${renderIcon('play', { size: 18 })}Смотреть видео</button>` : ''}
      ${m.gallery.length ? `
        <div class="tb-gallery">
          ${m.gallery.map((g) => `<figure><img src="${escapeAttr(g.src)}" alt="" loading="lazy" />${g.title ? `<figcaption>${escapeHtml(g.title)}</figcaption>` : ''}</figure>`).join('')}
        </div>` : ''}
      <div class="tb-services" role="radiogroup" aria-label="Что добавить">
        ${m.services.map((s) => `
          <button type="button" class="tb-option${s.id === chosen.id ? ' is-on' : ''}" role="radio" aria-checked="${s.id === chosen.id}" data-tb-service="${escapeAttr(s.id)}">
            <span class="tb-option-head"><span>${escapeHtml(s.title)}</span><b>${escapeHtml(money(s.price))}</b></span>
            ${s.summary ? `<span class="tb-option-text">${escapeHtml(s.summary)}</span>` : ''}
            ${s.description ? `<span class="tb-option-text">${escapeHtml(s.description).replace(/\n/g, ' · ')}</span>` : ''}
          </button>
        `).join('')}
      </div>
      <button type="button" class="vz-cta dr-submit" data-tb-add>${on ? 'Убрать из программы' : `Добавить за ${escapeHtml(money(chosen.price))}`}</button>
    </div>
  `;
}

function openPromo(id) {
  const m = member(id);
  if (!m) return;
  let chosenId = shownService(m).id;
  openSheet(() => renderPromo(m, chosenId), (body, { close, render }) => {
    body.querySelector('[data-tb-video]')?.addEventListener('click', () => openVideoModal(m.videoUrl, { title: m.name }));
    body.querySelectorAll('[data-tb-service]').forEach((btn) => btn.addEventListener('click', () => {
      chosenId = btn.dataset.tbService;
      // Выбрали другой вариант у уже добавленного артиста — сразу меняем его.
      if (state.picked[m.id]) setPicked(m.id, chosenId);
      render();
    }));
    body.querySelector('[data-tb-add]')?.addEventListener('click', () => {
      setPicked(m.id, state.picked[m.id] ? '' : chosenId);
      close();
    });
  });
}

function renderRequest() {
  if (state.sent) {
    return `
      ${sheetHead('')}
      <div class="dr-done">
        <span class="dr-done-ring" aria-hidden="true">${renderIcon('check', { size: 36 })}</span>
        <h2 class="dr-title">Заявка у меня</h2>
        <p class="dr-done-text">Проверю, свободны ли артисты, и перезвоню вам.</p>
        <button type="button" class="dr-text-btn" data-tb-close>Вернуться к визитке</button>
      </div>
    `;
  }
  const list = pickedList();
  const total = list.reduce((sum, p) => sum + p.s.price, 0);
  return `
    ${sheetHead('Ваш праздник')}
    <h2 class="dr-title">Добавить к программе</h2>
    <dl class="dr-summary tb-summary">
      ${list.map((p) => `<div><dt>${escapeHtml(p.m.name)} · ${escapeHtml(p.s.title)}</dt><dd>${escapeHtml(money(p.s.price))}</dd></div>`).join('')}
      <div class="tb-summary-total"><dt>Дополнительно${state.city ? `, ${escapeHtml(state.city)}` : ''}</dt><dd>${escapeHtml(money(total))}</dd></div>
    </dl>
    <form class="dr-form" data-tb-form novalidate>
      <label class="dr-field"><span class="dr-label">Как вас зовут</span><input class="dr-input" name="name" autocomplete="name" maxlength="80" value="${escapeAttr(state.name)}" /></label>
      <label class="dr-field"><span class="dr-label">Телефон</span><input class="dr-input" name="phone" type="tel" inputmode="tel" autocomplete="tel" maxlength="30" placeholder="+7 900 000-00-00" value="${escapeAttr(state.phone)}" /></label>
      <label class="dr-field"><span class="dr-label">Дата праздника (по желанию)</span><input class="dr-input" name="date" type="date" value="${escapeAttr(state.date)}" /></label>
      <button type="submit" class="vz-cta dr-submit" ${state.busy ? 'disabled' : ''}>${state.busy ? 'Отправляю…' : 'Отправить'}</button>
      <p class="dr-privacy">Контакт не публикуется, он нужен только для ответа.</p>
    </form>
  `;
}

function openRequest() {
  if (!pickedList().length) return;
  openSheet(renderRequest, (body, { render }) => {
    const form = body.querySelector('[data-tb-form]');
    if (!form) return;
    form.addEventListener('input', (e) => { state = { ...state, [e.target.name]: e.target.value }; });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!state.name.trim() || state.phone.replace(/\D/g, '').length < 10) {
        toast.show('Укажите имя и телефон, по нему перезвоню');
        return;
      }
      if (!state.interactive) {
        toast.show('Это предпросмотр. Заявки принимает опубликованная визитка');
        return;
      }
      state = { ...state, busy: true };
      render();
      try {
        const res = await fetch(`${API}card-team-request`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            slug: state.slug,
            city: state.city,
            name: state.name.trim(),
            phone: state.phone.trim(),
            date: state.date,
            items: pickedList().map((p) => ({ memberId: p.m.id, serviceId: p.s.id }))
          })
        });
        const data = await res.json();
        if (!data?.ok) throw new Error(data?.error || 'failed');
        state = { ...state, busy: false, sent: true };
        hapticSuccess();
      } catch {
        state = { ...state, busy: false };
        toast.show('Не получилось отправить. Позвоните или напишите, контакты есть на визитке.');
      }
      render();
    });
  });
}

/* ─────────── На странице ─────────── */

let host = null;

function setPicked(id, serviceId) {
  const picked = { ...state.picked };
  if (serviceId) picked[id] = serviceId;
  else delete picked[id];
  state = { ...state, picked, sent: false };
  redraw();
}

function redraw() {
  if (!host) return;
  host.querySelector('[data-team-block]')?.replaceWith(htmlToNode(renderSection()));
  host.querySelector('[data-tb-bar]')?.replaceWith(htmlToNode(renderBar()));
  // Пока что-то добавлено, нижняя панель — «Хочу так» вместо «Проверить дату».
  host.querySelector('[data-date-bar]')?.toggleAttribute('hidden', pickedList().length > 0);
}

function htmlToNode(html) {
  const tpl = document.createElement('template');
  tpl.innerHTML = html.trim();
  return tpl.content.firstElementChild;
}

function onClick(e) {
  const toggle = e.target.closest('[data-tb-toggle]');
  if (toggle) {
    hapticLight();
    const m = member(toggle.dataset.tbToggle);
    if (m) setPicked(m.id, state.picked[m.id] ? '' : shownService(m).id);
    return;
  }
  const open = e.target.closest('[data-tb-open]');
  if (open) return openPromo(open.dataset.tbOpen);
  if (e.target.closest('[data-tb-want]')) openRequest();
}

// Встраивает блок в уже нарисованную визитку (над подписью внизу) и панель
// итога. Визитку перерисовывают (кэш → свежие данные) — зовём снова.
export function injectTeamBlock(node, data, { slug, interactive = true } = {}) {
  if (!node || !data?.members?.length) return;
  if (state.slug !== slug) state = freshState();
  state = { ...state, slug, city: data.city, members: data.members, interactive };
  host = node;
  node.querySelector('[data-team-block]')?.remove();
  node.querySelector('[data-tb-bar]')?.remove();
  const page = node.querySelector('.cp-page') || node;
  const footer = page.querySelector('.cp-footer');
  const section = htmlToNode(renderSection());
  if (footer) footer.before(section);
  else page.appendChild(section);
  page.appendChild(htmlToNode(renderBar()));
  if (!node.dataset.tbBound) {
    node.addEventListener('click', onClick);
    node.dataset.tbBound = '1';
  }
  redraw();
}

export function resetTeamBlock() {
  state = freshState();
  host = null;
  document.querySelector('[data-tb-sheet]')?.remove();
}
