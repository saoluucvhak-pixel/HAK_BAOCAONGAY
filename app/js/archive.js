/**
 * archive.js — 🗄️ Lưu trữ: mỗi lần xuất (Word / PDF / Excel) app tự lưu 1 "hồ sơ" gồm THÔNG SỐ FORM + CÁC DÒNG PHIẾU CÂN
 * đã lọc (nén gzip) vào IndexedDB của trình duyệt. Từ trang Lưu trữ có thể tải lại Word / PDF / Excel bất cứ lúc nào
 * mà KHÔNG cần chọn lại file Excel cân (dùng mẫu Word hiện hành). Có nút Sao lưu / Khôi phục ra file .json.
 *
 * - Cùng thông số + cùng dữ liệu → cùng 1 hồ sơ (ghi đè thời gian, gộp các kiểu đã xuất) — không nhân bản.
 * - Không có IndexedDB (chế độ ẩn danh…) → tự chuyển sang lưu tạm trong RAM (mất khi đóng trang) và báo trên trang.
 * - Lỗi lưu trữ KHÔNG bao giờ làm hỏng việc xuất file (mọi lỗi đều được bắt).
 */
(function (root) {
  'use strict';
  const HAK = (root.HAK = root.HAK || {});
  // v2.7.4 (Thủy: "quá tải hồ sơ"): BỎ giới hạn 500 hồ sơ tự xóa cũ nhất. Không bao giờ tự xóa — quá SOFT_WARN thì nhắc
  // "📦 Xuất & dọn hồ sơ cũ" (xuất file trước, xác nhận đã lưu rồi mới xóa). Trang Lưu trữ hiện PAGE dòng / lần (đỡ nặng máy).
  const DB_NAME = 'hak-archive', SOFT_WARN = 1500, PAGE = 200;
  const MODE_LABEL = { word: 'Word', pdf: 'PDF', xlsx: 'Excel', bkls: 'BKLS' };

  /* ---------------------------------------------------------------
   * 1. Lớp lưu trữ (IndexedDB, dự phòng RAM)
   * ------------------------------------------------------------- */
  let dbp = null;
  const mem = { meta: new Map(), data: new Map() };
  const state = { backend: 'idb' };

  function openDb() {
    if (dbp) return dbp;
    dbp = new Promise((ok) => {
      try {
        if (!root.indexedDB) { state.backend = 'mem'; return ok(null); }
        const rq = root.indexedDB.open(DB_NAME, 1);
        rq.onupgradeneeded = () => { const d = rq.result; d.createObjectStore('meta', { keyPath: 'id' }); d.createObjectStore('data'); };
        rq.onsuccess = () => ok(rq.result);
        rq.onerror = rq.onblocked = () => { state.backend = 'mem'; ok(null); };
      } catch (e) { state.backend = 'mem'; ok(null); }
    });
    return dbp;
  }
  const reqP = (rq) => new Promise((ok, no) => { rq.onsuccess = () => ok(rq.result); rq.onerror = () => no(rq.error); });
  const getAll = async (store) => { const db = await openDb(); if (!db) return Array.from(mem[store].values()); return reqP(db.transaction(store, 'readonly').objectStore(store).getAll()); };
  const getOne = async (store, k) => { const db = await openDb(); if (!db) return mem[store].get(k); return reqP(db.transaction(store, 'readonly').objectStore(store).get(k)); };
  const putBoth = (meta, data) => new Promise(async (ok, no) => {
    const db = await openDb();
    if (!db) { mem.meta.set(meta.id, meta); if (data !== undefined) mem.data.set(meta.id, data); return ok(); }
    const tx = db.transaction(['meta', 'data'], 'readwrite');
    tx.objectStore('meta').put(meta); if (data !== undefined) tx.objectStore('data').put(data, meta.id);
    tx.oncomplete = () => ok(); tx.onerror = tx.onabort = () => no(tx.error || new Error('Không ghi được dữ liệu lưu trữ'));
  });
  const delOne = (id) => new Promise(async (ok, no) => {
    const db = await openDb();
    if (!db) { mem.meta.delete(id); mem.data.delete(id); return ok(); }
    const tx = db.transaction(['meta', 'data'], 'readwrite');
    tx.objectStore('meta').delete(id); tx.objectStore('data').delete(id);
    tx.oncomplete = () => ok(); tx.onerror = tx.onabort = () => no(tx.error);
  });
  const clearAll = () => new Promise(async (ok, no) => {
    const db = await openDb();
    if (!db) { mem.meta.clear(); mem.data.clear(); return ok(); }
    const tx = db.transaction(['meta', 'data'], 'readwrite');
    tx.objectStore('meta').clear(); tx.objectStore('data').clear();
    tx.oncomplete = () => ok(); tx.onerror = tx.onabort = () => no(tx.error);
  });

  /* ---------------------------------------------------------------
   * 2. Nén / giải nén (gzip → base64; không hỗ trợ thì lưu thẳng JSON)
   * ------------------------------------------------------------- */
  function toB64(bytes) { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); }
  function fromB64(b) { const s = atob(b), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; }
  async function pack(obj) {
    const js = JSON.stringify(obj);
    if (typeof CompressionStream === 'function' && typeof Blob !== 'undefined' && Blob.prototype.stream) {
      try {
        const buf = await new Response(new Blob([js]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();
        return 'gz:' + toB64(new Uint8Array(buf));
      } catch (e) { /* rơi xuống lưu thô */ }
    }
    return 'raw:' + js;
  }
  async function unpack(s) {
    if (typeof s !== 'string') throw new Error('Dữ liệu lưu trữ không hợp lệ.');
    if (s.slice(0, 3) === 'gz:') {
      if (typeof DecompressionStream !== 'function') throw new Error('Trình duyệt này không giải nén được hồ sơ — hãy dùng Chrome / Edge.');
      const txt = await new Response(new Blob([fromB64(s.slice(3))]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
      return JSON.parse(txt);
    }
    return JSON.parse(s.slice(4));
  }

  /* ---------------------------------------------------------------
   * 3. Lưu / đọc hồ sơ
   * ------------------------------------------------------------- */
  /** Băm chuỗi (cyrb53) → id ngắn, ổn định: cùng thông số + dữ liệu ⇒ cùng hồ sơ. */
  function hash(str) {
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < str.length; i++) { const c = str.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
  }
  /** Số liệu phục vụ Báo cáo tổng hợp: tàu, bên giao/nhận, xe trả về (chỉ Ủy thác / Xuất hàng kho gửi). */
  function stats(type, params, rows) {
    const C = HAK.Config, ret = new Set(params.returned || []);
    const retRows = rows.filter((r) => ret.has(HAK.Generator.retKey(r)));
    const nm = (id) => { try { return (C.company(id) || {}).short || ''; } catch (e) { return ''; } };
    return {
      sv: 2, ship: params.ship ? String(params.ship).trim().toUpperCase() : '',
      giao: params.giaoId ? nm(params.giaoId) : '', nhan: params.nhanId ? nm(params.nhanId) : '',
      kho: (params.khoGiaoId || '') + '>' + (params.khoNhanId || ''),
      retTrips: retRows.length, retKg: retRows.reduce((a, r) => a + r.net, 0),
      contract: params.contractId || '',      // v2.5: hợp đồng (📇 Danh mục) đã chọn khi lập — báo cáo Xuất hàng dùng
      cid: params.giaoId || ''                // v2.6.2: công ty bên xuất (id) — lọc Lưu trữ / Báo cáo theo công ty làm việc
    };
  }
  const stripExt = (n) => String(n || '').replace(/\.(docx|xlsx|zip)$/i, '');

  /**
   * Lưu hồ sơ sau khi xuất thành công.
   * @param {string} type  guikho | xuatkhogui | uythac | dieuchuyen | traodoi
   * @param {object} params  kết quả HAK.Pages._collect(type)
   * @param {object} res     kết quả HAK.Generator.build (files, excel, summary)
   * @param {object} ds      dataset đọc từ Excel (dùng ds.rows)
   * @param {string} mode    word | pdf | xlsx
   * @returns {Promise<boolean>}
   */
  async function save(type, params, res, ds, mode) {
    try {
      const G = HAK.Generator;
      const rows = G.filterRows(ds.rows, params.filter);
      if (!rows.length) return false;
      const sum = G.summarize(rows);
      const pNoDate = Object.assign({}, params); delete pNoDate.docDate;
      // Ô BKLS (bkls*) không tính vào mã hồ sơ → biên bản và BKLS của CÙNG một đợt ghép chung 1 hồ sơ.
      Object.keys(pNoDate).forEach((k) => { if (k.indexOf('bkls') === 0) delete pNoDate[k]; });
      delete pNoDate.contractId;   // v2.5: ô "Chọn hợp đồng" chỉ để điền form → không tách hồ sơ cũ / mới của cùng một đợt
      const id = 'a' + hash(type + '|' + JSON.stringify(pNoDate) + '|' + sum.trips + '|' + sum.kg + '|' + rows[0].idx + '|' + rows[rows.length - 1].idx);
      const now = Date.now();
      const old = await getOne('meta', id);
      const modes = old && old.modes ? old.modes.slice() : [];
      if (modes.indexOf(mode) < 0) modes.push(mode);
      const title = res.excel ? stripExt(res.excel.fileName) : stripExt((res.files[res.files.length - 1] || {}).name);
      const st = stats(type, params, rows);
      const isBkls = mode === 'bkls', keepOld = old && isBkls;     // BKLS ghép vào hồ sơ biên bản có sẵn: giữ tên + tóm tắt của biên bản
      const meta = Object.assign(st, {
        id, type, title: keepOld ? old.title : (res.files[res.files.length - 1] ? stripExt(res.files[res.files.length - 1].name) : title), createdAt: old ? old.createdAt : now, updatedAt: now, modes,
        trips: sum.trips, kg: sum.kg, vehicles: sum.vehicles, from: sum.from, to: sum.to,
        summary: keepOld ? Object.assign({}, old.summary, { 'Số BKLS': params.bklsSoBkls })
          : Object.assign({}, res.summary || {}, old && old.summary && old.summary['Số BKLS'] ? { 'Số BKLS': old.summary['Số BKLS'] } : {}),
        size: old ? old.size : 0
      });
      if (!meta.contract && old && old.contract) meta.contract = old.contract;
      // v2.6.1: người lập (đăng nhập) — createdBy giữ người lập đầu tiên, by = người thao tác gần nhất
      const who = HAK.Auth && HAK.Auth.who ? HAK.Auth.who() : '';
      meta.by = who || (old && old.by) || ''; meta.createdBy = (old && old.createdBy) || who || '';   // lập lại mà không chọn hợp đồng → giữ hợp đồng đã gắn trước đó
      let data;
      if (!old || isBkls) {                                   // BKLS: luôn ghi lại thông số mới nhất (số BKLS, bên mua…) để tải lại đúng bản vừa lập
        const custom = {};
        Object.keys(params).forEach((k) => { const v = params[k]; if (typeof v === 'string' && v.indexOf('__c_') === 0 && HAK.Config.custom[v]) custom[v] = HAK.Config.custom[v]; });
        data = await pack({ v: 1, type, params, rows, custom });
        meta.size = data.length;
      }
      await putBoth(meta, data);
      trim();
      updateBadge();
      if (navigator.storage && navigator.storage.persist) { try { navigator.storage.persist(); } catch (e) { /* bỏ qua */ } }
      return true;
    } catch (e) { console.warn('Lưu trữ hồ sơ thất bại:', e); return false; }
  }

  /** v2.7.4: KHÔNG tự xóa nữa (trước: giữ 500 hồ sơ mới nhất) — chỉ nhắc 1 lần mỗi phiên khi vượt SOFT_WARN. */
  let warned = false;
  async function trim() {
    try {
      const n = (await getAll('meta')).length;
      if (n > SOFT_WARN && !warned && HAK.UI) { warned = true; HAK.UI.toast('Lưu trữ đang có ' + n.toLocaleString('vi-VN') + ' hồ sơ — Quản trị nên vào 🗄️ Lưu trữ → 📦 Xuất & dọn hồ sơ cũ cho máy nhẹ (không có hồ sơ nào bị tự xóa).', 'warning'); }
    } catch (e) { /* bỏ qua */ }
  }

  /** Hồ sơ lưu từ bản trước chưa có số liệu báo cáo → tính bổ sung từ dữ liệu đã lưu (1 lần). */
  async function ensureStats(metas) {
    for (const m of metas) {
      if (m.sv >= 2) continue;
      try {
        const d = await load(m.id);
        Object.assign(m, stats(d.type, d.params, d.rows));
        await putBoth(m);
      } catch (e) { console.warn('Không bổ sung được số liệu cho hồ sơ', m.id, e); m.sv = 2; m.retKg = m.retKg || 0; m.retTrips = m.retTrips || 0; }
    }
    return metas;
  }

  const list = async () => (await getAll('meta')).sort((a, b) => b.updatedAt - a.updatedAt);
  async function load(id) {
    const s = await getOne('data', id);
    if (s === undefined) throw new Error('Không tìm thấy dữ liệu của hồ sơ này.');
    return unpack(s);
  }

  /** Tải lại Word / PDF / Excel từ hồ sơ (không cần file Excel cân). */
  async function regenerate(id, mode) {
    const { toast } = HAK.UI;
    let d;
    try { d = await load(id); } catch (e) { toast(e.message || String(e), 'error'); return; }
    Object.assign(HAK.Config.custom, d.custom || {});          // kho nhập tay đã dùng trong hồ sơ
    if (mode === 'bkls') return HAK.Pages.generateBkls(d.type, { ds: { ok: true, rows: d.rows }, params: d.params });
    await HAK.Pages.generate(d.type, mode === 'word' ? undefined : mode, { ds: { ok: true, rows: d.rows }, params: d.params });
  }

  /* ---------------------------------------------------------------
   * 4. Sao lưu / khôi phục (.json)
   * ------------------------------------------------------------- */
  /** Toàn bộ hồ sơ dạng [{meta, data}] (dùng cho sao lưu riêng Lưu trữ và sao lưu toàn bộ). */
  async function collectItems() {
    const metas = await list();
    const items = [];
    for (const m of metas) { const data = await getOne('data', m.id); if (data !== undefined) items.push({ meta: m, data }); }
    return items;
  }
  async function exportAll() {
    const items = await collectItems();
    const blob = new Blob([JSON.stringify({ app: 'hak-bienban-archive', v: 1, exportedAt: new Date().toISOString(), items })], { type: 'application/json' });
    const d = new Date(), p2 = (n) => String(n).padStart(2, '0');
    const name = 'HAK_LuuTru_' + d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate()) + '.json';
    // Dùng chung thư mục sao lưu mặc định đã chọn ở Cài đặt → Chung (nếu có) — xem backup.js
    if (HAK.Backup && HAK.Backup.saveBackupBlob) await HAK.Backup.saveBackupBlob(blob, name);
    else HAK.Word.Files.saveBlob(blob, name);
    return { name, count: items.length };
  }
  async function importFile(file) {
    let j = null;
    if (HAK.Backup && HAK.Backup.readJson) j = await HAK.Backup.readJson(file);   // v2.7.5: nhận cả .zip
    else { try { j = JSON.parse(await file.text()); } catch (e) { /* báo lỗi bên dưới */ } }
    if (!j || j.app !== 'hak-bienban-archive' || !Array.isArray(j.items)) throw new Error('Đây không phải file sao lưu Lưu trữ của app.');
    return importItems(j.items);
  }
  async function importItems(list) {
    let added = 0, updated = 0, skipped = 0;
    for (const it of list) {
      if (!it || !it.meta || !it.meta.id || typeof it.data !== 'string') { skipped++; continue; }
      const cur = await getOne('meta', it.meta.id);
      if (cur && cur.updatedAt >= it.meta.updatedAt) { skipped++; continue; }
      await putBoth(it.meta, it.data);
      cur ? updated++ : added++;
    }
    trim(); updateBadge();
    return { added, updated, skipped };
  }

  /* ---------------------------------------------------------------
   * 5. Giao diện trang "Lưu trữ"
   * ------------------------------------------------------------- */
  const UI = () => HAK.UI;
  const fmtDT = (t) => { const d = new Date(t), p = (n) => String(n).padStart(2, '0'); return p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + d.getFullYear() + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()); };
  const fmtMB = (b) => b < 1048576 ? Math.max(1, Math.round(b / 1024)) + ' KB' : (b / 1048576).toFixed(1).replace('.', ',') + ' MB';
  let cache = [], shown = PAGE;

  async function updateBadge() {
    try {
      const n = (await getAll('meta')).length, el = document.getElementById('archCount');
      if (el) { el.textContent = n ? String(n) : ''; el.classList.toggle('d-none', !n); }
    } catch (e) { /* bỏ qua */ }
  }

  function typeLabel(t) { const D = HAK.Pages && HAK.Pages.DOCS[t]; return D ? D.icon + ' ' + D.title : t; }

  /** Bộ lọc theo phạm vi công ty đang xem (dùng chung cho danh sách và 📦 dọn hồ sơ cũ). */
  function scopeFilter() {
    const scope = HAK.Auth && HAK.Auth.scopeIds ? HAK.Auth.scopeIds('archive') : null;
    return (m) => !scope || scope.indexOf(HAK.Auth.companyOfMeta(m)) >= 0;
  }
  function renderRows() {
    const { esc } = UI();
    const q = (document.getElementById('archSearch').value || '').trim().toLowerCase(), ty = document.getElementById('archType').value;
    const inScope = scopeFilter();   // v2.6.2: mặc định chỉ hồ sơ của công ty đang làm
    const rows = cache.filter((m) => inScope(m) && (!ty || m.type === ty) && (!q || (m.title + ' ' + m.type + ' ' + Object.values(m.summary || {}).join(' ')).toLowerCase().indexOf(q) >= 0));
    const body = document.getElementById('archBody'), more = document.getElementById('archMore');
    if (more) { const left = rows.length - shown; more.classList.toggle('d-none', left <= 0); more.textContent = 'Hiện thêm ' + Math.min(PAGE, left).toLocaleString('vi-VN') + ' hồ sơ (còn ' + Math.max(0, left).toLocaleString('vi-VN') + ')'; }
    body.innerHTML = rows.slice(0, shown).map((m) => {
      const sub = Object.keys(m.summary || {}).slice(0, 2).map((k) => k + ': ' + m.summary[k]).join(' · ');
      return '<tr><td class="text-nowrap">' + fmtDT(m.updatedAt) + '</td><td class="text-nowrap">' + esc(typeLabel(m.type)) + '</td>' +
        '<td><div class="fw-semibold mono">' + esc(m.title) + '</div><div class="small muted">' + esc(sub) + '</div>' +
        '<div class="small muted">👤 ' + (m.by ? esc(m.by) + (m.createdBy && m.createdBy !== m.by ? ' (lập đầu: ' + esc(m.createdBy) + ')' : '') : '(trước v2.6)') + '</div></td>' +
        '<td class="num">' + m.trips.toLocaleString('vi-VN') + '</td><td class="num">' + HAK.Generator.fmtTon(m.kg) + '</td>' +
        '<td class="small">' + (m.modes || []).map((x) => MODE_LABEL[x] || x).join(', ') + '</td>' +
        '<td class="text-nowrap text-end"><div class="btn-group btn-group-sm">' +
        '<button class="btn btn-outline-primary" data-act="word" data-id="' + m.id + '" type="button" title="Sinh lại Word">Word</button>' +
        '<button class="btn btn-outline-primary" data-act="pdf" data-id="' + m.id + '" type="button" title="Tải PDF">PDF</button>' +
        '<button class="btn btn-outline-success" data-act="xlsx" data-id="' + m.id + '" type="button" title="Xuất Excel">Excel</button>' +
        ((m.modes || []).indexOf('bkls') >= 0 ? '<button class="btn btn-outline-dark" data-act="bkls" data-id="' + m.id + '" type="button" title="Tạo lại Bảng kê lâm sản (số BKLS ' + esc((m.summary || {})['Số BKLS'] || '') + ')">BKLS</button>' : '') +
        '<button class="btn btn-outline-danger" data-act="del" data-id="' + m.id + '" type="button" title="Xóa hồ sơ">🗑</button></div></td></tr>';
    }).join('');
    document.getElementById('archEmpty').classList.toggle('d-none', rows.length > 0);
    document.getElementById('archTableWrap').classList.toggle('d-none', rows.length === 0);
    document.getElementById('archCountInfo').innerHTML = (rows.length === cache.length ? cache.length.toLocaleString('vi-VN') + ' hồ sơ' : rows.length.toLocaleString('vi-VN') + ' / ' + cache.length.toLocaleString('vi-VN') + ' hồ sơ') +
      (cache.length > SOFT_WARN ? ' <span class="badge text-bg-warning" title="Nên Xuất & dọn hồ sơ cũ">nhiều — nên dọn</span>' : '');
  }

  async function render() {
    cache = await list();
    const total = cache.reduce((a, m) => a + (m.size || 0), 0);
    document.getElementById('archSize').textContent = cache.length ? '≈ ' + fmtMB(total) : '';
    document.getElementById('archMemWarn').classList.toggle('d-none', state.backend !== 'mem');
    const sel = document.getElementById('archType'), cur = sel.value;
    const types = Array.from(new Set(cache.map((m) => m.type)));
    sel.innerHTML = '<option value="">Tất cả loại</option>' + types.map((t) => '<option value="' + t + '">' + UI().esc(typeLabel(t)) + '</option>').join('');
    if (types.indexOf(cur) >= 0) sel.value = cur;
    renderRows(); updateBadge();
    const pp = document.getElementById('archPrunePanel'); if (pp && !pp.classList.contains('d-none')) renderPrune();   // v2.7.4: số liệu dọn luôn khớp sau khôi phục / xóa
  }

  /* ---------------------------------------------------------------
   * 6. v2.7.4 📦 Xuất & dọn hồ sơ cũ: ① xuất các hồ sơ cập nhật TRƯỚC ngày chọn ra 1 file (đúng định dạng "Sao lưu Lưu trữ" → ⬆ Khôi phục
   *    nhập lại được) → ② tick "đã kiểm tra file" → xóa đúng các hồ sơ đó khỏi máy. Không xuất được file thì không cho xóa.
   * ------------------------------------------------------------- */
  const isoDay = (t) => { const d = new Date(t), p = (n) => String(n).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); };
  let pruneIds = null;
  function renderPrune() {
    const { esc } = UI(), box = document.getElementById('archPruneBody');
    const def = new Date(); def.setFullYear(def.getFullYear() - 1); def.setDate(1);
    const old = cache.length ? cache[cache.length - 1].updatedAt : Date.now();
    box.innerHTML = '<div class="fw-semibold mb-1">📦 Xuất &amp; dọn hồ sơ cũ</div>' +
      '<div class="small muted mb-2">Hồ sơ cũ được xuất ra 1 file (giữ được mãi, cần thì <b>⬆ Khôi phục</b> nhập lại) rồi mới xóa khỏi máy cho nhẹ. Hồ sơ cũ nhất: <b>' + esc(fmtDT(old)) + '</b>. Chỉ tính hồ sơ trong phạm vi công ty đang xem.</div>' +
      '<div class="d-flex flex-wrap align-items-end gap-2"><div><label class="form-label mb-1" for="archPruneDate">Hồ sơ cập nhật trước ngày</label><input type="date" class="form-control form-control-sm" id="archPruneDate" value="' + isoDay(def) + '"></div>' +
      '<div class="small" id="archPruneCount"></div><button class="btn btn-sm btn-primary" id="archPruneExport" type="button">① Xuất file hồ sơ cũ</button></div>' +
      '<div class="mt-2 d-none" id="archPruneStep2"><div class="form-check"><input class="form-check-input" type="checkbox" id="archPruneOk"><label class="form-check-label small" for="archPruneOk">Tôi đã kiểm tra: file vừa xuất <b>đã lưu xong</b> (thấy trong thư mục / Downloads) và đã chép ra nơi an toàn.</label></div>' +
      '<button class="btn btn-sm btn-danger mt-1" id="archPruneDel" type="button" disabled>② Xóa các hồ sơ này khỏi máy</button></div>';
    const pick = () => { const v = document.getElementById('archPruneDate').value, t = v ? new Date(v + 'T00:00:00').getTime() : 0; const inScope = scopeFilter(); return cache.filter((m) => m.updatedAt < t && inScope(m)); };
    const upd = () => { const n = pick().length; document.getElementById('archPruneCount').innerHTML = '<b>' + n.toLocaleString('vi-VN') + '</b> hồ sơ'; document.getElementById('archPruneExport').disabled = !n; document.getElementById('archPruneStep2').classList.add('d-none'); pruneIds = null; };
    document.getElementById('archPruneDate').addEventListener('change', upd); upd();
    document.getElementById('archPruneExport').addEventListener('click', async (e) => {
      const { toast, Loading } = UI(), sel = pick(), btn = e.currentTarget; if (!sel.length) return;
      btn.disabled = true; Loading.show('Đang xuất ' + sel.length + ' hồ sơ…');
      try {
        const items = [];
        for (const m of sel) { const data = await getOne('data', m.id); if (data !== undefined) items.push({ meta: m, data }); }
        const from = isoDay(sel[sel.length - 1].updatedAt).replace(/-/g, ''), to = isoDay(sel[0].updatedAt).replace(/-/g, '');
        const name = 'HAK_LuuTru_HoSoCu_' + from + '-' + to + '.json';
        const blob = new Blob([JSON.stringify({ app: 'hak-bienban-archive', v: 1, exportedAt: new Date().toISOString(), pruned: true, items })], { type: 'application/json' });
        if (HAK.Backup && HAK.Backup.saveBackupBlob) await HAK.Backup.saveBackupBlob(blob, name); else HAK.Word.Files.saveBlob(blob, name);
        pruneIds = items.map((x) => x.meta.id);
        document.getElementById('archPruneStep2').classList.remove('d-none');
        toast('Đã xuất ' + items.length + ' hồ sơ: ' + name + '. Kiểm tra file rồi tick xác nhận để xóa khỏi máy.', 'success');
      } catch (x) { if (!(x && x.name === 'AbortError')) { console.error(x); toast('Không xuất được: ' + (x.message || x), 'error'); } }
      finally { Loading.hide(); btn.disabled = false; }
    });
    document.getElementById('archPruneOk').addEventListener('change', (e) => { document.getElementById('archPruneDel').disabled = !e.target.checked; });
    document.getElementById('archPruneDel').addEventListener('click', (e) => UI().confirmClick(e.currentTarget, async () => {
      const ids = pruneIds || []; if (!ids.length) return;
      UI().Loading.show('Đang dọn ' + ids.length + ' hồ sơ…');
      try { for (const id of ids) await delOne(id); } finally { UI().Loading.hide(); }
      pruneIds = null; await render();
      UI().toast('Đã dọn ' + ids.length + ' hồ sơ cũ khỏi máy (đã có trong file vừa xuất).', 'success');
    }, 'Bấm lần nữa để xóa ' + (pruneIds || []).length + ' hồ sơ'));
  }

  function init() {
    const { $, toast, Loading, confirmClick, debounce } = UI();
    if (!$('#page-archive')) return;
    $('#archSearch').addEventListener('input', debounce(() => { shown = PAGE; renderRows(); }, 150));
    $('#archType').addEventListener('change', () => { shown = PAGE; renderRows(); });
    $('#archMore').addEventListener('click', () => { shown += PAGE; renderRows(); });
    $('#archPrune').addEventListener('click', () => { const p = $('#archPrunePanel'); p.classList.toggle('d-none'); if (!p.classList.contains('d-none')) renderPrune(); });
    const sw = document.getElementById('archScopeWrap'); if (sw && HAK.Auth && HAK.Auth.scopeSwitch) sw.innerHTML = HAK.Auth.scopeSwitch('archive');
    root.addEventListener('hak:scope', (e) => { if (e.detail && e.detail.key === 'archive') { renderRows(); if (!$('#archPrunePanel').classList.contains('d-none')) renderPrune(); } });
    $('#archBody').addEventListener('click', async (e) => {
      const b = e.target.closest('button[data-act]'); if (!b) return;
      const id = b.dataset.id, act = b.dataset.act;
      if (act === 'del') return confirmClick(b, async () => { await delOne(id); await render(); toast('Đã xóa hồ sơ.', 'info'); }, 'Bấm lần nữa');
      b.disabled = true;
      try { await regenerate(id, act); await render(); } finally { b.disabled = false; }
    });
    $('#archBackup').addEventListener('click', async () => {
      try { const r = await exportAll(); toast(r.count ? 'Đã sao lưu ' + r.count + ' hồ sơ: ' + r.name : 'Chưa có hồ sơ nào để sao lưu.', r.count ? 'success' : 'warning'); }
      catch (e) { if (e && e.name === 'AbortError') return; console.error(e); toast(e.message || String(e), 'error'); }
    });
    $('#archRestore').addEventListener('change', async (e) => {
      const f = e.target.files[0]; e.target.value = ''; if (!f) return;
      Loading.show('Đang khôi phục…');
      try { const r = await importFile(f); await render(); toast('Khôi phục xong: thêm ' + r.added + ', cập nhật ' + r.updated + (r.skipped ? ', bỏ qua ' + r.skipped + ' (đã có bản mới hơn / không hợp lệ)' : '') + '.', 'success'); }
      catch (err) { console.error(err); toast(err.message || String(err), 'error'); }
      finally { Loading.hide(); }
    });
    $('#archClear').addEventListener('click', (e) => confirmClick(e.currentTarget, async () => { await clearAll(); await render(); toast('Đã xóa toàn bộ Lưu trữ.', 'info'); }, 'Bấm lần nữa để xóa TẤT CẢ'));
    updateBadge();
  }

  HAK.Archive = { SOFT_WARN, save, list, load, ensureStats, regenerate, exportAll, importFile, collectItems, importItems, render, init, updateBadge, get state() { return state; } };
})(typeof window !== 'undefined' ? window : globalThis);
