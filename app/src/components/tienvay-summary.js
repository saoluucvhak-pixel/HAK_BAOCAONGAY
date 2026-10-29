/**
 * [2026-10-29] Phần đầu tab "Sổ chi tiết tiền vay":
 *  1. Ô "Số dư đầu kỳ" nhập tay (ngày + số tiền) — lưu trên máy (services/loan-store, kho `meta`), có
 *     trong file sao lưu. Có số dư nhập thì sổ bắt đầu từ ngày đó với lũy kế = số tiền nhập
 *     (computeSoTienVay). Để trống: sổ bắt đầu từ ngày giải ngân đầu tiên như trước.
 *  2. Thẻ số liệu tổng của kỳ đang xem: Số dư đầu kỳ, Tiền vay giải ngân, Tiền chi thanh toán, Số dư cuối
 *     kỳ + thanh "đã chi bao nhiêu % nguồn vốn trong kỳ". Số liệu lấy NGUYÊN từ kết quả computeSoTienVay
 *     (cùng số với bảng và file xuất) — không có công thức riêng.
 * Lớp này chỉ trình bày + gọi kho; không import legacy-app (nhận hàm gọi lại, như loan-editor).
 * @module components/tienvay-summary
 */
import { $, esc } from '../utils/dom-utils.js';
import { STATE } from '../store/state.js';
import { fmtMoney, fmtKL } from '../utils/number-utils.js';
import { formatIsoDate } from '../utils/hak-format.js';
import { fmtDate, dateKey } from '../utils/date-utils.js';
import { formatVNNumber, makeVNNumberInput, parseVNNumber } from './number-input.js';
import { validateOpening } from '../services/loan-model.js';
import { getOpening, setOpening } from '../services/loan-store.js';
import { renderStatCards } from './stat-cards.js';
import { logger } from '../services/logger.js';

/** Thời gian chờ bấm lần 2 để xác nhận xoá số dư. */
const CONFIRM_MS = 3500;
let onChanged = () => {};
let confirmTimer = null;

function setStatus(text, kind) {
  const el = $('#tvOpStatus'); if (!el) return;
  el.textContent = text || ''; el.className = 'loanStatus' + (kind ? ' ' + kind : '');
}

function fillForm(op) {
  $('#tvOpNgay').value = op ? formatIsoDate(op.ngay) : '';
  $('#tvOpTien').value = op ? formatVNNumber(op.soTien, 0) : '';
  $('#tvOpNgay').classList.remove('invalid'); $('#tvOpTien').classList.remove('invalid');
  $('#btnTvOpClear').disabled = !op;
  $('#tvOpCurrent').innerHTML = op
    ? 'Đang dùng: sổ bắt đầu ngày <b>' + esc(formatIsoDate(op.ngay)) + '</b>, số dư <b>' + fmtMoney(op.soTien) + '</b> đồng.'
    : 'Chưa nhập — sổ bắt đầu từ ngày giải ngân đầu tiên, số dư đầu = 0.';
}

async function onSave() {
  const res = validateOpening({ ngay: $('#tvOpNgay').value, soTien: $('#tvOpTien').value.trim() === '' ? null : parseVNNumber($('#tvOpTien').value) });
  $('#tvOpNgay').classList.toggle('invalid', res.errors.some((m) => m.indexOf('Ngày') === 0));
  $('#tvOpTien').classList.toggle('invalid', res.errors.some((m) => m.indexOf('Số tiền') === 0));
  if (!res.ok) { setStatus(res.errors.join('; '), 'err'); return; }
  try {
    STATE.soDuDauSo = await setOpening(res.value);
    fillForm(STATE.soDuDauSo);
    setStatus('Đã lưu số dư đầu kỳ.', 'ok');
    onChanged();
  } catch (e) { setStatus('CHƯA lưu được: ' + e.message, 'err'); }
}

async function onClear(btn) {
  if (!btn.classList.contains('confirm')) {
    btn.classList.add('confirm'); btn.textContent = 'Bấm lần nữa để xoá';
    confirmTimer = setTimeout(() => { btn.classList.remove('confirm'); btn.textContent = 'Xoá'; }, CONFIRM_MS);
    return;
  }
  clearTimeout(confirmTimer); btn.classList.remove('confirm'); btn.textContent = 'Xoá';
  try {
    STATE.soDuDauSo = await setOpening(null);
    fillForm(null);
    setStatus('Đã xoá số dư đầu kỳ.', 'ok');
    onChanged();
  } catch (e) { setStatus('CHƯA xoá được: ' + e.message, 'err'); }
}

