/**
 * search.js — 🔍 Tìm kiếm chung (Ctrl+K) + chỉ mục dữ liệu dùng chung cho Tổng quan.
 *
 *  HAK.Search.index()  : quét mọi ngăn dữ liệu (HAK.App.slots) → { trips (đã khử trùng giữa các loại), plates, drivers, ships, perType }.
 *                        Chỉ đọc, không sửa dữ liệu gốc. Tính lại mỗi lần gọi (vài chục ms cho ~15.000 dòng) nên luôn đúng.
 *  HAK.Search.run(q)   : tìm theo biển số · tài xế · số phiếu cân · tàu/lô · số PXK · số BKLS · bên mua/đơn vị · hồ sơ lưu · đợt Excel.
 *  HAK.Search.open(q)  : mở hộp tìm kiếm (Ctrl+K hoặc nút 🔍 trên thanh trên).
 * Phần tìm (index/run) không phụ thuộc DOM.
 */
(function (root) {
  'use strict';
  const HAK = (root.HAK = root.HAK || {});
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /** Bỏ dấu + chữ thường. */
  const fold = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'd').toLowerCase().trim();
  /** Khóa so khớp chỉ gồm chữ + số ("43C-123.45" → "43c12345"). */
  const key = (s) => fold(s).replace(/[^a-z0-9]+/g, '');
  const monthOf = (d) => { const m = String(d || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); return m ? m[3] + '-' + m[2].padStart(2, '0') : ''; };
  const dmyTs = (d) => { const m = String(d || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); return m ? Date.UTC(+m[3], +m[2] - 1, +m[1]) : null; };
  const pad6 = (n) => 'PXK' + String(n).padStart(6, '0');
  const typeName = (t) => { const D = HAK.Pages && HAK.Pages.DOCS[t]; return D ? D.icon + ' ' + D.title : t; };

  /* ===================== Chỉ mục ===================== */
  function bump(map, k, name, r, type) {
    let a = map.get(k);
    if (!a) { a = { key: k, name, trips: 0, kg: 0, from: null, to: null, types: new Set(), drivers: new Set(), plates: new Set(), rows: [] }; map.set(k, a); }
    a.trips++; a.kg += r.kg; a.types.add(type);
    if (r.plate) a.plates.add(r.plate);
    if (r.driver) a.drivers.add(r.driver);
    if (r.ts !== null) { if (a.from === null || r.ts < a.from) a.from = r.ts; if (a.to === null || r.ts > a.to) a.to = r.ts; }
    a.rows.push(r);
  }
  function index() {
    const App = HAK.App, plates = new Map(), drivers = new Map(), ships = new Map(), trips = [], perType = {};
    const seen = new Set();
    Object.keys(App.slots).forEach((type) => {
      const sl = App.slots[type], ds = sl && sl.ds;
      if (!ds || !ds.ok) return;
      const pt = perType[type] = { trips: 0, kg: 0, months: new Map(), noDate: 0 };
      ds.rows.forEach((r) => {
        const kg = Number(r.net) || 0;
        pt.trips++; pt.kg += kg;
        const mo = monthOf(r.dateStr);
        if (!mo) pt.noDate++;
        else { let m = pt.months.get(mo); if (!m) pt.months.set(mo, (m = { trips: 0, kg: 0 })); m.trips++; m.kg += kg; }
        // khử trùng giữa các loại (cùng một lượt cân có thể được nạp ở nhiều loại biên bản)
        const k = (r.ticket || '') + '|' + r.plate + '|' + (r.ts1 !== null && r.ts1 !== undefined ? r.ts1 : r.time1) + (r.ticket ? '' : '|' + r.net);
        if (seen.has(k)) return;
        seen.add(k);
        const row = { type, plate: r.plate || '', driver: r.driver || '', ticket: r.ticket || '', date: r.dateStr || '', time: r.time1 || '', ts: r.ts1 !== undefined ? r.ts1 : null, kg, ship: r.note || '', carrier: r.carrier || '' };
        trips.push(row);
        if (row.plate) bump(plates, key(row.plate), row.plate, row, type);
        if (row.driver) bump(drivers, fold(row.driver), row.driver, row, type);
        if (row.ship) bump(ships, fold(row.ship), row.ship, row, type);
      });
    });
    return { trips, plates, drivers, ships, perType };
  }

  /* ===================== Tìm ===================== */
  const LIMIT = 8;
  function issuedText(r) { return fold([r.soBkls, r.benMua, r.tenDonVi, r.cua, r.batch, r.fileName, r.kind === 'pxk' ? 'pxkkvcnb' : 'bkls'].join(' ')); }

  /**
   * @param {string} q  chuỗi tìm
   * @param {object} opt { idx (chỉ mục dựng sẵn), archive (metas hồ sơ lưu) }
   * @returns {{groups:object[], total:number}}  group = { id, title, items:[{...}], more }
   */
  function run(q, opt) {
    opt = opt || {};
    q = String(q || '').trim();
    const out = [];
    if (q.length < 2) return { groups: out, total: 0 };
    const idx = opt.idx || index(), qf = fold(q), qk = key(q);
    const add = (id, title, items) => { if (items.length) out.push({ id, title, items: items.slice(0, LIMIT), more: Math.max(0, items.length - LIMIT) }); };
    const byKg = (a, b) => b.kg - a.kg;

    // Biển số
    if (qk.length >= 2) {
      const list = [];
      idx.plates.forEach((a) => { if (a.key.indexOf(qk) >= 0) list.push(a); });
      add('plate', '🚛 Biển số xe', list.sort((a, b) => (a.key === qk ? -1 : b.key === qk ? 1 : b.kg - a.kg)).map((a) => ({ kind: 'plate', agg: a, title: a.name, sub: [...a.drivers].slice(0, 2).join(', ') })));
    }
    // Tài xế
    const dl = [];
    idx.drivers.forEach((a) => { if (a.key.indexOf(qf) >= 0) dl.push(a); });
    add('driver', '👤 Tài xế', dl.sort(byKg).map((a) => ({ kind: 'driver', agg: a, title: a.name, sub: [...a.plates].slice(0, 3).join(', ') })));
    // Số phiếu cân
    if (qk.length >= 3) {
      const tl = idx.trips.filter((t) => t.ticket && key(t.ticket).indexOf(qk) >= 0);
      add('ticket', '🧾 Số phiếu cân', tl.map((t) => ({ kind: 'ticket', trip: t, title: t.ticket, sub: t.plate + ' · ' + t.date + ' · ' + HAK.Generator.fmtTon(t.kg) + ' tấn' })));
    }
    // Tàu / lô hàng (cột Ghi chú/Tàu của Excel + tên tàu ở hồ sơ lưu)
    const sl = [];
    idx.ships.forEach((a) => { if (a.key.indexOf(qf) >= 0) sl.push(a); });
    add('ship', '🚢 Tàu / lô hàng (trong dữ liệu Excel)', sl.sort(byKg).map((a) => ({ kind: 'ship', agg: a, title: a.name, sub: '' })));

    // Chứng từ đã lập: số PXK, số BKLS, bên mua, đơn vị, đợt
    const issued = (HAK.Issued && HAK.Issued.list) || [];
    let pxkNo = null; const mp = q.match(/^pxk\s*0*(\d+)$/i) || (/^\d{3,}$/.test(q) ? [0, q] : null);
    if (mp) pxkNo = Number(mp[1]);
    const il = issued.filter((r) => (pxkNo !== null && r.kind === 'pxk' && pxkNo >= r.pxkFrom && pxkNo <= r.pxkTo) || issuedText(r).indexOf(qf) >= 0);
    add('issued', '📑 Chứng từ đã lập (PXK / BKLS)', il.map((r) => ({
      kind: 'issued', rec: r,
      title: r.kind === 'pxk' ? 'PXKKVCNB ' + pad6(r.pxkFrom) + ' → ' + pad6(r.pxkTo) : 'BKLS ' + r.soBkls,
      sub: (r.cua || '') + (r.kind === 'bkls' && r.benMua ? ' → ' + r.benMua : '') + ' · ' + typeName(r.type) + ' · đợt "' + r.batch + '"'
    })));
    // Hồ sơ đã lưu (tàu, bên giao/nhận, tên hồ sơ)
    const al = (opt.archive || []).filter((m) => fold([m.title, m.ship, m.giao, m.nhan].join(' ')).indexOf(qf) >= 0);
    add('archive', '🗄️ Hồ sơ đã lưu', al.map((m) => ({ kind: 'archive', meta: m, title: m.title || m.id, sub: typeName(m.type) + (m.ship ? ' · tàu ' + m.ship : '') + ' · ' + (m.from || '') + (m.to && m.to !== m.from ? ' → ' + m.to : '') })));
    // Đợt Excel đang nạp
    const bl = [];
    Object.keys(HAK.App.slots).forEach((t) => (HAK.App.slots[t].batches || []).forEach((b) => { if (fold(b.fileName).indexOf(qf) >= 0) bl.push({ kind: 'batch', type: t, b, title: b.fileName, sub: typeName(t) + (b.ds && b.ds.ok ? ' · ' + HAK.Generator.fmtInt(b.ds.stats.trips) + ' xe' : '') }); }));
    add('batch', '📂 Đợt Excel đã nạp', bl);

    return { groups: out, total: out.reduce((n, g) => n + g.items.length + g.more, 0) };
  }

  /* ===================== Giao diện ===================== */
  let ov = null, inp = null, box = null, idxCache = null, archCache = [], flat = [], act = -1, expanded = null;
  const fmtTon = (kg) => HAK.Generator.fmtTon(kg);
  const fmtInt = (n) => HAK.Generator.fmtInt(n);
  const fmtD = (ts) => { if (ts === null || ts === undefined) return ''; const d = new Date(ts); return String(d.getUTCDate()).padStart(2, '0') + '/' + String(d.getUTCMonth() + 1).padStart(2, '0') + '/' + d.getUTCFullYear(); };

  function build() {
    ov = document.createElement('div');
    ov.className = 'gs-overlay'; ov.hidden = true;
    ov.innerHTML = '<div class="gs-panel" role="dialog" aria-modal="true" aria-label="Tìm kiếm chung">' +
      '<div class="gs-head"><span class="gs-ico">🔍</span><input id="gsInput" type="search" autocomplete="off" spellcheck="false" placeholder="Tìm biển số, tài xế, số phiếu cân, PXK000123, số BKLS, tàu, bên mua…"><button type="button" class="btn btn-sm btn-outline-secondary" id="gsClose">Esc</button></div>' +
      '<div class="gs-body" id="gsBody"></div>' +
      '<div class="gs-foot muted small">↑ ↓ chọn · Enter mở / xem chi tiết · Esc đóng · Ctrl+K mở nhanh</div></div>';
    document.body.appendChild(ov);
    inp = ov.querySelector('#gsInput'); box = ov.querySelector('#gsBody');
    ov.addEventListener('mousedown', (e) => { if (e.target === ov) close(); });
    ov.querySelector('#gsClose').addEventListener('click', close);
    inp.addEventListener('input', HAK.UI.debounce(() => { expanded = null; render(); }, 120));
    inp.addEventListener('keydown', onKey);
    box.addEventListener('click', onClick);
  }
  function open(q) {
    if (!ov) build();
    idxCache = index(); archCache = [];
    if (HAK.Archive) HAK.Archive.list().then((l) => { archCache = l || []; if (!ov.hidden) render(); }).catch(() => {});
    ov.hidden = false; document.body.classList.add('gs-open');
    inp.value = q == null ? inp.value : q;
    expanded = null; render();
    setTimeout(() => { inp.focus(); inp.select(); }, 0);
  }
  function close() { if (ov) { ov.hidden = true; document.body.classList.remove('gs-open'); } }

  const detailTrips = (rows) => {
    const list = rows.slice().sort((a, b) => (b.ts || 0) - (a.ts || 0)).slice(0, 40);
    return '<div class="gs-detail table-responsive"><table class="table table-sm mb-1"><thead><tr><th>Ngày</th><th>Phiếu</th><th>Biển số</th><th>Tài xế</th><th class="text-end">Tấn</th><th>Ghi chú / tàu</th><th>Loại</th></tr></thead><tbody>' +
      list.map((t) => '<tr><td class="text-nowrap">' + esc(t.date) + '</td><td>' + esc(t.ticket) + '</td><td>' + esc(t.plate) + '</td><td>' + esc(t.driver) + '</td><td class="text-end">' + fmtTon(t.kg) + '</td><td>' + esc(t.ship) + '</td><td class="small">' + esc(typeName(t.type)) + '</td></tr>').join('') +
      '</tbody></table>' + (rows.length > list.length ? '<div class="muted small">… và ' + (rows.length - list.length) + ' lượt cân khác (hiện 40 lượt mới nhất).</div>' : '') + '</div>';
  };
  function meta(it) {
    if (it.agg) { const a = it.agg; return fmtInt(a.trips) + ' xe · ' + fmtTon(a.kg) + ' tấn' + (a.from !== null ? ' · ' + fmtD(a.from) + (a.to !== a.from ? ' → ' + fmtD(a.to) : '') : ''); }
    if (it.rec) return fmtD(it.rec.at) === '' ? '' : new Date(it.rec.at).toLocaleDateString('vi-VN') + ' · ' + fmtInt(it.rec.trips) + ' xe · ' + fmtTon(it.rec.kg) + ' tấn';
    if (it.meta) return fmtInt(it.meta.trips) + ' xe · ' + fmtTon(it.meta.kg) + ' tấn';
    return '';
  }
  function render() {
    const q = inp.value.trim();
    flat = []; act = -1;
    if (q.length < 2) {
      box.innerHTML = '<div class="gs-empty">Gõ ít nhất 2 ký tự.<br><span class="muted small">Ví dụ: <code>43C</code> · <code>Nguyễn Văn</code> · <code>PXK000123</code> · <code>010/2026/BKLS</code> · tên tàu</span></div>';
      return;
    }
    const res = run(q, { idx: idxCache || (idxCache = index()), archive: archCache });
    if (!res.groups.length) { box.innerHTML = '<div class="gs-empty">Không tìm thấy "' + esc(q) + '" trong dữ liệu đang nạp, nhật ký chứng từ và hồ sơ lưu.</div>'; return; }
    let n = 0;
    box.innerHTML = res.groups.map((g) => '<div class="gs-group"><div class="gs-gt">' + g.title + '</div>' + g.items.map((it) => {
      const i = n++; flat.push(it);
      const isOpen = expanded === i && (it.agg || it.trip);
      return '<div class="gs-item" data-i="' + i + '" role="option"><div class="gs-row"><div class="gs-main"><b>' + esc(it.title) + '</b>' + (it.sub ? '<div class="muted small text-break">' + esc(it.sub) + '</div>' : '') + '</div><div class="gs-meta muted small">' + esc(meta(it)) + '</div></div>' +
        (isOpen ? detailTrips(it.agg ? it.agg.rows : [it.trip]) : '') + '</div>';
    }).join('') + (g.more ? '<div class="muted small px-3 pb-2">… còn ' + g.more + ' kết quả — gõ cụ thể hơn để thu hẹp.</div>' : '') + '</div>').join('');
    setActive(0);
  }
  function setActive(i) {
    const els = box.querySelectorAll('.gs-item');
    if (!els.length) return;
    act = (i + els.length) % els.length;
    els.forEach((e, k) => e.classList.toggle('active', k === act));
    els[act].scrollIntoView({ block: 'nearest' });
  }
  function activate(i) {
    const it = flat[i]; if (!it) return;
    if (it.agg || it.trip) { expanded = expanded === i ? null : i; const keep = i; render(); setActive(keep); return; }
    if (it.kind === 'issued') { location.hash = '#/chungtu'; }
    else if (it.kind === 'archive') { location.hash = '#/archive'; }
    else if (it.kind === 'batch') { const a = document.createElement('a'); a.href = '#/file'; a.dataset.filetype = it.type; document.body.appendChild(a); a.click(); a.remove(); }
    close();
  }
  function onClick(e) { const el = e.target.closest('.gs-item'); if (el) activate(+el.dataset.i); }
  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setActive(act + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(act - 1); }
    else if (e.key === 'Enter') { e.preventDefault(); if (act >= 0) activate(act); }
  }
  function init() {
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && String(e.key).toLowerCase() === 'k') { e.preventDefault(); ov && !ov.hidden ? close() : open(); }
    });
    const b = document.getElementById('btnSearch'); if (b) b.addEventListener('click', () => open());
    document.addEventListener('click', (e) => { const a = e.target.closest('[data-search]'); if (a) { e.preventDefault(); open(a.dataset.search); } });
  }

  HAK.Search = { index, run, open, close, init, fold, key, monthOf, dmyTs };
})(window);
