import { escapeHtml } from '../lib/html.js';
// Единый toast-компонент для всего приложения.
// Заменяет 7+ дублирующихся showToast() из разных файлов.
//
//   import { toast } from '../components/toast.js';
//   toast.show('Сохранено');           // нейтральный
//   toast.show('Готово', { ok: true }); // успех (зелёный)
//   toast.show('Ошибка', { error: true }); // ошибка (красный)

let activeNode = null;
let timer = null;

function dismiss() {
  if (!activeNode) return;
  activeNode.classList.add('is-leaving');
  const node = activeNode;
  activeNode = null;
  setTimeout(() => { try { node.remove(); } catch {} }, 300);
}

export const toast = {
  show(message, { ok = false, error = false, duration = 2400 } = {}) {
    if (!message) return;
    // Если уже что-то висит — мгновенно убираем, потом новое.
    if (activeNode) {
      try { activeNode.remove(); } catch {}
      activeNode = null;
    }
    clearTimeout(timer);

    const node = document.createElement('div');
    const kind = error ? 'is-error' : (ok ? 'is-success' : '');
    node.className = `app-toast ${kind}`.trim();
    node.setAttribute('role', error ? 'alert' : 'status');
    node.innerHTML = escapeHtml(message);
    document.body.appendChild(node);
    activeNode = node;

    timer = setTimeout(dismiss, duration);
  },
  hide: dismiss
};
