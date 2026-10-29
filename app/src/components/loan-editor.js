/**
 * [KHOẢN VAY — 2026-10-29] Giao diện tab "Cập nhật khoản vay" (Báo cáo ngân hàng) = bảng TH_VAY 3 cột
 * (Ngày hạch toán, Ngày chứng từ, Tổng tiền vay): thêm, sửa, xoá (từng dòng / nhiều dòng), nhập từ Excel
 * (file 3 cột, hoặc nguyên sổ phụ VAY — app tự lọc dòng tiền vay; thêm dòng mới hoặc thay toàn bộ),
 * tìm kiếm không dấu + lọc khoảng ngày (HAK Smart Filter). Mọi thay đổi ghi ngay vào kho trên máy
 * (services/loan-store.js) rồi cập nhật lại Sổ chi tiết tiền vay.
 *
 * Lớp này chỉ TRÌNH BÀY: không tự tính tổng nghiệp vụ (dùng summarizeLoans/computeSoTienVay), không
 * tự tạo khoá (kho tạo id). Xoá dùng kiểu "bấm lần nữa để xác nhận" (chuẩn HAK) — không có hộp thoại
 * chặn màn hình nhưng cũng không xoá nhầm bằng 1 cú bấm.
 * @module components/loan-editor
 */
import { createFilter, core as sf } from '@hak/smart-filter';
import { $, esc } from '../utils/dom-utils.js';
import { STATE } from '../store/state.js';
import { alignClass, fmtCell } from './report-table.js';
import { formatVNNumber, makeVNNumberInput, parseVNNumber } from './number-input.js';
import { formatIsoDate, dateRangeProblem, parseUserDate } from '../utils/hak-format.js';
import { fmtMoney } from '../utils/number-utils.js';
import { LOAN_FIELDS, IMPORT_HEADER_SETS, IMPORT_PREFER_SHEETS, validateLoan, parseImportRows, sortLoans, summarizeLoans } from '../services/loan-model.js';
import { listLoans, saveLoan, deleteLoans, importLoans } from '../services/loan-store.js';
import { parseExcelTableInWorker } from '../services/excel-import-worker.js';
import { logger } from '../services/logger.js';
import { renderStatCards } from './stat-cards.js';

const PAGE_SIZE = 50;
/** Thời gian chờ bấm lần 2 để xác nhận xoá. */
const CONFIRM_MS = 3500;
/** Số lỗi dòng tối đa liệt kê trong hộp nhập file (còn lại ghi "và N dòng khác"). */
const MAX_LISTED_ERRORS = 30;
/** Id ô nhập trong modal theo khoá dữ liệu (ô được dựng từ LOAN_FIELDS — xem buildLoanForm). */
const inputId = (key) => 'loan_' + key;
const DECIMALS = { money: 0, kl: 2 };

const ui = { all: [], view: [], page: 0, selected: new Set(), editing: null, pendingImport: null, confirmTimers: new Map() };
/** Gọi sau mỗi lần dữ liệu khoản vay đổi (legacy-app truyền vào: lập lại báo cáo nếu đã lập). Truyền
 *  hàm thay vì import legacy-app để không tạo thêm vòng phụ thuộc giữa 2 module. */
let onDataChanged = () => {};

const filter = createFilter({
  screenId: 'khoan-vay',
  fields: [],
  matchQ: (r, q) => r._hay.indexOf(q) >= 0,
  matchDate: (r, tu, den) => (!tu || r.ngayHachToan >= tu) && (!den || r.ngayHachToan <= den)
});

function setStatus(text, kind) {
  const el = $('#loanStatus'); if (!el) return;
  el.textContent = text || ''; el.className = 'loanStatus' + (kind ? ' ' + kind : '');
}

/** Chuỗi tìm kiếm của 1 dòng: ngày dd/MM/yyyy, số tiền dạng hiển thị, nguồn. */
function hayOf(r) {
  return sf.hay([formatIsoDate(r.ngayHachToan), formatIsoDate(r.ngayChungTu) || r.ngayChungTu, fmtMoney(r.tongTienVay), r.nguon]);
}

