import { displayVietnamDateTime, displayDateParts } from '../utils/display-format.js';
import { CONFIG } from '../config/config.js';
import { FORESTRY_DEFAULT_ROWS, normalizeForestryModel } from '../config/forestry-defaults.js';
import { storageService } from '../services/storage-service.js';

const storageKey = CONFIG.STORAGE_KEYS.forestrySettings;
const fields = [
  ['Tên thông thường', 'text'],
  ['Tên khoa học', 'text'],
  ['TÊN HH_TKHQ', 'text'],
  ['Đơn vị tính (MT)', 'text'],
  ['Đơn vị tính (BDMT)', 'text'],
  ['Khối lượng NK', 'number'],
  ['Trị giá NK (USD)', 'number'],
  ['Số hiệu, nhãn đánh dấu', 'text'],
  ['Ghi chú', 'text'],
  ['Loài nguy cấp Quý hiếm', 'text'],
  ['Tiêu hao SX', 'number'],
  ['Diễn giải hồ sơ nhập', 'text'],
  ['Diễn giải hồ sơ xuất', 'text'],
  ['Mã số hàng hóa', 'text', 'Mã số hàng hóa (HS)'],
];
const optionalNumberFields = new Set(['Khối lượng NK', 'Trị giá NK (USD)']);

const exportFields = ['Mã số hàng hóa', 'Đơn vị tính (BDMT)', ...optionalNumberFields];

export function dispatchSheetId(value) {
  let id;
  try {
    const url = new URL(value);
    if (url.origin === 'https://docs.google.com' && !url.username && !url.password) {
      id = url.pathname.match(/^\/spreadsheets\/d\/([\w-]+)(?:\/|$)/)?.[1];
    }
  } catch { /* Hiển thị thông báo bên dưới. */ }
  if (!id || id === 'e') throw new Error('Nhập link Google Sheet XUATHANG dạng /spreadsheets/d/…/edit.');
  return id;
}

function readRegulations() {
  const saved = storageService.get(storageKey);
  if (Array.isArray(saved?.regulations) && Array.isArray(saved?.parameters)) return saved;
  const code = 'QD-001';
  return {
    regulations: [{
      code, documentType: '', documentNumber: '', basis: saved?.basis ?? '',
      effectiveFrom: saved?.effectiveFrom ?? '', effectiveTo: saved?.effectiveTo ?? '', updatedAt: saved?.updatedAt ?? '',
    }],
    parameters: (Array.isArray(saved?.rows) ? saved.rows : []).map(row => ({ ...row, regulationCode: code })),
  };
}

function parametersForRegulation(parameters, code) {
  const entries = parameters.filter(row => row.regulationCode === code);
  const legacy = entries.find(row => normalizeForestryModel(row['Mẫu']) === 'MAU04' && row['Mẫu'] !== 'MAU04');
  const daily = entries.find(row => row['Mẫu'] === 'MAU04');
  const exportRow = entries.find(row => row['Mẫu'] === 'MAU14');
  const shared = entries.find(row => row['Mẫu'] === 'CHUNG');
  const values = { ...FORESTRY_DEFAULT_ROWS[0], ...exportRow, ...legacy, ...daily };
  for (const field of exportFields) {
    if (exportRow?.[field] != null) values[field] = exportRow[field];
  }
  return { ...values, ...shared, 'Mẫu': 'CHUNG', regulationCode: code };
}

export function readForestrySettings(from, to) {
  const { regulations, parameters } = readRegulations();
  const matches = regulations.filter(regulation =>
    (!regulation.effectiveFrom || from >= regulation.effectiveFrom) &&
    (!regulation.effectiveTo || to <= regulation.effectiveTo));
  if (matches.length > 1) throw new Error('Nhiều quy định cùng áp dụng cho kỳ báo cáo. Hãy đối chiếu ngày hiệu lực trong Cấu hình.');
  if (!matches.length) throw new Error('Kỳ báo cáo phải nằm trọn trong khoảng hiệu lực của một quy định.');
  const regulation = matches[0];
  const shared = parametersForRegulation(parameters, regulation.code);
  const rows = ['MAU04', 'MAU14'].map(model => ({ ...shared, 'Mẫu': model }));
  return { ...regulation, rows };
}

