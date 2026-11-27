import { displayDecimal, displayVietnamDateTime } from '../utils/display-format.js';
import { formatIsoDate as dateLabel } from '../utils/hak-format.js';
import { forestryPrintPages } from '../services/export/forestry-layout.js';
import { forestryWord, forestryWorkbook } from '../services/export/forestry-documents.js';
import { closingStock, isForestryHistoryEntry, latestForestryClosing } from '../services/forestry-history.js';
import { storageService } from '../services/storage-service.js';
import { dispatchSheetId, readForestrySettings } from './forestry-settings.js';
import { CONFIG } from '../config/config.js';
import { fetchCSVText } from '../services/data-service.js';
import { ensureExportLibs } from '../services/export-libs.js';
import { FORESTRY_SOURCES, buildForestryReports, forestryPeriodRange, normalizeForestrySheet, validateForestryPeriod } from '../services/forestry-report.js';
import { csvToObjects, parseCSV } from '../utils/csv-utils.js';
import { downloadBlob } from '../utils/dom-utils.js';

function dispatchSheetUrl(id, sheet) {
  const url = new URL('https://docs.google.com/spreadsheets/d/' + id + '/gviz/tq');
  url.searchParams.set('tqx', 'out:csv');
  url.searchParams.set('sheet', sheet);
  return url.href;
}

async function loadSource(source, value) {
  try {
    const rows = parseCSV(await fetchCSVText(value));
    const headers = (rows[0] ?? []).map(value => value.trim());
    return normalizeForestrySheet(source, headers, csvToObjects(rows));
  } catch (error) {
    throw new Error(source.label + ' — ' + error.message);
  }
}

function appendRow(parent, values, tag) {
  const row = parent.insertRow();
  for (const value of values) {
    const cell = document.createElement(tag);
    cell.textContent = value ?? '';
    if (tag === 'th') cell.scope = 'col';
    row.append(cell);
  }
}

const dailyNumericColumns = new Set([0, 6, 7, 11, 12, 14, 15]);

function showResults(container, reports) {
  for (const report of reports) {
    const panel = document.createElement('section');
    panel.className = 'panel';
    const title = document.createElement('h3');
    title.textContent = report.name + ' · ' + report.rows.length + ' dòng';
    const scroll = document.createElement('div');
    scroll.className = 'scrollWrap';
    const table = document.createElement('table');
    table.className = 'dataTbl';
    table.setAttribute('aria-label', report.name);
    appendRow(table.createTHead(), report.headers, 'th');
    const body = table.createTBody();
    const pageSize = 200;
    const pageCount = Math.max(1, Math.ceil(report.rows.length / pageSize));
    const pager = document.createElement('div');
    pager.className = 'tools';
    const previous = document.createElement('button');
    const next = document.createElement('button');
    for (const [button, label] of [[previous, 'Trang trước'], [next, 'Trang sau']]) {
      button.type = 'button';
      button.className = 'btn small';
      button.textContent = label;
    }
    const pageLabel = document.createElement('span');
    pageLabel.setAttribute('aria-live', 'polite');
    let page = 0;
    function renderPage() {
      body.replaceChildren();
      for (const values of report.rows.slice(page * pageSize, (page + 1) * pageSize)) {
        appendRow(body, values.map((value, index) => {
          if (report.name === 'RP_MAU04' && (index === 1 || index === 9)) return dateLabel(value);
          if (typeof value !== 'number') return value;
          if (report.name === 'RP_MAU04') return dailyNumericColumns.has(index) ? displayDecimal(value, 3) : value;
          if (report.name === 'RP_MAU14') return [6, 7, 9, 10].includes(index) ? displayDecimal(value, 2) : value;
          return index >= 4 && index <= 8 ? displayDecimal(value, 3) : value;
        }), 'td');
      }
      pageLabel.textContent = (page + 1) + ' / ' + pageCount;
      previous.disabled = page === 0;
      next.disabled = page + 1 === pageCount;
    }
    previous.addEventListener('click', () => { page--; renderPage(); });
    next.addEventListener('click', () => { page++; renderPage(); });
    renderPage();
    scroll.append(table);
    panel.append(title, scroll);
    if (pageCount > 1) {
      pager.append(previous, pageLabel, next);
      panel.append(pager);
    }
    container.append(panel);
  }
}

