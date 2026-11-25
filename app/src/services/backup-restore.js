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
import { RESULTS, runReport } from '../store/report-runtime.js';
import { renderDMTables } from '../components/dm-tables.js';
import { exportLoans, restoreLoans } from './loan-store.js';
import { reloadOpening } from '../components/tienvay-summary.js';
import { reloadLoans } from '../components/loan-editor.js';

function pad2(n) { return (n < 10 ? '0' : '') + n; }

/** Xuất toàn bộ dữ liệu người dùng đã lưu ra 1 file JSON, tải xuống ngay. */
export async function backupData() {
  var status = $('#backupRestoreStatus');
  try {
    var backup = storageService.exportAll();
    // [2026-10-29] Kèm toàn bộ "Cập nhật khoản vay" (kho IndexedDB riêng) — không có thì file sao
    // lưu thiếu đúng phần dữ liệu người dùng tự nhập nhiều nhất.
    // [SỬA — rà soát 30/10] Không đọc được kho khoản vay (máy chặn IndexedDB, kho lỗi…) KHÔNG được làm hỏng
    // cả bản sao lưu (trước khi có khoản vay, sao lưu Danh mục/Cấu hình luôn chạy được): vẫn tải file
    // nhưng KHÔNG có trường khoanVay (khôi phục file này sẽ giữ nguyên khoản vay đang có) và báo rõ.
    var loanErr = '';
    try { backup.khoanVay = await exportLoans(); }
    catch (le) { loanErr = (le && le.message) || String(le); logger.error('[backup-restore] Không đọc được khoản vay khi sao lưu', loanErr); }
    var json = JSON.stringify(backup, null, 2);
    var blob = new Blob([json], { type: 'application/json' });
    var d = new Date();
    var filename = 'BaoCaoNgay_Backup_' + d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) + '.json';
    downloadBlob(blob, filename);
    if (status) status.textContent = 'Đã tải file sao lưu "' + filename + '"' + (backup.khoanVay
      ? ' (gồm ' + backup.khoanVay.rows.length.toLocaleString('vi-VN') + ' dòng khoản vay).'
      : '. CHÚ Ý: file này KHÔNG có khoản vay — không đọc được dữ liệu khoản vay trên máy (' + loanErr + ').');
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
    if (!backup || !backup.data || typeof backup.data !== 'object' || Array.isArray(backup.data)) {
      throw new Error('File không đúng định dạng sao lưu (thiếu trường "data" hợp lệ).');
    }
    if (backup.khoanVay && (!Array.isArray(backup.khoanVay.rows) || ![1, 2, 3].includes(backup.khoanVay.schema))) {
      throw new Error('Phần khoản vay của file sao lưu không hợp lệ — chưa thay đổi dữ liệu.');
    }
    // Lưu bản gốc trước khi khôi phục để có thể hoàn nguyên localStorage nếu kho khoản vay lỗi.
    var beforeRestore = storageService.snapshotRaw();
    pushUndoSnapshot();
    var result = storageService.importAll(backup);
    if (!result.ok) throw new Error(result.rollbackFailed
      ? 'Không thể ghi và hoàn nguyên dữ liệu. Cần kiểm tra bộ nhớ trình duyệt và bản sao lưu trước khi tiếp tục.'
      : 'Không thể ghi dữ liệu khôi phục vào bộ nhớ (đầy dung lượng hoặc bị chặn). Dữ liệu cũ đã được giữ lại.');
    // File sao lưu cũ (trước 29/10/2026) không có "khoanVay" ⇒ GIỮ NGUYÊN khoản vay đang có, không xoá.
    var loanNote = '';
    if (backup.khoanVay) {
      var n;
      try { n = await restoreLoans(backup.khoanVay); }
      catch (loanError) {
        var rollback = storageService.restoreRaw(beforeRestore);
        throw new Error('Không thể khôi phục khoản vay: ' + loanError.message +
          (rollback ? ' Danh mục/cấu hình cũ đã được hoàn nguyên.' : ' CẢNH BÁO: không hoàn nguyên được đầy đủ danh mục/cấu hình.'));
      }
      await reloadLoans();
      await reloadOpening();
      loanNote = ' Khoản vay: ' + n.toLocaleString('vi-VN') + ' khoản.';
    }

    // Nạp lại STATE từ dữ liệu vừa khôi phục + vẽ lại UI liên quan — đúng những gì boot() làm
    // lúc khởi động, chỉ khác là chạy lại giữa chừng thay vì lúc tải trang.
    loadDM();
    renderDMTables();
    if (RESULTS) runReport();

    if (status) status.textContent = 'Đã khôi phục ' + result.restoredKeys.length + ' mục dữ liệu từ "' + file.name + '".' + loanNote + ' (Danh mục có thể bấm "Hoàn tác" nếu khôi phục nhầm.)';
    logger.info('[backup-restore] Đã khôi phục', result.restoredKeys.join(', '), 'từ', file.name);
  } catch (e) {
    if (status) status.textContent = 'Lỗi khôi phục: ' + e.message;
    logger.error('[backup-restore] Lỗi khôi phục file', file && file.name, e.message);
  }
}
