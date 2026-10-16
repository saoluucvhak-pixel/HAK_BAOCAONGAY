/**
 * [Phase 3.12 — 2026-09-23] Bọc các nút XUẤT FILE (Excel/PDF): hiện "Đang xuất…" TRƯỚC khi bắt
 * đầu, báo lỗi rõ ràng nếu hỏng, và bỏ qua cú bấm lặp lại khi đang xuất dở.
 *
 * Vì sao cần: đo thực tế với 10.000 phiếu cân, xuất PDF bảng nhập keo mất ~7 giây, Excel "tất
 * cả" ~4 giây — phần lớn thời gian nằm trong thư viện jsPDF/ExcelJS (không tối ưu được mà không
 * đổi thư viện/đổi hình thức file). Trong lúc đó giao diện đứng yên KHÔNG có dấu hiệu gì → người
 * dùng tưởng chưa bấm, bấm thêm lần nữa → ra 2 file trùng. Nay: thanh trạng thái hiện ngay "Đang
 * xuất…" (nhường 1 khung hình cho trình duyệt kịp vẽ chữ trước khi bắt đầu việc nặng), xong thì
 * trả lại trạng thái cũ; lỗi thì báo đỏ kèm nội dung lỗi.
 *
 * KHÔNG đổi nội dung/hình thức file xuất ra, KHÔNG đổi luồng xử lý bên trong hàm xuất.
 * @module services/export-runner
 */
import { $ } from '../utils/dom-utils.js';
import { setStatus } from './data-service.js';
import { logger } from './logger.js';
import { ensureExportLibs } from './export-libs.js';

let busy = false;

/** Chờ trình duyệt vẽ xong khung hình kế tiếp (để chữ "Đang xuất…" hiện ra trước khi bắt đầu việc nặng). */
function nextPaint() {
  return new Promise(function (resolve) {
    let done = false;
    const go = function () { if (!done) { done = true; setTimeout(resolve, 0); } };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(go);
    setTimeout(go, 100); // dự phòng nếu cửa sổ đang ẩn (requestAnimationFrame không chạy)
  });
}

/**
 * Tạo hàm xử lý sự kiện bọc quanh 1 hàm xuất file.
 * @param {string} label vd 'xuất PDF' — hiện thành "Đang xuất PDF…"
 * @param {Function} fn hàm xuất gốc (đồng bộ hoặc async)
 * @returns {Function}
 */
export function runExport(label, fn) {
  return function () {
    if (busy) { logger.warn('[Xuất file] Đang ' + label + ' dở — bỏ qua cú bấm lặp lại.'); return Promise.resolve(); }
    busy = true;
    const self = this, args = arguments;
    const textEl = $('#statusText'), dotEl = $('#statusDot');
    const prev = textEl ? { text: textEl.textContent, title: textEl.title, dot: dotEl.className } : null;
    const busyText = 'Đang ' + label + '… (dữ liệu lớn có thể mất vài giây, vui lòng chờ)';
    setStatus(busyText, 'busy');
    return nextPaint()
      .then(function () { return ensureExportLibs(); }) // [PERF-06] nạp thư viện xuất file lần đầu cần dùng
      .then(function () { return fn.apply(self, args); })
      .then(function () {
        // Chỉ trả lại trạng thái cũ nếu trong lúc xuất không có gì khác ghi đè thanh trạng thái.
        if (prev && textEl.textContent === busyText) { textEl.textContent = prev.text; textEl.title = prev.title; dotEl.className = prev.dot; }
      }, function (err) {
        const msg = (err && err.message) || String(err);
        logger.error('[Xuất file] Lỗi khi ' + label + ': ' + msg);
        setStatus('Lỗi khi ' + label + ': ' + msg + ' — file chưa được tạo, vui lòng thử lại', 'err');
      })
      .finally(function () { setTimeout(function () { busy = false; }, 300); });
  };
}
