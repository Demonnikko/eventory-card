// Раздел «Праздники» в редакторе: разметка и поведение.
//
// Три сезонных праздника из каталога и свои (юбилей, 8 Марта…). У каждого —
// своя продающая страница, и настройки сгруппированы по её экранам в том же
// порядке, в каком их увидит заказчик: обложка → момент → номера →
// изюминка → срочность. Черновик и перерисовку даёт editor.js через api.
import './styles/editor-occasions.css';
import { escapeHtml, escapeAttr } from './shared/lib/html.js';
import { mediaUrl } from './shared/lib/media-url.js';
import { renderIcon } from './shared/components/icons.js';
import { toast } from './shared/components/toast.js';
import { hapticLight } from './shared/lib/haptic.js';
import {
  occasionsOf,
  findOccasion,
  occasionTitle,
  occasionTemplate,
  createCustomOccasionId,
  uniqueOccasionSlug,
  MAX_CUSTOM_OCCASIONS,
  OCCASION_TITLE_MAX,
  OCCASION_FX,
  defaultOccasionFx
} from './shared/data/occasions.js';
import { field } from './editor-sections.js';
import { FX_LABELS } from './occasion-fx.js';
import { uploadOccasionCover } from './cover-upload.js';

const COVER_POSITION_LABELS = { top: 'Лицо сверху', center: 'По центру', bottom: 'Ниже' };

// Своя обложка праздника (например, фото в новогоднем колпаке) — загрузка в
// хранилище. До первой публикации грузить некуда: у визитки ещё нет адреса.
function coverBlock(card, occasion, settings) {
  const id = occasion.id;
  const published = Boolean(card.publishedSlug && card.leadKey);
  const input = `<input type="file" accept="image/*" hidden data-occ-cover-input="${escapeAttr(id)}" />`;
  if (settings.cover) {
    const position = settings.coverPosition || 'top';
    return `
      <div class="ca-occ-cover">
        <img class="ca-occ-cover-img" src="${escapeAttr(mediaUrl(settings.cover))}" alt="Обложка праздника"
          style="object-position:${{ top: 'center 18%', center: 'center', bottom: 'center 82%' }[position]}" />
        <div class="ca-segment" role="radiogroup" aria-label="Кадр обложки">
          ${Object.entries(COVER_POSITION_LABELS).map(([value, label]) => `
            <button type="button" role="radio" aria-checked="${position === value ? 'true' : 'false'}"
              class="ca-segment-btn${position === value ? ' is-active' : ''}" data-occ-cover-pos="${escapeAttr(id)}" data-value="${value}">
              ${escapeHtml(label)}
            </button>
          `).join('')}
        </div>
        <div class="ca-cover-actions">
          <button type="button" class="ca-btn ca-btn--ghost" data-occ-cover-trigger="${escapeAttr(id)}">Заменить</button>
          <button type="button" class="ca-btn ca-btn--ghost" data-occ-cover-remove="${escapeAttr(id)}">Убрать</button>
        </div>
        ${input}
      </div>
    `;
  }
  return `
    <div class="ca-occ-cover">
      <button type="button" class="ca-btn ca-btn--ghost ca-occ-cover-upload" data-occ-cover-trigger="${escapeAttr(id)}"
        ${published ? '' : 'disabled'}>${renderIcon('upload')} Загрузить свою обложку</button>
      <span class="ca-field-hint">${published
        ? 'Например, фото в новогоднем колпаке, только для этой страницы.'
        : 'Станет доступно после первой публикации визитки.'}</span>
      ${input}
    </div>
    ${photoPicker(card, id, 'photo', settings.photo ?? -1, { label: 'Или фото из визитки' })}
  `;
}

// Анимация шапки: «Авто» подбирает её под праздник.
function fxPicker(occasion, settings) {
  const current = settings.fx || 'auto';
  const auto = FX_LABELS[defaultOccasionFx(occasion)] || '';
  return `
    <fieldset class="ca-occ-fx">
      <legend class="ca-field-label">Анимация в шапке</legend>
      <div class="ca-chips">
        ${[...OCCASION_FX.filter((fx) => fx !== 'none'), 'none'].map((fx) => {
          const label = fx === 'auto' ? `Авто · ${auto.toLowerCase()}` : FX_LABELS[fx];
          return `
            <button type="button" class="ca-chip${current === fx ? ' is-active' : ''}" aria-pressed="${current === fx ? 'true' : 'false'}"
              data-occ-fx="${escapeAttr(occasion.id)}" data-value="${fx}">${escapeHtml(label)}</button>
          `;
        }).join('')}
      </div>
    </fieldset>
  `;
}

