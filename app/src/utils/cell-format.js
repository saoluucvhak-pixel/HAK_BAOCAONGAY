/**
 * [UTIL] Định dạng ô bảng báo cáo (căn lề, giá trị theo kiểu cột) — tách khỏi components/report-table.js để các
 * module xuất file (Excel/PDF/In) dùng chung mà không import ngược vào component (tránh vòng phụ thuộc).
 * @module utils/cell-format
 */
import { displayDateParts, displayDecimal } from './display-format.js';
import { esc } from './dom-utils.js';
import { fmtDate, fmtTime } from './date-utils.js';
import { fmtMoney, fmtKL } from './number-utils.js';
import { alignOf } from './hak-format.js';

/**
 * [CHUẨN HAK] Lớp CSS căn lề theo kiểu cột: số → phải (' num'), ngày/giờ → giữa (' ctr'), chữ → trái.
 * Dùng chung cho bảng trên màn hình và bản in để 2 nơi luôn giống nhau.
 * @param {string} type kiểu cột ('money' | 'kl' | 'int' | 'date' | ...)
 */
export function alignClass(type) {
  var a = alignOf(type);
  return a === 'right' ? ' num' : (a === 'center' ? ' ctr' : '');
}

export function fmtCell(val, type) {
  if (val == null || val === '') return '';
  switch (type) {
    case 'money': return fmtMoney(val);
    case 'kl': return fmtKL(val);
    case 'int': return displayDecimal(Math.round(val));
    case 'date': return fmtDate(val);
    case 'time': return fmtTime(val);
    case 'datekey': { var s = String(val); if (s.length !== 8) return ''; return displayDateParts(s.slice(0, 4), s.slice(4, 6), s.slice(6, 8)); }
    default: return esc(val);
  }
}

/**
 * [2026-10-29] Ô hiển thị của 1 dòng — dòng đặc biệt có `_label` (vd "Số dư đầu kỳ" của Bảng kê chi tiết
 * tiền vay) hiện nhãn ở CỘT ĐẦU dù cột đó là cột ngày. Dùng chung cho màn hình, In, PDF, Excel.
 */
export function cellDisplay(r, c, i) {
  if (i === 0 && r && r._label) return esc(r._label);
  return fmtCell(r[c[0]], c[2]);
}
