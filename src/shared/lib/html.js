export function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Безопасно и для двойных, и для одинарных кавычек в значениях атрибутов.
export function escapeAttr(s) {
  return escapeHtml(s)
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

// CSV injection guard: Excel/Numbers исполняют формулы из ячеек начинающихся
// на =, @, +, -. Префиксим апостроф — Excel его не отображает, но не исполняет.
export function escapeCsv(s) {
  const str = String(s ?? '');
  if (/^[=@+\-]/.test(str)) return `'${str}`;
  return str;
}
