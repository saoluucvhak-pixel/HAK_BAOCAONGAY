/**
 * [LOGGER] Logger tập trung — thay cho console.log rải rác khắp nơi. Có thể bật/tắt theo
 * cấp độ, và bật/tắt hoàn toàn qua localStorage (để người dùng tự bật debug khi cần hỗ trợ
 * từ xa mà không cần sửa code).
 * @module services/logger
 */

const LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3, PERF: 1, SILENT: 99 };
const STORAGE_KEY = 'baocaongay_log_level';

function readStoredLevel() {
  try {
    const v = (typeof localStorage !== 'undefined') ? localStorage.getItem(STORAGE_KEY) : null;
    return v && LEVELS[v] != null ? v : 'WARN';
  } catch (e) { return 'WARN'; }
}

class Logger {
  constructor() {
    /** @type {string} mức log hiện tại — mặc định chỉ hiện WARN/ERROR để không làm ồn console người dùng cuối */
    this.level = readStoredLevel();
  }

  /** Đổi mức log lúc runtime (vd gõ trong console: `app.logger.setLevel('DEBUG')`), lưu lại cho lần sau. */
  setLevel(level) {
    if (LEVELS[level] == null) return;
    this.level = level;
    try { localStorage.setItem(STORAGE_KEY, level); } catch (e) { /* bỏ qua nếu localStorage không dùng được */ }
  }

  _shouldLog(level) { return LEVELS[level] >= LEVELS[this.level]; }

  debug(...args) { if (this._shouldLog('DEBUG')) console.debug('[DEBUG]', ...args); }
  info(...args) { if (this._shouldLog('INFO')) console.info('[INFO]', ...args); }
  warn(...args) { if (this._shouldLog('WARN')) console.warn('[WARN]', ...args); }
  error(...args) { if (this._shouldLog('ERROR')) console.error('[ERROR]', ...args); }

  /** Đo thời gian thực thi 1 khối việc (đồng bộ). @param {string} label @param {Function} fn */
  measure(label, fn) {
    const t0 = (typeof performance !== 'undefined') ? performance.now() : Date.now();
    const result = fn();
    const t1 = (typeof performance !== 'undefined') ? performance.now() : Date.now();
    if (this._shouldLog('PERF')) console.info('[PERF]', label + ':', (t1 - t0).toFixed(1) + ' ms');
    return result;
  }
}

/** Instance dùng chung toàn app — import { logger } from '.../logger.js' */
export const logger = new Logger();