// Выбор фото. noneLabel — что значит -1: «Обложка» визитки для обложки
// страницы или «Без фото» для момента и изюминки.
function photoPicker(card, occasionId, fieldName, selected, { label, noneLabel = 'Обложка' }) {
  const photos = card.galleryPhotos || [];
  const options = [
    { value: -1, src: noneLabel === 'Обложка' ? card.coverPhoto : '', label: noneLabel },
    ...photos.map((src, i) => ({ value: i, src, label: card.galleryCaptions?.[i] || `Фото ${i + 1}` }))
  ];
  return `
    <fieldset class="ca-photo-pick">
      <legend class="ca-field-label">${escapeHtml(label)}</legend>
      <div class="ca-photo-pick-row">
        ${options.map((o) => `
          <button type="button" class="ca-photo-opt${o.value === selected ? ' is-active' : ''}"
            aria-pressed="${o.value === selected ? 'true' : 'false'}" aria-label="${escapeAttr(o.label)}"
            data-occ-photo="${escapeAttr(occasionId)}" data-occ-field="${escapeAttr(fieldName)}" data-value="${o.value}">
            ${o.src ? `<img src="${escapeAttr(o.src)}" alt="" />` : `<span>${escapeHtml(o.label)}</span>`}
          </button>
        `).join('')}
      </div>
    </fieldset>
  `;
}

function occasionField(occasionId, key, label, value, opts = {}) {
  return field({
    label,
    value,
    data: `data-occ="${escapeAttr(occasionId)}" data-occ-field="${escapeAttr(key)}"`,
    ...opts
  });
}

function group(title, body, hint = '') {
  return `
    <div class="ca-occ-group">
      <span class="ca-occ-group-title">${escapeHtml(title)}</span>
      ${hint ? `<span class="ca-occ-group-hint">${escapeHtml(hint)}</span>` : ''}
      ${body}
    </div>
  `;
}

// Какие номера стоят на странице. По умолчанию — все фото «Номеров».
function actsPicker(card, occasionId, settings) {
  const photos = card.galleryPhotos || [];
  if (!photos.length) {
    return '<p class="ca-note">Добавьте фото в раздел «Номера», и здесь можно будет выбрать, какие показать на этой странице.</p>';
  }
  const picked = Array.isArray(settings.acts) ? settings.acts : photos.map((_, i) => i);
  return `
    <div class="ca-act-pick" role="group" aria-label="Номера на странице">
      ${photos.map((src, i) => {
        const on = picked.includes(i);
        const name = card.galleryCaptions?.[i] || `Фото ${i + 1}`;
        return `
          <button type="button" class="ca-act-opt${on ? ' is-active' : ''}" aria-pressed="${on ? 'true' : 'false'}"
            data-occ-act="${escapeAttr(occasionId)}" data-index="${i}">
            <img src="${escapeAttr(src)}" alt="" />
            <span class="ca-act-opt-name">${escapeHtml(name)}</span>
            <span class="ca-act-opt-check" aria-hidden="true">${renderIcon('check', { size: 14 })}</span>
          </button>
        `;
      }).join('')}
    </div>
  `;
}

// Кнопка образца видна, пока в празднике есть пустые продающие поля.
function hasEmptyTemplateFields(occasion, settings) {
  return Object.keys(occasionTemplate(occasion)).some((key) => !String(settings[key] || '').trim());
}

