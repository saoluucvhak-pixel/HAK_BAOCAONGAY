/**
 * [KHOẢN VAY — 2026-10-29] Mô hình dữ liệu tab "Cập nhật khoản vay" = bảng TH_VAY của người dùng
 * (3 cột: Ngày hạch toán, Ngày chứng từ, Tổng tiền vay), hàm thuần — kiểm thử được bằng Node.
 *
 * Luồng giống Power Query của người dùng (xem ARCHITECTURE §5d):
 *   TH_VAY (nhập ở tab này — tay hoặc file 3 cột; hoặc tải nguyên sổ phụ VAY thì app tự lọc như query
 *       TH_VAY: dòng có "Diễn giải" thuộc CONFIG.DIEN_GIAI_TIEN_VAY, Tổng tiền vay = Thu), Ngày chung = Ngày hạch toán
 *   DNTT_CT (Google Sheet, link trong cấu hình) → THTT_NH: Ngày chung = Ngày thanh toán
 *   → BKCT_TIENVAY = ghép 2 phần, xếp theo Ngày chung (computeSoTienVay trong report-service).
 *
 * Lịch sử cấu trúc: 1 = bảng kê tính sẵn (sáng 29/10), 2 = sổ phụ 12 cột (chiều 29/10), 3 = TH_VAY 3 cột
 * (người dùng: "chỉ nhập 3 cột đó"). Dữ liệu 1/2 cũ KHÔNG xoá — xem services/loan-store.js.
 *
 * Quy tắc (HAK_ACCOUNTING_REPORT_STANDARD + skill hak-data-integrity): khoá `id` ổn định; lưu giá trị
 * có kiểu (ngày ISO, số); ô trống ≠ 0 (lưu null); nhập lại cùng file không nhân đôi.
 * @module services/loan-model
 */
import { parseDateParts, pad2 } from '../utils/date-utils.js';
import { parseNum } from '../utils/number-utils.js';
import { parseUserDate } from '../utils/hak-format.js';
import { CONFIG } from '../config/config.js';

/** Phiên bản cấu trúc 1 dòng khoản vay đang dùng (3 = TH_VAY 3 cột). */
export const LOAN_SCHEMA = 3;
/** Phiên bản dòng sổ phụ ngân hàng 12 cột (bản trước) — chỉ còn dùng để chuyển đổi/khôi phục. */
export const SOPHU_SCHEMA = 2;

/** Cột khoản vay: [khoá lưu, tên cột trong file Excel, kiểu]. Thứ tự = bảng TH_VAY. */
export const LOAN_FIELDS = Object.freeze([
  ['ngayHachToan', 'Ngày hạch toán', 'date'],
  ['ngayChungTu', 'Ngày chứng từ', 'date'],
  ['tongTienVay', 'Tổng tiền vay', 'money']
]);
/** Cột sổ phụ ngân hàng (bảng VAY) — đọc khi người dùng tải nguyên sổ phụ để app tự lọc dòng tiền vay. */
export const SOPHU_FIELDS = Object.freeze([
  ['taiKhoan', 'Tài khoản ngân hàng', 'text'],
  ['ngayHachToan', 'Ngày hạch toán', 'date'],
  ['ngayChungTu', 'Ngày chứng từ', 'date'],
  ['soChungTu', 'Số chứng từ', 'text'],
  ['dienGiai', 'Diễn giải', 'text'],
  ['tkDoiUng', 'TK đối ứng', 'text'],
  ['thu', 'Thu', 'money'],
  ['chi', 'Chi', 'money'],
  ['ton', 'Tồn', 'money'],
  ['tenDoiTuong', 'Tên đối tượng', 'text'],
  ['maMuc', 'Mã mục thu/chi', 'text'],
  ['tenMuc', 'Tên mục thu/chi', 'text']
]);
/** 2 dạng file nhận được, thử theo thứ tự: bảng TH_VAY 3 cột, hoặc nguyên sổ phụ VAY. */
export const IMPORT_HEADER_SETS = Object.freeze([
  { kind: 'thvay', keys: ['Ngày hạch toán', 'Tổng tiền vay'] },
  { kind: 'sophu', keys: ['Ngày hạch toán', 'Diễn giải', 'Thu'] }
]);
/** Sheet đọc trước (đúng tên trong file của người dùng), sau đó các sheet còn lại. */
export const IMPORT_PREFER_SHEETS = Object.freeze(['TH_VAY', 'VAY']);

