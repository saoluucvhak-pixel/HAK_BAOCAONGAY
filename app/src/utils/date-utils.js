/**
 * [UTILS] Hàm thuần xử lý ngày/giờ — không phụ thuộc DOM/State.
 * Logic parse GIỮ NGUYÊN 100% so với BaoCaoNgay.html gốc (đã kiểm chứng bằng
 * script so sánh output trước/sau, xem PERFORMANCE_REPORT.md).
 * @module utils/date-utils
 */

/**
 * Cache kết quả parse ngày theo chuỗi gốc (xem PERFORMANCE_REPORT.md — PERF-01).
 * Object trả về chỉ bị ĐỌC ở mọi nơi gọi, không bị sửa, nên cache an toàn tuyệt đối.
 * @type {Map<string, {y:number, mo:number, d:number}|null>}
 */
const _dateCache = new Map();

/**
 * Parse 1 chuỗi ngày (định dạng "YYYY-MM-DD" hoặc dạng "X/Y/Năm") thành {y, mo, d}.
 * [BUGFIX 2026-09-22] Dữ liệu ngày xuất từ Google Sheet (cột "Ngày cân 1"/"Ngày cân 2" ở
 * PHIEUCAN và "Ngày thanh toán" ở DNTT_CT) ra CSV theo định dạng THÁNG/NGÀY/NĂM (kiểu Mỹ,
 * do locale của Google Sheet nguồn — đã xác nhận thực tế qua ảnh chụp Sheet: "1/10/2026" =
 * ngày 10 tháng 1, KHÔNG PHẢI ngày 1 tháng 10). Trước đây khi cả 2 số đều ≤12 (trường hợp mập
 * mờ, vd "1/10"), hàm này mặc định đoán là Ngày/Tháng (kiểu Việt Nam) — SAI với dữ liệu thật,
 * khiến nhiều ngày bị đảo Ngày↔Tháng (vd 10/01/2026 bị đọc nhầm thành 01/10/2026). Hậu quả
 * nghiêm trọng nhất là báo cáo Công nợ: 1 phiếu đã thanh toán tháng 1 bị hiểu nhầm là thanh
 * toán tháng 10 (sau kỳ báo cáo) → bị tính nhầm là "chưa thanh toán" → Công nợ bị đội lên sai
 * (xác nhận bằng dữ liệu thật: 4,28 tỷ đúng theo file Excel Power Query đối chiếu, app cũ tính
 * ra 17,44 tỷ do lỗi này — xem BUG_FIXED.md). Nay đổi mặc định ở trường hợp mập mờ sang
 * Tháng/Ngày cho khớp đúng dữ liệu nguồn thực tế; 2 nhánh còn lại (khi 1 trong 2 số >12, nên
 * chỉ có 1 cách đọc hợp lệ duy nhất) giữ nguyên vì đã tự suy luận đúng, không phụ thuộc mặc định.
 * @param {string|null|undefined} str
 * @returns {{y:number, mo:number, d:number}|null}
 */
export function parseDateParts(str) {
  if (str == null) return null;
  // [PERF-04] 1 lần tra Map thay vì 2 (has + get) — hàm này bị gọi hàng trăm nghìn lần mỗi lần
  // LẬP BÁO CÁO. Kết quả null cũng được cache (null !== undefined) nên ngữ nghĩa không đổi.
  const cached = _dateCache.get(str);
  if (cached !== undefined) return cached;
  let result = null;
  const s = String(str).trim();
  if (s) {
    const datePart = s.split(/[ T]/)[0];
    let m = datePart.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (m) {
      result = { y: +m[1], mo: +m[2], d: +m[3] };
    } else {
      m = datePart.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (m) {
        const a = +m[1], b = +m[2], y = +m[3];
        if (a > 12 && b <= 12) result = { y, mo: b, d: a };
        else if (b > 12 && a <= 12) result = { y, mo: a, d: b };
        else result = { y, mo: a, d: b };
      }
    }
  }
  _dateCache.set(str, result);
  return result;
}