function renderOccasionBody(card, occasion, settings) {
  const id = occasion.id;
  return `
    <div class="ca-occ-body">
      ${hasEmptyTemplateFields(occasion, settings) ? `
        <button type="button" class="ca-occ-template" data-occ-template="${escapeAttr(id)}">
          ${renderIcon('sparkle', { size: 18 })}
          <span>Подставить продающие тексты</span>
        </button>
        <p class="ca-occ-template-hint">Заполнит пустые поля образцом, а вы поправите под себя.</p>
      ` : ''}

      ${occasion.custom ? field({
        label: 'Название праздника',
        value: occasion.title,
        maxlength: OCCASION_TITLE_MAX,
        hint: `Адрес страницы не меняется: …/${occasion.slug}`,
        data: `data-custom-title="${escapeAttr(id)}"`
      }) : ''}

      ${group('Обложка', `
        ${occasionField(id, 'headline', 'Заголовок', settings.headline, { placeholder: occasionTitle(occasion), maxlength: 90, hint: 'Что получит вечер, а не «кто я».' })}
        ${occasionField(id, 'text', 'Пара слов под заголовком', settings.text, { textarea: true, rows: 2, maxlength: 220, placeholder: 'Для кого и в чём особенность программы' })}
        ${coverBlock(card, occasion, settings)}
        ${fxPicker(occasion, settings)}
        ${occasionField(id, 'video', 'Видео для этой страницы', settings.video, { type: 'url', placeholder: 'Если пусто, возьмём видео из «Фото и видео»' })}
        ${occasionField(id, 'note', 'Подпись на плитке', settings.note, { placeholder: occasion.note, maxlength: 60 })}
      `)}

      ${group('Ради этого момента', `
        ${occasionField(id, 'momentTitle', 'Заголовок', settings.momentTitle, { placeholder: 'Когда удивление становится общим', maxlength: 60 })}
        ${occasionField(id, 'momentText', 'Что происходит в зале', settings.momentText, { textarea: true, rows: 2, maxlength: 160, placeholder: 'Один гость участвует, а весь зал проживает финал вместе с ним.' })}
        ${photoPicker(card, id, 'momentPhoto', settings.momentPhoto ?? -1, { label: 'Фото момента', noneLabel: 'Без фото' })}
      `, 'Почему ваш номер работает: эмоция гостей, а не описание реквизита.')}

      ${group('Номера на этой странице', actsPicker(card, id, settings), 'Каждый номер стоит на отдельном экране. Заголовки и описания задаются в разделе «Номера».')}

      ${group('Изюминка', `
        ${occasionField(id, 'highlightTitle', 'Что есть только для этого праздника', settings.highlightTitle, { placeholder: 'Например: ваш логотип в финале', maxlength: 40 })}
        ${occasionField(id, 'highlightText', 'Чем она хороша', settings.highlightText, { textarea: true, rows: 2, maxlength: 140 })}
        ${photoPicker(card, id, 'highlightPhoto', settings.highlightPhoto ?? -1, { label: 'Фото изюминки', noneLabel: 'Без фото' })}
      `)}

      ${group('Почему бронировать сейчас', `
        ${occasionField(id, 'urgency', 'Строка в финале страницы', settings.urgency, { placeholder: 'Декабрьские даты разбирают в октябре и ноябре', maxlength: 120 })}
      `)}

      <div class="ca-occ-actions">
        <a class="ca-text-link" href="#/preview/${escapeAttr(occasion.slug)}">Посмотреть страницу</a>
        ${occasion.custom ? `
          <button type="button" class="ca-occ-remove" data-occ-remove="${escapeAttr(id)}">Удалить праздник</button>
        ` : ''}
      </div>
    </div>
  `;
}

function renderOccasion(card, occasion, open) {
  const settings = card.occasions?.[occasion.id] || {};
  const on = settings.on === true;
  // Корпоратив владелец знает как «новогодний» — так и подписываем; клиенту
  // вне сезона страница называется просто «Корпоратив».
  const title = occasion.seasonTitle || occasion.title;
  const sub = occasion.custom
    ? `/${occasion.slug}${on ? '' : ' · скрыт'}`
    : (on ? `/${occasion.slug}` : 'Скрыт на визитке');
  return `
    <div class="ca-occ${on ? ' is-on' : ''}">
      <div class="ca-occ-head">
        <button type="button" class="ca-switch" role="switch" aria-checked="${on ? 'true' : 'false'}"
          data-occ-toggle="${escapeAttr(occasion.id)}" aria-label="Показывать «${escapeAttr(occasion.title)}» на визитке">
          <span class="ca-switch-knob" aria-hidden="true"></span>
        </button>
        <span class="ca-occ-titles">
          <span class="ca-occ-title">${escapeHtml(title)}</span>
          <span class="ca-occ-sub">${escapeHtml(sub)}</span>
        </span>
        ${on || occasion.custom ? `
          <button type="button" class="ca-occ-more" data-occ-open="${escapeAttr(occasion.id)}"
            aria-expanded="${open ? 'true' : 'false'}">${open ? 'Свернуть' : 'Настроить'}</button>
        ` : ''}
      </div>
      ${open && (on || occasion.custom) ? renderOccasionBody(card, occasion, settings) : ''}
    </div>
  `;
}

