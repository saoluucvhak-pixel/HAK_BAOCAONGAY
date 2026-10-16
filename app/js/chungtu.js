/**
 * chungtu.js — Chứng từ xuất hàng: lập PXKKVCNB (Excel import Bkav) cho MỘT ĐỢT đã nhập ở mục Nhập liệu.
 *  - Dữ liệu lấy từ HAK.App.slots[hình thức].batches (mỗi đợt = 1 file Excel cân) → không đọc lại Excel, dùng lại bộ đọc + danh sách xe.
 *  - Công ty / kho / "Về việc | Lý do" lấy từ Cài đặt (HAK.Config), không hardcode lần nữa.
 *  - Bảng kê lâm sản (BKLS, Word/PDF, xử lý ở bkls.js) nay lập ở trang "Tạo biên bản" (xem js/pages.js — generateBkls()),
 *    không còn ở trang này. HAK.CHUNGTU[type].bkls vẫn giữ để dashboard.js biết loại nào cần nhắc "chưa lập BKLS".
 */
(function (root) {
  'use strict';
  const HAK = (root.HAK = root.HAK || {});
  const { $, $$, esc, toast, debounce, Loading } = HAK.UI;
  const G = HAK.Generator;
  const C = () => HAK.Config;
  const KEY = 'hak.form.chungtu';
  const CUSTOM = '__custom';

  /** Các cột của file import Bkav eHoadon (BTF.eHD v1.00) — đúng thứ tự file mẫu PXKKVCNB. */
  const PXK_HEADER = ['STT', 'LoaiHoaDon', 'IDChungTu/MaBill', 'MaHang', 'TenHangHoaDichVu', 'DonViTinh/ChietKhau', 'SoLuong', 'DonGia', 'ThanhTien', 'MaTienTe', 'TyGia',
    'TenDonVi', 'MaSoThue', 'NhapKhoTai', 'NgayXuatKho', 'CanCuLenh', 'Ngay', 'Cua', 'VeViec', 'LyDoXuatKho', 'NguoiVanChuyen', 'DonViVanChuyen', 'HopDongSo',
    'PhuongTienVanChuyen', 'XuatKhoTai', 'GhiChu'];

  const st = { type: '', batchName: '', vals: {} };      // vals[hình thức] = giá trị các ô của form
  let built = false;

  const cfg = () => C().data;
  const DOCS = () => HAK.Pages.DOCS;
  const CT = (t) => HAK.CHUNGTU[t];
  const pad6 = (n) => 'PXK' + String(n).padStart(6, '0');
  const isKhoXuat = (w) => w.type === 'Kho xuất' || w.type === 'Kho gửi';

  /* ---------------- Dữ liệu đợt ---------------- */
  function batches() {
    const sl = HAK.App.slots[st.type];
    return sl ? sl.batches.filter((b) => b.ds && b.ds.ok) : [];
  }
  function curBatch() {
    const list = batches();
    return list.find((b) => b.fileName === st.batchName) || list[0] || null;
  }

  /* ---------------- Giá trị mặc định ---------------- */
  function khoAddressOf(companyId) {
    const co = cfg().companies.find((c) => c.id === companyId);
    if (!co) return '';
    const w = cfg().warehouses.find((x) => x.id === C().companyAttr(co, 'khoXuat'));
    return w ? (w.address || w.name) : '';
  }
  function defaultsFor(type) {
    const ops = C().operations(), op = ops[CT(type).op] || ops[0] || { veViec: '', lyDo: '' };
    const port = cfg().warehouses.find((w) => w.id === 'w_ts');
    const cid = (cfg().companies.find((c) => c.id === 'hak') || cfg().companies[0]).id;
    return {
      cua: cid, veViec: op.veViec, lyDo: op.lyDo, xuatKhoTai: khoAddressOf(cid),
      nhapKho: CT(type).op === 0 && port ? port.name : '',
      maHang: 'DG', tenHang: 'Dăm gỗ keo lai PEFC Controlled Sources', dvt: 'Tấn', donViVC: '',
      idBatDau: '', canCuLenh: '', tenDonVi: ''
    };
  }

  /* ---------------- Dựng form ---------------- */
  function comboHtml(id, label, opts, col, help) {
    return '<div class="col-md-' + col + '"><label class="form-label" for="ct-' + id + '">' + label + '</label>' +
      '<select class="form-select" id="ct-' + id + '" data-combo="' + id + '"></select>' +
      '<input type="text" class="form-control mt-2 d-none" id="ct-' + id + '__txt" placeholder="Nhập nội dung khác…" autocomplete="off">' +
      (help ? '<div class="form-text">' + help + '</div>' : '') + '</div>';
  }
  function textHtml(id, label, col, opts) {
    opts = opts || {};
    return '<div class="col-md-' + col + '"><label class="form-label" for="ct-' + id + '">' + label + '</label>' +
      '<input type="' + (opts.number ? 'number' : 'text') + '" class="form-control" id="ct-' + id + '"' + (opts.number ? (opts.step ? ' min="0" step="' + opts.step + '"' : ' min="0" max="999999" step="1"') : '') +
      (opts.list ? ' list="' + opts.list + '"' : '') + ' placeholder="' + esc(opts.ph || '') + '" autocomplete="off">' +
      (opts.help ? '<div class="form-text" id="ct-' + id + '-help">' + opts.help + '</div>' : '<div class="form-text d-none" id="ct-' + id + '-help"></div>') + '</div>';
  }
  function buildForm() {
    $('#ctForm').innerHTML =
      '<div class="card mb-3"><div class="card-body"><div class="sec-title">③ Thông tin chung</div><div class="row g-3">' +
      '<div class="col-md-12"><label class="form-label" for="ct-cua">Của (bên xuất)</label><select class="form-select" id="ct-cua"></select>' +
      '<div class="form-text" id="ct-cua-info"></div></div>' +
      comboHtml('veViec', 'Về việc', null, 6) + comboHtml('lyDo', 'Lý do xuất kho', null, 6) +
      comboHtml('xuatKhoTai', 'Xuất kho tại (địa chỉ)', null, 12, 'Chọn bên xuất sẽ tự gợi ý kho xuất tương ứng.') +
      comboHtml('nhapKho', 'Nhập kho tại', null, 12) +
      '</div></div></div>' +
      '<div class="card mb-3"><div class="card-body"><div class="sec-title">④ Thông tin đợt</div><div class="row g-3">' +
      textHtml('idBatDau', 'Số phiếu PXK bắt đầu', 4, { number: true, ph: 'VD: 81900 (tối đa 6 chữ số)' }) +
      textHtml('canCuLenh', 'Căn cứ lệnh (CanCuLenh)', 4, { ph: 'VD: IWC/HAKVT26-1793' }) +
      textHtml('tenDonVi', 'Tên đơn vị (cột TenDonVi)', 4, { list: 'ctDonVi', ph: 'Đơn vị nhận hàng' }) +
      '<datalist id="ctDonVi"></datalist>' +
      '<div class="col-12"><div class="small muted" id="ct-idHint"></div></div>' +
      '</div></div></div>' +
      '<div class="card mb-3"><div class="card-body"><div class="sec-title">Hàng hóa &amp; vận chuyển</div><div class="row g-3">' +
      textHtml('maHang', 'Mã hàng (MaHang)', 3) + textHtml('tenHang', 'Tên hàng hóa dịch vụ', 5) + textHtml('dvt', 'Đơn vị tính', 4) +
      textHtml('donViVC', 'Đơn vị vận chuyển (dự phòng khi xe không có trong danh sách)', 12) +
      '</div></div></div>';
    built = true;
  }

  /** Nạp lại danh sách lựa chọn (công ty / kho / nghiệp vụ) theo Cài đặt. */
  function fillOptions() {
    const co = cfg().companies;
    $('#ct-cua').innerHTML = co.map((c) => '<option value="' + esc(c.id) + '">' + esc(C().companyAttr(c, 'cua')) + '</option>').join('');
    $('#ctDonVi').innerHTML = co.map((c) => '<option value="' + esc(c.name) + '">').join('');
    const ops = C().operations(), seen = (arr) => arr.filter((v, i) => v && arr.indexOf(v) === i);
    const opts = {
      veViec: seen(ops.map((o) => o.veViec)).map((v) => [v, v]),
      lyDo: seen(ops.map((o) => o.lyDo)).map((v) => [v, v]),
      xuatKhoTai: cfg().warehouses.filter((w) => isKhoXuat(w) && w.address).map((w) => [w.address, w.name + ' — ' + w.address]),
      nhapKho: cfg().warehouses.filter((w) => !isKhoXuat(w)).map((w) => [w.name, w.name])
    };
    $$('#ctForm [data-combo]').forEach((sel) => {
      const cur = getCombo(sel.dataset.combo);
      sel.innerHTML = '<option value="">— Chọn từ danh sách —</option>' + opts[sel.dataset.combo].map(([v, l]) => '<option value="' + esc(v) + '">' + esc(l) + '</option>').join('') + '<option value="' + CUSTOM + '">✎ Khác — nhập tay…</option>';
      setCombo(sel.dataset.combo, cur);
    });
  }
  function getCombo(id) {
    const s = $('#ct-' + id); if (!s) return '';
    return s.value === CUSTOM ? ($('#ct-' + id + '__txt').value || '').trim() : s.value;
  }
  function setCombo(id, val) {
    const s = $('#ct-' + id), t = $('#ct-' + id + '__txt'); if (!s) return;
    val = val || '';
    const has = val !== '' && Array.prototype.some.call(s.options, (o) => o.value === val && o.value !== CUSTOM);
    if (has) { s.value = val; t.classList.add('d-none'); t.value = ''; }
    else if (val) { s.value = CUSTOM; t.value = val; t.classList.remove('d-none'); }
    else { s.value = ''; t.classList.add('d-none'); t.value = ''; }
  }

  const COMBOS = ['veViec', 'lyDo', 'xuatKhoTai', 'nhapKho'], TEXTS = ['maHang', 'tenHang', 'dvt', 'donViVC', 'idBatDau', 'canCuLenh', 'tenDonVi'];
  function readVals() {
    const v = { cua: $('#ct-cua').value };
    COMBOS.forEach((k) => { v[k] = getCombo(k); });
    TEXTS.forEach((k) => { v[k] = ($('#ct-' + k).value || '').trim(); });
    return v;
  }
  /** v2.6.2: công ty làm việc = "Của (bên xuất)" mặc định mỗi lần mở app (vẫn đổi được); đổi bên xuất thì "Xuất kho tại" theo kho của công ty. */
  function withCompany(v) {
    const co = HAK.Auth && HAK.Auth.company ? HAK.Auth.company() : '';
    if (co && v.cua !== co && cfg().companies.some((c) => c.id === co)) { v.cua = co; v.xuatKhoTai = khoAddressOf(co); }
    return v;
  }
  function applyVals(v) {
    if (Array.prototype.some.call($('#ct-cua').options, (o) => o.value === v.cua)) $('#ct-cua').value = v.cua;
    COMBOS.forEach((k) => setCombo(k, v[k]));
    TEXTS.forEach((k) => { $('#ct-' + k).value = v[k] == null ? '' : v[k]; });
    updateCuaInfo();
  }
  function updateCuaInfo() {
    const c = cfg().companies.find((x) => x.id === $('#ct-cua').value);
    $('#ct-cua-info').textContent = c ? 'MST ' + (c.tax || '—') + ' · ' + (c.address || '') : '';
  }

  /* ---------------- Lưu / nạp trạng thái ---------------- */
  function persist() {
    if (st.type && built) st.vals[st.type] = readVals();
    HAK.Store.set(KEY, { type: st.type, batchName: st.batchName, vals: st.vals, last: st.last || null });
  }
  const persistSoon = debounce(persist, 300);

  /* ---------------- Hiển thị ---------------- */
  function renderTypes() {
    $('#ctTypes').innerHTML = Object.keys(HAK.CHUNGTU).map((k) => {
      const d = DOCS()[k], sl = HAK.App.slots[k], n = sl ? sl.batches.filter((b) => b.ds && b.ds.ok).length : 0;
      return '<button type="button" class="btn ' + (st.type === k ? 'btn-primary' : 'btn-outline-secondary') + '" data-ct="' + k + '">' + d.icon + ' ' + esc(d.title) +
        (n ? ' <span class="badge text-bg-success ms-1">' + n + ' đợt</span>' : '') + '</button>';
    }).join('');
    $('#ctTypeHint').textContent = st.type
      ? 'Trang này chỉ lập PXKKVCNB. Bảng kê lâm sản (BKLS) lập ở trang "Tạo biên bản" của hình thức tương ứng.'
      : '';
  }
  function render() {
    if (!HAK.App || !built) return;
    renderLog();
    fillOptions();
    renderTypes();
    $('#ctNoType').classList.toggle('d-none', !!st.type);
    const noData = !!st.type && !batches().length;
    $('#ctNoData').classList.toggle('d-none', !noData);
    if (st.type) $('#ctGoData').dataset.filetype = st.type;
    $('#ctBody').classList.toggle('d-none', !st.type || noData);
    if (!st.type || noData) return;
    const list = batches();
    if (!list.some((b) => b.fileName === st.batchName)) st.batchName = list[0].fileName;
    $('#ctBatch').innerHTML = list.map((b) => '<option value="' + esc(b.fileName) + '"' + (b.fileName === st.batchName ? ' selected' : '') + '>' + esc(b.fileName) + ' — ' + G.fmtInt(b.ds.stats.trips) + ' xe · ' + G.fmtTon(b.ds.stats.kg) + ' tấn</option>').join('');
    $('#ct-idBatDau-help').classList.add('d-none');
    updateSummary();
  }

  function updateSummary() {
    const b = curBatch(); if (!b) return;
    const ds = b.ds, s = ds.stats, v = readVals();
    $('#ctBatchInfo').textContent = (s.from ? 'Ngày cân: ' + s.from + (s.to && s.to !== s.from ? ' → ' + s.to : '') : '') + ' · sheet "' + b.sheet + '"';
    $('#ctTrips').textContent = G.fmtInt(s.trips);
    $('#ctTons').textContent = G.fmtTon(s.kg);
    const start = parseInt(v.idBatDau, 10), okStart = Number.isFinite(start);
    const noDriver = ds.rows.filter((r) => !r.driver).length;
    $('#ctSumList').innerHTML =
      '<li><span>Số xe (biển số)</span><b>' + G.fmtInt(s.plates) + '</b></li>' +
      '<li><span>Phiếu PXK</span><b>' + (okStart ? pad6(start) + ' → ' + pad6(start + s.trips - 1) : '—') + '</b></li>' +
      '<li><span>Chưa có tài xế</span><b>' + G.fmtInt(noDriver) + '</b></li>';
    const lp = HAK.Issued && HAK.Issued.lastPxk(v.cua), last = lp ? { from: lp.pxkFrom, to: lp.pxkTo } : st.last;
    const hint = $('#ct-idHint');
    hint.innerHTML = last ? 'Lần tạo gần nhất: <b>' + pad6(last.from) + ' → ' + pad6(last.to) + '</b>. ' +
      '<a href="#" id="ctUseNext">Bắt đầu tiếp từ ' + pad6(last.to + 1) + '</a>' : '';
    const a = $('#ctUseNext');
    if (a) a.addEventListener('click', (e) => { e.preventDefault(); $('#ct-idBatDau').value = String(last.to + 1); persistSoon(); updateSummary(); });
    const msgs = [];
    if (noDriver && !(ds.vehicleInfo && ds.vehicleInfo.total)) msgs.push('Đợt này chưa có danh sách xe & tài xế (Nhập liệu → dòng đợt → 🚚) — cột người vận chuyển / đơn vị vận chuyển sẽ để trống hoặc dùng "đơn vị vận chuyển dự phòng".');
    else if (ds.vehicleInfo && ds.vehicleInfo.missing.length) msgs.push('🚚 ' + ds.vehicleInfo.missing.length + ' biển số chưa có trong danh sách xe: ' + ds.vehicleInfo.missing.slice(0, 8).join(', ') + (ds.vehicleInfo.missing.length > 8 ? ' …' : '') + '.');
    const zero = ds.rows.filter((r) => !(r.net > 0)).length;
    if (zero) msgs.push(zero + ' xe có khối lượng bằng 0 sẽ ra 0 tấn trên PXK.');
    $('#ctMsgs').innerHTML = msgs.length ? '<div class="alert alert-warning py-2 mb-0"><ul class="alert-list">' + msgs.map((m) => '<li>' + esc(m) + '</li>').join('') + '</ul></div>' : '';
    $('#ctHint').textContent = 'Sẽ tạo: PXKKVCNB_' + slug(DOCS()[st.type].title) + '_….xlsx';
  }
  const slug = (t) => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').replace(/[^A-Za-z0-9]+/g, '');

  /* ---------------- Kiểm tra trước khi tạo ---------------- */
  /** mode 'pxk' | 'bkls' — mỗi loại chứng từ chỉ đòi các ô nó dùng. */
  function validate(v, n, mode) {
    const problems = [];
    const flag = (id, bad, label, isCombo) => {
      const el = $('#ct-' + id), tx = isCombo ? $('#ct-' + id + '__txt') : null;
      [el, tx].forEach((x) => { if (x) x.classList.toggle('is-invalid', !!bad); });
      if (bad) problems.push({ label, el: (tx && !tx.classList.contains('d-none')) ? tx : el });
    };
    const start = parseInt(v.idBatDau, 10);
    flag('idBatDau', !Number.isFinite(start) || start < 0 || start + n - 1 > 999999, Number.isFinite(start) ? 'Số phiếu PXK phải từ 0 và đủ chỗ cho ' + n + ' phiếu (tối đa 999999)' : 'Số phiếu PXK bắt đầu');
    flag('canCuLenh', CT(st.type).bkls && !v.canCuLenh, 'Căn cứ lệnh');
    flag('veViec', !v.veViec, 'Về việc', true);
    flag('lyDo', !v.lyDo, 'Lý do xuất kho', true);
    flag('maHang', !v.maHang, 'Mã hàng'); flag('tenHang', !v.tenHang, 'Tên hàng hóa'); flag('dvt', !v.dvt, 'Đơn vị tính');
    flag('cua', !v.cua, 'Của (bên xuất)');
    flag('xuatKhoTai', !v.xuatKhoTai, 'Xuất kho tại', true);
    flag('nhapKho', !v.nhapKho, 'Nhập kho tại', true);
    return problems;
  }

  /* ---------------- Sinh PXKKVCNB ---------------- */
  /** rows = dòng phiếu cân của đợt (ds.rows); trả về { blob, count, from, to }. */
  function buildPxk(rows, v) {
    const co = cfg().companies.find((c) => c.id === v.cua);
    const cua = co ? C().companyAttr(co, 'cua') : '';
    const start = parseInt(v.idBatDau, 10);
    const idx = (n) => PXK_HEADER.indexOf(n);
    const aoa = [PXK_HEADER.slice()];
    rows.forEach((r, i) => {
      const row = new Array(PXK_HEADER.length).fill(null);
      const set = (n, val) => { const k = idx(n); if (k >= 0) row[k] = val; };
      set('STT', i + 1); set('LoaiHoaDon', 'pxk'); set('IDChungTu/MaBill', pad6(start + i));
      set('MaHang', v.maHang); set('TenHangHoaDichVu', v.tenHang); set('DonViTinh/ChietKhau', v.dvt);
      set('SoLuong', Math.round((r.net || 0) / 1000 * 100) / 100);
      set('TenDonVi', v.tenDonVi); set('NhapKhoTai', v.nhapKho);
      set('NgayXuatKho', r.dateStr || ''); set('CanCuLenh', v.canCuLenh); set('Ngay', r.dateStr || '');
      set('Cua', cua); set('VeViec', v.veViec); set('LyDoXuatKho', v.lyDo);
      set('NguoiVanChuyen', r.driver || ''); set('DonViVanChuyen', r.carrier || v.donViVC);
      set('PhuongTienVanChuyen', r.plate); set('XuatKhoTai', v.xuatKhoTai);
      aoa.push(row);
    });
    const ws = root.XLSX.utils.aoa_to_sheet(aoa), wb = root.XLSX.utils.book_new();
    root.XLSX.utils.book_append_sheet(wb, ws, 'PXK');
    const buf = root.XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    return { blob: new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), count: rows.length, from: start, to: start + rows.length - 1 };
  }

  /* ---------------- Nhật ký chứng từ & cảnh báo trùng số ---------------- */
  const fmtDT = (t) => { const d = new Date(t), p = (n) => String(n).padStart(2, '0'); return p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + d.getFullYear() + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()); };
  const coName = (id) => { const c = cfg().companies.find((x) => x.id === id); return c ? (c.short || c.name) : id; };
  function conflictText(cs) {
    return cs.slice(0, 3).map((c) => {
      const r = c.rec, d = DOCS()[r.type], t = d ? d.title : r.type;
      if (c.why === 'overlap') return 'dải ' + pad6(r.pxkFrom) + '–' + pad6(r.pxkTo) + ' đã lập ngày ' + fmtDT(r.at) + ' (' + t + ', đợt "' + r.batch + '")';
      if (c.why === 'again') return 'đợt này đã lập PXK ngày ' + fmtDT(r.at) + ' với dải ' + pad6(r.pxkFrom) + '–' + pad6(r.pxkTo);
      return 'số ' + r.soBkls + ' đã dùng ngày ' + fmtDT(r.at) + ' cho đợt "' + r.batch + '" (' + t + ')';
    }).join('; ') + (cs.length > 3 ? ' …' : '');
  }
  const BTN_LABEL = { ctPxk: '📊 Tạo PXKKVCNB (Excel)' };
  function restoreLabels() {
    Object.keys(BTN_LABEL).forEach((id) => { const b = $('#' + id); if (b) { b.textContent = BTN_LABEL[id]; b.classList.remove('btn-warning'); } });
  }
  function resetDup() {
    if (!st.dupKey) return;
    st.dupKey = ''; restoreLabels();
  }
  /** Có xung đột → báo và đổi nút thành "bấm lại để vẫn tạo"; trả true nếu cần DỪNG lần bấm này. */
  function confirmDup(key, btnId, cs) {
    if (!cs.length || st.dupKey === key) { st.dupKey = ''; restoreLabels(); return false; }
    st.dupKey = key;
    const b = $('#' + btnId); b.textContent = '⚠ Trùng số — bấm lại để vẫn tạo'; b.classList.add('btn-warning');
    toast('⚠ Có thể trùng chứng từ đã lập: ' + conflictText(cs) + '. Bấm nút lần nữa nếu vẫn muốn tạo.', 'warning');
    return true;
  }
  function renderLog() {
    if (!HAK.Issued) return;
    const all = HAK.Issued.list, rows = all.slice(0, 30);
    $('#ctLogCount').textContent = all.length ? '· ' + all.length + ' lần lập' + (all.length > rows.length ? ' (hiện ' + rows.length + ' gần nhất)' : '') : '';
    $('#ctLogBody').innerHTML = rows.length ? rows.map((r) => {
      const d = DOCS()[r.type];
      return '<tr><td>' + fmtDT(r.at) + '</td><td>' + (r.kind === 'pxk' ? 'PXKKVCNB' : 'BKLS') + '</td><td>' + (d ? esc(d.title) : esc(r.type)) + '</td><td>' + esc(coName(r.cid)) + '</td><td class="text-break">' + esc(r.batch) + '</td>' +
        '<td class="mono">' + (r.kind === 'pxk' ? pad6(r.pxkFrom) + ' → ' + pad6(r.pxkTo) : esc(r.soBkls) + (r.benMua ? '<div class="muted small">' + esc(r.benMua) + '</div>' : '')) + '</td>' +
        '<td class="num">' + G.fmtInt(r.trips) + '</td><td class="num">' + G.fmtTon(r.kg) + '</td><td class="small">' + (r.by ? esc(r.by) : '<span class="muted">(trước v2.6)</span>') + '</td><td><button class="btn btn-sm btn-outline-danger" type="button" data-del-log="' + esc(r.id) + '" title="Xóa dòng nhật ký">✕</button></td></tr>';
    }).join('') : '<tr><td colspan="10" class="muted">Chưa lập chứng từ nào.</td></tr>';
  }
  const logBase = (kind, b, v, s) => ({ kind, type: st.type, cid: v.cua, cua: coName(v.cua), batch: b.fileName, from: s.from, to: s.to, trips: s.trips, kg: s.kg, canCuLenh: v.canCuLenh });

  function onPxk() {
    const b = curBatch(); if (!b) { toast('Chưa có đợt để lập chứng từ.', 'error'); return; }
    const rows = b.ds.rows, v = readVals();
    const problems = validate(v, rows.length, 'pxk');
    if (problems.length) {
      toast('Chưa thể tạo file — cần bổ sung/sửa: ' + problems.map((p) => p.label).join('; ') + '.', 'warning');
      const first = problems.find((p) => p.el); if (first) first.el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    const start0 = parseInt(v.idBatDau, 10);
    if (HAK.Issued && confirmDup('pxk|' + v.cua + '|' + start0 + '|' + b.fileName, 'ctPxk', HAK.Issued.checkPxk({ cid: v.cua, from: start0, to: start0 + rows.length - 1, type: st.type, batch: b.fileName }))) return;
    let res;
    try { res = buildPxk(rows, v); } catch (e) { console.error(e); toast('Lỗi khi tạo PXKKVCNB: ' + e.message, 'error'); return; }
    const s = b.ds.stats;
    const name = 'PXKKVCNB_' + slug(DOCS()[st.type].title) + '_' + String(s.from).replace(/\//g, '') + (s.to && s.to !== s.from ? '-' + String(s.to).replace(/\//g, '') : '') + '.xlsx';
    HAK.Word.Files.saveBlob(res.blob, name);
    st.last = { from: res.from, to: res.to };
    if (HAK.Issued) HAK.Issued.add(Object.assign(logBase('pxk', b, v, s), { pxkFrom: res.from, pxkTo: res.to, tenDonVi: v.tenDonVi, fileName: name })).then(renderLog);
    persist(); updateSummary();
    toast('Đã tạo ' + name + ' (' + G.fmtInt(res.count) + ' phiếu, ' + pad6(res.from) + ' → ' + pad6(res.to) + ').', 'success');
  }

  /* ---------------- Sự kiện ---------------- */
  function switchType(t) {
    if (!CT(t)) return;
    if (st.type && built) st.vals[st.type] = readVals();
    st.type = t; st.batchName = '';
    resetDup();
    render();
    applyVals(withCompany(Object.assign(defaultsFor(t), st.vals[t] || {})));
    updateSummary(); persist();
  }
  function init() {
    buildForm();
    const saved = HAK.Store.get(KEY, null) || {};
    st.vals = saved.vals || {}; st.last = saved.last || null; st.batchName = saved.batchName || '';
    const t = saved.type && CT(saved.type) ? saved.type : '';
    st.type = t;
    render();
    if (t) applyVals(withCompany(Object.assign(defaultsFor(t), st.vals[t] || {})));
    $('#ctTypes').addEventListener('click', (e) => { const b = e.target.closest('[data-ct]'); if (b) switchType(b.dataset.ct); });
    $('#ctBatch').addEventListener('change', (e) => { resetDup(); st.batchName = e.target.value; persist(); updateSummary(); });
    const form = $('#ctForm');
    form.addEventListener('change', (e) => {
      const el = e.target;
      if (el.dataset && el.dataset.combo) {
        const id = el.dataset.combo, tx = $('#ct-' + id + '__txt');
        tx.classList.toggle('d-none', el.value !== CUSTOM); if (el.value === CUSTOM) tx.focus();
        if (id === 'veViec') {                       // chọn "Về việc" → gợi ý "Lý do xuất kho" tương ứng
          const op = C().operations().find((o) => o.veViec === el.value);
          if (op) setCombo('lyDo', op.lyDo);
        }
      }
      if (el.id === 'ct-cua') { setCombo('xuatKhoTai', khoAddressOf(el.value)); updateCuaInfo(); }
      el.classList.remove('is-invalid');
      resetDup(); persistSoon(); updateSummary();
    });
    form.addEventListener('input', (e) => { e.target.classList.remove('is-invalid'); resetDup(); persistSoon(); updateSummary(); });
    $('#ctLogBody').addEventListener('click', (e) => {
      const d = e.target.closest('[data-del-log]'); if (!d) return;
      HAK.UI.confirmClick(d, () => HAK.Issued.remove(d.dataset.delLog).then(() => { renderLog(); updateSummary(); }), 'Xóa?');
    });
    window.addEventListener('hak:flush', persist);
    $('#ctPxk').addEventListener('click', onPxk);
  }

  HAK.Chungtu = { init, render, buildPxk, PXK_HEADER, get type() { return st.type; } };
})(window);