/** @param {string} str @returns {number|null} */
export function dateKey(str) {
  const p = parseDateParts(str);
  return p ? p.y * 10000 + p.mo * 100 + p.d : null;
}

/**
 * [PERF-04] Cache kết quả parse giờ theo chuỗi gốc — giống hệt cách đã cache ngày (PERF-01).
 * Số chuỗi giờ khác nhau rất ít (tối đa vài nghìn "HH:MM[:SS]"), nhưng hàm bị gọi hàng trăm
 * nghìn lần mỗi lần LẬP BÁO CÁO. Object trong cache được đóng băng (Object.freeze) để không nơi
 * nào vô tình sửa làm hỏng cache (hiện không nơi nào sửa — đã rà toàn bộ src/).
 * @type {Map<string, {h:number, mi:number, s:number}>}
 */
const _timeCache = new Map();

function _parseTimePartsUncached(str) {
  const s = String(str).trim();
  const m = s.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM|am|pm)?/);
  if (!m) return { h: 0, mi: 0, s: 0 };
  let h = +m[1];
  const mi = +m[2], sec = m[3] ? +m[3] : 0;
  const ap = m[4] ? m[4].toUpperCase() : null;
  if (ap === 'PM' && h < 12) h += 12;
  if (ap === 'AM' && h === 12) h = 0;
  return { h, mi, s: sec };
}

/** @param {string} str @returns {{h:number, mi:number, s:number}} */
export function parseTimeParts(str) {
  if (str == null) return { h: 0, mi: 0, s: 0 };
  if (typeof str !== 'string') return _parseTimePartsUncached(str);
  let v = _timeCache.get(str);
  if (v === undefined) {
    v = Object.freeze(_parseTimePartsUncached(str));
    if (_timeCache.size > 50000) _timeCache.clear(); // chặn phình bộ nhớ bất thường (dữ liệu rác)
    _timeCache.set(str, v);
  }
  return v;
}

/** @param {string} dateStr @param {string} timeStr @returns {number|null} */
export function toMinutes(dateStr, timeStr) {
  const dp = parseDateParts(dateStr);
  if (!dp) return null;
  const tp = parseTimeParts(timeStr);
  return Date.UTC(dp.y, dp.mo - 1, dp.d, tp.h, tp.mi, tp.s) / 60000;
}

/** @param {number} n @returns {string} */
export function pad2(n) { return (n < 10 ? '0' : '') + n; }

/**
 * [CHUẨN HAK] Ngày của app ("YYYY-MM-DD" / "M/D/YYYY" từ Google Sheet) → Date UTC 0 giờ để ghi ô NGÀY
 * THẬT vào Excel (ExcelJS đổi Date sang số ngày Excel theo UTC ⇒ không lệch ngày theo múi giờ máy).
 * Sai/rỗng → null (ô trống).
 */
export function toExcelDate(v) {
  const p = parseDateParts(v);
  return p ? new Date(Date.UTC(p.y, p.mo - 1, p.d)) : null;
}

/** @param {string} str @returns {string} */
export function fmtDate(str) {
  const p = parseDateParts(str);
  return p ? pad2(p.d) + '/' + pad2(p.mo) + '/' + p.y : '';
}

/** @param {string} str @returns {string} */
export function fmtTime(str) {
  const t = parseTimeParts(str);
  return pad2(t.h) + ':' + pad2(t.mi);
}

/**
 * @param {string} str
 * @param {number|null} fromKey
 * @param {number|null} toKey
 * @returns {boolean}
 */
export function inDateRange(str, fromKey, toKey) {
  const k = dateKey(str);
  if (k == null) return false;
  if (fromKey != null && k < fromKey) return false;
  if (toKey != null && k > toKey) return false;
  return true;
}

/** @param {string} dmy chuỗi "YYYY-MM-DD" từ <input type="date"> @returns {number|null} */
export function toKeyFromInput(dmy) {
  if (!dmy) return null;
  const m = dmy.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? (+m[1]) * 10000 + (+m[2]) * 100 + (+m[3]) : null;
}

/** @returns {number} dateKey của ngày hôm nay */
export function dateKeyToday() {
  const d = new Date();
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}
