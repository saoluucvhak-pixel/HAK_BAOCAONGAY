import { CONFIG } from '../config/config.js';
import { storageService } from '../services/storage-service.js';
import { $ } from '../utils/dom-utils.js';
import { eventBus, notify } from '../utils/event-bus.js';
import { getPrecisionSettings, loadPrecisionSettings } from '../utils/hak-format.js';

export function initPrecisionSettings() {
  const dialog = $('#precisionSettings');
  const form = $('#precisionForm');
  const error = $('#precisionError');
  $('#btnPrecisionSettings').addEventListener('click', () => {
    const settings = getPrecisionSettings();
    for (const [name, value] of Object.entries(settings)) {
      const input = form.elements.namedItem(name);
      if (input) input.value = String(value);
    }
    error.hidden = true;
    dialog.showModal();
  });
  $('#btnPrecisionCancel').addEventListener('click', () => dialog.close());
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const fields = new FormData(form);
    const settings = {
      moneyDigits: Number(fields.get('moneyDigits')),
      quantityDigits: Number(fields.get('quantityDigits')),
      negative: fields.get('negative')
    };
    if (!storageService.set(CONFIG.STORAGE_KEYS.PRECISION_SETTINGS, settings)) {
      error.textContent = 'Không lưu được cài đặt định dạng số.';
      error.hidden = false;
      return;
    }
    loadPrecisionSettings();
    dialog.close();
    eventBus.emit('precision:change');
    notify('success', 'Đã lưu cài đặt định dạng số.');
  });
}
