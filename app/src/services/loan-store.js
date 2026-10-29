/**
 * [KHOẢN VAY — 2026-10-29] Kho lưu "Cập nhật khoản vay" (bảng TH_VAY 3 cột) trên máy (IndexedDB), dùng offline.
 *
 * Vì sao IndexedDB (không phải localStorage như Danh mục): dữ liệu người dùng tự nhập, tích luỹ nhiều
 * năm; kho riêng (không chung với `baocaongay-offline`) để bộ nhớ đệm Google Sheet có thể xoá/làm mới mà
 * không bao giờ đụng vào dữ liệu người dùng tự nhập.
 *
 * KHÁC bộ nhớ đệm offline (nuốt lỗi): đây là dữ liệu gốc người dùng nhập ⇒ MỌI lỗi ghi đều ném ra để
 * giao diện báo "CHƯA lưu" (mẫu Lưu trữ theo năm: "lỗi ghi IndexedDB phải báo lỗi, không thay bằng
 * RAM rồi báo đã lưu"). Mỗi lần ghi là 1 giao dịch: hoặc ghi đủ, hoặc không ghi gì.
 * Chống ghi đè: mỗi dòng có `rev`; sửa dòng đã bị cửa sổ khác sửa trước ⇒ từ chối, yêu cầu mở lại.
 *
 * Không mất dữ liệu cũ khi đổi cấu trúc: kho `loans` (v1) và `vay` (v2 — sổ phụ 12 cột) GIỮ NGUYÊN, không
 * xoá. Lên v3, các dòng tiền vay trong sổ phụ cũ được chép sang kho `thvay` (3 cột); sổ phụ cũ vẫn nằm
 * trong file sao lưu (`soPhuCu`) để khôi phục được.
 * @module services/loan-store
 */
import { LOAN_SCHEMA, SOPHU_SCHEMA, loanFingerprint, sophuToLoanInput, validateLoan } from './loan-model.js';

const DB_NAME = 'baocaongay-khoanvay';
/** Tăng khi đổi cấu trúc kho; thêm bước vào MIGRATIONS, KHÔNG sửa bước cũ (xem MIGRATION.md). */
const DB_VERSION = 4;
/** Kho đang dùng: khoản vay TH_VAY (schema 3). */
const STORE = 'thvay';
/** Kho v2: sổ phụ ngân hàng 12 cột — GIỮ NGUYÊN, chỉ đọc để sao lưu/chuyển đổi. */
const SOPHU_STORE = 'vay';
/** Kho cũ (v1, bảng kê đã tính sẵn — bản sáng 29/10): GIỮ NGUYÊN, không xoá dữ liệu người dùng đã nhập. */
const LEGACY_STORE = 'loans';
/** v4: cài đặt của sổ tiền vay do người dùng nhập (khoá `key`) — hiện có `soDuDauSo` (số dư đầu kỳ nhập tay). */
const META_STORE = 'meta';
const OPENING_KEY = 'soDuDauSo';

/** Dòng sổ phụ cũ → bản ghi khoản vay (giữ ngày tạo, thứ tự, nguồn) | null nếu không phải tiền vay. */
export function convertSoPhuRecord(r, phrases) {
  if (!r || r.schema !== SOPHU_SCHEMA) return null;
  const input = sophuToLoanInput(r, phrases);
  if (!input) return null;
  const res = validateLoan(input);
  if (!res.ok) return null;
  return Object.assign({}, res.value, { id: r.id, schema: LOAN_SCHEMA, rev: 1, seq: r.seq || 0,
    nguon: 'Sổ phụ: ' + (r.nguon || ''), createdAt: r.createdAt, updatedAt: r.updatedAt || r.createdAt });
}