/** Đọc lại toàn bộ kho → cập nhật bảng + Sổ chi tiết tiền vay. */
export async function reloadLoans() {
  try {
    const rows = sortLoans(await listLoans());
    rows.forEach((r) => { Object.defineProperty(r, '_hay', { value: hayOf(r), enumerable: false }); });
    ui.all = rows;
    ui.selected.forEach((id) => { if (!rows.some((r) => r.id === id)) ui.selected.delete(id); });
    STATE.vayRecords = rows;
    applyFilter();
    onDataChanged();
  } catch (e) {
    logger.error('[khoan-vay] Không đọc được kho', e.message);
    const s = $('#loanSummary'); if (s) s.textContent = 'Không đọc được dữ liệu khoản vay đã lưu: ' + e.message;
    setStatus('Lỗi: ' + e.message, 'err');
  }
}

function applyFilter() {
  const tuText = $('#loanFrom').value, denText = $('#loanTo').value;
  const tu = parseUserDate(tuText), den = parseUserDate(denText);
  $('#loanFrom').classList.toggle('invalid', tu === null);
  $('#loanTo').classList.toggle('invalid', den === null);
  const problem = tu === null || den === null ? 'Ngày lọc không hợp lệ (dd/MM/yyyy)' : dateRangeProblem(tu, den);
  if (problem) { ui.view = []; setStatus(problem, 'err'); }
  else {
    filter.setState(Object.assign(filter.getState(), { q: $('#loanSearch').value, tu: tu || '', den: den || '', ky: '', flag: {} }));
    ui.view = filter.filter(ui.all).rows;
    setStatus('');
  }
  ui.page = Math.min(ui.page, Math.max(0, Math.ceil(ui.view.length / PAGE_SIZE) - 1));
  renderSummary(); renderTable();
}

function renderSummary() {
  const all = summarizeLoans(ui.all), v = summarizeLoans(ui.view);
  const filtered = ui.view.length !== ui.all.length;
  const n = (x) => x.toLocaleString('vi-VN'), d = (iso) => formatIsoDate(iso) || '';
  // Thẻ tổng: theo các dòng đang xem (đang lọc thì tính trên phần lọc, ghi rõ trên tổng đã lưu).
  renderStatCards($('#loanKpi'), [
    { lbl: filtered ? 'TỔNG TIỀN VAY (ĐANG LỌC)' : 'TỔNG TIỀN VAY', val: fmtMoney(v.vay), sub: n(v.count) + ' khoản vay' + (filtered ? ' · tổng đã lưu ' + fmtMoney(all.vay) : ''), cls: 'c2' },
    { lbl: 'GIẢI NGÂN GẦN NHẤT', val: v.latest ? fmtMoney(v.latest.tongTienVay) : '—', sub: v.latest ? 'Ngày ' + d(v.latest.ngayHachToan) : 'Chưa có khoản vay', cls: 'c1' },
    { lbl: 'KHOẢN LỚN NHẤT', val: v.max ? fmtMoney(v.max.tongTienVay) : '—', sub: v.count ? 'Ngày ' + d(v.max.ngayHachToan) + ' · bình quân ' + fmtMoney(v.avg) + '/khoản' : '', cls: 'c3' },
    { lbl: 'THỜI GIAN GIẢI NGÂN', val: v.from ? (v.from === v.to ? d(v.from) : d(v.from) + ' – ' + d(v.to)) : '—', sub: v.soNgay ? n(v.soNgay) + ' ngày có giải ngân' : '', cls: 'c1' }
  ]);
  const saved = all.lastSaved ? new Date(all.lastSaved) : null;
  const when = saved && !isNaN(saved) ? saved.toLocaleTimeString('vi-VN', { hour12: false }) + ' ' + saved.toLocaleDateString('vi-VN') : '';
  $('#loanSummary').innerHTML =
    '<span class="loanSaved">&#10003; Tự động lưu trên máy</span>' +
    '<span>Đã lưu: <b>' + n(all.count) + '</b> khoản vay, tổng <b>' + fmtMoney(all.vay) + '</b></span>' +
    (when ? '<span>Lần lưu gần nhất: <b>' + esc(when) + '</b></span>' : '') +
    (filtered ? '<span>Đang lọc: <b>' + n(v.count) + '</b> khoản, tổng <b>' + fmtMoney(v.vay) + '</b> (' + esc(filter.describe()) + ')</span>' : '') +
    '<span>(đơn vị tiền: đồng)</span>';
}