async function buildExport(format, pages) {
  if (format === 'word') return {
    bytes: await forestryWord(pages), extension: 'docx',
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  };
  const { ExcelJS } = await ensureExportLibs();
  return {
    bytes: await forestryWorkbook(ExcelJS, pages).xlsx.writeBuffer(), extension: 'xlsx',
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  };
}

const historyKey = CONFIG.STORAGE_KEYS.forestryHistory;
const displayStock = value => displayDecimal(value, 3);
const reportLabels = { M04_14: '04, 14', M04: '04', M14: '14', M: '29 tháng', Q: '29 quý', '6T': '29 sáu tháng', Y: '29 năm', CUSTOM: '29 kỳ tùy chọn' };

const periodChoices = {
  M: { label: 'Tháng', options: Array.from({ length: 12 }, (_, i) => 'Tháng ' + (i + 1)) },
  Q: { label: 'Quý', options: ['Quý I', 'Quý II', 'Quý III', 'Quý IV'] },
  '6T': { label: 'Nửa năm', options: ['6 tháng đầu năm', '6 tháng cuối năm'] },
  Y: { label: '', options: [] },
  CUSTOM: { label: '', options: [] },
};

function readHistory() {
  const entries = storageService.get(historyKey, []);
  return Array.isArray(entries) ? entries.filter(isForestryHistoryEntry) : [];
}