/** Ngày bất kỳ của app/Excel ("YYYY-MM-DD", "M/D/YYYY", Date) → "YYYY-MM-DD" | '' (trống) | null (sai). */
function toIsoDate(v) {
  if (v == null || v === '') return '';
  if (v instanceof Date) return isNaN(v) ? null : v.getUTCFullYear() + '-' + pad2(v.getUTCMonth() + 1) + '-' + pad2(v.getUTCDate());
  const p = parseDateParts(String(v));
  if (!p) return null;
  const d = new Date(Date.UTC(p.y, p.mo - 1, p.d));
  if (d.getUTCFullYear() !== p.y || d.getUTCMonth() !== p.mo - 1 || d.getUTCDate() !== p.d) return null;
  return p.y + '-' + pad2(p.mo) + '-' + pad2(p.d);
}

/** Số trong file/ô nhập → number | null (trống) | NaN (sai). */
function toNumber(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return v;
  const n = parseNum(v);
  return isNaN(n) ? NaN : n;
}

/**
 * Kiểm tra + chuẩn hoá 1 khoản vay (ô nhập tay: ngày gõ dd/MM/yyyy; file Excel: ngày đã đọc theo lịch).
 * Bắt buộc: Ngày hạch toán (Ngày chung của sổ) và Tổng tiền vay > 0. Ngày chứng từ được để trống.
 * @param {Object} input khoá theo LOAN_FIELDS[i][0]
 * @param {{userDates?: boolean}} [opt]
 * @returns {{ok: boolean, errors: string[], warnings: string[], value: Object}}
 */
export function validateLoan(input, opt) {
  const userDates = !!(opt && opt.userDates);
  const errors = [], warnings = [], value = {};
  LOAN_FIELDS.forEach(([key, label, type]) => {
    const raw = input ? input[key] : undefined;
    if (type === 'date') {
      const iso = userDates ? parseUserDate(raw == null ? '' : String(raw)) : toIsoDate(raw);
      // Nhập FILE: Ngày chứng từ là chữ thì GIỮ NGUYÊN + cảnh báo (không bỏ bút toán của người dùng).
      if (iso === null && !userDates && key !== 'ngayHachToan') { warnings.push(label + ': "' + String(raw).trim() + '" không phải ngày — giữ nguyên'); value[key] = String(raw).trim(); return; }
      if (iso === null) errors.push(label + ': ngày không hợp lệ (cần dd/MM/yyyy)');
      value[key] = iso || '';
    } else {
      const n = toNumber(raw);
      if (Number.isNaN(n)) errors.push(label + ': không phải số');
      else if (n == null) errors.push(label + ': bắt buộc nhập');
      else if (n <= 0) errors.push(label + ': phải lớn hơn 0');
      value[key] = Number.isNaN(n) ? null : n;
    }
  });
  if (!value.ngayHachToan && !errors.some((e) => e.indexOf('Ngày hạch toán') === 0)) errors.push('Ngày hạch toán: bắt buộc nhập');
  return { ok: errors.length === 0, errors, warnings, value };
}

/** Dòng sổ phụ là TIỀN VAY GIẢI NGÂN? (Diễn giải đúng 1 câu trong cấu hình — như query TH_VAY). */
export function isTienVay(rec, phrases) {
  const list = phrases || CONFIG.DIEN_GIAI_TIEN_VAY || [];
  return list.indexOf(String(rec && rec.dienGiai == null ? '' : rec.dienGiai).trim()) >= 0;
}

/** Dòng sổ phụ (khoá SOPHU_FIELDS) → đầu vào khoản vay, hoặc null nếu không phải tiền vay (query TH_VAY). */
export function sophuToLoanInput(rec, phrases) {
  if (!isTienVay(rec, phrases)) return null;
  return { ngayHachToan: rec.ngayHachToan, ngayChungTu: rec.ngayChungTu, tongTienVay: rec.thu };
}

/** Dấu vân tay nội dung để nhận ra dòng đã có khi nhập lại file. */
export function loanFingerprint(v) {
  return LOAN_FIELDS.map(([key, , type]) => {
    const x = v[key];
    if (type === 'money') return x == null ? '' : String(Math.round(x * 1000) / 1000);
    return String(x == null ? '' : x).trim().toLowerCase();
  }).join('|');
}