function renderAddCustom(card) {
  const count = (card.customOccasions || []).length;
  if (count >= MAX_CUSTOM_OCCASIONS) {
    return `<p class="ca-note">Своих праздников может быть не больше ${MAX_CUSTOM_OCCASIONS}. Удалите ненужный, чтобы добавить новый.</p>`;
  }
  return `
    <div class="ca-occ-add">
      <input class="ca-input" type="text" maxlength="${OCCASION_TITLE_MAX}" placeholder="Юбилей, 8 Марта…"
        aria-label="Название своего праздника" data-occ-new-title />
      <button type="button" class="ca-btn ca-btn--ghost" data-occ-add>${renderIcon('plus')} Добавить</button>
    </div>
  `;
}

export function renderOccasions(card, openOccasion) {
  const list = occasionsOf(card);
  const seasonal = list.filter((o) => !o.custom);
  const custom = list.filter((o) => o.custom);
  return `
    <p class="ca-note">У каждого праздника своя продающая страница и своя ссылка: Sales присылает её заказчику, а по QR человек выбирает повод сам. То, что бронируют сейчас, на визитке стоит первым.</p>
    <div class="ca-editor-subhead"><span>Сезонные</span></div>
    <div class="ca-occs">
      ${seasonal.map((o) => renderOccasion(card, o, openOccasion === o.id)).join('')}
    </div>
    <div class="ca-editor-subhead ca-occ-custom-head"><span>Свои праздники</span><span>${custom.length} из ${MAX_CUSTOM_OCCASIONS}</span></div>
    ${custom.length ? `
      <div class="ca-occs">
        ${custom.map((o) => renderOccasion(card, o, openOccasion === o.id)).join('')}
      </div>
    ` : ''}
    ${renderAddCustom(card)}
  `;
}

/* ─────────── Поведение ─────────── */

// api: card() — текущая визитка, persist(patch), occasionPatch(id, changes),
// listCopy(list), rerender(), openOccasion([id]) — какой праздник раскрыт.
export function bindOccasionEditor(node, api) {
  node.querySelectorAll('[data-occ-toggle]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.occToggle;
      const on = !(api.card().occasions?.[id]?.on);
      hapticLight();
      // Только что включённый праздник сразу раскрываем — его стоит настроить.
      const open = api.openOccasion();
      api.openOccasion(on ? id : (open === id ? '' : open));
      await api.persist(api.occasionPatch(id, { on }));
      api.rerender();
    });
  });
  node.querySelectorAll('[data-occ-open]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.occOpen;
      api.openOccasion(api.openOccasion() === id ? '' : id);
      api.rerender();
    });
  });
  node.querySelectorAll('[data-occ-photo]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      hapticLight();
      await api.persist(api.occasionPatch(btn.dataset.occPhoto, { [btn.dataset.occField]: Number(btn.dataset.value) }));
      api.rerender();
    });
  });
  bindActs(node, api);
  bindTemplate(node, api);
  bindCustom(node, api);
  bindCover(node, api);
  node.querySelectorAll('[data-occ-fx]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      hapticLight();
      await api.persist(api.occasionPatch(btn.dataset.occFx, { fx: btn.dataset.value }));
      api.rerender();
    });
  });
}

const COVER_ERRORS = {
  not_published: 'Сначала опубликуйте визитку, тогда можно будет загрузить обложку',
  image_too_large: 'Фото слишком большое, попробуйте другое',
  forbidden: 'Ключ визитки не совпал. Опубликуйте визитку ещё раз',
  not_image: 'Это не фото, выберите картинку'
};