/** Đọc lại số dư đầu kỳ đã lưu (sau khi khôi phục sao lưu) rồi báo thay đổi. */
export async function reloadOpening() {
  try { STATE.soDuDauSo = await getOpening(); fillForm(STATE.soDuDauSo); }
  catch (e) { logger.error('[tien-vay] Không đọc được số dư đầu kỳ', e.message); setStatus('Không đọc được số dư đầu kỳ đã lưu: ' + e.message, 'err'); }
  onChanged();
}

/**
 * Gắn sự kiện ô số dư đầu kỳ, nạp số dư đã lưu. Gọi 1 lần lúc khởi động.
 * @param {Function} [changed] gọi lại khi số dư đổi (legacy-app: lập lại báo cáo nếu đã lập)
 */
export function initOpeningBalance(changed) {
  if (!$('#tvOpening')) return Promise.resolve();
  if (typeof changed === 'function') onChanged = changed;
  makeVNNumberInput($('#tvOpTien'), null, 0);
  $('#btnTvOpSave').addEventListener('click', onSave);
  $('#btnTvOpClear').addEventListener('click', (e) => onClear(e.currentTarget));
  ['#tvOpNgay', '#tvOpTien'].forEach((sel) => $(sel).addEventListener('keydown', (e) => { if (e.key === 'Enter') onSave(); }));
  return reloadOpening();
}

/** Khoá lưu lựa chọn cách tính lũy kế (tuỳ chọn hiển thị trên máy, không phải dữ liệu nghiệp vụ). */
const LUYKE_KEY = 'baocaongay_tienvay_luyke';
/** Đọc lựa chọn đã lưu: 'ky' (mặc định — trong khoảng thời gian báo cáo) | 'dauSo'. */
export function loadLuyKeMode() {
  try { return localStorage.getItem(LUYKE_KEY) === 'dauSo' ? 'dauSo' : 'ky'; } catch (e) { return 'ky'; }
}
/**
 * [2026-10-29] Ô chọn "Lũy kế tiền vay chi: Trong kỳ báo cáo | Từ đầu sổ". Đổi ⇒ lưu trên máy, lập lại sổ.
 * @param {Function} [changed]
 */
export function initLuyKeMode(changed) {
  STATE.tienVayLuyKe = loadLuyKeMode();
  const sel = $('#tvLuyKeMode'); if (!sel) return;
  sel.value = STATE.tienVayLuyKe;
  sel.addEventListener('change', () => {
    STATE.tienVayLuyKe = sel.value === 'dauSo' ? 'dauSo' : 'ky';
    try { localStorage.setItem(LUYKE_KEY, STATE.tienVayLuyKe); } catch (e) { /* không lưu được thì vẫn dùng cho phiên này */ }
    if (typeof changed === 'function') changed();
  });
}

/** Ngày bất kỳ của sổ (ISO hoặc M/D/YYYY) → dd/MM/yyyy. */
const dmy = (v) => formatIsoDate(v) || fmtDate(v) || '';
const pad = (x) => (x < 10 ? '0' : '') + x;
/** yyyymmdd → dd/MM/yyyy. */
const dmyKey = (k) => pad(k % 100) + '/' + pad(Math.floor(k / 100) % 100) + '/' + Math.floor(k / 10000);

/**
 * Vẽ thẻ số liệu tổng từ kết quả computeSoTienVay của kỳ đang xem.
 * @param {Object} r RESULTS.tienvay
 * @param {?number} fromKey yyyymmdd "Từ ngày" (null = không chọn)
 */