/** Các khoản vay đang hiện (đã áp tìm kiếm/lọc), đúng thứ tự bảng — cho nút "Lưu ra Excel". */
export function getLoanView() { return ui.view.slice(); }

/** Ô ngày chứa chữ (giữ nguyên từ file cũ, vd "PC0001") vẫn hiện ra để người dùng thấy mà sửa. */
function cellText(v, type) {
  if (type === 'date' && v && !formatIsoDate(v)) return esc(v);
  return fmtCell(v, type);
}

function rowHtml(r, stt) {
  const checked = ui.selected.has(r.id) ? ' checked' : '';
  return '<tr data-id="' + esc(r.id) + '"><td class="chk"><input type="checkbox" class="loanChk" aria-label="Chọn dòng ' + stt + '"' + checked + '></td>' +
    '<td class="act"><button class="btn small" data-act="edit" type="button">Sửa</button> <button class="btn small danger" data-act="del" type="button">Xoá</button></td>' +
    '<td class="num">' + stt + '</td>' +
    LOAN_FIELDS.map(([key, , type]) => '<td class="' + alignClass(type).trim() + '">' + cellText(r[key], type) + '</td>').join('') +
    '<td>' + esc(r.nguon || '') + '</td></tr>';
}

function renderTable() {
  const start = ui.page * PAGE_SIZE, slice = ui.view.slice(start, start + PAGE_SIZE);
  const allChecked = slice.length > 0 && slice.every((r) => ui.selected.has(r.id));
  const head = '<thead><tr><th class="chk"><input type="checkbox" id="loanChkPage" aria-label="Chọn cả trang"' + (allChecked ? ' checked' : '') + '></th><th class="ctr">Thao tác</th><th class="num">STT</th>' +
    LOAN_FIELDS.map(([, label, type]) => '<th class="' + alignClass(type).trim() + '">' + esc(label) + '</th>').join('') + '<th>Nguồn</th></tr></thead>';
  const empty = ui.all.length ? 'Không có dòng phù hợp bộ lọc' : 'Chưa có khoản vay — bấm "Thêm khoản vay" hoặc "Nhập từ Excel"';
  const body = slice.length ? slice.map((r, i) => rowHtml(r, start + i + 1)).join('') : '<tr><td colspan="' + (LOAN_FIELDS.length + 4) + '" class="empty">' + empty + '</td></tr>';
  $('#tbl-khoanvay').innerHTML = head + '<tbody>' + body + '</tbody>';
  const pages = Math.max(1, Math.ceil(ui.view.length / PAGE_SIZE));
  $('#loanPager').innerHTML = '<span>' + (ui.view.length ? 'Hiển thị ' + (start + 1) + '–' + (start + slice.length) + ' / ' + ui.view.length.toLocaleString('vi-VN') + ' dòng' : '') + '</span>' +
    '<span><button class="btn small" id="loanPrev" type="button"' + (ui.page <= 0 ? ' disabled' : '') + '>‹ Trước</button> Trang ' + (ui.page + 1) + '/' + pages +
    ' <button class="btn small" id="loanNext" type="button"' + (ui.page >= pages - 1 ? ' disabled' : '') + '>Sau ›</button></span>';
  const n = ui.selected.size, btn = $('#btnLoanDeleteSel');
  btn.disabled = n === 0; btn.classList.remove('confirm');
  btn.textContent = n ? '🗑 Xoá ' + n.toLocaleString('vi-VN') + ' dòng đã chọn' : '🗑 Xoá dòng đã chọn';
}

