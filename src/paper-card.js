// «Бумажная» визитка — макет карточки: текстура профессии, тиснёное имя,
// золотая фольга. Лежит горизонтально, как настоящая визитка в руке.
//
// Живёт отдельным модулем, потому что нужна в двух местах: в онбординге, где
// карточка обретает лицо на глазах, и в редакторе, где владелец правит поля.
// Без неё редактор превращался в анкету: человек заполнял визитку вслепую и
// видел результат только на отдельной вкладке.
import { escapeHtml, escapeAttr } from './shared/lib/html.js';
import {
  BUSINESS_CARD_PROFESSIONS,
  businessCardOnboardingTemplateUrl
} from './shared/data/businessCard.js';

export function professionLabel(id) {
  return BUSINESS_CARD_PROFESSIONS.find((p) => p.id === id)?.label || '';
}

export function splitName(full) {
  const parts = String(full || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { first: '', last: '' };
  return { first: parts[0], last: parts.slice(1).join(' ') };
}

// role — если направление вписано руками («Ведущий и шоумен»), показываем его:
// в редакторе это поле правят чаще, чем меняют профессию из списка.
export function renderPaperCard({ name = '', profession = '', role = '' } = {}) {
  const pro = profession || '';
  const { first, last } = splitName(name);
  const caption = String(role || '').trim() || professionLabel(pro);
  const template = pro ? businessCardOnboardingTemplateUrl(pro) : '';

  return `
    <div class="ob-paper${pro ? ' has-template' : ''}" data-paper style="${template ? `--ob-template:url('${escapeAttr(template)}')` : ''}">
      <div class="ob-paper-bg" aria-hidden="true"></div>
      <div class="ob-paper-sheen" aria-hidden="true"></div>
      <div class="ob-paper-copy">
        <strong class="ob-paper-first">${escapeHtml(first || 'Ваше имя')}</strong>
        ${last ? `<span class="ob-paper-last">${escapeHtml(last)}</span>` : ''}
        <em class="ob-paper-role">${escapeHtml(caption || 'ваше направление')}</em>
      </div>
      <div class="ob-paper-edge" aria-hidden="true"></div>
    </div>
  `;
}
