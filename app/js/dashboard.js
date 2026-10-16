/**
 * dashboard.js — 🏠 Tổng quan (thay Trang chủ): số liệu, biểu đồ, cảnh báo, chứng từ gần đây.
 * Nguồn: HAK.Search.index() (dữ liệu Excel đang nạp), HAK.Issued (nhật ký chứng từ), HAK.Archive (hồ sơ lưu).
 * Chỉ ĐỌC dữ liệu — không thay đổi Báo cáo tổng hợp hay bất kỳ dữ liệu nào. Biểu đồ vẽ bằng SVG/HTML thuần, không thêm thư viện.
 * Màu: mỗi hình thức có 1 màu cố định (bảng màu đã kiểm CVD), ≥2 chuỗi luôn có chú giải + tooltip + bảng số.
 */
(function (root) {
  'use strict';
  const HAK = (root.HAK = root.HAK || {});
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = (s) => document.querySelector(s);
  const G = () => HAK.Generator;
  const fmtInt = (n) => G().fmtInt(n), fmtTon = (kg) => G().fmtTon(kg);
  // Thứ tự cố định → màu cố định theo hình thức (--s1…--s7 trong style.css)
  const ORDER = ['xuatkhau', 'uythac', 'xuatkhogui', 'xuatban', 'guikho', 'dieuchuyen', 'traodoi'];
  const slot = (t) => Math.max(0, ORDER.indexOf(t)) + 1;
  const tName = (t) => { const D = HAK.Pages.DOCS[t]; return D ? D.title : t; };
  const tIcon = (t) => { const D = HAK.Pages.DOCS[t]; return D ? D.icon : ''; };
  const st = { metric: 'kg', view: 'chart', data: null, arch: null };

  /* ---------------- Số liệu ---------------- */
  function compute() {
    const idx = HAK.Search.index();
    const months = new Map();           // 'yyyy-mm' → { type → {trips, kg} }
    Object.keys(idx.perType).forEach((t) => idx.perType[t].months.forEach((v, mo) => {
      if (!months.has(mo)) months.set(mo, {});
      months.get(mo)[t] = v;
    }));
    const kg = idx.trips.reduce((a, r) => a + r.kg, 0);
    const types = ORDER.filter((t) => idx.perType[t]).concat(Object.keys(idx.perType).filter((t) => ORDER.indexOf(t) < 0));
    return { idx, months: Array.from(months.entries()).sort((a, b) => (a[0] < b[0] ? -1 : 1)), kg, types };
  }
  function batchesList() {
    const out = [];
    Object.keys(HAK.App.slots).forEach((t) => (HAK.App.slots[t].batches || []).forEach((b) => { if (b.ds && b.ds.ok) out.push({ type: t, b }); }));
    return out;
  }

  /* ---------------- Cảnh báo ---------------- */
  function alerts() {
    const A = [], issued = (HAK.Issued && HAK.Issued.list) || [], CT = HAK.CHUNGTU || {};
    // 1. đợt chưa lập chứng từ
    const todo = [];
    batchesList().forEach(({ type, b }) => {
      const has = (k) => issued.some((r) => r.type === type && r.batch === b.fileName && r.kind === k);
      const miss = [];
      if (!has('pxk')) miss.push('PXKKVCNB');
      if (CT[type] && CT[type].bkls && !has('bkls')) miss.push('BKLS');
      if (miss.length) todo.push({ type, b, miss });
    });
    todo.slice(0, 6).forEach((x) => A.push({ ico: '⏳', txt: '<b>' + esc(tName(x.type)) + '</b> — đợt "' + esc(x.b.fileName) + '" (' + fmtInt(x.b.ds.stats.trips) + ' xe, ' + fmtTon(x.b.ds.stats.kg) + ' tấn) chưa lập ' + x.miss.join(' + '), href: '#/chungtu', tag: 'Lập chứng từ' }));
    if (todo.length > 6) A.push({ ico: '⏳', txt: '… và ' + (todo.length - 6) + ' đợt khác chưa lập chứng từ.', href: '#/chungtu', tag: 'Mở' });
    // 2. BKLS trùng số giữa các đợt
    const bk = new Map();
    issued.filter((r) => r.kind === 'bkls').forEach((r) => { const k = r.cid + '|' + r.soBkls; (bk.get(k) || bk.set(k, []).get(k)).push(r); });
    bk.forEach((l) => { if (l.length > 1) A.push({ ico: '⚠', txt: 'Số BKLS <b>' + esc(l[0].soBkls) + '</b> (' + esc(l[0].cua) + ') dùng cho ' + l.length + ' đợt khác nhau: ' + l.map((r) => '"' + esc(r.batch) + '"').join(', '), href: '#/chungtu', tag: 'Kiểm tra' }); });
    // 3. PXK chồng dải số
    const px = issued.filter((r) => r.kind === 'pxk'); let ov = 0, ovFirst = null;
    for (let i = 0; i < px.length; i++) for (let j = i + 1; j < px.length; j++) {
      if (px[i].cid === px[j].cid && px[i].pxkFrom <= px[j].pxkTo && px[j].pxkFrom <= px[i].pxkTo) { ov++; if (!ovFirst) ovFirst = [px[i], px[j]]; }
    }
    if (ov) A.push({ ico: '⚠', txt: 'Có <b>' + ov + '</b> cặp PXKKVCNB chồng dải số' + (ovFirst ? ' (vd ' + esc(ovFirst[0].cua) + ': ' + pad6(ovFirst[0].pxkFrom) + '–' + pad6(ovFirst[0].pxkTo) + ' và ' + pad6(ovFirst[1].pxkFrom) + '–' + pad6(ovFirst[1].pxkTo) + ')' : ''), href: '#/chungtu', tag: 'Kiểm tra' });
    // 4. cảnh báo dữ liệu Excel (gộp 1 dòng)
    const wl = [];
    Object.keys(HAK.App.slots).forEach((t) => {
      const ds = HAK.App.slots[t].ds;
      const w = ds && ds.ok ? (ds.warnings || []).filter((x) => !/^ℹ/.test(x)).length : 0;
      if (w) wl.push({ t, w });
    });
    if (wl.length) A.push({ ico: '⚠', txt: 'Cảnh báo dữ liệu Excel: ' + wl.map((x) => '<b>' + esc(tName(x.t)) + '</b> (' + x.w + ')').join(', '), href: '#/file', tag: 'Xem', ft: wl[0].t });
    // 5. sao lưu
    const hasData = batchesList().length || issued.length;
    const last = HAK.Store.get('hak.backup.last', 0);
    if (hasData && !last) A.push({ ico: '💾', txt: 'Chưa sao lưu toàn bộ lần nào — nên tải file sao lưu để phòng mất dữ liệu trình duyệt.', href: '#/settings', tag: 'Sao lưu' });
    else if (hasData && Date.now() - last > 7 * 864e5) A.push({ ico: '💾', txt: '<b class="text-danger">Đã ' + Math.floor((Date.now() - last) / 864e5) + ' ngày chưa sao lưu toàn bộ</b> — quên mật khẩu / hỏng trình duyệt thì file sao lưu là đường lấy lại dữ liệu cuối cùng.', href: '#/settings', tag: 'Sao lưu' });   // v2.7.3: nhắc sau 7 ngày (trước 14)
    // v2.7.5: tự sao lưu đã bật nhưng trình duyệt chưa cho ghi thư mục (hỏi lại sau mỗi lần mở trình duyệt) → nút bấm cho phép
    const ab = HAK.Backup && HAK.Backup.autoStatus ? HAK.Backup.autoStatus() : null;
    if (ab && ab.on && ab.dir && ab.due && (ab.perm === 'prompt' || ab.perm === 'denied'))
      A.push({ ico: '🔁', txt: '<b>Tự sao lưu</b> hôm nay đang chờ trình duyệt cho phép ghi vào thư mục 📁 ' + esc(ab.dir) + '.', act: 'autobk', tag: 'Cho phép & sao lưu' });
    // v2.7.3: Quản trị chưa đặt mật khẩu chủ của nhóm → nhắc (quên mật khẩu Quản trị sẽ chỉ còn mã khôi phục / công cụ)
    if (HAK.Auth && HAK.Auth.isAdmin && HAK.Auth.isAdmin() && !((HAK.Store.get('hak.auth.v1', {}) || {}).master))
      A.push({ ico: '🔐', txt: 'Chưa đặt <b>mật khẩu chủ của nhóm</b> — đặt 1 câu chung để mọi máy tự khôi phục khi quên mật khẩu Quản trị (Cài đặt → 👤 Tài khoản).', href: '#/settings', tag: 'Đặt ngay' });
    return A;
  }
  const pad6 = (n) => 'PXK' + String(n).padStart(6, '0');

  /* ---------------- Thành phần HTML ---------------- */
  const tile = (v, l, s) => '<div class="col-6 col-md-4 col-xl"><div class="stat"><div class="v">' + esc(v) + '</div><div class="l">' + esc(l) + '</div>' + (s ? '<div class="s">' + esc(s) + '</div>' : '') + '</div></div>';
  function barList(items, fmt, clr) {
    if (!items.length) return '<div class="muted small">Chưa có dữ liệu.</div>';
    const max = Math.max.apply(null, items.map((i) => i.v)) || 1;
    return '<div class="viz-bars">' + items.map((i) => '<div class="viz-row"' + (i.search ? ' data-search="' + esc(i.search) + '" role="button" tabindex="0"' : '') + ' title="' + esc(i.title || i.label) + '"><span class="lab">' + esc(i.label) + '</span>' +
      '<span class="track"><span class="fill" style="width:' + Math.max(1.5, i.v / max * 100).toFixed(1) + '%;background:var(' + (i.color || clr || '--s1') + ')"></span></span><span class="val">' + fmt(i) + '</span></div>').join('') + '</div>';
  }
  const cardH = (title, right) => '<div class="card-header d-flex align-items-center gap-2 flex-wrap"><span>' + title + '</span>' + (right ? '<span class="ms-auto">' + right + '</span>' : '') + '</div>';

  /* ---------------- Biểu đồ cột chồng theo tháng ---------------- */
  const monthLabel = (mo) => (mo.length === 7 ? mo.slice(5) + '/' + mo.slice(2, 4) : mo);
  function niceMax(v) {
    if (v <= 0) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(v))), f = v / p;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
  }
  const topRound = (x, y, w, h, r) => { r = Math.min(r, h, w / 2); return 'M' + x + ' ' + (y + h) + 'V' + (y + r) + 'Q' + x + ' ' + y + ' ' + (x + r) + ' ' + y + 'H' + (x + w - r) + 'Q' + (x + w) + ' ' + y + ' ' + (x + w) + ' ' + (y + r) + 'V' + (y + h) + 'Z'; };
  const val = (o) => (st.metric === 'kg' ? o.kg / 1000 : o.trips);
  const fmtVal = (v) => (st.metric === 'kg' ? G().fmtDec(v, 2) : fmtInt(v));

  function monthly(d) {
    const box = $('#dashMonthly'); if (!box) return;
    if (!d.months.length) { box.innerHTML = '<div class="muted small">Chưa có lượt cân nào có ngày hợp lệ.</div>'; return; }
    const types = d.types.filter((t) => d.months.some((m) => m[1][t]));
    const legend = '<div class="viz-legend">' + types.map((t) => '<span><i style="background:var(--s' + slot(t) + ')"></i>' + esc(tName(t)) + '</span>').join('') + '</div>';
    if (st.view === 'table') {
      const unit = st.metric === 'kg' ? 'tấn' : 'xe';
      box.innerHTML = legend + '<div class="table-responsive"><table class="table table-sm"><thead><tr><th>Tháng</th>' + types.map((t) => '<th class="text-end">' + esc(tName(t)) + '</th>').join('') + '<th class="text-end">Cộng (' + unit + ')</th></tr></thead><tbody>' +
        d.months.map(([mo, o]) => { let tot = 0; return '<tr><td>' + esc(monthLabel(mo)) + '</td>' + types.map((t) => { const v = o[t] ? val(o[t]) : 0; tot += v; return '<td class="text-end">' + (v ? fmtVal(v) : '–') + '</td>'; }).join('') + '<td class="text-end fw-semibold">' + fmtVal(tot) + '</td></tr>'; }).join('') + '</tbody></table></div>' +
        '<div class="muted small">Mỗi hình thức tính riêng theo dữ liệu Excel đang nạp; cùng một lượt cân nạp ở nhiều hình thức sẽ có mặt ở mỗi hình thức đó (giống Báo cáo tổng hợp: không có tổng chung).</div>';
      return;
    }
    const W = Math.max(300, box.clientWidth || 640), H = 250, m = { l: 46, r: 8, t: 10, b: 26 };
    const pw = W - m.l - m.r, ph = H - m.t - m.b, n = d.months.length, band = pw / n, bw = Math.max(6, Math.min(46, band * 0.62));
    const tot = d.months.map(([, o]) => types.reduce((a, t) => a + (o[t] ? val(o[t]) : 0), 0));
    const top = niceMax(Math.max.apply(null, tot)), y = (v) => m.t + ph - (v / top) * ph;
    let s = '<svg class="viz-svg" viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" role="img" aria-label="Khối lượng theo tháng và hình thức">';
    for (let i = 0; i <= 4; i++) {
      const v = top * i / 4, yy = y(v);
      s += '<line class="grid" x1="' + m.l + '" x2="' + (W - m.r) + '" y1="' + yy + '" y2="' + yy + '"/><text class="ax" x="' + (m.l - 6) + '" y="' + (yy + 4) + '" text-anchor="end">' + esc(st.metric === 'kg' ? G().fmtDec(v, v < 10 ? 1 : 0) : fmtInt(v)) + '</text>';
    }
    const every = Math.ceil(30 / band);
    d.months.forEach(([mo, o], i) => {
      const cx = m.l + band * i + band / 2, x = cx - bw / 2; let acc = 0;
      const segs = types.filter((t) => o[t] && val(o[t]) > 0);
      segs.forEach((t, k) => {
        const v = val(o[t]), y1 = y(acc + v), y0 = y(acc), h = y0 - y1; acc += v;
        const last = k === segs.length - 1, c = 'var(--s' + slot(t) + ')';
        s += last && h > 5 ? '<path d="' + topRound(x, y1, bw, y0 - y1, 4) + '" fill="' + c + '" class="seg"/>' : '<rect x="' + x + '" y="' + y1 + '" width="' + bw + '" height="' + Math.max(0, h) + '" fill="' + c + '" class="seg"/>';
      });
      if (i % every === 0) s += '<text class="ax" x="' + cx + '" y="' + (H - 8) + '" text-anchor="middle">' + esc(monthLabel(mo)) + '</text>';
      s += '<rect class="hit" data-i="' + i + '" x="' + (m.l + band * i) + '" y="' + m.t + '" width="' + band + '" height="' + ph + '"/>';
    });
    s += '<line class="base" x1="' + m.l + '" x2="' + (W - m.r) + '" y1="' + y(0) + '" y2="' + y(0) + '"/></svg><div class="viz-tip" id="dashTip" hidden></div>';
    box.innerHTML = legend + '<div class="viz-wrap">' + s + '</div>' +
      '<div class="muted small mt-1">' + (st.metric === 'kg' ? 'Đơn vị: tấn.' : 'Đơn vị: lượt xe.') + ' Di chuột / chạm vào cột để xem chi tiết; bấm "Bảng số" để xem đủ số liệu.</div>';
    const tip = $('#dashTip'), wrap = box.querySelector('.viz-wrap');
    const show = (i, ev) => {
      const [mo, o] = d.months[i];
      tip.innerHTML = '<b>Tháng ' + esc(mo.slice(5) + '/' + mo.slice(0, 4)) + '</b>' + types.filter((t) => o[t]).map((t) => '<div><i style="background:var(--s' + slot(t) + ')"></i>' + esc(tName(t)) + ': <b>' + fmtVal(val(o[t])) + '</b></div>').join('') + '<div class="tot">Cộng: <b>' + fmtVal(tot[i]) + '</b></div>';
      tip.hidden = false;
      const r = wrap.getBoundingClientRect(), tw = tip.offsetWidth, cx = m.l + band * i + band / 2;
      let left = cx + 12; if (left + tw > r.width) left = cx - tw - 12; tip.style.left = Math.max(0, left) + 'px'; tip.style.top = '8px';
      box.querySelectorAll('.hit').forEach((h) => h.classList.toggle('on', h.dataset.i === String(i)));
    };
    box.querySelectorAll('.hit').forEach((h) => {
      h.addEventListener('pointerenter', (e) => show(+h.dataset.i, e));
      h.addEventListener('pointerdown', (e) => show(+h.dataset.i, e));
    });
    wrap.addEventListener('pointerleave', () => { tip.hidden = true; box.querySelectorAll('.hit').forEach((h) => h.classList.remove('on')); });
  }

  /* ---------------- Trang ---------------- */
  function render() {
    const host = $('#dashBody'); if (!host) return;
    const issued = (HAK.Issued && HAK.Issued.list) || [];
    const bl = batchesList();
    const empty = !bl.length && !issued.length;
    $('#homeIntro').hidden = !empty;
    if (empty) { host.innerHTML = ''; st.data = null; return; }
    const d = st.data = compute(), idx = d.idx;
    const nPxk = issued.filter((r) => r.kind === 'pxk').length, nBk = issued.filter((r) => r.kind === 'bkls').length;
    const kpi = '<div class="row g-3 mb-3">' +
      tile(fmtInt(idx.trips.length), 'Lượt xe (đã khử trùng)', d.types.length + ' hình thức · ' + bl.length + ' đợt Excel') + tile(fmtTon(d.kg), 'Tổng tấn') +
      tile(fmtInt(idx.plates.size), 'Số xe (biển số)') + tile(fmtInt(idx.drivers.size), 'Số tài xế') +
      tile(fmtInt(nPxk), 'PXKKVCNB đã lập') + tile(fmtInt(nBk), 'BKLS đã lập') + '<div class="col-6 col-md-4 col-xl" id="dashArch"></div></div>';
    const al = alerts();
    const alertCard = '<div class="card mb-3">' + cardH('🔔 Cần chú ý', al.length ? '<span class="badge text-bg-warning">' + al.length + '</span>' : '') + '<div class="card-body py-2">' +
      (al.length ? al.map((a) => '<div class="dash-alert"><span class="ico">' + a.ico + '</span><span class="txt">' + a.txt + '</span>' + (a.act === 'autobk' ? '<button type="button" class="btn btn-sm btn-primary" data-autobk-allow>' + esc(a.tag) + '</button>' : '<a class="btn btn-sm btn-outline-secondary" href="' + a.href + '"' + (a.ft ? ' data-filetype="' + a.ft + '"' : '') + '>' + esc(a.tag) + '</a>') + '</div>').join('') : '<div class="text-success">✓ Không có cảnh báo — các đợt đã lập chứng từ, số PXK/BKLS không trùng.</div>') + '</div></div>';
    const chartCard = '<div class="col-lg-8"><div class="card h-100">' + cardH('📅 Theo tháng và hình thức',
      '<span class="btn-group btn-group-sm" role="group"><button type="button" class="btn ' + (st.metric === 'kg' ? 'btn-primary' : 'btn-outline-secondary') + '" data-dm="kg">Tấn</button><button type="button" class="btn ' + (st.metric === 'trips' ? 'btn-primary' : 'btn-outline-secondary') + '" data-dm="trips">Xe</button></span> ' +
      '<button type="button" class="btn btn-sm btn-outline-secondary" data-dv="' + (st.view === 'chart' ? 'table' : 'chart') + '">' + (st.view === 'chart' ? 'Bảng số' : 'Biểu đồ') + '</button>') +
      '<div class="card-body" id="dashMonthly"></div></div></div>';
    const typeCard = '<div class="col-lg-4"><div class="card h-100">' + cardH('📊 Theo hình thức (tấn)') + '<div class="card-body">' +
      barList(d.types.map((t) => ({ label: tIcon(t) + ' ' + tName(t), v: idx.perType[t].kg, kg: idx.perType[t].kg, trips: idx.perType[t].trips, color: '--s' + slot(t) })).sort((a, b) => b.v - a.v), (i) => fmtTon(i.kg) + ' <span class="muted">· ' + fmtInt(i.trips) + ' xe</span>') + '</div></div></div>';
    const top = (map, n) => Array.from(map.values()).sort((a, b) => b.kg - a.kg).slice(0, n);
    const topXe = '<div class="col-lg-4"><div class="card h-100">' + cardH('🚛 Top 10 xe (tấn)') + '<div class="card-body">' +
      barList(top(idx.plates, 10).map((a) => ({ label: a.name, v: a.kg, kg: a.kg, trips: a.trips, search: a.name, title: [...a.drivers].join(', ') })), (i) => fmtTon(i.kg) + ' <span class="muted">· ' + fmtInt(i.trips) + '</span>') + '</div></div></div>';
    const topTx = '<div class="col-lg-4"><div class="card h-100">' + cardH('👤 Top 10 tài xế (tấn)') + '<div class="card-body">' +
      barList(top(idx.drivers, 10).map((a) => ({ label: a.name, v: a.kg, kg: a.kg, trips: a.trips, search: a.name, title: [...a.plates].join(', ') })), (i) => fmtTon(i.kg) + ' <span class="muted">· ' + fmtInt(i.trips) + '</span>') + '</div></div></div>';
    const recent = '<div class="col-lg-4"><div class="card h-100">' + cardH('🧾 Chứng từ gần đây', '<a href="#/chungtu" class="small">Xem tất cả</a>') + '<div class="card-body py-2">' +
      (issued.length ? issued.slice(0, 7).map((r) => '<div class="dash-doc"><div><b>' + (r.kind === 'pxk' ? 'PXK ' + pad6(r.pxkFrom) + '→' + pad6(r.pxkTo) : 'BKLS ' + esc(r.soBkls)) + '</b></div><div class="muted small text-break">' + esc(r.cua || '') + ' · ' + esc(tName(r.type)) + ' · ' + new Date(r.at).toLocaleDateString('vi-VN') + '</div></div>').join('') : '<div class="muted small">Chưa lập chứng từ nào.</div>') + '</div></div></div>';
    host.innerHTML = kpi + '<div id="dashHealth" class="mb-3"></div>' + alertCard + '<div class="row g-3 mb-3">' + chartCard + typeCard + '</div><div class="row g-3 mb-4">' + topXe + topTx + recent + '</div>';
    monthly(d);
    if (HAK.Backup && HAK.Backup.health) HAK.Backup.health().then(renderHealth).catch((e) => console.warn('Sức khỏe dữ liệu:', e));
    // hồ sơ lưu trữ (bất đồng bộ — không chặn việc vẽ)
    if (HAK.Archive) HAK.Archive.list().then((l) => { const el = $('#dashArch'); if (el) el.innerHTML = '<a class="stat d-block text-decoration-none" href="#/archive"><div class="v">' + fmtInt(l.length) + '</div><div class="l">Hồ sơ đã lưu</div></a>'; }).catch(() => {});
  }

  /** v2.7.5 🩺 Sức khỏe dữ liệu: 5 ô (bộ nhớ, localStorage, Lưu trữ, sao lưu gần nhất, tự sao lưu) — xanh / vàng / đỏ. */
  const HL = ['ok', 'warn', 'bad'], HT = ['Tốt', 'Cần chú ý', 'Nguy hiểm'];
  function renderHealth(h) {
    const el = $('#dashHealth'); if (!el) return;
    el.innerHTML = '<div class="card">' + cardH('🩺 Sức khỏe dữ liệu', '<span class="hl-badge hl-' + HL[h.lvl] + '">' + HT[h.lvl] + '</span> <a class="small ms-2 admin-only" href="#/settings">Sao lưu…</a>') +
      '<div class="card-body py-2"><div class="hl-grid">' + h.items.map((x) => '<div class="hl-item hl-' + HL[x.lvl] + '" data-hl="' + x.k + '" title="' + esc(x.hint) + '"><span class="dot"></span><div class="min-w-0"><div class="l">' + esc(x.label) + '</div><div class="v">' + esc(x.val) + '</div><div class="h">' + esc(x.hint) + '</div></div></div>').join('') + '</div></div></div>';
  }

  function init() {
    const host = $('#dashBody'); if (!host) return;
    host.addEventListener('click', (e) => {
      const m = e.target.closest('[data-dm]'), v = e.target.closest('[data-dv]');
      if (m) { st.metric = m.dataset.dm; render(); }
      else if (v) { st.view = v.dataset.dv; render(); }
    });
    host.addEventListener('keydown', (e) => { if (e.key === 'Enter') { const r = e.target.closest('[data-search]'); if (r) HAK.Search.open(r.dataset.search); } });
    let t; window.addEventListener('resize', () => { clearTimeout(t); t = setTimeout(() => { if (st.data && !$('#page-home').hidden && st.view === 'chart') monthly(st.data); }, 150); });
  }

  HAK.Dashboard = { render, init, alerts, compute };
})(window);
