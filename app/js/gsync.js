/**
 * gsync.js — ☁ Đồng bộ 1 chiều báo cáo XUẤT HÀNG (2 sheet NL_DH_XB · NL_PC_XH) lên Google Sheet (v2.5 Phase 4).
 *
 * Cách chạy: app mở từ file:// nên không đăng nhập Google được → dùng Apps Script Web App gắn vào Sheet (Code.gs bên dưới,
 * app sinh sẵn kèm mã bí mật). App POST JSON (Content-Type text/plain → không preflight CORS) → script kiểm mã → ghi Sheet.
 * Quy tắc ghi (Thủy chốt 27/09/2026 — "thay cả lô", bấm nút khi muốn):
 *   - Chỉ gửi lô CÓ hồ sơ cân trong Lưu trữ (lô chỉ có trong Danh mục không gửi → dữ liệu cũ trên Sheet không bị đụng).
 *   - NL_PC_XH: xóa MỌI dòng của lô được gửi (khớp "Mã lô (app)" hoặc SỐ TKHQ) rồi ghi lại → sửa xe trả về / BKLS không bị trùng, sót.
 *   - NL_DH_XB: cập nhật tại chỗ dòng của lô (giữ STT cũ), lô mới thêm cuối.
 *   - Cột được tìm theo TÊN tiêu đề (dời cột trên Sheet vẫn đúng); thiếu cột thì script tự thêm bên phải; cột người dùng tự thêm giữ nguyên
 *     ở các dòng không bị ghi đè.
 * v2.6.3 (Thủy chốt 27/09/2026 — "cài cho nhiều công ty, mỗi công ty 1 nguồn dữ liệu đồng bộ lên Google Sheet", 2a = mỗi công ty 1 FILE Sheet):
 *   cấu hình THEO TỪNG CÔNG TY ở 'hak.gsync.v2' = { cos: { <companyId>: { url, token, last } } }. Bản cũ 'hak.gsync.v1' (1 Sheet chung)
 *   tự chuyển thành cấu hình của công ty HAK (giữ nguyên v1 làm bản lưu). Đồng bộ: mỗi lô đi về Sheet của công ty BÊN XUẤT của lô;
 *   công ty chưa cài Sheet → bỏ qua + báo rõ (không đổ nhầm sang Sheet công ty khác). Nằm trong Sao lưu toàn bộ / gói cấu hình.
 */