const pick = (row, fields) => { const o = {}; fields.forEach(([key, label]) => { o[key] = row[label]; }); return o; };
const blank = (v) => v == null || String(v).trim() === '';

/**
 * Các dòng đọc từ file (khoá = tên cột) → khoản vay hợp lệ + lỗi + số dòng bỏ qua.
 * - kind 'thvay' (bảng 3 cột): dòng không có Tổng tiền vay (trống/0) không phải khoản vay ⇒ bỏ qua.
 * - kind 'sophu' (nguyên sổ phụ VAY): chỉ lấy dòng có Diễn giải tiền vay, Tổng tiền vay = Thu; các dòng
 *   thu/chi khác bỏ qua (đúng query TH_VAY).
 * @returns {{values:Object[], errors:string[], warnings:string[], skipped:number, total:number}}
 */
export function parseImportRows(rows, kind, phrases) {
  const values = [], errors = [], warnings = [];
  let skipped = 0;
  (rows || []).forEach((row, i) => {
    let input;
    if (kind === 'sophu') input = sophuToLoanInput(pick(row, SOPHU_FIELDS), phrases);
    else {
      input = pick(row, LOAN_FIELDS);
      const n = toNumber(input.tongTienVay);
      if (blank(input.tongTienVay) || n === 0) input = null;
    }
    if (!input) { skipped++; return; }
    const res = validateLoan(input);
    if (res.ok) values.push(res.value); else errors.push('Dòng dữ liệu ' + (i + 1) + ': ' + res.errors.join('; '));
    if (res.ok && res.warnings.length) warnings.push('Dòng dữ liệu ' + (i + 1) + ': ' + res.warnings.join('; '));
  });
  return { values, errors, warnings, skipped, total: (rows || []).length };
}

/** Sắp xếp ổn định: theo Ngày hạch toán, cùng ngày giữ thứ tự nhập (seq). Không đổi mảng gốc. */
export function sortLoans(list) {
  return list.slice().sort((a, b) => (a.ngayHachToan < b.ngayHachToan ? -1 : a.ngayHachToan > b.ngayHachToan ? 1 : (a.seq || 0) - (b.seq || 0)));
}

/**
 * Tổng hợp cho thẻ số liệu của tab: số khoản, tổng tiền vay, khoản lớn nhất, lần giải ngân gần nhất
 * (theo Ngày hạch toán, cùng ngày lấy khoản nhập sau), khoảng ngày, số ngày có giải ngân, lần lưu gần nhất.
 */
export function summarizeLoans(list) {
  let vay = 0, max = null, latest = null, from = '', to = '', lastSaved = '';
  const days = new Set();
  list.forEach((r) => {
    const v = r.tongTienVay || 0, d = r.ngayHachToan || '';
    vay += v;
    if (!max || v > max.tongTienVay) max = r;
    if (d && (!latest || d > latest.ngayHachToan || (d === latest.ngayHachToan && (r.seq || 0) >= (latest.seq || 0)))) latest = r;
    if (d) { days.add(d); if (!from || d < from) from = d; if (!to || d > to) to = d; }
    if (r.updatedAt && r.updatedAt > lastSaved) lastSaved = r.updatedAt;
  });
  return { count: list.length, vay, avg: list.length ? vay / list.length : 0, max, latest, from, to, soNgay: days.size, lastSaved };
}

/**
 * [2026-10-29] Số dư đầu kỳ (đầu sổ) của Sổ chi tiết tiền vay, nhập tay: ngày (dd/MM/yyyy) + số tiền.
 * Số tiền bắt buộc, được bằng 0 hoặc âm (lũy kế tiền vay − chi có thể âm). Trả {ok, errors, value:{ngay ISO, soTien}}.
 */
export function validateOpening(input) {
  const errors = [];
  const ngay = parseUserDate(input && input.ngay != null ? String(input.ngay) : '');
  if (ngay === null) errors.push('Ngày: không hợp lệ (cần dd/MM/yyyy)');
  else if (!ngay) errors.push('Ngày: bắt buộc nhập');
  const raw = input ? input.soTien : null;
  const n = typeof raw === 'number' ? raw : toNumber(raw);
  if (n == null) errors.push('Số tiền: bắt buộc nhập');
  else if (Number.isNaN(n) || !isFinite(n)) errors.push('Số tiền: không phải số');
  return { ok: errors.length === 0, errors, value: { ngay: ngay || '', soTien: Number.isNaN(n) ? null : n } };
}
