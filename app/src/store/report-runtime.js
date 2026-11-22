/**
 * [STORE] Kết quả báo cáo hiện tại (`RESULTS`) và hàm lập báo cáo (`runReport`), tách khỏi legacy-app.js
 * để các component/service không import ngược vào legacy-app.js (trước đây tạo 10 vòng phụ thuộc).
 *
 * - `RESULTS` là live binding: legacy-app.js gán qua `setResults()`, nơi khác import và đọc như biến thường.
 * - `runReport()` chuyển tiếp tới hàm do legacy-app.js đăng ký lúc khởi động (`registerRunReport`); gọi trước
 *   khi đăng ký thì không làm gì (cùng hành vi cũ: chỉ được gọi từ sự kiện người dùng, sau khi app khởi động).
 */
export let RESULTS = null;
let _runReport = null;

/** @param {?Object} v model báo cáo mới (null = chưa lập) */
export function setResults(v) { RESULTS = v; }

/** @param {Function} fn hàm lập báo cáo thật (legacy-app.js) */
export function registerRunReport(fn) { _runReport = fn; }

/** Lập lại báo cáo theo bộ lọc hiện tại. */
export function runReport() { return _runReport ? _runReport.apply(null, arguments) : undefined; }