const MIGRATIONS = {
  1: (db) => { if (!db.objectStoreNames.contains(LEGACY_STORE)) db.createObjectStore(LEGACY_STORE, { keyPath: 'id' }); },
  2: (db) => { if (!db.objectStoreNames.contains(SOPHU_STORE)) db.createObjectStore(SOPHU_STORE, { keyPath: 'id' }); },
  // v3: tạo kho 3 cột và chép các dòng TIỀN VAY của sổ phụ cũ sang (sổ phụ cũ không bị xoá/sửa).
  3: (db, t) => {
    const dst = db.objectStoreNames.contains(STORE) ? t.objectStore(STORE) : db.createObjectStore(STORE, { keyPath: 'id' });
    const req = t.objectStore(SOPHU_STORE).getAll();
    req.onsuccess = () => { (req.result || []).forEach((r) => { const rec = convertSoPhuRecord(r); if (rec) dst.put(rec); }); };
  },
  4: (db) => { if (!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE, { keyPath: 'key' }); },
};
/** Chờ mở kho tối đa ngần này rồi báo lỗi rõ ràng thay vì treo màn hình. */
const OPEN_TIMEOUT_MS = 5000;

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined' || !indexedDB) { reject(new Error('Trình duyệt không hỗ trợ lưu dữ liệu trên máy (IndexedDB).')); return; }
    const timer = setTimeout(() => reject(new Error('Không mở được kho dữ liệu khoản vay (quá thời gian chờ) — đóng bớt cửa sổ app rồi thử lại.')), OPEN_TIMEOUT_MS);
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (ev) => {
      for (let v = (ev.oldVersion || 0) + 1; v <= DB_VERSION; v++) if (MIGRATIONS[v]) MIGRATIONS[v](req.result, req.transaction);
    };
    req.onsuccess = () => {
      clearTimeout(timer);
      const db = req.result;
      db.onversionchange = () => { try { db.close(); } catch (e) { /* đã đóng */ } dbPromise = null; };
      resolve(db);
    };
    req.onerror = () => { clearTimeout(timer); reject(new Error('Lỗi mở kho khoản vay: ' + (req.error && req.error.message))); };
  });
  dbPromise.catch(() => { dbPromise = null; }); // lần sau thử mở lại, không giữ lỗi cũ mãi
  return dbPromise;
}

/** Chạy fn(store) trong 1 giao dịch; resolve SAU KHI giao dịch ghi xong (oncomplete). */
function tx(mode, fn, storeName) {
  return openDb().then((db) => new Promise((resolve, reject) => {
    let result, failed = null;
    const names = Array.isArray(storeName) ? storeName : [storeName || STORE];
    const t = db.transaction(names, mode);
    // 1 kho ⇒ truyền kho đó; nhiều kho ⇒ truyền { tên: kho } (ghi nhiều kho trong CÙNG 1 giao dịch).
    const store = Array.isArray(storeName) ? Object.fromEntries(names.map((n) => [n, t.objectStore(n)])) : t.objectStore(names[0]);
    try { result = fn(store, (e) => { failed = e; t.abort(); }); } catch (e) { failed = e; try { t.abort(); } catch (x) { /* đã huỷ */ } }
    t.oncomplete = () => resolve(typeof result === 'function' ? result() : result);
    t.onabort = () => reject(failed || new Error('Ghi dữ liệu khoản vay bị huỷ: ' + (t.error && t.error.message)));
    t.onerror = () => { /* onabort sẽ báo lỗi */ };
  }));
}

function getAllFrom(store) {
  let rows = [];
  const req = store.getAll();
  req.onsuccess = () => { rows = req.result || []; };
  return () => rows.filter((r) => r && r.schema === LOAN_SCHEMA);
}

function newId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'kv-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

/** Toàn bộ dòng đã lưu (chưa sắp xếp). */
export function listLoans() {
  return tx('readonly', (store) => getAllFrom(store));
}

/**
 * Thêm mới (value không có id) hoặc sửa (id + rev đang xem). Trả dòng đã lưu.
 * @param {Object} value giá trị đã qua validateLoan
 * @param {{id?: string, rev?: number, nguon?: string}} meta
 */