/** Nút nguy hiểm: lần 1 đổi chữ "Bấm lần nữa để xoá", lần 2 (trong CONFIRM_MS) mới chạy action. */
function confirmClick(btn, label, action) {
  if (btn.classList.contains('confirm')) {
    clearTimeout(ui.confirmTimers.get(btn)); btn.classList.remove('confirm'); action(); return;
  }
  const old = btn.textContent;
  btn.classList.add('confirm'); btn.textContent = label;
  ui.confirmTimers.set(btn, setTimeout(() => { btn.classList.remove('confirm'); btn.textContent = old; }, CONFIRM_MS));
}

async function removeIds(ids, doneText) {
  try {
    await deleteLoans(ids);
    ids.forEach((id) => ui.selected.delete(id));
    await reloadLoans();
    setStatus(doneText, 'ok');
  } catch (e) { setStatus('CHƯA xoá được: ' + e.message, 'err'); }
}

function onTableClick(e) {
  const tr = e.target.closest('tr[data-id]');
  if (e.target.id === 'loanChkPage') {
    const start = ui.page * PAGE_SIZE;
    ui.view.slice(start, start + PAGE_SIZE).forEach((r) => { if (e.target.checked) ui.selected.add(r.id); else ui.selected.delete(r.id); });
    renderTable(); return;
  }
  if (!tr) return;
  const id = tr.dataset.id, rec = ui.all.find((r) => r.id === id);
  if (e.target.classList.contains('loanChk')) { if (e.target.checked) ui.selected.add(id); else ui.selected.delete(id); renderTable(); return; }
  const act = e.target.dataset && e.target.dataset.act;
  if (act === 'edit' && rec) openLoanModal(rec);
  if (act === 'del' && rec) confirmClick(e.target, 'Bấm lần nữa', () => removeIds([id], 'Đã xoá 1 dòng.'));
}

/* ---------------- Modal thêm/sửa ---------------- */

/** Dựng các ô nhập theo LOAN_FIELDS (1 nguồn khai báo cột duy nhất — không lặp danh sách cột ở HTML). */
function buildLoanForm() {
  $('#loanFormGrid').innerHTML = LOAN_FIELDS.map(([key, label, type]) => {
    const req = key === 'ngayChungTu' ? '' : ' *';
    const attrs = type === 'date' ? ' placeholder="dd/MM/yyyy" inputmode="numeric"' : ' inputmode="numeric"';
    return '<div class="f"><label for="' + inputId(key) + '">' + esc(label) + (type === 'money' ? ' (đồng)' : '') + req +
      '</label><input type="text" id="' + inputId(key) + '"' + attrs + '></div>';
  }).join('');
}

function openLoanModal(rec) {
  ui.editing = rec ? { id: rec.id, rev: rec.rev } : null;
  $('#loanModalTitle').textContent = rec ? 'Sửa khoản vay' : 'Thêm khoản vay';
  LOAN_FIELDS.forEach(([key, , type]) => {
    const inp = $('#' + inputId(key)); inp.classList.remove('invalid');
    const v = rec ? rec[key] : null;
    // Ngày chứa chữ (từ file cũ) hiện nguyên chữ — Lưu sẽ báo sai ngày để người dùng sửa/xoá, không âm thầm mất.
    inp.value = type === 'date' ? (formatIsoDate(v) || v || '') : (type === 'text' ? (v || '') : formatVNNumber(v, DECIMALS[type]));
  });
  $('#loanFormErrors').textContent = '';
  $('#loanModalOverlay').classList.add('active');
  $('#' + inputId('ngayHachToan')).focus();
}

function closeLoanModal() { $('#loanModalOverlay').classList.remove('active'); ui.editing = null; }

function readLoanForm() {
  const input = {};
  LOAN_FIELDS.forEach(([key, , type]) => {
    const raw = $('#' + inputId(key)).value;
    if (type === 'money') { const n = parseVNNumber(raw); input[key] = isNaN(n) ? null : n; }
    else input[key] = raw;
  });
  return input;
}

