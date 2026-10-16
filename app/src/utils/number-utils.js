/**
 * [UTILS] Hàm thuần xử lý số — parse số từ chuỗi CSV (nhiều định dạng VN/quốc tế),
 * format hiển thị tiền/khối lượng. Logic GIỮ NGUYÊN so với bản gốc.
 * @module utils/number-utils
 */

/** Cache kết quả parseNum theo chuỗi gốc (PERF-04). @type {Map<string, number>} */
const _numCache = new Map();

/**
 * Parse 1 giá trị (chuỗi CSV hoặc number) thành số, hỗ trợ dấu phân cách nghìn/thập phân
 * kiểu VN (1.234,56) lẫn quốc tế (1,234.56), số âm dạng ngoặc đơn "(123)", ký hiệu tiền tệ.
 * @param {string|number|null} v
 * @returns {number} NaN nếu không parse được
 */
export function parseNum(v) {
  if (v == null) return NaN;
  if (typeof v === 'number') return v;
  // [PERF-04] Cache theo chuỗi gốc: dữ liệu CSV giữ nguyên dạng chuỗi trong STATE, nên MỖI lần
  // LẬP BÁO CÁO, cùng 1 ô số bị parse lại (5-6 regex) ở nhiều báo cáo khác nhau. Kết quả là số
  // (bất biến) nên cache an toàn tuyệt đối; chỉ cache khi đầu vào là chuỗi.
  if (typeof v === 'string') {
    const cached = _numCache.get(v);
    if (cached !== undefined) return cached;
    const n = _parseNumUncached(v);
    if (_numCache.size > 300000) _numCache.clear(); // chặn phình bộ nhớ khi phiên làm việc rất dài
    _numCache.set(v, n);
    return n;
  }
  return _parseNumUncached(v);
}

function _parseNumUncached(v) {
  let s = String(v).trim();
  if (!s) return NaN;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  s = s.replace(/[\s ₫đ$€£%]|VND|VNĐ/gi, '');
  if (!/^[-+]?[\d.,]+$/.test(s)) return NaN;
  const hasDot = s.indexOf('.') >= 0, hasComma = s.indexOf(',') >= 0;
  if (hasDot && hasComma) {
    if (s.lastIndexOf('.') > s.lastIndexOf(',')) s = s.replace(/,/g, '');
    else s = s.replace(/\./g, '').replace(',', '.');
  } else if (hasComma) {
    if (/^[-+]?\d{1,3}(,\d{3})+$/.test(s)) s = s.replace(/,/g, '');
    else s = s.replace(',', '.');
  } else if (hasDot) {
    if (/^[-+]?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  }
  const n = parseFloat(s);
  if (isNaN(n)) return NaN;
  return neg ? -n : n;
}

/**
 * [PERF-05] Bộ định dạng số tạo 1 lần, dùng lại. Theo đặc tả ECMA-402,
 * `x.toLocaleString(locale, opts)` (bản cũ) chính là `new Intl.NumberFormat(locale, opts).format(x)`
 * — tức là MỖI lần gọi đều tạo lại 1 bộ định dạng mới (tốn kém). Kết quả chuỗi GIỐNG HỆT. Chỉ dùng
 * bộ định dạng cache khi đầu vào đúng là kiểu number; kiểu khác vẫn đi đường cũ để giữ nguyên
 * hành vi 100% (vd chuỗi '12' gọi `.toLocaleString()` của String, khác với Number).
 */
const _hasIntl = typeof Intl !== 'undefined' && typeof Intl.NumberFormat === 'function';
const _fmtInt = _hasIntl ? new Intl.NumberFormat('vi-VN') : null;
const _fmtKL = _hasIntl ? new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 }) : null;

/** @param {number} n @returns {string} vd "1.234.567 đ" */
export function fmtMoney(n) {
  if (n == null || isNaN(n)) return '';
  const neg = n < 0;
  n = Math.abs(Math.round(n));
  return (neg ? '-' : '') + (_fmtInt ? _fmtInt.format(n) : n.toLocaleString('vi-VN')) + ' đ';
}

/** @param {number} n @returns {string} vd "1.234,56" (tối đa 2 chữ số thập phân) */
export function fmtKL(n) {
  if (n == null || isNaN(n)) return '';
  if (_fmtKL && typeof n === 'number') return _fmtKL.format(n);
  return n.toLocaleString('vi-VN', { maximumFractionDigits: 2 });
}

/** Làm tròn xuống hàng nghìn gần nhất (dùng cho tính tiền hỗ trợ/hoa hồng). @param {number} x */
export function roundDown3(x) { return Math.floor(x / 1000) * 1000; }
