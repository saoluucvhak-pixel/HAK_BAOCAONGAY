import { forestryPrintPages } from '../services/export/forestry-layout.js';
import { forestryWord, forestryWorkbook } from '../services/export/forestry-documents.js';
import { closingStock, isForestryHistoryEntry, latestForestryClosing } from '../services/forestry-history.js';
import { storageService } from '../services/storage-service.js';
import { dispatchSheetId, readForestrySettings } from './forestry-settings.js';
import { CONFIG } from '../config/config.js';
import { fetchCSVText } from '../services/data-service.js';
import { ensureExportLibs } from '../services/export-libs.js';
import { FORESTRY_SOURCES, buildForestryReports, normalizeForestrySheet, validateForestryPeriod } from '../services/forestry-report.js';
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

const previewQuantity = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 3 });
const previewCurrency = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 });
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
          if (typeof value !== 'number') return value;
          if (report.name === 'RP_MAU04') return dailyNumericColumns.has(index) ? previewQuantity.format(value) : value;
          if (report.name === 'RP_MAU14') return [6, 7, 9, 10].includes(index) ? previewCurrency.format(value) : value;
          return index >= 4 && index <= 8 ? previewQuantity.format(value) : value;
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

async function exportReports(format, pages, filename) {
  if (format === 'word') {
    const buffer = await forestryWord(pages);
    downloadBlob(new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    }), filename + '.docx');
    return;
  }
  const { ExcelJS } = await ensureExportLibs();
  const buffer = await forestryWorkbook(ExcelJS, pages).xlsx.writeBuffer();
  downloadBlob(new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  }), filename + '.xlsx');
}

const historyKey = CONFIG.STORAGE_KEYS.forestryHistory;
const number = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 3 });
const dateTime = new Intl.DateTimeFormat('vi-VN', {
  dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh',
});
const dateLabel = date => date.split('-').reverse().join('/');
const reportLabels = { M04_14: '04, 14', M: '29 tháng', '6T': '29 sáu tháng', Y: '29 năm' };

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
  form.elements.from.value = document.getElementById('fFrom').value;
  form.elements.to.value = document.getElementById('fTo').value;

  let result;
  let exporting = false;
  let prior;
  let carriedOpening = false;
  let openingSourceId;
  function refreshOpening() {
    let source = '';
    try { source = dispatchSheetId(readForestrySettings().shipping); } catch { /* Đợi link hợp lệ. */ }
    if (carriedOpening && source !== openingSourceId) {
      form.elements.opening.value = '';
      carriedOpening = false;
    }
    openingSourceId = source;
    prior = latestForestryClosing(readHistory(), form.elements.from.value, { source, company: CONFIG.TEN_CONG_TY, intake: CONFIG.HOSOKEO });
    priorButton.disabled = !prior;
    openingSource.textContent = prior
      ? 'Tồn cuối gần nhất: ' + number.format(prior.closing) + ' tấn, ngày ' + dateLabel(prior.to) + '.'
      : 'Chưa có tồn cuối của ngày liền trước cùng nguồn nhập, xuất và đơn vị. Hãy đối chiếu rồi nhập tồn đầu kỳ.';
  }
  function renderHistory() {
    historyTable.replaceChildren();
    const entries = readHistory();
    const stored = storageService.get(historyKey, []);
    if (!Array.isArray(stored) || stored.length !== entries.length) {
      const notice = historyTable.insertRow().insertCell();
      notice.colSpan = 5;
      notice.textContent = 'Có mục lịch sử lâm sản không hợp lệ đang được bỏ qua.';
    }
    if (!entries.length) {
      const empty = historyTable.insertRow().insertCell();
      empty.colSpan = 5;
      empty.textContent = 'Chưa có báo cáo đã tạo.';
    }
    for (const entry of entries) {
      appendRow(historyTable, [dateTime.format(new Date(entry.createdAt)),
        dateLabel(entry.from) + ' – ' + dateLabel(entry.to), entry.selected.map(key => reportLabels[key]).join('; '),
        number.format(entry.opening), Number.isFinite(entry.closing) ? number.format(entry.closing) : '—'], 'td');
    }
    refreshOpening();
  }
  function updateExportButtons() {
    excelButton.disabled = exporting || !result;
    wordButton.disabled = exporting || !result;
  }
  renderHistory();
  priorButton.addEventListener('click', () => {
    if (!prior) return;
    form.elements.opening.value = prior.closing;
    carriedOpening = true;
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
    if (event.target.name === 'opening') carriedOpening = false;
    if (event.target.name === 'from') {
      if (carriedOpening) form.elements.opening.value = '';
      carriedOpening = false;
      refreshOpening();
    }
    invalidateReport();
  });
  document.addEventListener('forestryhistorychange', renderHistory);
  document.addEventListener('forestrysettingschange', () => {
    refreshOpening();
    invalidateReport();
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const currentRevision = ++revision;
    const values = new FormData(form);
    const from = values.get('from');
    const to = values.get('to');
    const opening = Number(values.get('opening'));
    const selected = values.getAll('reports');
    result = undefined;
    output.replaceChildren();
    submitButton.disabled = true;
    updateExportButtons();
    status.textContent = 'Đang đọc Google Sheet…';
    try {
      validateForestryPeriod(from, to);
      if (!selected.length) throw new Error('Chọn ít nhất một mẫu báo cáo.');
      const config = readForestrySettings();
      if ((config.effectiveFrom && from < config.effectiveFrom) ||
          (config.effectiveTo && to > config.effectiveTo)) {
        throw new Error('Kỳ báo cáo nằm ngoài thời gian hiệu lực ở Cấu hình → Tham số báo cáo lâm sản.');
      }
      const source = dispatchSheetId(config.shipping);
      const urls = {
        intake: CONFIG.HOSOKEO,
        dispatch: dispatchSheetUrl(source, FORESTRY_SOURCES.dispatch.label),
        orders: dispatchSheetUrl(source, FORESTRY_SOURCES.orders.label),
      };
      const data = Object.fromEntries(await Promise.all(sources.map(async ([key, source]) =>
        [key, await loadSource(source, urls[key])])));
      if (currentRevision !== revision) return;
      const reports = buildForestryReports({ ...data, calendar: [], settings: config.rows }, { from, to, opening, selected });
      showResults(output, reports);
      result = { reports, from, to };
      updateExportButtons();
      const entry = { createdAt: new Date().toISOString(), source, company: CONFIG.TEN_CONG_TY, intake: CONFIG.HOSOKEO, from, to, selected, opening, closing: closingStock(reports) };
      const savedHistory = storageService.set(historyKey, [entry, ...readHistory()]);
      renderHistory();
      status.textContent = 'Đã lập ' + reports.length + ' bảng từ Google Sheet.' +
        (savedHistory ? '' : ' Không lưu được lịch sử trên trình duyệt này.');
    } catch (error) {
      if (currentRevision === revision) status.textContent = 'Lỗi lập báo cáo: ' + error.message;
    } finally {
      submitButton.disabled = false;
    }
  });
  function handleExport(format) {
    return async () => {
      if (!result || exporting) return;
      const { reports, from, to } = result;
      exporting = true;
      updateExportButtons();
      try {
        const pages = forestryPrintPages(reports, {
          from, to, company: CONFIG.TEN_CONG_TY, commodityCode: CONFIG.MA_HS,
          bookNumber: form.elements.bookNumber.value.trim(),
        });
        await exportReports(format, pages, 'BaoCaoKiemLam_' + from + '_' + to);
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
