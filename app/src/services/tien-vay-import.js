/**
 * [DATA_SERVICE] Nối luồng chính với Worker đọc file "Sổ chi tiết tiền vay"
 * (`excel-import-worker.js`). Đây là hàm `handleTienVayFile()` bị bỏ sót khi tách Phase 1 —
 * đã khôi phục đúng hành vi gốc (xem `BaoCaoNgay.html` dòng 837-883), chỉ khác 1 điểm: phần
 * đọc/parse Excel (CPU nặng với file lớn) nay chạy trong Web Worker thay vì luồng chính, để
 * không làm treo giao diện lúc đang đọc file — không đổi bất kỳ số liệu/kết quả nào.
 * @module services/tien-vay-import
 */
import { $ } from '../utils/dom-utils.js';
import { STATE } from '../store/state.js';
import { parseTienVayInWorker } from './excel-import-worker.js';
import { logger } from './logger.js';
import { RESULTS, runReport } from '../legacy-app.js';

/** @param {File} file file Excel người dùng chọn ở input#tienVayFileInput */
export async function handleTienVayFile(file) {
  var status = $('#tienVayFileStatus');
  if (status) status.textContent = 'Đang đọc file...';
  try {
    var buf = await file.arrayBuffer();
    var result = await parseTienVayInWorker(buf);
    STATE.tienVayRaw = result.rows;
    STATE.tienVayFileName = file.name;
    if (status) status.textContent = 'Đã tải ' + result.rows.length.toLocaleString('vi-VN') + ' dòng từ "' + file.name + '".';
    logger.info('[tien-vay-import] Đọc thành công', result.rows.length, 'dòng từ', file.name);
    if (RESULTS) runReport();
  } catch (e) {
    STATE.tienVayRaw = [];
    STATE.tienVayFileName = null;
    if (status) status.textContent = 'Lỗi đọc file: ' + e.message;
    logger.error('[tien-vay-import] Lỗi đọc file', file && file.name, e.message);
  }
}
