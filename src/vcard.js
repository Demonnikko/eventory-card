// Сохранение контакта.
//
// Важное ограничение, которое нельзя обойти в вебе: .vcf копируется в
// телефонную книгу и живёт там своей жизнью — обновить её удалённо нельзя.
// Поэтому «живой» контакт делаем иначе: в карточку кладём ссылку на визитку.
// Телефон может устареть, а ссылка всегда ведёт на актуальные данные.
import { cardPublicUrl } from './card-data.js';

function esc(value) {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

// Фото в vCard — base64 без префикса data:. Ограничиваем размер: часть
// телефонных книг не переваривает тяжёлые карточки.
function photoLine(dataUrl) {
  const match = /^data:image\/(jpeg|jpg|png);base64,(.+)$/i.exec(String(dataUrl || ''));
  if (!match) return '';
  const body = match[2];
  if (body.length > 200 * 1024) return '';
  const type = match[1].toLowerCase() === 'png' ? 'PNG' : 'JPEG';
  return `PHOTO;ENCODING=b;TYPE=${type}:${body}`;
}

export function buildLiveVCard(card) {
  const lines = ['BEGIN:VCARD', 'VERSION:3.0'];
  const link = card.publishedSlug ? cardPublicUrl(card.publishedSlug) : '';

  if (card.name) {
    lines.push(`FN:${esc(card.name)}`);
    const parts = String(card.name).trim().split(/\s+/);
    lines.push(`N:${esc(parts.slice(1).join(' '))};${esc(parts[0] || '')};;;`);
  }
  if (card.company) lines.push(`ORG:${esc(card.company)}`);
  if (card.role) lines.push(`TITLE:${esc(card.role)}`);
  if (card.phone) lines.push(`TEL;TYPE=CELL:${esc(card.phone)}`);
  if (card.email) lines.push(`EMAIL;TYPE=INTERNET:${esc(card.email)}`);

  // Ссылка на визитку идёт первой: это единственное, что не устаревает.
  if (link) lines.push(`URL:${esc(link)}`);
  if (card.website) lines.push(`URL;TYPE=WORK:${esc(card.website)}`);
  if (card.telegram) {
    const tg = String(card.telegram).replace(/^https?:\/\/t\.me\//i, '').replace(/^@/, '');
    lines.push(`URL;TYPE=Telegram:https://t.me/${esc(tg)}`);
  }
  if (card.city) lines.push(`ADR;TYPE=WORK:;;${esc(card.city)};;;;`);

  const photo = photoLine(card.coverPhoto);
  if (photo) lines.push(photo);

  const note = [
    card.bio ? String(card.bio) : '',
    link ? `Актуальная визитка: ${link}` : ''
  ].filter(Boolean).join('\n');
  if (note) lines.push(`NOTE:${esc(note)}`);

  lines.push('END:VCARD');
  return lines.join('\r\n');
}

export function downloadVCard(card) {
  const blob = new Blob([buildLiveVCard(card)], { type: 'text/vcard;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${card.name || 'contact'}.vcf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}
