import { CONFIG } from '../config/config.js';
import { FORESTRY_DEFAULT_ROWS } from '../config/forestry-defaults.js';
import { storageService } from '../services/storage-service.js';

const storageKey = CONFIG.STORAGE_KEYS.forestrySettings;
const fields = [
  ['Tên thông thường', 'text'],
  ['Tên khoa học', 'text'],
  ['TÊN HH_TKHQ', 'text'],
  ['Đơn vị tính (MT)', 'text'],
  ['Đơn vị tính (BDMT)', 'text'],
  ['Loài nguy cấp Quý hiếm', 'text'],
  ['Tiêu hao SX', 'number'],
  ['Tồn đầu ngày', 'number'],
  ['IN_Tungay', 'date', 'Từ ngày của kỳ gốc'],
  ['IN_Denngay', 'date', 'Đến ngày của kỳ gốc'],
  ['Ngày tháng năm nhập', 'date'],
  ['Diễn giải hồ sơ nhập', 'text'],
  ['Diễn giải hồ sơ xuất', 'text'],
  ['ID_Mau07', 'text'],
];

export function dispatchSheetId(value) {
  let id;
  try {
    const url = new URL(value);
    if (url.origin === 'https://docs.google.com' && !url.username && !url.password) {
      id = url.pathname.match(/^\/spreadsheets\/d\/([\w-]+)(?:\/|$)/)?.[1];
    }
  } catch { /* Hiển thị thông báo bên dưới. */ }
  if (!id || id === 'e') throw new Error('Nhập link Google Sheet XUATHANG_DN dạng /spreadsheets/d/…/edit.');
  return id;
}

export function readForestrySettings() {
  const saved = storageService.get(storageKey);
  const rows = FORESTRY_DEFAULT_ROWS.map(defaults => {
    const entry = Array.isArray(saved?.rows) ? saved.rows.find(row => row?.['Mẫu'] === defaults['Mẫu']) : null;
    return { ...defaults, ...entry };
  });
  const previousLink = storageService.get('baocaongay_forestry_sources')?.shipping;
  const configuredLinkChanged = saved?.shippingBase && saved.shippingBase !== CONFIG.XUATHANG_DN;
  const shipping = (configuredLinkChanged ? '' : saved?.shipping || previousLink) || CONFIG.XUATHANG_DN;
  return { basis: '', effectiveFrom: '', effectiveTo: '', updatedAt: '', ...saved, shipping, rows };
}

export function initForestrySettings() {
  const form = document.getElementById('forestrySettings');
  const fieldsContainer = document.getElementById('forestryParameterFields');
  const updated = document.getElementById('forestryUpdated');
  const status = document.getElementById('forestrySettingsStatus');
  for (const row of FORESTRY_DEFAULT_ROWS) {
    const code = row['Mẫu'];
    const group = document.createElement('fieldset');
    const legend = document.createElement('legend');
    legend.textContent = code;
    const grid = document.createElement('div');
    grid.className = 'modalGrid';
    for (const [field, type, title = field] of fields) {
      const label = document.createElement('label');
      label.className = 'f';
      label.textContent = title === 'Tiêu hao SX' ? 'Tiêu hao sản xuất (%)' : title;
      const input = document.createElement('input');
      input.type = type;
      input.name = code + ':' + field;
      if (type === 'number') {
        input.step = 'any';
        input.required = true;
      }
      if (field === 'Tiêu hao SX') {
        input.min = '0';
        input.max = '100';
      }
      label.append(input);
      grid.append(label);
    }
    group.append(legend, grid);
    fieldsContainer.append(group);
  }

  function render() {
    const settings = readForestrySettings();
    for (const field of ['shipping', 'basis', 'effectiveFrom', 'effectiveTo']) {
      form.elements.namedItem(field).value = settings[field];
    }
    for (const row of settings.rows) {
      for (const [field] of fields) {
        const raw = row[field];
        const value = field === 'Tiêu hao SX' ? Number((raw * 100).toPrecision(12)) : raw;
        form.elements.namedItem(row['Mẫu'] + ':' + field).value = value ?? '';
      }
    }
    const date = new Date(settings.updatedAt);
    updated.textContent = Number.isFinite(+date) ? new Intl.DateTimeFormat('vi-VN', {
      dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh',
    }).format(date) : 'Chưa có lần lưu';
  }

  render();
  document.addEventListener('forestrysettingschange', render);
  form.addEventListener('submit', event => {
    event.preventDefault();
    const values = new FormData(form);
    const shipping = values.get('shipping').trim();
    try { dispatchSheetId(shipping); }
    catch (error) {
      status.textContent = error.message;
      return;
    }
    const basis = values.get('basis').trim();
    const effectiveFrom = values.get('effectiveFrom');
    const effectiveTo = values.get('effectiveTo');
    if (effectiveFrom && effectiveTo && effectiveTo < effectiveFrom) {
      status.textContent = 'Ngày hết hiệu lực phải từ ngày hiệu lực trở đi.';
      return;
    }
    const rows = readForestrySettings().rows.map(row => {
      const next = { ...row };
      for (const [field, type] of fields) {
        const value = values.get(row['Mẫu'] + ':' + field).trim();
        next[field] = type === 'number' ? Number(value) / (field === 'Tiêu hao SX' ? 100 : 1) : value;
      }
      return next;
    });
    if (!storageService.set(storageKey, { shipping, shippingBase: CONFIG.XUATHANG_DN, basis, effectiveFrom, effectiveTo, updatedAt: new Date().toISOString(), rows })) {
      status.textContent = 'Không lưu được tham số trên trình duyệt này.';
      return;
    }
    status.textContent = 'Đã lưu tham số báo cáo lâm sản.';
    document.dispatchEvent(new Event('forestrysettingschange'));
  });
}