async function onSaveLoan() {
  const res = validateLoan(readLoanForm(), { userDates: true });
  LOAN_FIELDS.forEach(([key, label]) => { $('#' + inputId(key)).classList.toggle('invalid', res.errors.some((m) => m.indexOf(label + ':') === 0)); });
  if (!res.ok) { $('#loanFormErrors').textContent = res.errors.join('\n'); return; }
  const btn = $('#btnLoanSave'); btn.disabled = true;
  try {
    const isEdit = !!ui.editing;
    await saveLoan(res.value, ui.editing || { nguon: 'Nhập tay' });
    closeLoanModal();
    await reloadLoans();
    setStatus(isEdit ? 'Đã lưu thay đổi.' : 'Đã thêm 1 khoản vay.', 'ok');
  } catch (e) {
    $('#loanFormErrors').textContent = 'CHƯA lưu được: ' + e.message;
  } finally { btn.disabled = false; }
}

/* ---------------- Nhập file Excel ---------------- */

async function onImportFile(file) {
  setStatus('Đang đọc file "' + file.name + '"...');
  try {
    const parsed = await parseExcelTableInWorker(await file.arrayBuffer(), { headerSets: IMPORT_HEADER_SETS, preferSheets: IMPORT_PREFER_SHEETS });
    const res = parseImportRows(parsed.rows, parsed.kind);
    ui.pendingImport = Object.assign(res, { kind: parsed.kind, fileName: file.name, sheetName: parsed.sheetName });
    showImportSummary();
    setStatus('');
  } catch (e) {
    setStatus('Lỗi đọc file: ' + e.message, 'err');
    logger.error('[khoan-vay] Lỗi đọc file', file && file.name, e.message);
  }
}

function showImportSummary() {
  const p = ui.pendingImport, s = summarizeLoans(p.values);
  const listOf = (arr) => arr.slice(0, MAX_LISTED_ERRORS).map((m) => '<li>' + esc(m) + '</li>').join('') +
    (arr.length > MAX_LISTED_ERRORS ? '<li>… và ' + (arr.length - MAX_LISTED_ERRORS) + ' dòng khác</li>' : '');
  const n = (x) => x.toLocaleString('vi-VN');
  const what = p.kind === 'sophu'
    ? ' (sổ phụ ngân hàng): đọc <b>' + n(p.total) + '</b> dòng, lấy <b>' + n(s.count) + '</b> dòng tiền vay giải ngân (Diễn giải đúng câu trong cấu hình), bỏ qua ' + n(p.skipped) + ' dòng thu/chi khác'
    : ': đọc <b>' + n(p.total) + '</b> dòng, hợp lệ <b>' + n(s.count) + '</b> khoản vay' + (p.skipped ? ', bỏ qua ' + n(p.skipped) + ' dòng không có Tổng tiền vay' : '');
  $('#loanImportSummary').innerHTML =
    'File <b>' + esc(p.fileName) + '</b>, sheet <b>' + esc(p.sheetName) + '</b>' + what + '. Tổng tiền vay <b>' + fmtMoney(s.vay) + '</b> đồng.<br>' +
    'Hiện đã lưu <b>' + n(ui.all.length) + '</b> khoản vay. <b>Thêm các dòng mới</b>: chỉ thêm phần chưa có — nhập lại đúng file cũ sẽ không nhân đôi (dòng giống hệt nhau trong cùng file vẫn giữ đủ). ' +
    '<b>Thay toàn bộ</b>: xoá hết dữ liệu đã lưu rồi ghi lại theo file.' +
    (p.errors.length ? '<div>Bỏ qua <b>' + p.errors.length + '</b> dòng không hợp lệ:</div><ul>' + listOf(p.errors) + '</ul>' : '') +
    (p.warnings.length ? '<div>Lưu ý <b>' + p.warnings.length + '</b> dòng (vẫn nhập):</div><ul class="warn">' + listOf(p.warnings) + '</ul>' : '');
  const canWrite = s.count > 0;
  $('#btnLoanImportAppend').disabled = !canWrite; $('#btnLoanImportReplace').disabled = !canWrite;
  $('#loanImportOverlay').classList.add('active');
}

