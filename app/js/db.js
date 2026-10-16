/**
 * db.js — HAK.DB: lớp IndexedDB dùng chung của app (DB "hak-app").
 *   - Kho "kv": bản sao lưu ngầm của mọi khóa HAK.Store (cài đặt, danh sách xe, mẫu Word, form…) → không mất khi localStorage đầy / bị xóa.
 *   - Kho "hak-archive" (Lưu trữ biên bản) vẫn do archive.js quản lý riêng, KHÔNG đổi định dạng.
 *   - Kho nghiệp vụ (v2): "batches" + "batchdata" (các đợt Excel đã nhập: thông số + file gốc), "issued" (nhật ký chứng từ PXK/BKLS đã lập).
 *   - Kho "handles" (v3): tay cầm thư mục mặc định khi Sao lưu (File System Access API) — xem backup.js.
 *   - Kho mới ở giai đoạn sau: nâng VER và thêm khối `if (ev.oldVersion < N)` trong onupgradeneeded.
 * Không có IndexedDB → backend 'mem' (mọi hàm vẫn chạy, chỉ không lưu bền).
 */
(function (root) {
  'use strict';
  const HAK = (root.HAK = root.HAK || {});
  const NAME = 'hak-app', VER = 3;
  const STORES = { kv: { keyPath: 'key' }, batches: { keyPath: 'id' }, batchdata: {}, issued: { keyPath: 'id' }, handles: {} };
  const memStores = {};                                  // dự phòng khi không có IndexedDB
  const state = { backend: root.indexedDB ? 'idb' : 'mem', error: null };
  let dbp = null;

  function open() {
    if (dbp) return dbp;
    dbp = new Promise((ok) => {
      let done = false;
      const fin = (db) => { if (!done) { done = true; clearTimeout(timer); ok(db); } else if (db) db.close(); };
      const timer = setTimeout(() => { if (!done) { state.backend = 'mem'; state.error = 'timeout'; fin(null); } }, 4000);   // tab cũ giữ DB → không chờ mãi
      try {
        if (!root.indexedDB) { state.backend = 'mem'; return fin(null); }
        const rq = root.indexedDB.open(NAME, VER);
        rq.onupgradeneeded = (ev) => {
          const d = rq.result;
          if (ev.oldVersion < 1) d.createObjectStore('kv', { keyPath: 'key' });
          if (ev.oldVersion < 2) { d.createObjectStore('batches', { keyPath: 'id' }); d.createObjectStore('batchdata'); d.createObjectStore('issued', { keyPath: 'id' }); }
          if (ev.oldVersion < 3) d.createObjectStore('handles');
        };
        rq.onsuccess = () => { const d = rq.result; d.onversionchange = () => { d.close(); dbp = null; }; fin(d); };
        rq.onerror = () => { state.backend = 'mem'; state.error = String(rq.error || 'error'); fin(null); };
        /* onblocked: chờ (tab khác đang mở bản cũ sẽ tự đóng) — có timeout ở trên */
      } catch (e) { state.backend = 'mem'; state.error = String(e); fin(null); }
    });
    return dbp;
  }
  const reqP = (rq) => new Promise((ok, no) => { rq.onsuccess = () => ok(rq.result); rq.onerror = () => no(rq.error); });
  const txDone = (tx) => new Promise((ok, no) => { tx.oncomplete = () => ok(); tx.onerror = tx.onabort = () => no(tx.error || new Error('Không ghi được IndexedDB')); });

  async function kvPut(key, val, ls) {
    const db = await open(); if (!db) return;
    const tx = db.transaction('kv', 'readwrite');
    tx.objectStore('kv').put({ key, val, ls: ls !== false, ts: Date.now() });
    return txDone(tx);
  }
  async function kvDel(key) {
    const db = await open(); if (!db) return;
    const tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').delete(key); return txDone(tx);
  }
  async function kvAll() {
    const db = await open(); if (!db) return [];
    return reqP(db.transaction('kv', 'readonly').objectStore('kv').getAll());
  }
  async function kvClear() {
    const db = await open(); if (!db) return;
    const tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').clear(); return txDone(tx);
  }

  /* ---- API chung cho các kho nghiệp vụ (put/get/getAll/del/clear); không có IndexedDB → Map trong RAM ---- */
  const mem = (st) => memStores[st] || (memStores[st] = new Map());
  async function put(store, val, key) {
    const db = await open();
    if (!db) { mem(store).set(key !== undefined ? key : val[STORES[store].keyPath], val); return; }
    const tx = db.transaction(store, 'readwrite');
    if (key !== undefined) tx.objectStore(store).put(val, key); else tx.objectStore(store).put(val);
    return txDone(tx);
  }
  async function get(store, key) {
    const db = await open(); if (!db) return mem(store).get(key);
    return reqP(db.transaction(store, 'readonly').objectStore(store).get(key));
  }
  async function getAll(store) {
    const db = await open(); if (!db) return Array.from(mem(store).values());
    return reqP(db.transaction(store, 'readonly').objectStore(store).getAll());
  }
  async function del(store, key) {
    const db = await open(); if (!db) { mem(store).delete(key); return; }
    const tx = db.transaction(store, 'readwrite'); tx.objectStore(store).delete(key); return txDone(tx);
  }
  async function clear(store) {
    const db = await open(); if (!db) { mem(store).clear(); return; }
    const tx = db.transaction(store, 'readwrite'); tx.objectStore(store).clear(); return txDone(tx);
  }

  /** Tình trạng bộ nhớ trình duyệt (để hiện ở Cài đặt). */
  async function status() {
    const out = { backend: state.backend, persisted: null, usage: null, quota: null };
    await open(); out.backend = state.backend;
    try { if (navigator.storage && navigator.storage.persisted) out.persisted = await navigator.storage.persisted(); } catch (e) { /* bỏ qua */ }
    try { if (navigator.storage && navigator.storage.estimate) { const e = await navigator.storage.estimate(); out.usage = e.usage; out.quota = e.quota; } } catch (e) { /* bỏ qua */ }
    return out;
  }
  async function requestPersist() {
    try { return !!(navigator.storage && navigator.storage.persist && await navigator.storage.persist()); } catch (e) { return false; }
  }

  HAK.DB = { open, kvPut, kvDel, kvAll, kvClear, put, get, getAll, del, clear, status, requestPersist, usable: () => state.backend === 'idb', get backend() { return state.backend; } };
})(window);
