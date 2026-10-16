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
    if (!backup || typeof backup.data !== 'object') return { ok: false, restoredKeys: [] };
    const restoredKeys = [];
    Object.entries(CONFIG.STORAGE_KEYS).forEach(([name, key]) => {
      if (Object.prototype.hasOwnProperty.call(backup.data, name) && backup.data[name] != null) {
        this.set(key, backup.data[name]);
        restoredKeys.push(name);
      }
    });
    return { ok: true, restoredKeys };
  }
}

/** Instance dùng chung toàn app. */
export const storageService = new StorageService();
