/**
 * [CHUẨN HAK — 2026-10-29] Cầu nối duy nhất giữa app và chuẩn định dạng chung của HAK:
 *  - `@hak/accounting-report-standard` (repo HAK_ACCOUNTING_REPORT_STANDARD, commit a5833a9):
 *    nhóm hàng nghìn kiểu VN, độ chính xác theo nhóm (tiền 0 số lẻ, khối lượng 2 số lẻ), ngày
 *    dd/MM/yyyy, căn lề theo kiểu cột.
 *  - `@hak/smart-filter` (repo HAK_SMART_FILTER, commit 5181681): đọc ngày gõ tay dd/MM/yyyy có
 *    kiểm tra ngày có thật (31/02 → lỗi), tìm kiếm không dấu.
 * Vì sao gom về 1 file: màn hình, Excel, PDF và bản in phải dùng CÙNG một quy tắc — đổi chuẩn chỉ
 * sửa ở đây. Hàm ở đây chỉ để HIỂN THỊ; không làm tròn/sửa dữ liệu gốc dùng để tính toán.
 * @module utils/hak-format
 */
import standard from '@hak/accounting-report-standard';
import precision from '@hak/accounting-report-standard/src/precision-settings.js';
import smartFilterCore from '@hak/smart-filter/core';
import { CONFIG } from '../config/config.js';
import { storageService } from '../services/storage-service.js';

/** Độ chính xác mặc định của chuẩn (tiền: số nguyên; khối lượng: 2 số lẻ) — không tự đặt số riêng. */
const DEFAULTS = precision.normalizeSettings({});
export const MONEY_DIGITS = DEFAULTS.money.digits;
export const QUANTITY_DIGITS = DEFAULTS.quantity.digits;

const DEFAULT_SETTINGS = { moneyDigits: MONEY_DIGITS, quantityDigits: QUANTITY_DIGITS, kgDigits: 0, negative: 'minus' };
let settings = DEFAULT_SETTINGS;

export function getPrecisionSettings() {
  return { ...settings };
}

export function loadPrecisionSettings() {
  const saved = storageService.get(CONFIG.STORAGE_KEYS.PRECISION_SETTINGS);
  const quantityDigits = [1, 2, 3].includes(saved?.quantityDigits) ? saved.quantityDigits : null;
  settings = {
    moneyDigits: [0, 1, 2].includes(saved?.moneyDigits) ? saved.moneyDigits : MONEY_DIGITS,
    quantityDigits: quantityDigits ?? QUANTITY_DIGITS,
    kgDigits: quantityDigits ?? 0,
    negative: saved?.negative === 'parentheses' ? 'parentheses' : 'minus'
  };
}

function formatNegative(text) {
  return settings.negative === 'parentheses' && text.startsWith('-') ? '(' + text.slice(1) + ')' : text;
}

/** Mã định dạng Excel, giữ giá trị ô là số. */
export function excelNumberFormat(type, preferences = settings) {
  const digitsByType = { kl: preferences.quantityDigits, kg: preferences.kgDigits, money: preferences.moneyDigits };
  const digits = digitsByType[type] ?? 0;
  const pattern = '#,##0' + (digits ? '.' + '0'.repeat(digits) : '');
  return preferences.negative === 'parentheses' ? pattern + ';(' + pattern + ')' : pattern;
}

export function formatInteger(n) {
  return formatNegative(Math.round(n).toLocaleString('vi-VN'));
}

/** Kiểu cột của app → kiểu cột của chuẩn (để lấy căn lề). */
const TYPE_MAP = { money: 'money', kl: 'decimal', kg: 'decimal', int: 'integer', date: 'date', datekey: 'date', time: 'datetime' };

/** Căn lề theo chuẩn: số → phải, ngày/giờ → giữa, chữ/mã → trái. @param {string} appType */
export function alignOf(appType) {
  return standard.alignFor(TYPE_MAP[appType] || 'text');
}

/** Tiền: nhóm hàng nghìn bằng dấu chấm, KHÔNG kèm ký hiệu "đ" (đơn vị ghi ở tiêu đề). Vô cực/NaN → ''. */
export function formatMoney(n) {
  if (n == null || typeof n !== 'number' || !isFinite(n)) return '';
  // Giữ cách làm tròn tiền nguyên đồng của bản cũ, kể cả tại -0,5.
  if (settings.moneyDigits === 0) {
    const rounded = Math.round(n);
    return formatNegative(groupNumber(rounded === 0 ? 0 : rounded, 0));
  }
  return formatNegative(groupNumber(n, settings.moneyDigits));
}

/**
 * Định dạng qua thư viện chuẩn. Chuẩn TỪ CHỐI số ≥ 2^53 (Number đã mất chữ số) — khi đó dùng formatExact
 * của chính thư viện với đúng giá trị nguyên mà Number đang giữ, để báo cáo KHÔNG bị dừng vì 1 ô lạ.
 */
function groupNumber(v, digits) {
  if (Math.abs(v) < Number.MAX_SAFE_INTEGER + 1) return standard.formatNumber(v, { minDecimals: digits, maxDecimals: digits });
  return standard.formatExact(BigInt(Math.trunc(v)), { mode: digits ? 'decimal' : 'integer', digits: digits });
}

/** Khối lượng dùng số chữ số lẻ đã chọn để cột thẳng hàng. */
export function formatQuantity(n, digits = settings.quantityDigits) {
  if (n == null || typeof n !== 'number' || !isFinite(n)) return '';
  return formatNegative(groupNumber(n, digits));
}

/** Các cột cân theo kg trước đây hiển thị số nguyên cho đến khi người dùng lưu cài đặt. */
export function formatWeightKg(n) {
  if (!settings.kgDigits) return formatInteger(n);
  return formatQuantity(Number(n), settings.kgDigits);
}

/** "YYYY-MM-DD" → "dd/MM/yyyy" (theo chuẩn, có kiểm tra ngày có thật). Sai → ''. */
export function formatIsoDate(iso) {
  try { return standard.formatDateISO(iso); } catch { return ''; }
}

/**
 * Đọc ngày người dùng gõ: "dd/MM/yyyy" (hoặc dd.MM.yyyy, dd-MM-yyyy, yyyy-MM-dd) → "YYYY-MM-DD".
 * Rỗng → ''. Ngày không tồn tại / sai dạng → null.
 */
export function parseUserDate(text) {
  return smartFilterCore.parseVN(text);
}

/** Chuỗi tìm kiếm không dấu, chữ thường (đúng hàm fold của Smart Filter). */
export function foldText(s) {
  return smartFilterCore.fold(s);
}

/** Từ ngày > đến ngày → câu thông báo; hợp lệ → ''. Ngày dạng ISO. */
export function dateRangeProblem(tu, den) {
  return smartFilterCore.dateProblem({ tu: tu || '', den: den || '' });
}