export function renderTienVayKpi(r, fromKey) {
  const box = $('#tienVayKpi'); if (!box || !r) return;
  const n = (x) => x.toLocaleString('vi-VN');
  const startNote = r.batDau.loai === 'nhap' ? 'Số dư nhập tay ngày ' + dmy(r.batDau.ngay)
    : r.batDau.loai === 'giaiNgan' ? 'Sổ bắt đầu ' + dmy(r.batDau.ngay) + ' (giải ngân đầu)' : 'Chưa có khoản vay';
  // Kỳ bắt đầu SAU ngày đầu sổ ⇒ số dư đầu kỳ = lũy kế các dòng trước "Từ ngày"; ngược lại = điểm đầu sổ.
  const k0 = r.batDau.ngay ? dateKey(r.batDau.ngay) : null;
  let dauKyNote = r.mode !== 'ky' && fromKey != null && k0 != null && fromKey > k0 ? 'Lũy kế trước ' + dmyKey(fromKey) + ' · ' + startNote : startNote;
  if (r.mode === 'ky' && fromKey != null) dauKyNote = 'Lũy kế trong kỳ · ' + startNote;
  if (r.boQuaSoDu && STATE.soDuDauSo) dauKyNote += ' · số dư nhập ngày ' + dmy(STATE.soDuDauSo.ngay) + ' ngoài kỳ — không dùng';
  const am = r.luyKeCuoi < 0;
  const cards = [
    ['SỐ DƯ ĐẦU KỲ', fmtMoney(r.soDuDauKy), dauKyNote, 'c1'],
    ['TIỀN VAY GIẢI NGÂN', fmtMoney(r.totalVay), n(r.soLanVay) + ' lần giải ngân', 'c2'],
    ['TIỀN CHI THANH TOÁN', fmtMoney(r.totalChi), fmtKL(r.totalSoTan) + ' tấn · ' + n(r.soDongChi) + ' dòng chi', 'c3'],
    ['SỐ DƯ CUỐI KỲ', fmtMoney(r.luyKeCuoi), am ? 'Chi vượt tiền vay ' + fmtMoney(-r.luyKeCuoi) : '= đầu kỳ + vay − chi', am ? 'c4' : 'c1']
  ];
  renderStatCards(box, cards.map((c) => ({ lbl: c[0], val: c[1], sub: c[2], cls: c[3] })));
  // Thanh "đã chi / nguồn vốn trong kỳ" — nguồn = số dư đầu kỳ + tiền vay giải ngân trong kỳ.
  const nguon = r.soDuDauKy + r.totalVay, use = $('#tienVayUse');
  if (nguon > 0) {
    const pct = r.totalChi / nguon * 100, w = Math.max(0, Math.min(100, pct));
    use.innerHTML = '<div class="tvUseHead"><span>Đã chi <b>' + pct.toLocaleString('vi-VN', { maximumFractionDigits: 1 }) + '%</b> nguồn vốn trong kỳ</span><span>' +
      fmtMoney(r.totalChi) + ' / ' + fmtMoney(nguon) + ' (đầu kỳ + vay)</span></div><div class="tvUseBar' + (pct > 100 ? ' over' : '') + '" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + Math.round(w) + '"><i style="width:' + w + '%"></i></div>';
  } else use.innerHTML = '';
}

/**
 * [2026-10-29] Thẻ số liệu tổng tab "Tổng hợp thanh toán" — số lấy NGUYÊN từ computeTongHopThanhToan (cùng số
 * với bảng và dòng tổng).
 * @param {Object} r RESULTS.thtt
 */
export function renderThttKpi(r) {
  const box = $('#thttKpi'); if (!box || !r) return;
  const n = (x) => x.toLocaleString('vi-VN');
  const donGia = r.totalKL > 0 ? r.totalTien / r.totalKL : null;
  renderStatCards(box, [
    { lbl: 'TỔNG THÀNH TIỀN', val: fmtMoney(r.totalTien), sub: n(r.rows.length) + ' dòng thanh toán', cls: 'c2' },
    { lbl: 'TỔNG KHỐI LƯỢNG', val: fmtKL(r.totalKL), sub: donGia != null ? 'tấn · đơn giá bình quân ' + fmtMoney(donGia) + '/tấn' : 'tấn', cls: 'c3' },
    { lbl: 'SỐ CHỦ RỪNG', val: n(r.soChuRung), sub: r.topChuRung ? 'Nhiều nhất: ' + r.topChuRung.ten + ' (' + fmtMoney(r.topChuRung.tien) + ')' : '', cls: 'c1' },
    { lbl: 'SỐ NGÀY THANH TOÁN', val: n(r.soNgay), sub: r.soNgay ? 'bình quân ' + fmtMoney(r.totalTien / r.soNgay) + '/ngày' : '', cls: 'c1' }
  ]);
}