export function initForestryReports() {
  const form = document.getElementById('forestryForm');
  const status = document.getElementById('forestryStatus');
  const output = document.getElementById('forestryResults');
  const excelButton = document.getElementById('forestryExport');
  const wordButton = document.getElementById('forestryWord');
  const priorButton = document.getElementById('forestryUsePrior');
  const openingSource = document.getElementById('forestryOpeningSource');
  const historyTable = document.getElementById('forestryHistory');
  const submitButton = form.querySelector('[type="submit"]');
  const sources = Object.entries(FORESTRY_SOURCES);
  const periodChoice = document.getElementById('forestryPeriodChoice');
  const periodLabel = document.getElementById('forestryPeriodLabel');
  const periodRange = document.getElementById('forestryPeriodRange');
  const elements = form.elements;
  const currentDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
  const [currentYear, currentMonth] = currentDate.split('-').map(Number);
  elements.year.value = currentYear;

  let result;
  let exporting = false;
  let openingReference;
  let manualOpening = false;
  let range;

  function renderPeriodChoices() {
    const kind = elements.periodType.value;
    const { label, options } = periodChoices[kind];
    const custom = kind === 'CUSTOM';
    elements.year.disabled = custom;
    elements.year.parentElement.hidden = custom;
    for (const input of [elements.customFrom, elements.customTo]) {
      input.disabled = !custom;
      input.parentElement.hidden = !custom;
    }
    if (custom && !elements.customFrom.value && !elements.customTo.value && range) {
      elements.customFrom.value = range.from;
      elements.customTo.value = range.to;
    }
    periodLabel.textContent = label;
    periodChoice.hidden = !options.length;
    elements.periodIndex.disabled = !options.length;
    elements.periodIndex.replaceChildren(...options.map((text, i) => new Option(text, i + 1)));
    if (kind === 'M') elements.periodIndex.value = currentMonth;
    if (kind === 'Q') elements.periodIndex.value = Math.ceil(currentMonth / 3);
    if (kind === '6T') elements.periodIndex.value = Math.ceil(currentMonth / 6);
  }

  function refreshPeriod() {
    const start = range?.from;
    const custom = elements.periodType.value === 'CUSTOM';
    range = custom
      ? { from: elements.customFrom.value, to: elements.customTo.value }
      : forestryPeriodRange(elements.periodType.value, Number(elements.year.value), Number(elements.periodIndex.value || 1));
    periodRange.textContent = '';
    if (custom && range.from && range.to) {
      try { validateForestryPeriod(range.from, range.to); }
      catch (error) { periodRange.textContent = error.message; }
    } else if (!custom) {
      periodRange.textContent = range
        ? 'Từ ngày ' + dateLabel(range.from) + ' đến ngày ' + dateLabel(range.to)
        : 'Chọn năm hợp lệ.';
    }
    if (start !== range?.from) manualOpening = false;
    refreshOpening();
  }

  function refreshOpening() {
    let source = '';
    try { source = dispatchSheetId(CONFIG.XUATHANG_DN); } catch { /* Đợi link hợp lệ. */ }
    const prior = latestForestryClosing(readHistory(), range?.from, { source, company: CONFIG.TEN_CONG_TY, intake: CONFIG.HOSOKEO });
    let legacy;
    if (range?.from) {
      try {
        legacy = readForestrySettings(range.from, range.from).rows.find(row => row['Mẫu'] === 'MAU04' &&
          row.IN_Tungay === range.from && Number.isFinite(row['Tồn đầu ngày']));
      } catch { /* Chỉ gợi ý số tồn khi tìm được đúng quy định. */ }
    }
    openingReference = prior
      ? { value: prior.closing, label: 'Lấy tồn cuối kỳ trước' }
      : legacy ? { value: legacy['Tồn đầu ngày'], label: 'Dùng tồn đã lưu trước đây' } : undefined;
    priorButton.disabled = !openingReference;
    priorButton.textContent = openingReference?.label ?? 'Lấy tồn cuối kỳ trước';
    if (!manualOpening) elements.opening.value = prior?.closing ?? '';
    openingSource.textContent = prior
      ? 'Tồn cuối ngày ' + dateLabel(prior.to) + ' là ' + displayStock(prior.closing) + ' tấn.'
      : legacy ? 'Có số tồn đã lưu trước đây cho ngày ' + dateLabel(range.from) + ': ' +
        displayStock(legacy['Tồn đầu ngày']) + ' tấn. Hãy đối chiếu trước khi dùng.'
      : 'Nhập tồn đầu kỳ nếu chưa có tồn cuối của ngày liền trước.';
  }

  renderPeriodChoices();
  refreshPeriod();
  function renderHistory() {
    historyTable.replaceChildren();
    const entries = readHistory();
    const stored = storageService.get(historyKey, []);
    if (!Array.isArray(stored) || stored.length !== entries.length) {
      const notice = historyTable.insertRow().insertCell();
      notice.colSpan = 6;
      notice.textContent = 'Có mục lịch sử lâm sản không hợp lệ đang được bỏ qua.';
    }
    if (!entries.length) {
      const empty = historyTable.insertRow().insertCell();
      empty.colSpan = 6;
      empty.textContent = 'Chưa có báo cáo đã tạo.';
    }
    for (const entry of entries) {
      appendRow(historyTable, [displayVietnamDateTime(new Date(entry.createdAt)),
        dateLabel(entry.from) + ' – ' + dateLabel(entry.to), entry.selected.map(key => reportLabels[key]).join('; '),
        entry.regulationCode ?? '—', displayStock(entry.opening), Number.isFinite(entry.closing) ? displayStock(entry.closing) : '—'], 'td');
    }
    refreshOpening();
  }
  function updateExportButtons() {
    excelButton.disabled = exporting || !result;
    wordButton.disabled = exporting || !result;
  }
  renderHistory();
  priorButton.addEventListener('click', () => {
    if (!openingReference) return;
    elements.opening.value = openingReference.value;
    manualOpening = true;
    invalidateReport();
  });
  let revision = 0;
  function invalidateReport() {
    revision++;
    result = undefined;
    updateExportButtons();
    output.replaceChildren();
    status.textContent = 'Bấm Lập báo cáo kiểm lâm để cập nhật kết quả.';
  }
  form.addEventListener('input', event => {
    if (event.target.name === 'bookNumber') return;
    if (event.target.name === 'opening') manualOpening = true;
    if (event.target.name === 'periodType') renderPeriodChoices();
    if (['periodType', 'year', 'periodIndex', 'customFrom', 'customTo'].includes(event.target.name)) refreshPeriod();
    invalidateReport();
  });
  document.addEventListener('forestryhistorychange', renderHistory);
  document.addEventListener('displayformatchange', () => {
    refreshPeriod();
    renderHistory();
    if (result) {
      output.replaceChildren();
      showResults(output, result.reports);
    }
  });
  document.addEventListener('forestrysettingschange', () => {
    refreshOpening();
    invalidateReport();
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const currentRevision = ++revision;
    const values = new FormData(form);
    const { from, to } = range ?? {};
    const opening = elements.opening.valueAsNumber;
    const selected = values.getAll('reports').map(key => key === 'M29' ? elements.periodType.value : key);
    result = undefined;
    output.replaceChildren();
    submitButton.disabled = true;
    updateExportButtons();
    status.textContent = 'Đang đọc Google Sheet…';
    try {
      validateForestryPeriod(from, to);
      if (!Number.isFinite(opening)) throw new Error('Nhập tồn đầu kỳ hợp lệ.');
      if (!selected.length) throw new Error('Chọn ít nhất một mẫu báo cáo.');
      const config = readForestrySettings(from, to);
      const source = dispatchSheetId(CONFIG.XUATHANG_DN);
      const urls = {
        intake: CONFIG.HOSOKEO,
        dispatch: dispatchSheetUrl(source, FORESTRY_SOURCES.dispatch.label),
        orders: dispatchSheetUrl(source, FORESTRY_SOURCES.orders.label),
      };
      const data = Object.fromEntries(await Promise.all(sources.map(async ([key, source]) =>
        [key, await loadSource(source, urls[key])])));
      if (currentRevision !== revision) return;
      const reports = buildForestryReports({ ...data, calendar: [], settings: config.rows }, { from, to, opening, selected, commodityCode: CONFIG.MA_HS });
      showResults(output, reports);
      result = { reports, from, to };
      updateExportButtons();
      const entry = { createdAt: new Date().toISOString(), source, company: CONFIG.TEN_CONG_TY, intake: CONFIG.HOSOKEO, from, to, selected, opening, regulationCode: config.code, closing: closingStock(reports) };
      const savedHistory = storageService.set(historyKey, [entry, ...readHistory()]);
      renderHistory();
      status.textContent = 'Đã lập ' + reports.length + ' bảng theo quy định ' + config.code + '.' +
        (savedHistory ? '' : ' Không lưu được lịch sử trên trình duyệt này.');
    } catch (error) {
      if (currentRevision === revision) status.textContent = 'Lỗi lập báo cáo: ' + error.message;
    } finally {
      submitButton.disabled = false;
    }
  });
  const desktop = window.api;
  const folderButton = document.getElementById('forestryChooseFolder');
  const folderPath = document.getElementById('forestryFolderPath');
  const canSaveToFolder = typeof desktop?.saveForestryExport === 'function';
  let exportFolder = '';
  function showExportFolder(folder) {
    exportFolder = folder;
    folderPath.textContent = folder || 'Chọn thư mục để lưu Word và Excel theo từng khoảng ngày.';
  }
  async function chooseExportFolder() {
    folderButton.disabled = true;
    try {
      const selection = await desktop.chooseForestryExportFolder();
      if (selection.canceled) return false;
      if (!selection.ok) throw new Error(selection.error);
      showExportFolder(selection.folder);
      return true;
    } finally {
      folderButton.disabled = false;
    }
  }

  if (canSaveToFolder) {
    document.getElementById('forestryFolderOptions').hidden = false;
    showExportFolder('');
    desktop.forestryExportFolder().then(folder => {
      if (!exportFolder) showExportFolder(folder);
    }).catch(() => {});
    folderButton.addEventListener('click', () => {
      chooseExportFolder().catch(error => { status.textContent = error.message; });
    });
  }

  function handleExport(format) {
    return async () => {
      if (!result || exporting) return;
      const { reports, from, to } = result;
      exporting = true;
      updateExportButtons();
      try {
        if (canSaveToFolder && !exportFolder && (folderButton.disabled || !await chooseExportFolder())) return;
        const pages = forestryPrintPages(reports, {
          from, to, company: CONFIG.TEN_CONG_TY, commodityCode: CONFIG.MA_HS,
          bookNumber: form.elements.bookNumber.value.trim(),
        });
        const file = await buildExport(format, pages);
        if (canSaveToFolder) {
          const saved = await desktop.saveForestryExport({
            from, to, format: file.extension, bytes: new Uint8Array(file.bytes),
          });
          if (!saved.ok) throw new Error(saved.error);
          status.textContent = 'Đã lưu ' + saved.destination;
        } else {
          downloadBlob(new Blob([file.bytes], { type: file.mime }), 'BaoCaoKiemLam_' + from + '_' + to + '.' + file.extension);
        }
      } catch (error) {
        status.textContent = 'Lỗi xuất ' + (format === 'word' ? 'Word' : 'Excel') + ': ' + error.message;
      } finally {
        exporting = false;
        updateExportButtons();
      }
    };
  }
  excelButton.addEventListener('click', handleExport('excel'));
  wordButton.addEventListener('click', handleExport('word'));
}