export function saveLoan(value, meta) {
  const now = new Date().toISOString();
  let saved = null;
  return tx('readwrite', (store, fail) => {
    if (!meta || !meta.id) {
      saved = Object.assign({}, value, { id: newId(), schema: LOAN_SCHEMA, rev: 1, seq: Date.now(), nguon: (meta && meta.nguon) || 'Nhập tay', createdAt: now, updatedAt: now });
      store.add(saved);
      return () => saved;
    }
    const req = store.get(meta.id);
    req.onsuccess = () => {
      const cur = req.result;
      if (!cur) { fail(new Error('Dòng này đã bị xoá ở nơi khác — tải lại danh sách.')); return; }
      if (cur.rev !== meta.rev) { fail(new Error('Dòng này vừa được sửa ở cửa sổ khác — đóng lại và mở lại để xem bản mới nhất.')); return; }
      saved = Object.assign({}, cur, value, { rev: cur.rev + 1, updatedAt: now });
      store.put(saved);
    };
    return () => saved;
  });
}

/** Xoá theo danh sách id (1 giao dịch). Trả số dòng đã xoá. */
export function deleteLoans(ids) {
  return tx('readwrite', (store) => { (ids || []).forEach((id) => store.delete(id)); return (ids || []).length; });
}

/**
 * Ghi kết quả nhập file. mode 'append': chỉ thêm phần CHƯA có; 'replace': xoá hết rồi ghi lại — cả 2
 * trong ĐÚNG 1 giao dịch (lỗi giữa chừng ⇒ dữ liệu cũ còn nguyên).
 *
 * "Chưa có" tính theo SỐ LẦN xuất hiện, không theo có/không: sổ thật có những bút toán giống hệt nhau
 * mà đều đúng (cùng ngày, cùng chủ rừng, cùng số tiền — đã gặp 43 dòng như vậy trong file 7.437 dòng).
 * Ví dụ file có 2 dòng X, kho đã có 1 dòng X ⇒ thêm 1. Nhập lại đúng file cũ ⇒ không thêm gì.
 * @param {Object[]} values các dòng đã qua validateLoan
 * @param {'append'|'replace'} mode
 * @param {string} nguon nhãn nguồn (tên file)
 * @returns {Promise<{added:number, duplicate:number}>}
 */
export function importLoans(values, mode, nguon) {
  const now = new Date().toISOString(), base = Date.now();
  const stats = { added: 0, duplicate: 0 };
  return tx('readwrite', (store) => {
    const write = (existing) => {
      const have = new Map();
      existing.forEach((r) => { const fp = loanFingerprint(r); have.set(fp, (have.get(fp) || 0) + 1); });
      values.forEach((v, i) => {
        const fp = loanFingerprint(v), left = have.get(fp) || 0;
        if (left > 0) { have.set(fp, left - 1); stats.duplicate++; return; }
        store.add(Object.assign({}, v, { id: newId(), schema: LOAN_SCHEMA, rev: 1, seq: base + i, nguon: nguon, createdAt: now, updatedAt: now }));
        stats.added++;
      });
    };
    if (mode === 'replace') { store.clear(); write([]); }
    else { const req = store.getAll(); req.onsuccess = () => write(req.result || []); }
    return () => stats;
  });
}

/** Bản sao toàn bộ kho để đưa vào file sao lưu (kèm sổ phụ cũ nếu còn, để không mất khi khôi phục). */
export function exportLoans() {
  return tx('readonly', (stores) => {
    let rows = [], soPhu = [], opening = null;
    const a = stores[STORE].getAll(), b = stores[SOPHU_STORE].getAll(), c = stores[META_STORE].get(OPENING_KEY);
    a.onsuccess = () => { rows = (a.result || []).filter((r) => r && r.schema === LOAN_SCHEMA); };
    b.onsuccess = () => { soPhu = b.result || []; };
    c.onsuccess = () => { opening = c.result ? c.result.value : null; };
    return () => {
      const out = { schema: LOAN_SCHEMA, rows, soDuDauSo: opening };
      if (soPhu.length) out.soPhuCu = { schema: SOPHU_SCHEMA, rows: soPhu };
      return out;
    };
  }, [STORE, SOPHU_STORE, META_STORE]);
}

