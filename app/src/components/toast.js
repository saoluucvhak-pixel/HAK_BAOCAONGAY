import { eventBus } from '../utils/event-bus.js';

const TYPES = { success: 'Thành công', info: 'Thông tin', warning: 'Cảnh báo', error: 'Lỗi' };

export function initToast() {
  const stack = document.getElementById('toastStack');
  eventBus.on('toast', ({ detail: { type, message } }) => {
    const toast = document.createElement('div');
    toast.className = 'toast toast-' + type;

    const text = document.createElement('div');
    text.setAttribute('role', type === 'error' ? 'alert' : 'status');
    text.textContent = TYPES[type] + ' — ' + message;
    const close = document.createElement('button');
    close.type = 'button';
    close.setAttribute('aria-label', 'Đóng thông báo');
    close.textContent = '×';
    toast.append(text, close);
    stack.append(toast);

    const timer = setTimeout(() => toast.remove(), 3500);
    close.addEventListener('click', () => {
      clearTimeout(timer);
      toast.remove();
    });
  });
}