function closeImport() { $('#loanImportOverlay').classList.remove('active'); ui.pendingImport = null; $('#tienVayFileInput').value = ''; }

async function runImport(mode) {
  const p = ui.pendingImport; if (!p) return;
  try {
    const r = await importLoans(p.values, mode, 'Excel: ' + p.fileName);
    closeImport();
    await reloadLoans();
    setStatus((mode === 'replace' ? 'Đã thay toàn bộ: ' : 'Đã thêm ') + r.added.toLocaleString('vi-VN') + ' dòng' + (r.duplicate ? ', bỏ qua ' + r.duplicate.toLocaleString('vi-VN') + ' dòng đã có sẵn' : '') + '.', 'ok');
  } catch (e) {
    $('#loanImportSummary').insertAdjacentHTML('beforeend', '<div class="loanFormErrors">CHƯA ghi được — dữ liệu cũ giữ nguyên: ' + esc(e.message) + '</div>');
  }
}

/* ---------------- Gắn sự kiện ---------------- */

/**
 * Gắn sự kiện cho tab + 2 modal, rồi nạp dữ liệu đã lưu. Gọi 1 lần lúc khởi động.
 * @param {Function} [changed] gọi lại mỗi khi dữ liệu khoản vay thay đổi
 */
export function initLoanEditor(changed) {
  if (!$('#tbl-khoanvay')) return;
  if (typeof changed === 'function') onDataChanged = changed;
  buildLoanForm();
  LOAN_FIELDS.forEach(([key, , type]) => { if (type === 'money') makeVNNumberInput($('#' + inputId(key)), null, DECIMALS.money); });
  $('#btnLoanAdd').addEventListener('click', () => openLoanModal(null));
  $('#btnLoanCancel').addEventListener('click', closeLoanModal);
  $('#btnLoanSave').addEventListener('click', onSaveLoan);
  $('#loanModalOverlay').addEventListener('click', (e) => { if (e.target.id === 'loanModalOverlay') closeLoanModal(); });
  $('#loanModalOverlay').addEventListener('keydown', (e) => { if (e.key === 'Escape') closeLoanModal(); if (e.key === 'Enter' && e.target.tagName === 'INPUT') onSaveLoan(); });
  $('#tienVayFileInput').addEventListener('change', (e) => { const f = e.target.files && e.target.files[0]; if (f) onImportFile(f); });
  $('#btnLoanImportCancel').addEventListener('click', closeImport);
  $('#btnLoanImportAppend').addEventListener('click', () => runImport('append'));
  $('#btnLoanImportReplace').addEventListener('click', (e) => confirmClick(e.currentTarget, 'Bấm lần nữa để THAY TOÀN BỘ', () => runImport('replace')));
  $('#tbl-khoanvay').addEventListener('click', onTableClick);
  $('#loanPager').addEventListener('click', (e) => {
    if (e.target.id === 'loanPrev' && ui.page > 0) { ui.page--; renderTable(); }
    if (e.target.id === 'loanNext') { ui.page++; renderTable(); }
  });
  ['#loanSearch', '#loanFrom', '#loanTo'].forEach((sel) => $(sel).addEventListener('input', () => { ui.page = 0; applyFilter(); }));
  $('#btnLoanClearFilter').addEventListener('click', () => { $('#loanSearch').value = ''; $('#loanFrom').value = ''; $('#loanTo').value = ''; ui.page = 0; applyFilter(); });
  $('#btnLoanDeleteSel').addEventListener('click', (e) => {
    const ids = Array.from(ui.selected);
    if (ids.length) confirmClick(e.currentTarget, 'Bấm lần nữa để xoá ' + ids.length.toLocaleString('vi-VN') + ' dòng', () => removeIds(ids, 'Đã xoá ' + ids.length.toLocaleString('vi-VN') + ' dòng.'));
  });
  return reloadLoans();
}
