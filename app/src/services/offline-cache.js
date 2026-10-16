/**
 * [OFFLINE_CACHE — Phase 4.1] Lưu bản dữ liệu Google Sheet tải THÀNH CÔNG gần nhất vào IndexedDB,
 * để khi mất mạng app vẫn mở và lập được báo cáo (có ghi rõ "dữ liệu lưu lúc …").
 *
 * Vì sao lưu CHUỖI CSV THÔ thay vì mảng object đã parse:
 *  - 1 chuỗi lớn ghi/đọc IndexedDB nhanh hơn nhiều so với 10.000 object (IndexedDB phải sao chép
 *    từng object qua structured clone), và nhẹ bộ nhớ hơn.
 *  - Dữ liệu offline đi qua ĐÚNG MỘT đường parse với dữ liệu online (parseCSV → csvToObjects) →
 *    không thể có sai khác giữa báo cáo online và offline do 2 cách đọc khác nhau.
 *
 * Vì sao khoá theo URL (không theo tên Sheet): cùng 1 máy có thể dùng nhiều cấu hình công ty
 * (HAK, Đại Hiệp…) với link Sheet khác nhau — khoá theo URL thì không bao giờ lẫn dữ liệu công ty.
 *
 * Nguyên tắc an toàn: MỌI lỗi IndexedDB (trình duyệt chặn, chế độ ẩn danh, đầy ổ, bản ghi hỏng…)
 * đều bị nuốt tại đây và trả về "không có bản lưu" — app khi đó chạy y hệt trước khi có tính năng
 * này, không bao giờ vì bộ nhớ offline mà hỏng việc tải dữ liệu online.
 * @module services/offline-cache
 */
import { logger } from './logger.js';

const DB_NAME = 'baocaongay-offline';
/** Tăng số này khi đổi cấu trúc kho — xem MIGRATIONS bên dưới và MIGRATION.md. */
const DB_VERSION = 1;
const STORE_SHEETS = 'sheets';
/** Phiên bản cấu trúc của 1 bản ghi; bản ghi khác phiên bản bị bỏ qua (coi như chưa có bản lưu). */
const RECORD_SCHEMA = 1;
/** Chờ mở IndexedDB tối đa ngần này — tránh treo việc tải dữ liệu nếu trình duyệt chặn/khoá kho. */
const OPEN_TIMEOUT_MS = 3000;

/**
 * Các bước nâng cấp kho theo từng phiên bản. Khoá = phiên bản ĐÍCH. Mỗi hàm nhận (db, transaction).
 * Thêm phiên bản mới: tăng DB_VERSION và thêm 1 mục ở đây — KHÔNG sửa mục cũ.
 */
const MIGRATIONS = {
  1: (db) => {
    if (!db.objectStoreNames.contains(STORE_SHEETS)) db.createObjectStore(STORE_SHEETS, { keyPath: 'url' });
  },
};

let dbPromise = null;

function idbAvailable() {
  try { return typeof indexedDB !== 'undefined' && indexedDB !== null; } catch (e) { return false; }
}

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    if (!idbAvailable()) { resolve(null); return; }
    let settled = false;
    const finish = (db) => { if (!settled) { settled = true; resolve(db); } };
    const timer = setTimeout(() => { logger.warn('[Offline] Mở IndexedDB quá lâu — tạm không dùng bộ nhớ offline.'); finish(null); }, OPEN_TIMEOUT_MS);
    let req;
    try { req = indexedDB.open(DB_NAME, DB_VERSION); } catch (e) { clearTimeout(timer); logger.warn('[Offline] Không mở được IndexedDB:', e.message); finish(null); return; }
    req.onupgradeneeded = (ev) => {
      const db = req.result;
      for (let v = (ev.oldVersion || 0) + 1; v <= DB_VERSION; v++) { if (MIGRATIONS[v]) MIGRATIONS[v](db, req.transaction); }
    };
    req.onsuccess = () => {
      clearTimeout(timer);
      const db = req.result;
      // Tab khác mở bản app mới hơn (nâng phiên bản kho) → đóng kết nối cũ để không chặn nâng cấp.
      db.onversionchange = () => { try { db.close(); } catch (e) { /* bỏ qua */ } dbPromise = null; };
      finish(db);
    };
    req.onerror = () => { clearTimeout(timer); logger.warn('[Offline] Lỗi mở IndexedDB:', req.error && req.error.message); finish(null); };
    req.onblocked = () => { logger.warn('[Offline] IndexedDB đang bị tab khác giữ — tạm bỏ qua bộ nhớ offline.'); };
  });
  return dbPromise;
}

function runTx(mode, fn) {
  return openDb().then((db) => new Promise((resolve) => {
    if (!db) { resolve(null); return; }
    let result = null;
    try {
      const tx = db.transaction(STORE_SHEETS, mode);
      const store = tx.objectStore(STORE_SHEETS);
      fn(store, (v) => { result = v; });
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => { logger.warn('[Offline] Lỗi giao dịch IndexedDB:', tx.error && tx.error.message); resolve(null); };
      tx.onabort = () => { logger.warn('[Offline] Giao dịch IndexedDB bị huỷ:', tx.error && tx.error.message); resolve(null); };
    } catch (e) {
      logger.warn('[Offline] Không thao tác được IndexedDB:', e.message);
      resolve(null);
    }
  }));
}

/**
 * Lưu CSV thô vừa tải thành công. Không bao giờ ném lỗi.
 * @param {string} url @param {string} name tên Sheet (để hiển thị) @param {string} text
 * @returns {Promise<boolean>} true nếu đã lưu
 */
export function saveSheetText(url, name, text) {
  if (!url || typeof text !== 'string') return Promise.resolve(false);
  const record = { url, name, text, savedAt: new Date().toISOString(), schema: RECORD_SCHEMA };
  return runTx('readwrite', (store, setResult) => { store.put(record); setResult(true); }).then((ok) => ok === true);
}

/**
 * Đọc bản lưu gần nhất của 1 Sheet. Bản ghi hỏng/sai cấu trúc được coi như chưa có.
 * @param {string} url
 * @returns {Promise<{text:string, savedAt:Date, name:string}|null>}
 */
export function loadSheetText(url) {
  if (!url) return Promise.resolve(null);
  return runTx('readonly', (store, setResult) => {
    const req = store.get(url);
    req.onsuccess = () => setResult(req.result || null);
  }).then((rec) => {
    if (!rec || rec.schema !== RECORD_SCHEMA || typeof rec.text !== 'string' || !rec.savedAt) return null;
    const savedAt = new Date(rec.savedAt);
    if (isNaN(savedAt.getTime())) return null;
    return { text: rec.text, savedAt, name: rec.name || '' };
  });
}

/** Xoá toàn bộ bản lưu offline (dùng khi cần, vd đổi cấu hình công ty). Không bao giờ ném lỗi. */
export function clearOfflineCache() {
  return runTx('readwrite', (store, setResult) => { store.clear(); setResult(true); }).then((ok) => ok === true);
}
