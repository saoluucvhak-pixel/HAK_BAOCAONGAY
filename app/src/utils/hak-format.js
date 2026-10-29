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

/** Độ chính xác mặc định của chuẩn (tiền: số nguyên; khối lượng: 2 số lẻ) — không tự đặt số riêng. */
const DEFAULTS = precision.normalizeSettings({});
export const MONEY_DIGITS = DEFAULTS.money.digits;
export const QUANTITY_DIGITS = DEFAULTS.quantity.digits;

/** Kiểu cột của app → kiểu cột của chuẩn (để lấy căn lề). */
const TYPE_MAP = { money: 'money', kl: 'decimal', int: 'integer', date: 'date', datekey: 'date', time: 'datetime' };

/** Căn lề theo chuẩn: số → phải, ngày/giờ → giữa, chữ/mã → trái. @param {string} appType */
export function alignOf(appType) {
  return standard.alignFor(TYPE_MAP[appType] || 'text');
}

/** Tiền: số nguyên, nhóm hàng nghìn bằng dấu chấm, KHÔNG kèm ký hiệu "đ" (đơn vị ghi ở tiêu đề). Vô cực/NaN → ''. */
export function formatMoney(n) {
  if (n == null || typeof n !== 'number' || !isFinite(n)) return '';
  const neg = n < 0;
  // Làm tròn ĐÚNG như bản cũ (Math.round rồi mới lấy trị tuyệt đối: -1500,5 → -1.500) để số tiền hiển
  // thị không lệch 1 đồng so với trước. Khác duy nhất: số âm làm tròn về 0 hiện "0" thay vì "-0".
  const v = Math.abs(Math.round(n));
  return (neg && v !== 0 ? '-' : '') + groupNumber(v, MONEY_DIGITS);
}

/**
 * Định dạng qua thư viện chuẩn. Chuẩn TỪ CHỐI số ≥ 2^53 (Number đã mất chữ số) — khi đó dùng formatExact
 * của chính thư viện với đúng giá trị nguyên mà Number đang giữ, để báo cáo KHÔNG bị dừng vì 1 ô lạ.
 */
function groupNumber(v, digits) {
  if (Math.abs(v) < Number.MAX_SAFE_INTEGER + 1) return standard.formatNumber(v, { minDecimals: digits, maxDecimals: digits });
  return standard.formatExact(BigInt(Math.trunc(v)), { mode: digits ? 'decimal' : 'integer', digits: digits });
}

/** Khối lượng: luôn đúng QUANTITY_DIGITS chữ số lẻ (1.234,50) để cột thẳng hàng. */
export function formatQuantity(n) {
  if (n == null || typeof n !== 'number' || !isFinite(n)) return '';
  return groupNumber(n, QUANTITY_DIGITS);
}

/** "YYYY-MM-DD" → "dd/MM/yyyy" (theo chuẩn, có kiểm tra ngày có thật). Sai → ''. */
export function formatIsoDate(iso) {
  try { return standard.formatDateISO(iso); } catch (e) { return ''; }
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