export function initForestrySettings() {
  const form = document.getElementById('forestrySettings');
  const fieldsContainer = document.getElementById('forestryParameterFields');
  const updated = document.getElementById('forestryUpdated');
  const status = document.getElementById('forestrySettingsStatus');
  const picker = document.getElementById('forestryRegulation');
  const add = document.getElementById('forestryAddRegulation');
  const parentFields = ['documentType', 'documentNumber', 'basis', 'effectiveFrom', 'effectiveTo'];
  const editButton = document.getElementById('forestryEditRegulation');
  const saveButton = document.getElementById('forestrySaveRegulation');
  const cancelButton = document.getElementById('forestryCancelRegulation');
  const deleteButton = document.getElementById('forestryDeleteRegulation');
  const warning = document.getElementById('forestryDeleteWarning');
  const warningText = document.getElementById('forestryDeleteMessage');
  let editing = false;
  let selectedCode;
  let draftCode;
  const grid = document.createElement('div');
  grid.className = 'modalGrid';
  for (const [field, type, title = field] of fields) {
    const label = document.createElement('label');
    label.className = 'f';
    label.textContent = title === 'Tiêu hao SX' ? 'Tiêu hao sản xuất (%)' : title;
    const input = document.createElement('input');
    input.type = type;
    input.name = 'CHUNG:' + field;
    if (type === 'number') {
      input.step = 'any';
      input.required = !optionalNumberFields.has(field);
    }
    if (field === 'Tiêu hao SX') {
      input.min = '0';
      input.max = '100';
    }
    label.append(input);
    grid.append(label);
  }
  fieldsContainer.append(grid);

  function render() {
    const { regulations, parameters } = readRegulations();
    const active = regulations.find(item => item.code === selectedCode) ?? regulations[0];
    selectedCode = draftCode ?? active?.code ?? '';
    const settings = draftCode ? {} : active ?? {};
    picker.replaceChildren(...regulations.map(item =>
      new Option([item.code, item.documentType, item.documentNumber].filter(Boolean).join(' · '), item.code)));
    if (draftCode) picker.add(new Option(draftCode + ' · Đang tạo', draftCode));
    picker.value = selectedCode;
    form.elements.regulationCode.value = selectedCode;
    for (const field of parentFields) form.elements.namedItem(field).value = settings[field] ?? '';
    const row = parametersForRegulation(parameters, selectedCode);
    for (const [field] of fields) {
      const input = form.elements.namedItem('CHUNG:' + field);
      const raw = row[field];
      const value = field === 'Tiêu hao SX' ? Number((raw * 100).toPrecision(12)) : raw;
      input.value = value ?? '';
    }
    for (const input of form.querySelectorAll('input:not([name=regulationCode])')) input.readOnly = !editing;
    form.elements.documentType.disabled = !editing;
    editButton.disabled = !selectedCode || editing;
    saveButton.disabled = !editing;
    cancelButton.hidden = !editing;
    deleteButton.disabled = !active || editing;
    picker.disabled = editing || !regulations.length;
    add.disabled = editing;
    const date = new Date(settings.updatedAt);
    const today = new Intl.DateTimeFormat('sv-SE', { dateStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
    updated.textContent = editing
      ? displayDateParts(...today.split('-')) + ' · sẽ ghi ngày giờ khi lưu'
      : Number.isFinite(+date) ? displayVietnamDateTime(date) : 'Chưa có lần lưu';
  }

  picker.addEventListener('change', () => {
    selectedCode = picker.value;
    draftCode = undefined;
    warning.hidden = true;
    status.textContent = '';
    render();
  });
  add.addEventListener('click', () => {
    const { regulations } = readRegulations();
    const history = storageService.get(CONFIG.STORAGE_KEYS.forestryHistory, []);
    const usedCodes = new Set(regulations.map(item => item.code));
    if (Array.isArray(history)) for (const item of history) usedCodes.add(item?.regulationCode);
    let number = 1;
    do {
      draftCode = 'QD-' + String(number++).padStart(3, '0');
    } while (usedCodes.has(draftCode));
    editing = true;
    warning.hidden = true;
    status.textContent = 'Quy định mới cần loại văn bản, số hoặc ký hiệu và ngày hiệu lực. Ngày cập nhật được ghi tự động.';
    render();
    form.elements.documentType.focus();
  });
  editButton.addEventListener('click', () => {
    editing = true;
    warning.hidden = true;
    status.textContent = '';
    render();
    form.elements.documentType.focus();
  });
  cancelButton.addEventListener('click', () => {
    editing = false;
    draftCode = undefined;
    status.textContent = 'Đã hủy thay đổi chưa lưu.';
    render();
  });
  deleteButton.addEventListener('click', () => {
    warningText.textContent = 'Xóa quy định ' + selectedCode + ' và bộ tham số của quy định này. Kỳ báo cáo cần một quy định còn hiệu lực. Báo cáo đã tạo vẫn nằm trong lịch sử.';
    warning.hidden = false;
    document.getElementById('forestryCancelDelete').focus();
  });
  document.getElementById('forestryCancelDelete').addEventListener('click', () => {
    warning.hidden = true;
    deleteButton.focus();
  });
  document.getElementById('forestryConfirmDelete').addEventListener('click', () => {
    if (warning.hidden || editing || !selectedCode) return;
    const removed = selectedCode;
    const { regulations, parameters } = readRegulations();
    if (!storageService.set(storageKey, {
      regulations: regulations.filter(item => item.code !== removed),
      parameters: parameters.filter(row => row.regulationCode !== removed),
    })) {
      status.textContent = 'Không xóa được quy định.';
      return;
    }
    selectedCode = undefined;
    warning.hidden = true;
    status.textContent = 'Đã xóa quy định ' + removed + '.';
    document.dispatchEvent(new Event('forestrysettingschange'));
    add.focus();
  });
  document.addEventListener('displayformatchange', () => { if (!editing) render(); });
  render();
  document.addEventListener('forestrysettingschange', render);
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (!editing || !selectedCode) return;
    const values = new FormData(form);
    const parent = Object.fromEntries(parentFields.map(field => [field, values.get(field).trim()]));
    const { effectiveFrom, effectiveTo, documentType, documentNumber } = parent;
    if (draftCode && (!documentType || !documentNumber || !effectiveFrom)) {
      status.textContent = 'Chọn loại văn bản, nhập số / ký hiệu và ngày hiệu lực của quy định mới.';
      return;
    }
    if (effectiveFrom && effectiveTo && effectiveTo < effectiveFrom) {
      status.textContent = 'Ngày hết hiệu lực phải từ ngày hiệu lực trở đi.';
      return;
    }
    const { regulations, parameters } = readRegulations();
    const shared = parametersForRegulation(parameters, selectedCode);
    delete shared.ID_Mau07;
    for (const [field, type] of fields) {
      const value = values.get('CHUNG:' + field).trim();
      shared[field] = type === 'number' && value !== '' ? Number(value) / (field === 'Tiêu hao SX' ? 100 : 1) : value;
    }
    const regulation = { ...parent, code: selectedCode, updatedAt: new Date().toISOString() };
    const nextRegulations = draftCode
      ? [...regulations, regulation]
      : regulations.map(item => item.code === selectedCode ? regulation : item);
    if (!storageService.set(storageKey, {
      regulations: nextRegulations,
      parameters: [...parameters.filter(row => row.regulationCode !== selectedCode), shared],
    })) {
      status.textContent = 'Không lưu được tham số trên trình duyệt này.';
      return;
    }
    draftCode = undefined;
    editing = false;
    status.textContent = 'Đã lưu quy định ' + selectedCode + ' và tham số báo cáo.';
    document.dispatchEvent(new Event('forestrysettingschange'));
  });
}
