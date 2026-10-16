/**
 * backup.js — HAK.Backup: an toàn dữ liệu.
 *   boot()    : chạy trước khi dựng giao diện — khôi phục các khóa còn thiếu / lỗi thời của localStorage từ bản sao IndexedDB (HAK.DB "kv").
 *   sao lưu / khôi phục TOÀN BỘ ra 1 file .json: cài đặt, danh sách xe, mẫu Word, form, các đợt Excel đã nhập, nhật ký chứng từ + toàn bộ hồ sơ Lưu trữ.
 *   thẻ "Bộ nhớ & sao lưu" ở Cài đặt → Chung; báo lỗi khi không lưu được; lưu nốt form khi đóng trang.
 *   v2.7.5: sao lưu toàn bộ dạng .zip (nén, khôi phục nhận cả .zip lẫn .json cũ) · 🔁 tự sao lưu mỗi ngày vào 1 thư mục, giữ N bản mới nhất
 *           (File System Access API, Chrome/Edge) · health(): "Sức khỏe dữ liệu" cho Tổng quan.
 */
(function (root) {
  'use strict';
  const HAK = (root.HAK = root.HAK || {});
  const APP = 'hak-bienban-backup', LAST_KEY = 'hak.backup.last', DIR_KEY = 'backupDir', AUTO_KEY = 'hak.autobk', AUTO_DIR = 'autoDir';
  const $ = (s) => document.querySelector(s);
  const toast = (m, t) => HAK.UI && HAK.UI.toast(m, t);
  const esc = (s) => (HAK.UI ? HAK.UI.esc(s) : String(s));
  const withTimeout = (p, ms) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error('timeout')), ms))]);
  const fmtBytes = (b) => b == null ? '—' : b < 1048576 ? Math.max(1, Math.round(b / 1024)) + ' KB' : b < 1073741824 ? (b / 1048576).toFixed(1).replace('.', ',') + ' MB' : (b / 1073741824).toFixed(1).replace('.', ',') + ' GB';
  const fmtDT = (t) => { const d = new Date(t), p = (n) => String(n).padStart(2, '0'); return p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + d.getFullYear() + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()); };

  /* ---------------- Thư mục sao lưu mặc định (File System Access API — chỉ Chrome/Edge) ---------------- */
  function dirPickerSupported() { return typeof root.showSaveFilePicker === 'function' && typeof root.showDirectoryPicker === 'function'; }
  async function getSavedDir() {
    try { return (await HAK.DB.get('handles', DIR_KEY)) || null; } catch (e) { return null; }
  }
  async function setSavedDir(h) {
    try { if (h) await HAK.DB.put('handles', h, DIR_KEY); else await HAK.DB.del('handles', DIR_KEY); } catch (e) { /* bỏ qua */ }
  }
  async function pickDefaultDir() {
    const h = await root.showDirectoryPicker({ id: 'hak-backup-dir', mode: 'read' });
    await setSavedDir(h);
    return h;
  }
  /**
   * Lưu 1 blob sao lưu. Có hỗ trợ File System Access API → luôn hiện hộp thoại "Lưu file" của trình duyệt,
   * mở sẵn tại thư mục mặc định đã chọn (nếu có) để không phải chọn lại mỗi lần.
   * Không hỗ trợ (Firefox/Safari), hoặc thư mục đã chọn không còn dùng được → rơi về cách tải xuống hiện có (không đổi).
   */
  async function saveBackupBlob(blob, name) {
    if (dirPickerSupported()) {
      const dir = await getSavedDir();
      const opts = { suggestedName: name, types: [/\.zip$/i.test(name) ? { description: 'Sao lưu nén ZIP', accept: { 'application/zip': ['.zip'] } } : { description: 'Sao lưu JSON', accept: { 'application/json': ['.json'] } }] };
      if (dir) opts.startIn = dir;
      try {
        const handle = await root.showSaveFilePicker(opts);
        const w = await handle.createWritable();
        await w.write(blob);
        await w.close();
        return;
      } catch (e) {
        if (e && e.name === 'AbortError') throw e;   // người dùng bấm Hủy trong hộp thoại — báo lên trên, không rơi về cách khác
        if (dir) { await setSavedDir(null); toast('Thư mục sao lưu mặc định không còn dùng được — đã bỏ chọn, đang lưu theo cách tải xuống thường.', 'warning'); }
      }
    }
    HAK.Word.Files.saveBlob(blob, name);
  }

  /* ---------------- Khởi động: khôi phục từ bản sao ngầm ---------------- */
  async function boot() {
    let n = 0;
    try {
      const recs = await withTimeout(HAK.DB.kvAll(), 2500);
      for (const r of recs) {
        if (!r || !r.key) continue;
        let inLs = null;
        try { inLs = root.localStorage.getItem(r.key); } catch (e) { /* bị chặn */ }
        if (inLs === null || r.ls === false) {          // thiếu ở localStorage, hoặc lần ghi gần nhất không vào được localStorage (bản trong LS đã cũ)
          HAK.Store.set(r.key, r.val); n++;
        }
      }
      const have = new Set(recs.map((r) => r && r.key));
      HAK.Store.keys().forEach((k) => { if (!have.has(k)) HAK.DB.kvPut(k, HAK.Store.get(k, null), true).catch(() => { /* bỏ qua */ }); });   // dữ liệu có từ bản cũ → tạo bản sao dự phòng
      if (n) {
        if (HAK.Config) HAK.Config.load();
        if (HAK.Vehicles) HAK.Vehicles.loadSaved();
      }
    } catch (e) { console.warn('Không đọc được bản sao IndexedDB:', e); }
    boot.restored = n;
    return n;
  }
  boot.restored = 0;

  /* ---------------- Sao lưu / khôi phục toàn bộ ---------------- */
  async function collect() {
    const keys = {};
    HAK.Store.keys().forEach((k) => { if (k !== LAST_KEY && k !== AUTO_KEY) keys[k] = HAK.Store.get(k, null); });   // v2.7.5: cài đặt tự sao lưu gắn với thư mục của máy này → không mang đi
    const items = HAK.Archive ? await HAK.Archive.collectItems() : [];
    const batches = HAK.Batches ? await HAK.Batches.exportAll() : [];
    const issued = HAK.Issued ? await HAK.DB.getAll('issued') : [];
    return { keys, items, batches, issued };
  }
  /** Dựng nội dung sao lưu toàn bộ (mảng chuỗi JSON — không nối thành 1 chuỗi lớn) + số đếm. */
  async function buildFull() {
    const { keys, items, batches, issued } = await collect();
    const parts = ['{"app":"' + APP + '","v":1,"exportedAt":"' + new Date().toISOString() + '","keys":', JSON.stringify(keys), ',"archive":['];
    items.forEach((it, i) => { parts.push((i ? ',' : '') + JSON.stringify(it)); });
    parts.push('],"batches":[');
    batches.forEach((it, i) => { parts.push((i ? ',' : '') + JSON.stringify(it)); });
    parts.push('],"issued":', JSON.stringify(issued), '}');
    return { parts, keys: Object.keys(keys).length, archive: items.length, batches: batches.length, issued: issued.length };
  }
  /** v2.7.5: nén thành .zip (1 file HAK_SaoLuuToanBo.json bên trong — Windows mở được). Không có JSZip → null (lưu .json như cũ). */
  const ZIP_INNER = 'HAK_SaoLuuToanBo.json';
  async function zipParts(parts) {
    if (typeof root.JSZip !== 'function') return null;
    const z = new root.JSZip();
    z.file(ZIP_INNER, new Blob(parts, { type: 'application/json' }));
    return z.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 }, mimeType: 'application/zip' });
  }
  const stamp = (withTime) => { const d = new Date(), p2 = (n) => String(n).padStart(2, '0'); return d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate()) + (withTime ? '_' + p2(d.getHours()) + p2(d.getMinutes()) : ''); };
  async function saveAll() {
    const f = await buildFull();
    const zip = await zipParts(f.parts);
    const name = 'HAK_SaoLuuToanBo_' + stamp() + (zip ? '.zip' : '.json');
    await saveBackupBlob(zip || new Blob(f.parts, { type: 'application/json' }), name);
    HAK.Store.set(LAST_KEY, Date.now());
    return { name, size: (zip || {}).size, keys: f.keys, archive: f.archive, batches: f.batches, issued: f.issued };
  }
  /** v2.7.5: đọc file sao lưu .zip (của app) hoặc .json → object (null nếu không đọc được JSON). Dùng chung cho Lưu trữ. */
  async function readJson(file) {
    const head = new Uint8Array(await file.slice(0, 2).arrayBuffer());
    let text;
    if (head[0] === 0x50 && head[1] === 0x4b) {                          // "PK" = ZIP
      if (typeof root.JSZip !== 'function') throw new Error('Không mở được file ZIP (thiếu thư viện nén).');
      let z; try { z = await root.JSZip.loadAsync(file); } catch (e) { throw new Error('File ZIP bị hỏng hoặc không đọc được.'); }
      const f = z.file(ZIP_INNER) || Object.values(z.files).find((x) => !x.dir && /\.json$/i.test(x.name));
      if (!f) throw new Error('File ZIP không có dữ liệu sao lưu (.json) của app.');
      text = await f.async('string');
    } else text = await file.text();
    try { return JSON.parse(text); } catch (e) { return null; }
  }
  /** Khóa tài khoản đăng nhập — giữ nguyên khi khôi phục với tùy chọn "Giữ tài khoản đang dùng trên máy này" (v2.6.6). */
  const AUTH_KEYS = ['hak.auth.v1', 'hak.auth.lastco'];
  async function restoreFile(file, opts) {
    const keepAuth = !!(opts && opts.keepAuth);
    const j = await readJson(file);                                      // v2.7.5: .zip hoặc .json
    if (j && j.app === 'hak-bienban-archive' && Array.isArray(j.items)) { // file sao lưu riêng Lưu trữ (bản cũ)
      const r = await HAK.Archive.importItems(j.items);
      return { legacy: true, keys: 0, added: r.added, updated: r.updated, skipped: r.skipped };
    }
    if (!j || j.app !== APP || typeof j.keys !== 'object' || !Array.isArray(j.archive)) throw new Error('Đây không phải file sao lưu toàn bộ của app.');
    let keys = 0;
    Object.keys(j.keys).forEach((k) => {
      if (keepAuth && AUTH_KEYS.indexOf(k) >= 0) return;                // giữ tài khoản / mật khẩu / khóa khôi phục / loại máy hiện tại
      if (k.indexOf('hak.') === 0 && k !== LAST_KEY && k !== AUTO_KEY && j.keys[k] !== null) { HAK.Store.set(k, j.keys[k]); keys++; }
    });
    const r = await HAK.Archive.importItems(j.archive);
    const nb = HAK.Batches && Array.isArray(j.batches) ? await HAK.Batches.importAll(j.batches) : 0;
    const ni = HAK.Issued && Array.isArray(j.issued) ? await HAK.Issued.importAll(j.issued) : 0;
    return { legacy: false, keys, added: r.added, updated: r.updated, skipped: r.skipped, batches: nb, issued: ni, keepAuth };
  }

  /* ---------------- v2.6.4 D2 — Gói cấu hình cài đặt (cài cho nhiều công ty / nhiều máy) ----------------
   * GỒM: Cài đặt (công ty, kho, cài đặt chung, bảng mã ĐVVC), mẫu Word đã tải lên, Danh mục (khách hàng, hợp đồng),
   *      cấu hình Google Sheet từng công ty (URL + mã bí mật), tài khoản Nhân viên, khóa công khai khôi phục của nhóm.
   * KHÔNG GỒM: tài khoản Quản trị (đặt riêng khi cài từng máy), hồ sơ Lưu trữ, đợt Excel, nhật ký chứng từ, danh sách xe, trạng thái đồng bộ.
   * Nhập: Cài đặt + mẫu Word có trong gói → thay; Danh mục → gộp theo id (ô trống trong gói không xóa dữ liệu máy này);
   *       Google Sheet → thay URL/mã theo từng công ty; Nhân viên → gộp theo tên đăng nhập (xem HAK.Auth.packIn). */
  const PACK = 'hak-bienban-pack', CAT_KEY = 'hak.catalog.v1', GS_KEY = 'hak.gsync.v2', CFG_KEY = 'hak.config.v1';
  /** ids = danh sách công ty của gói (v2.6.5 D4 — gói cho máy trạm); null = gói đầy đủ (máy chính). */
  function packBuild(ids) {
    const st = HAK.Auth && HAK.Auth.stationCos ? HAK.Auth.stationCos() : null;
    if (st) ids = (ids || st).filter((id) => st.indexOf(id) >= 0);        // máy trạm chỉ xuất được gói trong phạm vi của mình
    if (ids && !ids.length) throw new Error('Chọn ít nhất 1 công ty cho gói.');
    const inIds = (id) => !ids || ids.indexOf(id) >= 0;
    const tpl = {};
    HAK.Store.keys().forEach((k) => { if (k.indexOf('hak.tpl.') === 0) { const v = HAK.Store.get(k, null); if (v) tpl[k] = v; } });
    const gs = {}, cos = (HAK.Store.get(GS_KEY, null) || {}).cos || {};
    Object.keys(cos).forEach((cid) => { if (inIds(cid) && cos[cid] && cos[cid].url) gs[cid] = { url: cos[cid].url, token: cos[cid].token || '' }; });
    let catalog = HAK.Store.get(CAT_KEY, null);
    if (ids && catalog && Array.isArray(catalog.contracts) && HAK.Catalog && HAK.Catalog.relatedTo) {
      catalog = Object.assign({}, catalog, { contracts: catalog.contracts.filter((c) => HAK.Catalog.relatedTo(c, ids)) });   // chỉ HĐ liên quan công ty của gói (+ HĐ chưa gán)
    }
    return { app: PACK, v: 1, exportedAt: new Date().toISOString(), by: HAK.Auth ? HAK.Auth.who() : '',
      config: HAK.Config ? HAK.Config.data : HAK.Store.get(CFG_KEY, null), tpl, catalog, gsync: gs,
      auth: HAK.Auth ? HAK.Auth.packOut(ids) : { users: [], groupPub: null, station: null } };
  }
  const asciiName = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').replace(/[^A-Za-z0-9]+/g, '');
  async function packExport(ids) {
    const j = packBuild(ids), d = new Date(), p2 = (n) => String(n).padStart(2, '0');
    const st = j.auth && j.auth.station ? j.auth.station.cos : null;
    const tag = st ? '_' + st.map((id) => { const c = (j.config.companies || []).find((x) => x.id === id); return asciiName(c ? c.short || c.name : id); }).join('-') : '';
    const name = 'HAK_GoiCaiDat' + tag + '_' + d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate()) + '.json';
    await saveBackupBlob(new Blob([JSON.stringify(j)], { type: 'application/json' }), name);
    return { name, j };
  }
  async function packRead(file) {
    let j = null;
    try { j = JSON.parse(await file.text()); } catch (e) { /* báo lỗi bên dưới */ }
    if (!j || j.app !== PACK || !j.config || !Array.isArray(j.config.companies)) {
      throw new Error(j && j.app === APP ? 'Đây là file Sao lưu toàn bộ — hãy dùng nút "Khôi phục toàn bộ".' : 'Đây không phải file gói cấu hình cài đặt của app.');
    }
    return j;
  }
  /** Tóm tắt gói (HTML) — dùng ở thẻ Cài đặt và ở màn tạo Quản trị lần đầu. */
  function packSummaryHtml(j) {
    const cat = j.catalog || {}, u = HAK.Auth ? HAK.Auth.packIn(j.auth, true) : { added: 0, updated: 0, skipped: [] };
    const names = (j.config.companies || []).map((c) => c.short || c.name);
    const coN = (id) => { const c = (j.config.companies || []).find((x) => x.id === id); return c ? c.short || c.name : id; };
    const kind = u.station ? '<b class="text-primary">Máy trạm — chỉ làm: ' + esc(u.station.map(coN).join(', ')) + '</b>'
      : '<b>Máy chính — mọi công ty</b>' + (u.wasStation ? ' <span class="text-warning">(máy này đang là máy trạm → sẽ bỏ giới hạn)</span>' : '');
    const gsN = Object.keys(j.gsync || {}).length, tplN = Object.keys(j.tpl || {}).length;
    return '<ul class="sum-list mb-2">' +
      '<li><span>Loại gói</span>' + kind + '</li>' +
      '<li><span>Tạo lúc</span><b>' + (j.exportedAt ? fmtDT(j.exportedAt) : '—') + (j.by ? ' · ' + esc(j.by) : '') + '</b></li>' +
      '<li><span>Công ty (' + names.length + ')</span><b>' + esc(names.join(', ')) + '</b></li>' +
      '<li><span>Kho · mã ĐVVC</span><b>' + (j.config.warehouses || []).length + ' kho · ' + (j.config.carrierCodes || []).length + ' mã</b></li>' +
      '<li><span>Mẫu Word đã tải lên</span><b>' + tplN + '</b></li>' +
      '<li><span>Danh mục</span><b>' + ((cat.customers || []).length) + ' khách hàng · ' + ((cat.contracts || []).length) + ' hợp đồng</b></li>' +
      '<li><span>Google Sheet đã cấu hình</span><b>' + gsN + ' công ty</b></li>' +
      '<li><span>Nhân viên</span><b>thêm ' + u.added + ' · cập nhật ' + u.updated + (u.skipped.length ? ' · <span class="text-warning">bỏ qua ' + esc(u.skipped.join(', ')) + ' (trùng Quản trị máy này)</span>' : '') + '</b></li>' +
      '<li><span>Mật khẩu chủ của nhóm</span><b>' + (j.auth && j.auth.master ? 'Có · <span class="mono">' + esc(j.auth.master.fp || '') + '</span>' : '—') + '</b></li>' +
      '<li><span>Khóa khôi phục của nhóm</span><b>' + (j.auth && j.auth.groupPub ? 'Có' : '—') + '</b></li></ul>';
  }
  function packApply(j) {
    const r = { tpl: 0, cat: 0, gs: 0 };
    HAK.Store.set(CFG_KEY, j.config);
    Object.keys(j.tpl || {}).forEach((k) => { if (k.indexOf('hak.tpl.') === 0 && j.tpl[k]) { HAK.Store.set(k, j.tpl[k]); r.tpl++; } });
    if (j.catalog && Array.isArray(j.catalog.customers) && Array.isArray(j.catalog.contracts)) {
      const loc = HAK.Store.get(CAT_KEY, null) || {};
      const merge = (a, b) => {
        const out = (Array.isArray(a) ? a : []).map((x) => Object.assign({}, x));
        b.forEach((x) => {
          if (!x || !x.id) return;
          const i = out.findIndex((y) => y.id === x.id), clean = {};
          Object.keys(x).forEach((k) => { if (x[k] !== '' && x[k] !== null && x[k] !== undefined) clean[k] = x[k]; });
          if (i < 0) out.push(Object.assign({}, x)); else Object.assign(out[i], clean);
          r.cat++;
        });
        return out;
      };
      HAK.Store.set(CAT_KEY, Object.assign({}, j.catalog, loc, { customers: merge(loc.customers, j.catalog.customers), contracts: merge(loc.contracts, j.catalog.contracts) }));
    }
    const gsIn = j.gsync || {}, gs = HAK.Store.get(GS_KEY, null) || { cos: {} };
    if (!gs.cos) gs.cos = {};
    const stIn = j.auth && j.auth.station && Array.isArray(j.auth.station.cos) ? j.auth.station.cos : null;
    if (stIn) Object.keys(gs.cos).forEach((cid) => { if (stIn.indexOf(cid) < 0) delete gs.cos[cid]; });   // máy trạm: xóa Sheet công ty khác (nếu có từ gói cũ)
    Object.keys(gsIn).forEach((cid) => { if (gsIn[cid] && gsIn[cid].url) { gs.cos[cid] = Object.assign({}, gs.cos[cid], { url: gsIn[cid].url, token: gsIn[cid].token || '' }); r.gs++; } });
    if (r.gs || stIn) { gs.migV1 = true; HAK.Store.set(GS_KEY, gs); }
    r.users = HAK.Auth ? HAK.Auth.packIn(j.auth) : { added: 0, updated: 0, skipped: [] };
    return r;
  }
  const packMsg = (r) => 'Đã nhập gói cấu hình: ' + r.tpl + ' mẫu Word, ' + r.cat + ' mục danh mục, ' + r.gs + ' Google Sheet, nhân viên thêm ' + r.users.added + ' / cập nhật ' + r.users.updated +
    (r.users.master ? ', mật khẩu chủ của nhóm' : '') + (r.users.station ? ' — máy trạm (' + r.users.station.length + ' công ty)' : '') + '. Trang sẽ tải lại…';
  /** Ô chọn công ty của gói. Tick đủ mọi công ty (máy chính) = gói đầy đủ; tick 1 phần = gói máy trạm. */
  function pkCosHtml() {
    const st = HAK.Auth && HAK.Auth.stationCos ? HAK.Auth.stationCos() : null;
    const cos = ((HAK.Config && HAK.Config.data.companies) || []).filter((c) => !st || st.indexOf(c.id) >= 0);
    return '<div class="mb-2"><div class="form-label mb-1">Gói cho công ty</div><div class="d-flex flex-wrap gap-3" id="pkCos">' +
      cos.map((c) => '<div class="form-check"><input class="form-check-input" type="checkbox" checked data-pkco="' + esc(c.id) + '" id="pkCo-' + esc(c.id) + '"><label class="form-check-label" for="pkCo-' + esc(c.id) + '">' + esc(c.short || c.name) + '</label></div>').join('') +
      '</div><div class="form-text" id="pkKind"></div></div>';
  }
  /** null = gói đầy đủ (mọi công ty, chỉ ở máy chính). */
  function pkIds() {
    const all = Array.from(document.querySelectorAll('#pkCos [data-pkco]')), on = all.filter((x) => x.checked).map((x) => x.dataset.pkco);
    const st = HAK.Auth && HAK.Auth.stationCos ? HAK.Auth.stationCos() : null;
    return !st && on.length === all.length ? null : on;
  }
  function pkKind() {
    const k = $('#pkKind'); if (!k) return;
    const ids = pkIds();
    k.innerHTML = ids === null ? 'Tick <b>đủ mọi công ty</b> = gói <b>máy chính</b> (mọi Google Sheet, mọi nhân viên, mọi hợp đồng).'
      : !ids.length ? '<span class="text-danger">Chọn ít nhất 1 công ty.</span>'
      : 'Gói <b>máy trạm</b>: Quản trị máy đó chỉ chọn được công ty đã tick; gói chỉ mang Google Sheet, nhân viên (được làm công ty đã tick) và hợp đồng liên quan các công ty này; khóa khôi phục bị khóa ở máy trạm.';
    $('#pkOut').disabled = !!ids && !ids.length;
  }
  function renderPack() {
    const box = $('#packBody'); if (!box) return;
    box.innerHTML = '<p class="small mb-2">Dùng khi <b>cài app cho máy / công ty khác</b>: xuất 1 file từ máy đã cài đặt xong, sang máy mới bấm nhập — không phải nhập lại công ty, kho, mẫu Word, danh mục, Google Sheet, nhân viên. <a href="#/help" data-help="help-install">📘 Xem hướng dẫn</a></p>' +
      pkCosHtml() +
      '<div class="d-flex flex-wrap gap-2"><button class="btn btn-primary" id="pkOut" type="button">📦 Xuất gói cấu hình (.json)</button>' +
      '<label class="btn btn-outline-primary mb-0">📥 Nhập gói cấu hình<input type="file" id="pkIn" accept=".json,application/json" hidden></label></div>' +
      '<div id="pkPreview"></div>' +
      '<div class="form-text mt-2">Gói <b>không</b> chứa tài khoản Quản trị (mỗi máy tự đặt khi cài), hồ sơ Lưu trữ, đợt Excel, nhật ký chứng từ, danh sách xe. ' +
      '<span class="text-warning">⚠ File có mật khẩu Nhân viên (dạng băm) và mã bí mật Google Sheet — chỉ gửi cho người cài máy, không đăng công khai.</span></div>';
    $('#pkCos').addEventListener('change', pkKind); pkKind();
    $('#pkOut').addEventListener('click', async (e) => {
      const b = e.currentTarget; b.disabled = true;
      try { const r = await packExport(pkIds()); toast('Đã xuất ' + r.name + ' (' + r.j.config.companies.length + ' công ty, ' + r.j.auth.users.length + ' nhân viên).', 'success'); }
      catch (err) { if (!(err && err.name === 'AbortError')) { console.error(err); toast('Không xuất được: ' + (err.message || err), 'error'); } }
      b.disabled = false; pkKind();
    });
    $('#pkIn').addEventListener('change', async (e) => {
      const f = e.target.files[0]; e.target.value = ''; if (!f) return;
      const pv = $('#pkPreview');
      try {
        const j = await packRead(f);
        pv.innerHTML = '<div class="border rounded p-3 mt-3"><div class="fw-semibold mb-2">Gói ' + esc(f.name) + '</div>' + packSummaryHtml(j) +
          '<div class="small muted mb-2">Cài đặt công ty / kho / mã ĐVVC và mẫu Word trong gói sẽ <b>thay</b> bản trên máy này; danh mục và nhân viên được <b>gộp</b>. Nên Sao lưu toàn bộ trước.</div>' +
          '<div class="d-flex gap-2"><button class="btn btn-primary" id="pkApply" type="button">Áp dụng &amp; tải lại</button><button class="btn btn-outline-secondary" id="pkCancel" type="button">Hủy</button></div></div>';
        $('#pkCancel').addEventListener('click', () => { pv.innerHTML = ''; });
        $('#pkApply').addEventListener('click', () => { const r = packApply(j); toast(packMsg(r), 'success'); setTimeout(() => root.location.reload(), 1500); });
      } catch (err) { pv.innerHTML = ''; toast(err.message || String(err), 'error'); }
    });
  }

  /* ---------------- v2.7.5 🔁 Tự sao lưu vào thư mục (xoay vòng N bản) ----------------
   * Thư mục chọn 1 lần (quyền GHI, tay cầm lưu ở HAK.DB 'handles' khóa AUTO_DIR — riêng với thư mục "mở sẵn" DIR_KEY).
   * Mỗi ngày: lần đầu mở app (sau ~20 giây) / mỗi 30 phút kiểm tra → quá AUTO_EVERY kể từ lần tự sao lưu thành công gần nhất thì ghi
   * HAK_TuDong_<yyyymmdd>_<hhmm>.zip, đọc lại kiểm tra dung lượng, rồi xóa các bản HAK_TuDong_*.zip cũ hơn N bản mới nhất
   * (KHÔNG đụng file khác trong thư mục). Trình duyệt hỏi lại quyền ghi sau khi mở lại → nút "Cho phép" ở Tổng quan / Cài đặt. */
  const AUTO_RE = /^HAK_TuDong_\d{8}_\d{4}\.zip$/, AUTO_EVERY = 20 * 3600e3, AUTO_KEEPS = [5, 10, 20, 30];
  const auto = { h: null, perm: 'none', busy: false, warned: false };   // perm: none | granted | prompt | denied | unsupported
  const autoCfg = () => Object.assign({ on: false, keep: 10, last: null }, HAK.Store.get(AUTO_KEY, null) || {});
  const autoSet = (patch) => HAK.Store.set(AUTO_KEY, Object.assign(autoCfg(), patch));
  async function autoDir() {
    if (auto.h) return auto.h;
    try { auto.h = (await HAK.DB.get('handles', AUTO_DIR)) || null; } catch (e) { auto.h = null; }
    return auto.h;
  }
  async function autoPerm(ask) {
    if (!dirPickerSupported()) return (auto.perm = 'unsupported');
    const h = await autoDir(); if (!h) return (auto.perm = 'none');
    const o = { mode: 'readwrite' };
    try {
      let p = h.queryPermission ? await h.queryPermission(o) : 'granted';
      if (p !== 'granted' && ask && h.requestPermission) p = await h.requestPermission(o);
      return (auto.perm = p);
    } catch (e) { return (auto.perm = 'prompt'); }
  }
  async function autoPick() {
    const h = await root.showDirectoryPicker({ id: 'hak-auto-backup', mode: 'readwrite' });
    auto.h = h;
    try { await HAK.DB.put('handles', h, AUTO_DIR); } catch (e) { console.warn('Không lưu được thư mục tự sao lưu:', e); }
    auto.perm = 'granted';
    return h;
  }
  async function autoForget() { auto.h = null; auto.perm = 'none'; try { await HAK.DB.del('handles', AUTO_DIR); } catch (e) { /* bỏ qua */ } }
  async function autoList() {
    const h = await autoDir(), out = [];
    if (!h || auto.perm !== 'granted' || !h.entries) return out;
    for await (const [name, e] of h.entries()) {
      if (e.kind === 'file' && AUTO_RE.test(name)) { try { const f = await e.getFile(); out.push({ name, size: f.size, at: f.lastModified }); } catch (x) { /* bỏ qua */ } }
    }
    return out.sort((a, b) => (a.name < b.name ? 1 : a.name > b.name ? -1 : 0));   // tên có ngày giờ → mới nhất trước
  }
  const autoDue = (c) => c.on && !(c.last && c.last.ok && Date.now() - c.last.at < AUTO_EVERY);
  /** Ghi 1 bản vào thư mục. opts.ask = được hỏi quyền (đang trong thao tác bấm của người dùng); opts.force = chạy dù chưa bật / chưa tới hạn. */
  async function autoRun(opts) {
    opts = opts || {};
    const c = autoCfg();
    if (auto.busy || (!opts.force && !autoDue(c))) return { skipped: true };
    const h = await autoDir(); if (!h) return { err: 'nodir' };
    if ((await autoPerm(opts.ask)) !== 'granted') { notify(); return { err: 'perm' }; }
    auto.busy = true;
    try {
      const f = await buildFull(), zip = await zipParts(f.parts);
      if (!zip) throw new Error('Thiếu thư viện nén ZIP.');
      const name = 'HAK_TuDong_' + stamp(true) + '.zip';
      const fh = await h.getFileHandle(name, { create: true }), w = await fh.createWritable();
      await w.write(zip); await w.close();
      const chk = await (await h.getFileHandle(name)).getFile();
      if (chk.size !== zip.size) throw new Error('File ghi ra không đủ (' + chk.size + ' / ' + zip.size + ' byte).');
      const keep = Math.max(1, +c.keep || 10); let removed = 0;
      for (const x of (await autoList()).slice(keep)) { try { await h.removeEntry(x.name); removed++; } catch (e) { console.warn('Không xóa được bản cũ', x.name, e); } }
      const now = Date.now();
      autoSet({ last: { at: now, ok: true, name, size: zip.size, archive: f.archive } });
      HAK.Store.set(LAST_KEY, now);
      auto.warned = false;
      return { name, size: zip.size, removed, archive: f.archive };
    } catch (e) {
      console.error('Tự sao lưu lỗi:', e);
      autoSet({ last: Object.assign({}, autoCfg().last, { failAt: Date.now(), ok: false, err: e.message || String(e) }) });
      return { err: 'fail', msg: e.message || String(e) };
    } finally { auto.busy = false; notify(); }
  }
  /** Báo các trang đang mở vẽ lại (Tổng quan, Cài đặt). */
  function notify() {
    if (location.hash === '#/home' || !location.hash) { if (HAK.Dashboard && HAK.Dashboard.render) HAK.Dashboard.render(); }
    const g = document.getElementById('tab-general'); if (g && g.classList.contains('active')) render();
  }
  async function autoTick() {
    const c = autoCfg(); if (!autoDue(c) || auto.busy) return;
    const before = auto.perm, r = await autoRun({});
    if (r.name) toast('🔁 Đã tự sao lưu vào thư mục: ' + r.name + ' (' + fmtBytes(r.size) + ', ' + r.archive + ' hồ sơ' + (r.removed ? ', xóa ' + r.removed + ' bản cũ' : '') + ').', 'success');
    else if (r.err === 'fail' && !auto.warned) { auto.warned = true; toast('⚠ Tự sao lưu lỗi: ' + r.msg + ' — vào Cài đặt → Chung → Tự sao lưu để kiểm tra.', 'error'); }
    else if (r.err === 'perm' && before !== auto.perm) notify();
  }
  /** Trạng thái tự sao lưu (đồng bộ, theo lần kiểm tra quyền gần nhất) — cho cảnh báo ở Tổng quan. */
  function autoStatus() { const c = autoCfg(); return { on: c.on, due: autoDue(c), perm: auto.perm, dir: auto.h ? auto.h.name : '', last: c.last, keep: c.keep, busy: auto.busy }; }
  /** Bấm "Cho phép & sao lưu ngay" (Tổng quan / Cài đặt) — trong thao tác bấm nên trình duyệt cho hỏi quyền. */
  async function autoAllowAndRun(btn) {
    if (btn) btn.disabled = true;
    const r = await autoRun({ ask: true, force: true });
    if (r.name) toast('🔁 Đã sao lưu vào thư mục: ' + r.name + ' (' + fmtBytes(r.size) + (r.removed ? ', xóa ' + r.removed + ' bản cũ' : '') + ').', 'success');
    else if (r.err === 'perm') toast('Trình duyệt chưa cho phép ghi vào thư mục — bấm lại và chọn "Cho phép" (Allow).', 'warning');
    else if (r.err === 'nodir') toast('Chưa chọn thư mục tự sao lưu (Cài đặt → Chung).', 'warning');
    else if (r.err === 'fail') toast('Không sao lưu được: ' + r.msg, 'error');
    if (btn) btn.disabled = false;
    return r;
  }
  /** Khối "🔁 Tự sao lưu" trong thẻ Bộ nhớ & sao lưu. */
  async function autoHtml() {
    if (!dirPickerSupported()) return '<hr><div class="fw-semibold mb-1">🔁 Tự sao lưu vào thư mục</div><div class="small text-warning">Trình duyệt này không hỗ trợ ghi vào thư mục — dùng Chrome hoặc Edge để bật tự sao lưu. Vẫn sao lưu tay được bằng nút ⬇ ở trên.</div>';
    const c = autoCfg(), h = await autoDir(), perm = await autoPerm(false), files = await autoList();
    const L = c.last, okT = (v, t) => '<span class="' + (v ? 'text-success' : 'text-warning') + '">' + t + '</span>';
    const permTxt = !h ? '—' : perm === 'granted' ? okT(true, 'Đã cho phép') : okT(false, 'Chờ cho phép (trình duyệt hỏi lại sau khi mở lại) — bấm ▶ Sao lưu vào thư mục ngay');
    const lastTxt = !L ? okT(false, 'Chưa có') : (L.ok === false ? '<span class="text-danger">✗ Lỗi ' + esc(fmtDT(L.failAt || L.at)) + ': ' + esc(L.err || '') + '</span>' + (L.name ? ' · bản tốt gần nhất: ' + esc(fmtDT(L.at)) : '')
      : okT(true, '✓ ' + esc(fmtDT(L.at))) + ' — <span class="mono">' + esc(L.name || '') + '</span> (' + fmtBytes(L.size) + ')');
    return '<hr><div class="fw-semibold mb-1">🔁 Tự sao lưu vào thư mục <span class="muted small fw-normal">— mỗi ngày 1 bản .zip, giữ ' + c.keep + ' bản mới nhất</span></div>' +
      '<ul class="sum-list mb-2">' +
      '<li><span>Thư mục</span><b>' + (h ? '📁 ' + esc(h.name) : okT(false, 'Chưa chọn')) + '</b></li>' +
      '<li><span>Trạng thái</span><b>' + (c.on ? okT(true, 'Đang bật') : okT(false, 'Đang tắt')) + '</b></li>' +
      '<li><span>Quyền ghi thư mục</span><b>' + permTxt + '</b></li>' +
      '<li><span>Lần tự sao lưu gần nhất</span><b>' + lastTxt + '</b></li></ul>' +
      '<div class="d-flex flex-wrap align-items-center gap-2">' +
      '<button class="btn btn-outline-secondary" id="abPick" type="button">📁 ' + (h ? 'Đổi thư mục…' : 'Chọn thư mục tự sao lưu…') + '</button>' +
      '<div class="form-check form-switch mb-0"><input class="form-check-input" type="checkbox" role="switch" id="abOn"' + (c.on ? ' checked' : '') + (h ? '' : ' disabled') + '><label class="form-check-label" for="abOn">Tự sao lưu mỗi ngày</label></div>' +
      '<label class="small d-flex align-items-center gap-1 mb-0">Giữ <select class="form-select form-select-sm w-auto" id="abKeep">' + AUTO_KEEPS.map((n) => '<option value="' + n + '"' + (+c.keep === n ? ' selected' : '') + '>' + n + '</option>').join('') + '</select> bản</label>' +
      '<button class="btn btn-primary" id="abRun" type="button"' + (h ? '' : ' disabled') + '>▶ Sao lưu vào thư mục ngay</button>' +
      (h ? '<button class="btn btn-outline-secondary btn-sm" id="abForget" type="button">✕ Bỏ thư mục</button>' : '') + '</div>' +
      (files.length ? '<div class="table-responsive mt-2"><table class="table table-sm mb-0"><thead><tr><th>Bản trong thư mục (' + files.length + ')</th><th class="text-end">Dung lượng</th><th class="text-end">Ghi lúc</th></tr></thead><tbody>' +
        files.map((x) => '<tr><td class="mono small">' + esc(x.name) + '</td><td class="text-end small">' + fmtBytes(x.size) + '</td><td class="text-end small">' + esc(fmtDT(x.at)) + '</td></tr>').join('') + '</tbody></table></div>' : '') +
      '<div class="form-text mt-2">App ghi <span class="mono">HAK_TuDong_&lt;ngày&gt;_&lt;giờ&gt;.zip</span> (đủ như ⬇ Sao lưu toàn bộ) lần đầu mở app mỗi ngày, đọc lại kiểm tra, rồi xóa các bản <span class="mono">HAK_TuDong_*.zip</span> cũ hơn số bản giữ — không đụng file khác trong thư mục. ' +
      'Nên chọn thư mục <b>đồng bộ Google Drive / OneDrive</b> hoặc ổ khác ổ C để có bản ngoài máy. Chrome/Edge thường hỏi lại quyền ghi sau mỗi lần mở trình duyệt → bấm <b>Cho phép &amp; sao lưu</b> ở Tổng quan (chọn "Cho phép mỗi lần truy cập" nếu trình duyệt có).</div>';
  }
  function bindAuto() {
    const pick = $('#abPick'); if (!pick) return;
    pick.addEventListener('click', async () => {
      try { await autoPick(); const c = autoCfg(); if (!c.on) autoSet({ on: true }); await render(); toast('Đã chọn thư mục tự sao lưu và bật tự sao lưu mỗi ngày. Bấm ▶ để tạo bản đầu tiên.', 'success'); }
      catch (e) { if (!(e && e.name === 'AbortError')) { console.error(e); toast('Không chọn được thư mục: ' + (e.message || e), 'error'); } }
    });
    $('#abOn').addEventListener('change', (e) => { autoSet({ on: e.target.checked }); render(); });
    $('#abKeep').addEventListener('change', (e) => { autoSet({ keep: +e.target.value }); render(); });
    $('#abRun').addEventListener('click', async (e) => { const b = e.currentTarget; HAK.UI.Loading.show('Đang sao lưu vào thư mục…'); try { await autoAllowAndRun(b); } finally { HAK.UI.Loading.hide(); } render(); });
    const fg = $('#abForget');
    if (fg) fg.addEventListener('click', (e) => HAK.UI.confirmClick(e.currentTarget, async () => { await autoForget(); autoSet({ on: false }); render(); toast('Đã bỏ thư mục tự sao lưu (các file đã ghi vẫn còn trong thư mục).', 'info'); }, 'Bấm lần nữa'));
  }

  /* ---------------- v2.7.5 🩺 Sức khỏe dữ liệu (Tổng quan) ----------------
   * Mỗi mục: lvl 0 = tốt, 1 = cần chú ý, 2 = nguy hiểm. Chỉ đọc. */
  function lsSize() { let b = 0; try { HAK.Store.keys().forEach((k) => { const v = root.localStorage.getItem(k); if (v) b += (k.length + v.length) * 2; }); } catch (e) { /* bị chặn */ } return b; }
  async function health() {
    const st = await HAK.DB.status(), ls = lsSize();
    let nArch = 0; try { nArch = HAK.Archive ? (await HAK.Archive.list()).length : 0; } catch (e) { /* bỏ qua */ }
    const soft = (HAK.Archive && HAK.Archive.SOFT_WARN) || 1500;
    await autoPerm(false);
    const a = autoStatus(), last = HAK.Store.get(LAST_KEY, 0), days = last ? Math.floor((Date.now() - last) / 864e5) : null;
    const pct = st.quota ? st.usage / st.quota * 100 : 0, lsPct = ls / (5 * 1048576) * 100;
    const autoOk = a.on && a.dir && a.perm === 'granted' && !(a.last && a.last.ok === false);   // tự sao lưu chạy tốt → "chưa cam kết giữ dữ liệu" không còn đáng lo
    const items = [
      { k: 'store', label: 'Bộ nhớ trình duyệt', val: st.backend !== 'idb' ? 'RAM tạm' : fmtBytes(st.usage) + (st.quota ? ' (' + pct.toFixed(1).replace('.', ',') + '%)' : ''),
        lvl: st.backend !== 'idb' || pct > 80 ? 2 : pct > 50 || (st.persisted === false && !autoOk) ? 1 : 0,
        hint: st.backend !== 'idb' ? 'Dữ liệu mất khi đóng trang' : st.persisted === false ? 'Trình duyệt chưa cam kết giữ dữ liệu' + (autoOk ? ' — đã có tự sao lưu' : ' → bật Tự sao lưu') : 'Bền' },
      { k: 'ls', label: 'Cài đặt (localStorage)', val: fmtBytes(ls) + ' / 5 MB', lvl: lsPct > 85 ? 2 : lsPct > 60 ? 1 : 0, hint: lsPct > 60 ? 'Gần đầy — bớt mẫu Word tải lên' : 'Còn rộng' },
      { k: 'arch', label: 'Lưu trữ', val: nArch.toLocaleString('vi-VN') + ' hồ sơ', lvl: nArch > soft ? 1 : 0, hint: nArch > soft ? 'Nên 📦 Xuất & dọn hồ sơ cũ' : 'Không tự xóa' },
      { k: 'bk', label: 'Sao lưu toàn bộ gần nhất', val: last ? (days === 0 ? 'Hôm nay' : days + ' ngày trước') : 'Chưa có', lvl: !last || days > 14 ? 2 : days > 7 ? 1 : 0, hint: last ? fmtDT(last) : 'Bấm ⬇ Sao lưu toàn bộ' },
      { k: 'auto', label: 'Tự sao lưu', val: a.perm === 'unsupported' ? 'Không hỗ trợ' : !a.dir ? 'Chưa bật' : !a.on ? 'Đang tắt' : a.last && a.last.ok === false ? 'Lỗi' : a.perm !== 'granted' ? 'Chờ cho phép' : 'Đang bật',
        lvl: a.on && a.dir && a.last && a.last.ok === false ? 2 : a.on && a.dir && a.perm === 'granted' ? 0 : 1,
        hint: a.dir ? '📁 ' + a.dir + ' · giữ ' + a.keep + ' bản' : 'Cài đặt → Chung → Tự sao lưu' }
    ];
    return { items, lvl: Math.max.apply(null, items.map((x) => x.lvl)), auto: a };
  }

  /* ---------------- Thẻ trạng thái ở Cài đặt ---------------- */
  async function render() {
    const box = $('#backupBody'); if (!box) return;
    const st = await HAK.DB.status();
    const lsBytes = lsSize();
    let nArch = 0; try { nArch = HAK.Archive ? (await HAK.Archive.list()).length : 0; } catch (e) { /* bỏ qua */ }
    let nBat = 0; try { nBat = (await HAK.DB.getAll('batches')).length; } catch (e) { /* bỏ qua */ }
    const nIss = HAK.Issued ? HAK.Issued.list.length : 0;
    const last = HAK.Store.get(LAST_KEY, 0);
    const dirOk = dirPickerSupported();
    const dir = dirOk ? await getSavedDir() : null;
    const ok = (v, t) => '<span class="' + (v ? 'text-success' : 'text-warning') + '">' + t + '</span>';
    const pct = st.quota ? Math.max(0.01, st.usage / st.quota * 100) : 0;
    box.innerHTML =
      '<ul class="sum-list mb-3">' +
      '<li><span>Nơi lưu dữ liệu</span><b>' + (st.backend === 'idb' ? ok(true, 'IndexedDB (bền)') : ok(false, 'RAM tạm — mất khi đóng trang')) + '</b></li>' +
      '<li><span>Trình duyệt cam kết giữ dữ liệu</span><b>' + (st.persisted === null ? '—' : ok(st.persisted, st.persisted ? 'Có' : 'Chưa (có thể bị xóa khi thiếu dung lượng)')) + '</b></li>' +
      '<li><span>Dung lượng đang dùng</span><b>' + fmtBytes(st.usage) + (st.quota ? ' / ' + fmtBytes(st.quota) + ' (' + pct.toFixed(2).replace('.', ',') + '%)' : '') + '</b></li>' +
      '<li><span>Cài đặt &amp; danh sách xe (localStorage)</span><b>' + fmtBytes(lsBytes) + ' / ~5 MB</b></li>' +
      '<li><span>Hồ sơ trong Lưu trữ</span><b>' + nArch + '</b></li>' +
      '<li><span>Đợt Excel đã lưu (mở lại app vẫn còn)</span><b>' + nBat + '</b></li>' +
      '<li><span>Chứng từ đã lập (nhật ký)</span><b>' + nIss + '</b></li>' +
      '<li><span>Sao lưu toàn bộ gần nhất</span><b>' + (last ? fmtDT(last) : ok(false, 'Chưa sao lưu lần nào')) + '</b></li>' +
      (dirOk ? '<li><span>Thư mục sao lưu mặc định</span><b>' + (dir ? '📁 ' + esc(dir.name) : ok(false, 'Chưa chọn')) + '</b></li>' : '') +
      '</ul>' +
      '<div class="d-flex flex-wrap gap-2">' +
      '<button class="btn btn-primary" id="bkSave" type="button">⬇ Sao lưu toàn bộ (.zip)</button>' +
      '<label class="btn btn-outline-primary mb-0 admin-only">⬆ Khôi phục toàn bộ<input type="file" id="bkRestore" accept=".zip,.json,application/zip,application/json" hidden></label>' +
      (dirOk ? '<button class="btn btn-outline-secondary" id="bkPickDir" type="button">📁 ' + (dir ? 'Đổi thư mục…' : 'Chọn thư mục mặc định…') + '</button>' : '') +
      (dirOk && dir ? '<button class="btn btn-outline-secondary" id="bkClearDir" type="button">✕ Bỏ chọn thư mục</button>' : '') +
      (st.persisted === false ? '<button class="btn btn-outline-secondary" id="bkPersist" type="button">Yêu cầu trình duyệt giữ dữ liệu</button>' : '') + '</div>' +
      '<div class="form-check mt-2 admin-only"><input class="form-check-input" type="checkbox" id="bkKeepAuth" checked><label class="form-check-label small" for="bkKeepAuth"><b>Giữ tài khoản đang dùng trên máy này</b> khi khôi phục (không lấy tài khoản / mật khẩu trong file sao lưu). ' +
      'Bỏ tick khi chuyển sang máy mới và muốn mọi người đăng nhập bằng mật khẩu cũ.</label></div>' +
      '<div class="form-text mt-2">Nên sao lưu định kỳ và trước khi đổi máy / trình duyệt hoặc xóa dữ liệu duyệt web. File sao lưu là <b>.zip</b> (nén, từ v2.7.5); Khôi phục nhận cả .zip và file .json của bản cũ. Khôi phục sẽ ghi đè cài đặt cùng tên và gộp hồ sơ Lưu trữ (hồ sơ mới hơn được giữ).' +
      (dirOk ? ' Đã chọn thư mục mặc định thì hộp thoại "Lưu file" khi bấm Sao lưu sẽ tự mở sẵn tại thư mục đó (trình duyệt chỉ cho biết tên thư mục, không cho biết đường dẫn đầy đủ). Chỉ hỗ trợ trên Chrome/Edge.' : '') + '</div>' +
      await autoHtml();
    bindAuto();
    const b1 = $('#bkSave'), b2 = $('#bkRestore'), b3 = $('#bkPersist'), b4 = $('#bkPickDir'), b5 = $('#bkClearDir');
    b1.addEventListener('click', async () => {
      b1.disabled = true;
      try { const r = await saveAll(); toast('Đã sao lưu: ' + r.name + (r.size ? ' · ' + fmtBytes(r.size) : '') + ' (' + r.keys + ' mục cài đặt, ' + r.archive + ' hồ sơ, ' + r.batches + ' đợt Excel, ' + r.issued + ' chứng từ đã lập).', 'success'); render(); }
      catch (e) {
        if (e && e.name === 'AbortError') { b1.disabled = false; return; }   // người dùng bấm Hủy trong hộp thoại lưu — không phải lỗi
        console.error(e); toast('Không sao lưu được: ' + (e.message || e), 'error'); b1.disabled = false;
      }
    });
    if (b4) b4.addEventListener('click', async () => {
      try { await pickDefaultDir(); render(); }
      catch (e) { if (!(e && e.name === 'AbortError')) { console.error(e); toast('Không chọn được thư mục: ' + (e.message || e), 'error'); } }
    });
    if (b5) b5.addEventListener('click', async () => { await setSavedDir(null); toast('Đã bỏ chọn thư mục mặc định.', 'info'); render(); });
    b2.addEventListener('change', async (e) => {
      const f = e.target.files[0]; e.target.value = ''; if (!f) return;
      HAK.UI.Loading.show('Đang khôi phục…');
      try {
        const ka = $('#bkKeepAuth'), r = await restoreFile(f, { keepAuth: !ka || ka.checked });
        toast('Khôi phục xong' + (r.legacy ? ' (file riêng Lưu trữ)' : ': ' + r.keys + ' mục cài đặt' + (r.keepAuth ? ' (giữ tài khoản đang dùng)' : ' (lấy cả tài khoản trong file)')) + ', hồ sơ thêm ' + r.added + ', cập nhật ' + r.updated + (r.skipped ? ', bỏ qua ' + r.skipped : '') + (r.legacy ? '' : ', ' + r.batches + ' đợt Excel, ' + r.issued + ' chứng từ') + '. Trang sẽ tải lại…', 'success');
        setTimeout(() => root.location.reload(), 1500);
      } catch (err) { console.error(err); toast(err.message || String(err), 'error'); }
      finally { HAK.UI.Loading.hide(); }
    });
    if (b3) b3.addEventListener('click', async () => { toast((await HAK.DB.requestPersist()) ? 'Trình duyệt đã đồng ý giữ dữ liệu.' : 'Trình duyệt chưa đồng ý (thường tự đồng ý khi bạn dùng app đều đặn hoặc thêm vào trang chủ).', 'info'); render(); });
  }

  /* ---------------- Khởi tạo ---------------- */
  let lastWarn = 0;
  function init() {
    // Không lưu được (localStorage đầy/bị chặn và không có IndexedDB) → báo, tối đa 1 lần / 10 giây
    HAK.Store.onError = () => {
      if (Date.now() - lastWarn < 10000) return; lastWarn = Date.now();
      toast('⚠ Không lưu được dữ liệu vào bộ nhớ trình duyệt (đầy hoặc bị chặn) — thay đổi chỉ tồn tại đến khi đóng trang. Hãy vào Cài đặt → Chung → Sao lưu toàn bộ.', 'error');
    };
    if (boot.restored) toast('Đã khôi phục ' + boot.restored + ' mục cài đặt từ bản sao dự phòng của trình duyệt.', 'info');
    // Lưu nốt form đang gõ dở khi đóng / ẩn trang
    const flush = () => root.dispatchEvent(new Event('hak:flush'));
    root.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
    const tab = document.querySelector('[data-bs-target="#tab-general"]');
    if (tab) tab.addEventListener('shown.bs.tab', render);
    render(); renderPack();
    // v2.7.5 tự sao lưu: kiểm tra sau ~20 giây (không làm chậm lúc mở) rồi mỗi 30 phút; nút "Cho phép & sao lưu" ở Tổng quan
    document.addEventListener('click', (e) => { const b = e.target.closest('[data-autobk-allow]'); if (b) { e.preventDefault(); autoAllowAndRun(b); } });
    autoPerm(false).then(() => { if (autoCfg().on) notify(); }).catch(() => { /* bỏ qua */ });
    setTimeout(() => { autoTick(); setInterval(autoTick, 30 * 60e3); }, 20e3);
  }

  HAK.Backup = { boot, init, render, saveAll, restoreFile, collect, dirPickerSupported, getSavedDir, pickDefaultDir, setSavedDir, saveBackupBlob,
    readJson, buildFull, zipParts, health, autoStatus, autoRun, autoTick, autoAllowAndRun, autoList, autoPick,
    packBuild, packExport, packRead, packSummaryHtml, packApply, packMsg };
})(window);
