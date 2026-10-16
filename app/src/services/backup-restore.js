/**
 * [DATA_SERVICE] Nối `StorageService.exportAll()/importAll()` (đã có sẵn từ Phase 1) vào UI —
 * nút "💾 Sao lưu dữ liệu" / "📂 Khôi phục dữ liệu" ở tab "Cấu hình". Tính năng bổ sung theo
 * yêu cầu người dùng, hoàn thiện nốt phần StorageService còn dang dở.
 *
 * CHỈ sao lưu/khôi phục dữ liệu người dùng TỰ NHẬP (danh mục Đại lý/Hỗ trợ, thông tin ngân
 * hàng/WO đã lưu) — KHÔNG đụng tới dữ liệu tải từ Google Sheet (luôn tải lại từ nguồn, không có
 * gì để "khôi phục").
 * @module services/backup-restore
 */
import { $, downloadBlob } from '../utils/dom-utils.js';
import { loadDM } from '../store/state.js';
import { storageService } from './storage-service.js';
import { logger } from './logger.js';
import { pushUndoSnapshot } from '../store/app-state.js';
import { RESULTS, runReport } from '../legacy-app.js';
import { renderDMTables } from '../components/dm-tables.js';

function pad2(n) { return (n < 10 ? '0' : '') + n; }

/** Xuất toàn bộ dữ liệu người dùng đã lưu ra 1 file JSON, tải xuống ngay. */
export function backupData() {
  var status = $('#backupRestoreStatus');
  try {
    var backup = storageService.exportAll();
    var json = JSON.stringify(backup, null, 2);
    var blob = new Blob([json], { type: 'application/json' });
    var d = new Date();
    var filename = 'BaoCaoNgay_Backup_' + d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) + '.json';
    downloadBlob(blob, filename);
    if (status) status.textContent = 'Đã tải file sao lưu "' + filename + '".';
    logger.info('[backup-restore] Đã xuất file sao lưu', filename);
  } catch (e) {
    if (status) status.textContent = 'Lỗi tạo file sao lưu: ' + e.message;
    logger.error('[backup-restore] Lỗi xuất file sao lưu', e.message);
  }
}

/**
 * Đọc 1 file JSON đã xuất trước đó (bằng `backupData()`) và ghi đè lại dữ liệu đã lưu.
 * @param {File} file
 */
export async function restoreData(file) {
  var status = $('#backupRestoreStatus');
  if (status) status.textContent = 'Đang đọc file...';
  try {
    var text = await file.text();
    var backup = JSON.parse(text);
    // Lưu lại trạng thái danh mục hiện tại vào lịch sử Hoàn tác TRƯỚC khi ghi đè — nếu khôi
    // phục nhầm file, người dùng vẫn bấm "Hoàn tác" (Ctrl+Z) để quay lại được.
    pushUndoSnapshot();
    var result = storageService.importAll(backup);
    if (!result.ok) throw new Error('File không đúng định dạng sao lưu (thiếu trường "data").');

    // Nạp lại STATE từ dữ liệu vừa khôi phục + vẽ lại UI liên quan — đúng những gì boot() làm
    // lúc khởi động, chỉ khác là chạy lại giữa chừng thay vì lúc tải trang.
    loadDM();
    renderDMTables();
    if (RESULTS) runReport();

    if (status) status.textContent = 'Đã khôi phục ' + result.restoredKeys.length + ' mục dữ liệu từ "' + file.name + '". (Có thể bấm "Hoàn tác" nếu khôi phục nhầm.)';
    logger.info('[backup-restore] Đã khôi phục', result.restoredKeys.join(', '), 'từ', file.name);
  } catch (e) {
    if (status) status.textContent = 'Lỗi khôi phục: ' + e.message;
    logger.error('[backup-restore] Lỗi khôi phục file', file && file.name, e.message);
  }
}
