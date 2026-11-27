/**
 * [STORAGE_SERVICE] Lớp bọc localStorage — KHÔNG gọi localStorage trực tiếp ở nơi khác trong
 * app nữa (BƯỚC 9). Cung cấp: version dữ liệu lưu (để migrate an toàn nếu đổi cấu trúc sau
 * này), try/catch tập trung (Safari riêng tư / storage đầy sẽ không làm crash app), và
 * import/export toàn bộ dữ liệu người dùng đã nhập (danh mục Đại lý/Hỗ trợ, thông tin ngân
 * hàng...) ra 1 file JSON để backup/khôi phục thủ công.
 * @module services/storage-service
 */
import { CONFIG } from '../config/config.js';
import { logger } from './logger.js';
import { isForestryHistoryEntry } from './forestry-history.js';

const DATA_VERSION = 1;

class StorageService {
  /**
   * Đọc 1 giá trị đã lưu (JSON.parse tự động). Trả về defaultValue nếu chưa có/lỗi.
   * @param {string} key @param {*} defaultValue
   */
  get(key, defaultValue = null) {
    try {
      const raw = localStorage.getItem(key);
      if (raw == null) return defaultValue;
      const parsed = JSON.parse(raw);
      // Cho phép migrate về sau: nếu giá trị lưu có bọc {__v, data} thì bóc ra; giá trị cũ
      // (lưu trước khi có StorageService) không có bọc này vẫn đọc được bình thường.
      if (parsed && typeof parsed === 'object' && '__v' in parsed && 'data' in parsed) return parsed.data;
      return parsed;
    } catch (e) {
      logger.warn('StorageService.get lỗi đọc key "' + key + '":', e.message);
      return defaultValue;
    }
  }

  /**
   * Ghi 1 giá trị (tự JSON.stringify, có bọc version để dễ migrate về sau).
   * @param {string} key @param {*} value @returns {boolean} true nếu ghi thành công
   */
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify({ __v: DATA_VERSION, data: value }));
      return true;
    } catch (e) {
      logger.warn('StorageService.set lỗi ghi key "' + key + '" (có thể do đầy bộ nhớ trình duyệt):', e.message);
      return false;
    }
  }

  remove(key) { try { localStorage.removeItem(key); } catch (e) { /* bỏ qua */ } }

  /** Chụp nguyên trạng từng khoá, kể cả khoá chưa tồn tại (null), để hoàn nguyên sau sự cố. */
  snapshotRaw() {
    const snapshot = {};
    for (const [name, key] of Object.entries(CONFIG.STORAGE_KEYS)) {
      snapshot[name] = localStorage.getItem(key);
    }
    return snapshot;
  }

  /** Hoàn nguyên nguyên trạng các khoá đã chụp, gồm xoá khoá vốn không tồn tại. */
  restoreRaw(snapshot) {
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return false;
    let ok = true;
    for (const [name, key] of Object.entries(CONFIG.STORAGE_KEYS)) {
      if (!Object.prototype.hasOwnProperty.call(snapshot, name)) { ok = false; continue; }
      try {
        if (snapshot[name] === null) localStorage.removeItem(key);
        else if (typeof snapshot[name] === 'string') localStorage.setItem(key, snapshot[name]);
        else ok = false;
      } catch (e) {
        ok = false;
        logger.error('Không hoàn nguyên được dữ liệu', name, e.message);
      }
    }
    return ok;
  }

  /** Xuất toàn bộ dữ liệu app đã lưu (theo CONFIG.STORAGE_KEYS) ra 1 object — dùng để tải file backup JSON. */
  exportAll() {
    const out = { appVersion: CONFIG.APP_VERSION, exportedAt: new Date().toISOString(), data: {} };
    Object.entries(CONFIG.STORAGE_KEYS).forEach(([name, key]) => { out.data[name] = this.get(key, null); });
    return out;
  }

  /**
   * Nhập lại dữ liệu từ 1 object đã export trước đó (BƯỚC 9: Restore). Chỉ ghi đè các khoá đã
   * có mặt trong file backup, không xoá khoá khác.
   * @param {Object} backup kết quả của exportAll() (đã JSON.parse nếu đọc từ file)
   * @returns {{ok:boolean, restoredKeys:string[]}}
   */
  importAll(backup) {
    // Không nhận mảng/null hoặc bản sao lưu bị hỏng. Lỗi ghi phải được báo, không được
    // đếm một mục là "đã khôi phục" nếu localStorage.setItem thất bại.
    if (!backup || !backup.data || typeof backup.data !== 'object' || Array.isArray(backup.data)) {
      return { ok: false, restoredKeys: [] };
    }
    const history = backup.data.forestryHistory;
    if (history != null && (!Array.isArray(history) || !history.every(isForestryHistoryEntry))) {
      return { ok: false, restoredKeys: [], error: 'Lịch sử lâm sản trong bản sao lưu không hợp lệ. Dữ liệu cũ được giữ lại.' };
    }
    const entries = Object.entries(CONFIG.STORAGE_KEYS)
      .filter(([name]) => Object.prototype.hasOwnProperty.call(backup.data, name) && backup.data[name] != null);
    const previous = new Map();
    const restoredKeys = [];
    try {
      // Chụp giá trị nguyên gốc (kể cả bản legacy) để hoàn nguyên nếu có lỗi ghi.
      for (const [, key] of entries) previous.set(key, localStorage.getItem(key));
      for (const [name, key] of entries) {
        if (!this.set(key, backup.data[name])) throw new Error('Không thể ghi ' + name);
        restoredKeys.push(name);
      }
    } catch (e) {
      // localStorage không hỗ trợ transaction: cố gắng phục hồi tất cả giá trị cũ.
      // Nếu quota/quyền truy cập tiếp tục chặn rollback, báo rõ thay vì nhận là thành công.
      let rollbackFailed = false;
      for (const [key, old] of previous) {
        try {
          if (old === null) localStorage.removeItem(key);
          else localStorage.setItem(key, old);
        } catch (rollbackError) { rollbackFailed = true; logger.error('Không hoàn nguyên được key', key, rollbackError.message); }
      }
      logger.error('Khôi phục localStorage thất bại:', e.message);
      return { ok: false, restoredKeys: [], rollbackFailed };
    }
    return { ok: true, restoredKeys };
  }
}

/** Instance dùng chung toàn app. */
export const storageService = new StorageService();