function bindCover(node, api) {
  node.querySelectorAll('[data-occ-cover-trigger]').forEach((btn) => {
    const id = btn.dataset.occCoverTrigger;
    const input = node.querySelector(`[data-occ-cover-input="${id}"]`);
    btn.addEventListener('click', () => input?.click());
    input?.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return;
      const label = btn.innerHTML;
      btn.disabled = true;
      btn.textContent = 'Загружаю…';
      try {
        const url = await uploadOccasionCover(api.card(), file);
        await api.persist(api.occasionPatch(id, { cover: url }));
        api.rerender();
        toast.show('Обложка загружена. Опубликуйте изменения', { ok: true });
      } catch (error) {
        btn.disabled = false;
        btn.innerHTML = label;
        input.value = '';
        toast.show(COVER_ERRORS[error?.message] || 'Не получилось загрузить обложку. Проверьте интернет', { error: true });
      }
    });
  });
  node.querySelectorAll('[data-occ-cover-remove]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await api.persist(api.occasionPatch(btn.dataset.occCoverRemove, { cover: '' }));
      api.rerender();
    });
  });
  node.querySelectorAll('[data-occ-cover-pos]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      hapticLight();
      await api.persist(api.occasionPatch(btn.dataset.occCoverPos, { coverPosition: btn.dataset.value }));
      api.rerender();
    });
  });
}

// Номера на странице праздника: выбор хранится списком в порядке «Номеров».
function bindActs(node, api) {
  node.querySelectorAll('[data-occ-act]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const card = api.card();
      const id = btn.dataset.occAct;
      const index = Number(btn.dataset.index);
      const all = card.galleryPhotos.map((_, i) => i);
      const current = card.occasions?.[id]?.acts;
      const picked = new Set(Array.isArray(current) ? current : all);
      if (picked.has(index)) picked.delete(index);
      else picked.add(index);
      hapticLight();
      await api.persist(api.occasionPatch(id, { acts: all.filter((i) => picked.has(i)) }));
      api.rerender();
    });
  });
}

// Образец заполняет только пустые поля: написанное владельцем не трогаем.
function bindTemplate(node, api) {
  node.querySelectorAll('[data-occ-template]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const card = api.card();
      const id = btn.dataset.occTemplate;
      const occasion = findOccasion(card, { id });
      if (!occasion) return;
      const current = card.occasions?.[id] || {};
      const fill = Object.fromEntries(Object.entries(occasionTemplate(occasion))
        .filter(([key]) => !String(current[key] || '').trim()));
      hapticLight();
      await api.persist(api.occasionPatch(id, fill));
      api.rerender();
      toast.show('Тексты подставлены, поправьте под себя', { ok: true });
    });
  });
}

function bindCustom(node, api) {
  const titleInput = node.querySelector('[data-occ-new-title]');
  const add = async () => {
    const card = api.card();
    const title = String(titleInput?.value || '').trim();
    if (!title) {
      titleInput?.focus();
      toast.show('Напишите название праздника');
      return;
    }
    if ((card.customOccasions || []).length >= MAX_CUSTOM_OCCASIONS) return;
    const item = { id: createCustomOccasionId(), title, slug: uniqueOccasionSlug(card, title) };
    hapticLight();
    api.openOccasion(item.id);
    await api.persist({
      customOccasions: [...(card.customOccasions || []), item],
      ...api.occasionPatch(item.id, { on: true, photo: -1, momentPhoto: -1, highlightPhoto: -1 })
    });
    api.rerender();
  };
  node.querySelector('[data-occ-add]')?.addEventListener('click', add);
  titleInput?.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    add();
  });

  node.querySelectorAll('[data-occ-remove]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const card = api.card();
      const id = btn.dataset.occRemove;
      const occasion = findOccasion(card, { id });
      if (!occasion) return;
      if (!window.confirm(`Удалить праздник «${occasion.title}»? Ссылка на его страницу перестанет открываться.`)) return;
      const occasions = Object.fromEntries(Object.entries(card.occasions || {}).filter(([key]) => key !== id));
      api.openOccasion('');
      await api.persist({
        customOccasions: card.customOccasions.filter((item) => item.id !== id),
        // Отзывы, привязанные к празднику, становятся общими.
        quotes: api.listCopy('quotes').map((q) => (q.occasion === id ? { ...q, occasion: '' } : q)),
        occasions
      });
      api.rerender();
    });
  });
}
