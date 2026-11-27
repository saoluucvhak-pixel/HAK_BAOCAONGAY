const target = new EventTarget();

export const eventBus = {
  on(type, listener) {
    target.addEventListener(type, listener);
    return () => eventBus.off(type, listener);
  },
  off(type, listener) {
    target.removeEventListener(type, listener);
  },
  emit(type, detail) {
    target.dispatchEvent(new CustomEvent(type, { detail }));
  }
};

export function notify(type, message) {
  eventBus.emit('toast', { type, message });
}