(function (root) {
  'use strict';
  const HAK = (root.HAK = root.HAK || {});
  const KEY_V1 = 'hak.gsync.v1', KEY = 'hak.gsync.v2';
  const BATCH_TRIPS = 4000;          // mỗi lần gửi ≤ ~4.000 phiếu (≈ 1,5 MB) để script chạy xa giới hạn 6 phút
  const $ = (s) => document.querySelector(s);
  const esc = (s) => HAK.UI.esc(s);

  /** Toàn bộ cấu hình { cos: {cid: {url, token, last}} }; lần đầu chạy bản v2.6.3: chuyển cấu hình 1 Sheet cũ sang công ty HAK. */
  function all() {
    let d = HAK.Store.get(KEY, null);
    if (!d || typeof d.cos !== 'object') { d = { cos: {} }; HAK.Store.set(KEY, d); }
    // Chuyển 1 lần: chưa cấu hình công ty nào + có cấu hình 1 Sheet cũ (v1) → gán cho HAK (Thủy xác nhận Sheet XUATHANG_DN hiện tại là của HAK)
    if (!d.migV1 && !Object.keys(d.cos).length) {
      const old = HAK.Store.get(KEY_V1, null);
      if (old && (old.url || old.token)) { d.cos.hak = { url: old.url || '', token: old.token || '', last: old.last || null }; d.migV1 = true; HAK.Store.set(KEY, d); }
    }
    return d;
  }
  const curCo = () => (HAK.Auth && HAK.Auth.company ? HAK.Auth.company() : '') || 'hak';
  const cfg = (cid) => Object.assign({ url: '', token: '', last: null }, all().cos[cid || curCo()] || {});
  const saveCfg = (cid, c) => { const d = all(); d.cos[cid] = { url: c.url || '', token: c.token || '', last: c.last || null }; d.migV1 = true; HAK.Store.set(KEY, d); };
  const configured = (cid) => { const c = cfg(cid); return !!(c.url && c.token); };
  const coName = (cid) => { const c = ((HAK.Config && HAK.Config.data.companies) || []).find((x) => x.id === cid); return c ? (c.short || c.name) : cid; };
  function genToken() {
    const a = new Uint8Array(18);
    (root.crypto || root.msCrypto).getRandomValues(a);
    return Array.from(a, (b) => 'abcdefghijkmnpqrstuvwxyz23456789'[b % 32]).join('');
  }
  const validUrl = (u) => /^https:\/\/script\.google(usercontent)?\.com\/.+/.test(String(u || '').trim());

  /* ---------------------------------------------------------------
   * Mã Apps Script (dán vào Sheet → Tiện ích mở rộng → Apps Script). Không dùng dấu ` trong mã.
   * ------------------------------------------------------------- */
  function codeGs(token) {
    return [
      '/**',
      ' * HAK — QUẢN LÝ XUẤT HÀNG: nhận báo cáo Xuất hàng từ app (đồng bộ 1 chiều app → Sheet).',
      ' * Cài 1 lần: Tiện ích mở rộng → Apps Script → xóa hết mã có sẵn → dán toàn bộ mã này → Lưu (Ctrl+S)',
      ' *   → Triển khai → Tùy chọn triển khai mới → (bánh răng) Ứng dụng web',
      ' *   → Thực thi với tư cách: TÔI · Người có quyền truy cập: BẤT KỲ AI → Triển khai → Cấp quyền truy cập',
      ' *   → sao chép "URL ứng dụng web" → dán vào app: Cài đặt → Chung → Đồng bộ Google Sheet.',
      ' * Mã bí mật bên dưới phải TRÙNG với ô "Mã bí mật" trong app. Đổi mã → dán lại mã mới rồi Triển khai → Quản lý → Sửa → Phiên bản mới.',
      ' */',
      'var SECRET = \'' + String(token || '').replace(/[^a-z0-9]/gi, '') + '\';',
      'var VERSION = 1;',
      'var MODE = { NL_DH_XB: \'upsert\', NL_PC_XH: \'replace\' };   // sheet nhận dữ liệu và cách ghi',
      '',
      'function doGet() { return out_({ ok: true, app: \'HAK-XUATHANG\', version: VERSION }); }',
      '',
      'function doPost(e) {',
      '  var req;',
      '  try { req = JSON.parse(e.postData.contents); } catch (x) { return out_({ ok: false, error: \'Dữ liệu gửi lên không đọc được.\' }); }',
      '  if (!req || !SECRET || req.token !== SECRET) return out_({ ok: false, error: \'Sai mã bí mật.\' });',
      '  var ss = SpreadsheetApp.getActiveSpreadsheet();',
      '  if (req.action === \'ping\') return out_({ ok: true, version: VERSION, file: ss.getName(), sheets: ss.getSheets().map(function (s) { return s.getName(); }) });',
      '  if (req.action !== \'push\') return out_({ ok: false, error: \'Lệnh không hợp lệ.\' });',
      '  var lock = LockService.getScriptLock();',
      '  if (!lock.tryLock(30000)) return out_({ ok: false, error: \'Sheet đang bận (một lần đồng bộ khác) — thử lại sau ít phút.\' });',
      '  try {',
      '    var keys = {}; (req.keys || []).forEach(function (k) { keys[String(k)] = true; });',
      '    var result = {};',
      '    (req.sheets || []).forEach(function (sh) { if (MODE[sh.name]) result[sh.name] = write_(ss, sh, keys, MODE[sh.name]); });',
      '    SpreadsheetApp.flush();',
      '    return out_({ ok: true, result: result });',
      '  } catch (err) {',
      '    return out_({ ok: false, error: String(err && err.message || err) });',
      '  } finally { lock.releaseLock(); }',
      '}',
      '',
      'function write_(ss, sh, keys, mode) {',
      '  var sheet = ss.getSheetByName(sh.name) || ss.insertSheet(sh.name);',
      '  var lastCol = sheet.getLastColumn(), header = lastCol ? sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h).trim(); }) : [];',
      '  var added = [];',
      '  var map = sh.cols.map(function (c) {',
      '    var i = header.indexOf(c.h);',
      '    if (i < 0) { header.push(c.h); i = header.length - 1; added.push(i); }',
      '    return i;',
      '  });',
      '  var width = header.length;',
      '  if (added.length || !lastCol) {',
      '    sheet.getRange(1, 1, 1, width).setValues([header]);',
      '    added.forEach(function (i) { sheet.getRange(1, i + 1).setFontWeight(\'bold\').setBackground(\'#d9d9d9\'); });',
      '  }',
      '  var keyIdx = header.indexOf(sh.keyCol), tkIdx = header.indexOf(\'SỐ TKHQ\'), sttIdx = header.indexOf(\'STT\');',
      '  var lastRow = sheet.getLastRow();',
      '  var data = lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, width).getValues() : [];',
      '  var oldCount = data.length;',
      '  function keyOf(row) {',
      '    var k = keyIdx >= 0 ? String(row[keyIdx]).trim() : \'\';',
      '    if (k && keys[k]) return k;',
      '    var t = tkIdx >= 0 ? row[tkIdx] : \'\';',
      '    t = typeof t === \'number\' ? String(Math.round(t)) : String(t).replace(/\\s+/g, \'\');',
      '    return t && keys[t] ? t : \'\';',
      '  }',
      '  function conv(v) {',
      '    if (v === null || v === undefined) return \'\';',
      '    if (typeof v === \'string\') { var m = v.match(/^(\\d{4})-(\\d{2})-(\\d{2})T00:00:00(\\.000)?Z$/); if (m) return new Date(+m[1], +m[2] - 1, +m[3]); }',
      '    return v;',
      '  }',
      '  function toRow(r, base) {',
      '    var row = base ? base.slice() : new Array(width).fill(\'\');',
      '    while (row.length < width) row.push(\'\');',
      '    map.forEach(function (ci, j) { if (!(base && ci === sttIdx)) row[ci] = conv(r[j]); });',
      '    return row;',
      '  }',
      '  var stat = { removed: 0, updated: 0, added: 0 };',
      '  var incoming = sh.rows || [], keyPos = sh.cols.map(function (c) { return c.h; }).indexOf(sh.keyCol);',
      '  if (mode === \'replace\') {',
      '    var keep = data.filter(function (row) { return !keyOf(row); });',
      '    stat.removed = data.length - keep.length;',
      '    incoming.forEach(function (r) { keep.push(toRow(r)); stat.added++; });',
      '    data = keep;',
      '  } else {',
      '    var at = {}; data.forEach(function (row, i) { var k = keyOf(row); if (k && at[k] === undefined) at[k] = i; });',
      '    var maxStt = 0; if (sttIdx >= 0) data.forEach(function (row) { var n = +row[sttIdx]; if (n > maxStt) maxStt = n; });',
      '    incoming.forEach(function (r) {',
      '      var k = String(r[keyPos]), tk = r[sh.cols.map(function (c) { return c.h; }).indexOf(\'SỐ TKHQ\')];',
      '      var i = at[k] !== undefined ? at[k] : (tk ? at[String(tk)] : undefined);',
      '      if (i !== undefined) { data[i] = toRow(r, data[i]); stat.updated++; }',
      '      else { var row = toRow(r); if (sttIdx >= 0) row[sttIdx] = ++maxStt; data.push(row); stat.added++; }',
      '    });',
      '  }',
      '  if (data.length) sheet.getRange(2, 1, data.length, width).setValues(data);',
      '  if (oldCount > data.length) sheet.getRange(2 + data.length, 1, oldCount - data.length, width).clearContent();',
      '  if (data.length) sh.cols.forEach(function (c, j) { if (c.n) sheet.getRange(2, map[j] + 1, data.length, 1).setNumberFormat(c.n); });',
      '  stat.total = data.length;',
      '  return stat;',
      '}',
      '',
      'function out_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }',
      ''
    ].join('\n');
  }

  /* ---------------------------------------------------------------
   * Gửi
   * ------------------------------------------------------------- */
  async function call(payload, cid) {
    const c = cfg(cid);
    if (!validUrl(c.url)) throw new Error('Chưa có địa chỉ Web App hợp lệ cho ' + coName(cid || curCo()) + ' (bắt đầu bằng https://script.google.com/…) — vào Cài đặt → Chung → ☁ Đồng bộ Google Sheet.');
    let res;
    try {
      res = await fetch(c.url.trim(), { method: 'POST', body: JSON.stringify(Object.assign({ token: c.token }, payload)), redirect: 'follow' });
    } catch (e) {
      throw new Error('Không kết nối được Google (máy đang offline, mạng chặn script.google.com, hoặc Web App chưa để "Bất kỳ ai"). Chi tiết: ' + (e.message || e));
    }
    const txt = await res.text();
    let j = null; try { j = JSON.parse(txt); } catch (e) { /* trang HTML lỗi */ }
    if (!j) throw new Error(res.status === 404 ? 'Không tìm thấy Web App (URL sai hoặc đã xóa bản triển khai).' : /accounts\.google|signin/i.test(txt) ? 'Web App đang yêu cầu đăng nhập — sửa "Người có quyền truy cập" thành "Bất kỳ ai" rồi triển khai lại.' : 'Google trả về dữ liệu lạ (mã ' + res.status + ').');
    if (!j.ok) throw new Error(j.error || 'Google Sheet báo lỗi.');
    return j;
  }
  const test = (cid) => call({ action: 'ping' }, cid);

  /**
   * sheets = HAK.Report.xhSheetRows(...) (chỉ NL_DH_XB + NL_PC_XH được gửi); coOf(key) = công ty bên xuất của lô (mã lô) → Sheet đích.
   * Mỗi công ty: gửi theo nhóm lô (≤ BATCH_TRIPS phiếu / lần). Công ty chưa cài Sheet → skipped; lỗi 1 công ty không chặn công ty khác.
   * @returns {Promise<{lots, trips, per:[{cid, name, lots, trips, added, removed, updated, skipped?, error?}]}>}
   */
  async function push(sheets, onStep, coOf) {
    const dh = sheets.find((s) => s.name === 'NL_DH_XB'), pc = sheets.find((s) => s.name === 'NL_PC_XH');
    if (!dh || !pc) throw new Error('Thiếu dữ liệu 2 sheet NL_DH_XB / NL_PC_XH.');
    const kDh = dh.cols.findIndex((c) => c.h === dh.keyCol), kPc = pc.cols.findIndex((c) => c.h === pc.keyCol);
    const keys = dh.rows.map((r) => String(r[kDh]));
    const tripsOf = new Map(keys.map((k) => [k, []]));
    pc.rows.forEach((r) => { const k = String(r[kPc]); if (tripsOf.has(k)) tripsOf.get(k).push(r); });
    const colsOf = (s) => s.cols.map((c) => ({ h: c.h, n: c.n === 'dd/mm/yyyy' ? 'dd/mm/yyyy' : c.n === '0' ? '0' : undefined }));
    // nhóm lô theo công ty (Sheet đích)
    const byCo = new Map();
    keys.forEach((k) => { const cid = (coOf && coOf(k)) || curCo(); if (!byCo.has(cid)) byCo.set(cid, []); byCo.get(cid).push(k); });
    const jobs = [];
    byCo.forEach((ks, cid) => {
      const it = { cid, name: coName(cid), lots: ks.length, trips: ks.reduce((a, k) => a + tripsOf.get(k).length, 0), added: 0, removed: 0, updated: 0, batches: [] };
      if (!configured(cid)) it.skipped = true;
      else {                // mỗi nhóm ≤ BATCH_TRIPS phiếu (1 lô lớn hơn vẫn gửi riêng 1 lần — không cắt đôi lô vì script xóa cả lô trước khi ghi)
        let cur = [], n = 0;
        ks.forEach((k) => { const t = tripsOf.get(k).length; if (cur.length && n + t > BATCH_TRIPS) { it.batches.push(cur); cur = []; n = 0; } cur.push(k); n += t; });
        if (cur.length) it.batches.push(cur);
      }
      jobs.push(it);
    });
    const total = jobs.reduce((a, j) => a + j.batches.length, 0);
    let step = 0;
    for (const it of jobs) {
      if (it.skipped) continue;
      try {
        for (const ks of it.batches) {
          const set = new Set(ks);
          if (onStep) onStep(++step, total, ks.length, it.name);
          const j = await call({
            action: 'push', keys: ks,
            sheets: [
              { name: 'NL_DH_XB', keyCol: dh.keyCol, cols: colsOf(dh), rows: dh.rows.filter((r) => set.has(String(r[kDh]))) },
              { name: 'NL_PC_XH', keyCol: pc.keyCol, cols: colsOf(pc), rows: ks.reduce((a, k) => a.concat(tripsOf.get(k)), []) }
            ]
          }, it.cid);
          const r = j.result || {};
          it.removed += (r.NL_PC_XH || {}).removed || 0; it.added += (r.NL_PC_XH || {}).added || 0; it.updated += (r.NL_DH_XB || {}).updated || 0;
        }
        const c = cfg(it.cid); c.last = { at: Date.now(), lots: it.lots, trips: it.trips }; saveCfg(it.cid, c);
      } catch (e) { it.error = e.message || String(e); }
      delete it.batches;
    }
    jobs.forEach((j) => { delete j.batches; });
    renderStatus(); renderTable();
    return { lots: keys.length, trips: pc.rows.length, per: jobs };
  }

  /* ---------------------------------------------------------------
   * Giao diện: thẻ ở Cài đặt → Chung (bảng theo công ty) + dòng trạng thái ở Báo cáo
   * ------------------------------------------------------------- */
  const fmtTime = (ts) => { const d = new Date(ts), p = (x) => String(x).padStart(2, '0'); return p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + d.getFullYear() + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()); };
  function lastText(cid) {
    const l = cfg(cid).last;
    return l ? 'đồng bộ gần nhất ' + fmtTime(l.at) + ' — ' + l.lots + ' lô, ' + l.trips.toLocaleString('vi-VN') + ' phiếu' : 'chưa đồng bộ lần nào';
  }
  /** Báo cáo: trạng thái Sheet của công ty đang làm (hoặc mọi công ty đang xem khi bật "Xem tất cả"). */
  function renderStatus() {
    const s = $('#repGsStatus'); if (!s) return;
    const scope = HAK.Auth && HAK.Auth.scopeIds ? HAK.Auth.scopeIds('report') : null;
    const ids = scope || ((HAK.Config && HAK.Config.data.companies) || []).map((c) => c.id);
    s.innerHTML = ids.map((cid) => '☁ <b>' + esc(coName(cid)) + '</b>: ' + (configured(cid) ? esc(lastText(cid)) : '<span class="text-warning">chưa cài Google Sheet</span>')).join(' · ') +
      (ids.some((cid) => !configured(cid)) ? ' <span class="muted">(Cài đặt → Chung → ☁ Đồng bộ Google Sheet)</span>' : '');
  }
  function renderTable() {
    const body = $('#gsBody'); if (!body) return;
    const allow = HAK.Auth && HAK.Auth.current && HAK.Auth.current() ? HAK.Auth.allowedCompanies() : null;   // v2.6.5: máy trạm chỉ thấy Sheet của công ty mình
    body.innerHTML = ((HAK.Config && HAK.Config.data.companies) || []).filter((co) => !allow || allow.indexOf(co.id) >= 0).map((co) => {
      const c = cfg(co.id), id = esc(co.id);
      return '<tr data-cid="' + id + '"><td class="fw-semibold text-nowrap">' + esc(co.short || co.name) + (co.id === curCo() ? ' <span class="badge badge-soft">đang làm</span>' : '') + '</td>' +
        '<td style="min-width:260px"><input class="form-control form-control-sm mono" data-gs="url" placeholder="https://script.google.com/macros/s/…/exec" value="' + esc(c.url) + '" autocomplete="off"></td>' +
        '<td style="min-width:200px"><div class="input-group input-group-sm"><input class="form-control mono" data-gs="token" type="password" value="' + esc(c.token) + '" autocomplete="off">' +
        '<button class="btn btn-outline-secondary" type="button" data-gsa="show" title="Hiện / ẩn">👁</button><button class="btn btn-outline-secondary" type="button" data-gsa="gen" title="Tạo mã mới">🎲</button></div></td>' +
        '<td class="text-nowrap"><div class="btn-group btn-group-sm"><button class="btn btn-outline-primary" type="button" data-gsa="copy" title="Sao chép Code.gs (có sẵn mã bí mật của công ty này)">📋 Code.gs</button>' +
        '<button class="btn btn-primary" type="button" data-gsa="test">🔌 Kiểm tra</button></div></td>' +
        '<td class="small" style="min-width:220px;white-space:normal" data-gs="msg">' + (configured(co.id) ? esc(lastText(co.id)) : '<span class="muted">chưa cài</span>') + '</td></tr>';
    }).join('');
  }
  function render() {
    const box = $('#gsyncBody'); if (!box) return;
    box.innerHTML =
      '<div class="small mb-2">Mỗi công ty <b>1 file Google Sheet riêng</b> — mỗi lô đi về Sheet của công ty <b>bên xuất</b> của lô. Cài cho từng công ty:</div>' +
      '<ol class="small mb-3 ps-3">' +
      '<li>Bấm <b>🎲</b> (nếu ô Mã bí mật trống) rồi <b>📋 Code.gs</b> ở dòng công ty đó.</li>' +
      '<li>Mở Google Sheet của công ty → <b>Tiện ích mở rộng → Apps Script</b> → xóa mã có sẵn → dán → <b>Lưu</b>.</li>' +
      '<li><b>Triển khai → Tùy chọn triển khai mới</b> → loại <b>Ứng dụng web</b> · Thực thi với tư cách <b>Tôi</b> · Người có quyền truy cập <b>Bất kỳ ai</b> → <b>Triển khai</b> → cấp quyền.</li>' +
      '<li>Sao chép <b>URL ứng dụng web</b> dán vào ô URL của đúng công ty → <b>🔌 Kiểm tra</b>.</li></ol>' +
      '<div class="tbl-wrap" style="max-height:none"><table class="table table-sm align-middle mb-0"><thead><tr><th>Công ty</th><th>URL ứng dụng web</th><th>Mã bí mật</th><th></th><th>Trạng thái</th></tr></thead><tbody id="gsBody"></tbody></table></div>' +
      '<div class="form-text">Đồng bộ 1 chiều app → Sheet, bấm ở <b>Báo cáo → 📑 Xuất hàng theo hợp đồng → ☁ Đồng bộ Google Sheet</b>. Lô được gửi bị <b>thay toàn bộ phiếu</b> trên NL_PC_XH và cập nhật dòng ở NL_DH_XB; lô khác trên Sheet giữ nguyên. Công ty chưa cài Sheet: lô của công ty đó được bỏ qua (có báo). Đổi mã bí mật phải dán lại Code.gs và triển khai phiên bản mới.</div>';
    renderTable();
    const body = $('#gsBody');
    const rowOf = (el) => el.closest('tr[data-cid]'), val = (tr, k) => tr.querySelector('[data-gs="' + k + '"]');
    const say = (tr, t, cls) => { const m = val(tr, 'msg'); m.className = 'small ' + (cls || ''); m.textContent = t; };
    const upd = (tr) => { const cid = tr.dataset.cid, c = cfg(cid); c.url = val(tr, 'url').value.trim(); c.token = val(tr, 'token').value.trim(); saveCfg(cid, c); renderStatus(); };
    body.addEventListener('input', (e) => { const tr = rowOf(e.target); if (tr) upd(tr); });
    body.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-gsa]'); if (!b) return;
      const tr = rowOf(b), cid = tr.dataset.cid, act = b.dataset.gsa, tok = val(tr, 'token');
      if (act === 'show') { tok.type = tok.type === 'password' ? 'text' : 'password'; return; }
      if (act === 'gen') {
        const go = () => { tok.value = genToken(); upd(tr); say(tr, 'Đã tạo mã mới — nhớ 📋 Code.gs dán lại lên Apps Script của ' + coName(cid) + ' và triển khai phiên bản mới.', 'text-warning'); };
        if (cfg(cid).token) HAK.UI.confirmClick(b, go, 'Đổi mã?'); else go();
        return;
      }
      if (act === 'copy') {
        if (!cfg(cid).token) { tok.value = genToken(); upd(tr); }
        const code = codeGs(cfg(cid).token);
        try { await navigator.clipboard.writeText(code); say(tr, 'Đã sao chép Code.gs của ' + coName(cid) + ' — dán vào Apps Script của Sheet công ty này.', 'text-success'); }
        catch (err) { HAK.Word.Files.saveBlob(new Blob([code], { type: 'text/plain;charset=utf-8' }), 'Code_' + cid + '.gs'); say(tr, 'Trình duyệt không cho sao chép — đã tải file Code_' + cid + '.gs, mở bằng Notepad rồi sao chép.', 'text-warning'); }
        return;
      }
      if (act === 'test') {
        b.disabled = true; say(tr, '⏳ Đang kết nối…', 'muted');
        try { const j = await test(cid); say(tr, '✔ Kết nối được file "' + j.file + '" (sheet: ' + (j.sheets || []).join(', ') + ').', 'text-success'); }
        catch (err) { say(tr, '✖ ' + (err.message || err), 'text-danger'); }
        finally { b.disabled = false; }
      }
    });
    renderStatus();
  }
  function init() { render(); renderStatus(); root.addEventListener('hak:scope', (e) => { if (e.detail && e.detail.key === 'report') renderStatus(); }); }

  HAK.GSync = { init, render, renderStatus, configured, test, push, codeGs, _call: call, BATCH_TRIPS, _cfg: cfg };
})(window);