/** Số dư đầu kỳ nhập tay của sổ tiền vay: {ngay ISO, soTien} | null (chưa nhập). */
export function getOpening() {
  return tx('readonly', (store) => { let v = null; const r = store.get(OPENING_KEY); r.onsuccess = () => { v = r.result ? r.result.value : null; }; return () => v; }, META_STORE);
}

/** Lưu (value) hoặc xoá (null) số dư đầu kỳ nhập tay. value đã qua validateOpening. */
export function setOpening(value) {
  return tx('readwrite', (store) => {
    if (value) store.put({ key: OPENING_KEY, value: { ngay: value.ngay, soTien: value.soTien }, updatedAt: new Date().toISOString() });
    else store.delete(OPENING_KEY);
    return value || null;
  }, META_STORE);
}

/**
 * Khôi phục từ file sao lưu: thay toàn bộ khoản vay bằng đúng nội dung file (1 giao dịch). Trả số khoản vay.
 * - schema 3: khoản vay 3 cột (+ `soPhuCu` nếu có ⇒ thay luôn kho sổ phụ cũ).
 * - schema 2 (file sao lưu bản sổ phụ): cất nguyên vào kho sổ phụ cũ VÀ chuyển các dòng tiền vay sang 3 cột.
 * - schema 1 (bảng kê tính sẵn): chỉ cất lại vào kho cũ để không mất; báo 0.
 * - Có trường `soDuDauSo` (kể cả null) ⇒ thay số dư đầu kỳ nhập tay; file không có trường này (bản trước)
 *   ⇒ GIỮ NGUYÊN số dư đang có.
 */
export function restoreLoans(backup) {
  if (!backup || !Array.isArray(backup.rows)) return Promise.reject(new Error('Phần "khoản vay" trong file sao lưu không đúng định dạng.'));
  if (backup.schema === 1) return tx('readwrite', (store) => { backup.rows.forEach((r) => { if (r && r.id) store.put(r); }); return 0; }, LEGACY_STORE);
  if (backup.schema !== LOAN_SCHEMA && backup.schema !== SOPHU_SCHEMA) return Promise.reject(new Error('Phần "khoản vay" trong file sao lưu có phiên bản lạ (' + backup.schema + ').'));
  const soPhu = backup.schema === SOPHU_SCHEMA ? backup : backup.soPhuCu;
  if (soPhu && (soPhu.schema !== SOPHU_SCHEMA || !Array.isArray(soPhu.rows))) return Promise.reject(new Error('Phần "sổ phụ cũ" trong file sao lưu không đúng định dạng.'));
  const rows = backup.schema === LOAN_SCHEMA ? backup.rows.filter((r) => r && r.id && r.schema === LOAN_SCHEMA)
    : backup.rows.map((r) => convertSoPhuRecord(r)).filter(Boolean);
  const hasOpening = Object.prototype.hasOwnProperty.call(backup, 'soDuDauSo');
  const op = backup.soDuDauSo;
  if (hasOpening && op != null && (typeof op.ngay !== 'string' || typeof op.soTien !== 'number')) return Promise.reject(new Error('Phần "số dư đầu kỳ" trong file sao lưu không đúng định dạng.'));
  return tx('readwrite', (stores) => {
    stores[STORE].clear();
    rows.forEach((r) => stores[STORE].put(r));
    if (soPhu) { stores[SOPHU_STORE].clear(); soPhu.rows.forEach((r) => { if (r && r.id) stores[SOPHU_STORE].put(r); }); }
    if (hasOpening) { if (op) stores[META_STORE].put({ key: OPENING_KEY, value: { ngay: op.ngay, soTien: op.soTien }, updatedAt: new Date().toISOString() }); else stores[META_STORE].delete(OPENING_KEY); }
    return rows.length;
  }, [STORE, SOPHU_STORE, META_STORE]);
}
