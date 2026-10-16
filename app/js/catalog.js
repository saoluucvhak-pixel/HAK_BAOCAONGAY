/**
 * catalog.js — 📇 Danh mục KHÁCH HÀNG và HỢP ĐỒNG (xuất khẩu / ủy thác XK / xuất bán / trao đổi — đều theo tàu).
 *
 * Quy ước (Thủy chốt 26/09/2026):
 *  - Mỗi lô (1 tàu) = 1 hợp đồng; hợp đồng có HÌNH THỨC → khi in biên bản chỉ lọc ra hợp đồng đúng hình thức của trang.
 *  - Hai bên của hợp đồng (bên bán/giao · bên mua/nhận) đều chọn từ danh mục Khách hàng. Các công ty trong nhóm
 *    (Cài đặt → Công ty) tự có mặt trong danh mục với nhãn "Nội bộ" — thông tin luôn lấy theo Cài đặt.
 *  - 1 hợp đồng = 1 chứng thư: phần "Chi tiết thực hiện" (số/ngày chứng thư, KL giám định tươi/khô, độ ẩm, bên giao,
 *    kho xuất, khoảng ngày cân) nằm ngay trong hợp đồng; có tab riêng để xem / điền nhanh.
 *  - Lưu ở HAK.Store 'hak.catalog.v1' → tự có bản dự phòng IndexedDB (db.js) và nằm trong "Sao lưu toàn bộ" (backup.js).
 *  - Nhập nhanh từ file tổng hợp "XUẤT HÀNG" (sheet có SỐ TKHQ / TÀU / KHÁCH HÀNG, ví dụ NL_DH_XB): khớp theo SỐ TKHQ.
 */
(function (root) {
  'use strict';
  const HAK = (root.HAK = root.HAK || {});
  const KEY = 'hak.catalog.v1';
  const U = () => HAK.Excel.util;
  const G = () => HAK.Generator;
  const state = { data: { v: 2, customers: [], contracts: [] }, tab: 'contracts', q: '', type: '', built: false, editing: null };

  /** Hình thức có hợp đồng + nhãn 2 bên theo từng hình thức. */
  const TYPES = {
    xuatkhau: { label: 'Xuất khẩu', a: 'Bên xuất khẩu (bên bán)', b: 'Khách hàng (bên mua)', cur: 'USD' },
    uythac: { label: 'Ủy thác XK', a: 'Bên ủy thác', b: 'Bên nhận ủy thác', cur: 'USD' },
    xuatban: { label: 'Xuất bán', a: 'Bên bán', b: 'Bên mua', cur: 'VND' },
    traodoi: { label: 'Trao đổi', a: 'Bên giao', b: 'Bên nhận', cur: 'VND' }
  };
  const KINDS = { ngoai: 'Nước ngoài', trongnuoc: 'Trong nước', noibo: 'Nội bộ' };

  /* ---------------------------------------------------------------
   * 1. Tiện ích
   * ------------------------------------------------------------- */
  const pad = (n) => String(n).padStart(2, '0');
  const uid = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const keyName = (s) => U().norm(s).replace(/[^a-z0-9]/g, '');
  const num = (v) => { const n = U().parseNum(v); return n === null || n === undefined || !isFinite(n) ? null : n; };
  const isoOf = (v) => { const p = U().parseDT(v); return p && p.hasDate ? p.y + '-' + pad(p.m) + '-' + pad(p.d) : ''; };
  const vnDate = (iso) => (iso && /^\d{4}-\d\d-\d\d/.test(iso) ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4) : '');
  /** Số TKHQ luôn giữ dạng CHUỖI đủ chữ số (Excel hay lưu thành số thực 307091039861.0). */
  const tkhqOf = (v) => (v === null || v === undefined || v === '' ? '' : typeof v === 'number' ? String(Math.round(v)) : String(v).replace(/\s+/g, '').trim());
  const fmtNum = (n, d) => (n === null || n === undefined || n === '' ? '' : G().fmtDec(+n, d));

  /* ---------------------------------------------------------------
   * 2. Dữ liệu
   * ------------------------------------------------------------- */
  function load() {
    const d = HAK.Store.get(KEY, null);
    if (d && Array.isArray(d.customers) && Array.isArray(d.contracts)) {
      state.data = d;
      // Bản đầu (v1) chưa có hình thức / loại khách → mặc định: hợp đồng xuất khẩu, khách nước ngoài.
      d.contracts.forEach((c) => { if (!c.type) c.type = 'xuatkhau'; if (!c.currency) c.currency = TYPES[c.type].cur; });
      d.customers.forEach((c) => { if (!c.kind) c.kind = c.companyId ? 'noibo' : 'ngoai'; });
      d.v = 2;
    }
  }
  const save = () => HAK.Store.set(KEY, state.data);
  const customers = () => state.data.customers;
  const contracts = (type) => (type ? state.data.contracts.filter((c) => c.type === type) : state.data.contracts);
  const customer = (id) => customers().find((c) => c.id === id) || null;
  const contract = (id) => contracts().find((c) => c.id === id) || null;
  const byCompany = (companyId) => customers().find((c) => c.companyId === companyId) || null;
  /** Độ khô thực tế = KL giám định khô ÷ KL giám định tươi. */
  const dryActual = (c) => (c && c.mt > 0 && c.bdmt > 0 ? c.bdmt / c.mt : null);
  /** Nhãn ngắn 1 hợp đồng (ô chọn ở biên bản): Tàu · Số HĐ / TKHQ · Bên mua/nhận. */
  function label(c) {
    const cu = customer(c.customerId);
    return [c.ship || '(chưa có tàu)', c.no ? 'HĐ ' + c.no : (c.tkhq ? 'TKHQ ' + c.tkhq : ''), cu ? cu.name : ''].filter(Boolean).join(' · ');
  }
  /**
   * v2.6.2: hợp đồng "liên quan" các công ty `ids` khi bên bán/giao, bên mua/nhận hoặc bên giao hàng là công ty nội bộ thuộc `ids`.
   * Hợp đồng chưa gán bên nội bộ nào (vd nhập từ XUATHANG_DN chưa có bên bán) → coi là liên quan mọi công ty (không bị ẩn).
   */
  function relatedTo(c, ids) {
    if (!ids) return true;
    const cos = [c.sellerId, c.customerId, c.deliverId].map((id) => { const cu = customer(id); return cu && cu.companyId; }).filter(Boolean);
    return !cos.length || cos.some((x) => ids.indexOf(x) >= 0);
  }
  const byDateDesc = (a, b) => (b.date || '').localeCompare(a.date || '') || (b.tkhq || '').localeCompare(a.tkhq || '');

  /** Công ty trong nhóm (Cài đặt → Công ty) luôn có mặt trong danh mục Khách hàng, thông tin theo Cài đặt. */
  function syncCompanies() {
    let changed = false;
    ((HAK.Config && HAK.Config.data && HAK.Config.data.companies) || []).forEach((co) => {
      const want = { name: String(co.name || '').trim(), address: String(co.address || '').trim(), tax: String(co.tax || '').trim() };
      if (!want.name) return;
      let c = byCompany(co.id);
      if (!c) {                                   // trùng tên với khách nhập tay trước đó → gắn liên kết thay vì tạo bản thứ 2
        c = customers().find((x) => !x.companyId && keyName(x.name) === keyName(want.name));
        if (c) { c.companyId = co.id; c.kind = 'noibo'; changed = true; }
      }
      if (!c) { customers().push(Object.assign({ id: uid('kh'), kind: 'noibo', companyId: co.id, country: 'Việt Nam', note: '' }, want)); changed = true; return; }
      Object.keys(want).forEach((k) => { if (c[k] !== want[k]) { c[k] = want[k]; changed = true; } });
    });
    if (changed) save();
  }

  /** Tìm / tạo khách hàng theo tên (không phân biệt hoa thường, dấu). Địa chỉ trống thì bổ sung từ dữ liệu mới. */
  function ensureCustomer(name, address, kind) {
    name = String(name || '').replace(/\s+/g, ' ').trim(); if (!name) return null;
    const k = keyName(name);
    let c = customers().find((x) => keyName(x.name) === k);
    if (!c) { c = { id: uid('kh'), kind: kind || 'ngoai', name, address: String(address || '').trim(), country: '', tax: '', note: '' }; customers().push(c); return { c, created: true }; }
    if (!c.address && address) c.address = String(address).trim();
    return { c, created: false };
  }

  function upsertCustomer(o) {
    const old = o.id ? customer(o.id) : null;
    if (old && old.companyId) {                   // công ty nội bộ: chỉ sửa quốc gia / ghi chú (tên, địa chỉ, MST theo Cài đặt)
      old.country = String(o.country || '').trim(); old.note = String(o.note || '').trim(); save(); return { rec: old };
    }
    const name = String(o.name || '').replace(/\s+/g, ' ').trim();
    if (!name) return { error: 'Chưa nhập tên khách hàng.' };
    const dup = customers().find((x) => x.id !== o.id && keyName(x.name) === keyName(name));
    if (dup) return { error: 'Đã có khách hàng "' + dup.name + '".' };
    const rec = { id: o.id || uid('kh'), kind: KINDS[o.kind] && o.kind !== 'noibo' ? o.kind : 'ngoai', name, address: String(o.address || '').trim(), country: String(o.country || '').trim(), tax: String(o.tax || '').trim(), note: String(o.note || '').trim() };
    const i = customers().findIndex((x) => x.id === rec.id);
    if (i >= 0) customers()[i] = rec; else customers().push(rec);
    save(); return { rec };
  }
  function removeCustomer(id) {
    const c = customer(id);
    if (c && c.companyId) return { error: 'Đây là công ty trong nhóm — xóa / sửa ở Cài đặt → Công ty.' };
    const used = contracts().filter((x) => x.customerId === id || x.sellerId === id || x.deliverId === id).length;
    if (used) return { error: 'Khách hàng đang có trong ' + used + ' hợp đồng — xóa / đổi các hợp đồng đó trước.' };
    state.data.customers = customers().filter((x) => x.id !== id); save(); return {};
  }

  const CONTRACT_FIELDS = ['type', 'date', 'no', 'tkhq', 'ship', 'sellerId', 'customerId', 'product', 'priceUsd', 'currency', 'qty', 'dryFactory',
    'certNo', 'certDate', 'mt', 'bdmt', 'moisture', 'deliverId', 'whId', 'fromDate', 'toDate', 'filterTrips', 'note'];
  /** Ô "Chi tiết thực hiện" (chứng thư) — nhập ở biểu mẫu riêng (tab 🧪); biểu mẫu hợp đồng chỉ gồm các ô còn lại. */
  const EXEC_FIELDS = ['certNo', 'certDate', 'mt', 'bdmt', 'moisture', 'deliverId', 'whId', 'fromDate', 'toDate', 'filterTrips'];
  const INFO_FIELDS = CONTRACT_FIELDS.filter((k) => EXEC_FIELDS.indexOf(k) < 0);
  function cleanContract(o) {
    const r = { id: o.id || uid('hd') };
    r.type = TYPES[o.type] ? o.type : 'xuatkhau';
    r.date = isoOf(o.date) || ''; r.certDate = isoOf(o.certDate) || ''; r.fromDate = isoOf(o.fromDate) || ''; r.toDate = isoOf(o.toDate) || '';
    r.no = String(o.no || '').trim(); r.tkhq = tkhqOf(o.tkhq); r.ship = String(o.ship || '').replace(/\s+/g, ' ').trim();
    r.certNo = String(o.certNo || '').trim();
    r.sellerId = o.sellerId || ''; r.customerId = o.customerId || ''; r.deliverId = o.deliverId || ''; r.whId = o.whId || '';
    r.product = String(o.product || '').trim(); r.note = String(o.note || '').trim();
    r.currency = o.currency === 'VND' || o.currency === 'USD' ? o.currency : TYPES[r.type].cur;
    ['priceUsd', 'qty', 'mt', 'bdmt', 'moisture', 'dryFactory'].forEach((k) => { r[k] = num(o[k]); });
    r.filterTrips = !!o.filterTrips;
    return r;
  }
  function validateContract(r) {
    if (!r.ship && !r.tkhq && !r.no) return 'Cần ít nhất Tên tàu, Số hợp đồng hoặc Số TKHQ.';
    if (r.tkhq && contracts().some((x) => x.id !== r.id && x.tkhq === r.tkhq)) return 'Số TKHQ ' + r.tkhq + ' đã có trong danh mục.';
    if (r.no && contracts().some((x) => x.id !== r.id && x.type === r.type && x.no === r.no)) return 'Số hợp đồng ' + r.no + ' (' + TYPES[r.type].label + ') đã có trong danh mục.';
    if (r.dryFactory !== null && !(r.dryFactory > 0 && r.dryFactory < 1)) return 'Độ khô nhà máy phải trong khoảng 0 – 1 (ví dụ 0,48).';
    if (r.moisture !== null && !(r.moisture >= 0 && r.moisture < 100)) return 'Độ ẩm tính theo % (0 – 100).';
    if (r.fromDate && r.toDate && r.fromDate > r.toDate) return 'Ngày cân "từ ngày" đang sau "đến ngày".';
    return '';
  }
  function upsertContract(o) {
    const r = cleanContract(o), err = validateContract(r);
    if (err) return { error: err };
    const i = contracts().findIndex((x) => x.id === r.id);
    if (i >= 0) contracts()[i] = r; else contracts().push(r);
    save(); return { rec: r };
  }
  function removeContract(id) { state.data.contracts = contracts().filter((c) => c.id !== id); save(); return {}; }

  /* ---------------------------------------------------------------
   * 3. Nhập từ file tổng hợp "XUẤT HÀNG" (sheet danh mục lô, ví dụ NL_DH_XB)
   * ------------------------------------------------------------- */
  /** Nhận diện cột theo tiêu đề đã chuẩn hoá (không dấu, chữ thường). Thứ tự = độ ưu tiên. */
  const COLS = [
    ['dryFactory', /^do kho nha may/], ['fromDate', /tu ngay/], ['toDate', /den ngay/], ['certDate', /^ngay chung thu/], ['certNo', /chung thu/],
    ['moisture', /do am/], ['tkhq', /so tkhq|to khai/], ['custAddr', /^d(c|ia chi) khach/], ['customer', /^khach hang|^ten khach|^ben mua|^ben nhan/],
    ['seller', /^ben ban|^ben giao|^ben uy thac/], ['type', /^hinh thuc/],
    ['product', /ten hh|hang hoa|ten hang/], ['priceUsd', /don gia/], ['bdmt', /bdmt/], ['mt', /^kl mt$|^khoi luong mt|^kl tuoi|^mt$/],
    ['no', /so hop dong|^so hd/], ['date', /^ngay (don hang|hop dong|hd|ky)|^ngay$/], ['ship', /^tau|ten tau|chuyen tau/],
    ['filterTrips', /loc xe/], ['wh', /^kho xuat|^kho$/], ['note', /ghi chu/]
  ];
  function mapHeader(row) {
    const m = {};
    (row || []).forEach((v, c) => {
      const h = U().norm(v); if (!h) return;
      for (const [k, re] of COLS) { if (m[k] === undefined && re.test(h)) { m[k] = c; break; } }
    });
    return m;
  }
  function findWh(name) {
    const k = keyName(name); if (!k) return '';
    const w = (HAK.Config.data.warehouses || []).find((x) => keyName(x.name) === k || keyName(x.short) === k);
    return w ? w.id : '';
  }
  function typeOf(v) {
    const k = U().norm(v);
    if (!k) return 'xuatkhau';
    if (/uy thac/.test(k)) return 'uythac';
    if (/trao doi/.test(k)) return 'traodoi';
    if (/xuat ban|ban/.test(k)) return 'xuatban';
    return 'xuatkhau';
  }
  /** wb = workbook SheetJS. Trả về { sheet, rows, addedCustomers, addedContracts, updated, skipped } hoặc ném lỗi. */
  function importWorkbook(wb) {
    let found = null;
    for (const sn of wb.SheetNames) {
      const G2 = root.XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, raw: true, defval: null, blankrows: false });
      for (let r = 0; r < Math.min(G2.length, 15); r++) {
        const m = mapHeader(G2[r]);
        if (m.tkhq !== undefined && m.ship !== undefined && m.customer !== undefined) { found = { sn, G: G2, hr: r, m }; break; }
      }
      if (found) break;
    }
    if (!found) throw new Error('Không tìm thấy sheet danh mục lô xuất (cần các cột "SỐ TKHQ", "TÀU", "KHÁCH HÀNG" — như sheet NL_DH_XB).');
    syncCompanies();
    const { G: rowsAll, hr, m } = found, cell = (row, k) => (m[k] === undefined ? null : row[m[k]]);
    const out = { sheet: found.sn, rows: 0, addedCustomers: 0, addedContracts: 0, updated: 0, skipped: 0 };
    rowsAll.slice(hr + 1).forEach((row) => {
      row = row || [];
      const tkhq = tkhqOf(cell(row, 'tkhq')), ship = String(cell(row, 'ship') || '').replace(/\s+/g, ' ').trim();
      if (!tkhq && !ship) return;
      out.rows++;
      const cu = ensureCustomer(cell(row, 'customer'), cell(row, 'custAddr'));
      if (cu && cu.created) out.addedCustomers++;
      const se = cell(row, 'seller') ? ensureCustomer(cell(row, 'seller'), '') : null;
      if (se && se.created) out.addedCustomers++;
      const inc = {
        type: m.type !== undefined ? typeOf(cell(row, 'type')) : undefined,
        date: cell(row, 'date'), no: cell(row, 'no'), tkhq, ship, customerId: cu ? cu.c.id : '', sellerId: se ? se.c.id : '', product: cell(row, 'product'),
        priceUsd: cell(row, 'priceUsd'), mt: cell(row, 'mt'), bdmt: cell(row, 'bdmt'), dryFactory: cell(row, 'dryFactory'),
        certNo: cell(row, 'certNo'), certDate: cell(row, 'certDate'), moisture: cell(row, 'moisture'),
        fromDate: cell(row, 'fromDate'), toDate: cell(row, 'toDate'), note: cell(row, 'note'),
        filterTrips: /^(y|yes|x|co|có|1|true)$/i.test(String(cell(row, 'filterTrips') || '').trim()), whId: findWh(cell(row, 'wh'))
      };
      const isoD = isoOf(inc.date);
      const old = contracts().find((x) => (tkhq ? x.tkhq === tkhq : (!x.tkhq && keyName(x.ship) === keyName(ship) && x.date === isoD)));
      if (old) {                                     // chỉ ghi đè ô có dữ liệu mới — không xóa thông tin đã bổ sung trong app
        const merged = Object.assign({}, old);
        CONTRACT_FIELDS.forEach((k) => { const v = inc[k]; if (v !== null && v !== undefined && v !== '' && !(k === 'filterTrips' && !v)) merged[k] = v; });
        const r = cleanContract(merged);
        if (validateContract(r)) { out.skipped++; return; }
        contracts()[contracts().indexOf(old)] = r; out.updated++;
      } else {
        const r = cleanContract(inc);
        if (validateContract(r)) { out.skipped++; return; }
        contracts().push(r); out.addedContracts++;
      }
    });
    save();
    return out;
  }

  /* ---------------------------------------------------------------
   * 4. Giao diện trang "Danh mục"
   * ------------------------------------------------------------- */
  const $ = (s) => document.querySelector(s);
  const esc = (s) => HAK.UI.esc(s);
  const custName = (id) => { const c = customer(id); return c ? c.name : ''; };
  const whName = (id) => { const w = id ? (HAK.Config.data.warehouses || []).find((x) => x.id === id) : null; return w ? (w.short || w.name) : ''; };
  function build() {
    const host = $('#catalogRoot'); if (!host || state.built) return;
    host.innerHTML =
      '<div class="card mb-3"><div class="card-body">' +
      '<div class="d-flex flex-wrap align-items-center gap-2 mb-3">' +
      '<div class="btn-group flex-wrap" role="group">' +
      '<button class="btn btn-outline-primary active" data-ctab="contracts" type="button">🚢 Hợp đồng <span class="badge text-bg-secondary ms-1" id="catNContracts"></span></button>' +
      '<button class="btn btn-outline-primary" data-ctab="exec" type="button">🧪 Chi tiết thực hiện</button>' +
      '<button class="btn btn-outline-primary" data-ctab="customers" type="button">👤 Khách hàng <span class="badge text-bg-secondary ms-1" id="catNCustomers"></span></button></div>' +
      '<div class="ms-auto d-flex flex-wrap gap-2">' +
      '<button class="btn btn-primary" id="catAdd" type="button">＋ Thêm</button>' +
      '<label class="btn btn-outline-secondary mb-0" title="File tổng hợp Xuất hàng (vd XUATHANG_DN.xlsx) — sheet có cột SỐ TKHQ / TÀU / KHÁCH HÀNG">⬆ Nhập từ file Xuất hàng<input type="file" id="catImport" accept=".xlsx,.xls,.xlsm" hidden></label>' +
      '</div></div>' +
      '<div class="row g-2 mb-2"><div class="col-md-4" id="catTypeWrap"><select class="form-select" id="catType"><option value="">Tất cả hình thức</option>' +
      Object.keys(TYPES).map((t) => '<option value="' + t + '">' + esc(TYPES[t].label) + '</option>').join('') + '</select></div>' +
      '<div class="col"><input class="form-control" id="catSearch" placeholder="Tìm theo tàu, số hợp đồng, TKHQ, chứng thư, khách hàng…"></div>' +
      '<div class="col-auto d-flex align-items-center" id="catScopeWrap">' + (HAK.Auth && HAK.Auth.scopeSwitch ? HAK.Auth.scopeSwitch('catalog') : '') + '</div></div>' +
      '<div class="tbl-wrap"><table class="table table-hover align-middle mb-0"><thead id="catHead"></thead><tbody id="catBody"></tbody></table></div>' +
      '<div class="text-center muted py-4 d-none" id="catEmpty"></div>' +
      '<div class="form-text mt-2">Mỗi <b>tàu / lô</b> là <b>1 hợp đồng</b> (có hình thức: xuất khẩu, ủy thác, xuất bán, trao đổi) và <b>1 chứng thư</b> (tab Chi tiết thực hiện). ' +
      'Khi in biên bản, app chỉ đưa ra hợp đồng đúng hình thức của trang. Công ty trong nhóm tự có trong Khách hàng (nhãn <b>Nội bộ</b>, sửa ở Cài đặt → Công ty). ' +
      'Danh mục nằm trong <b>Sao lưu toàn bộ</b>.</div>' +
      '</div></div>' +
      '<div class="modal fade" id="catModal" tabindex="-1"><div class="modal-dialog modal-xl modal-dialog-scrollable"><div class="modal-content">' +
      '<div class="modal-header"><h5 class="modal-title" id="catModalTitle"></h5><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>' +
      '<div class="modal-body"><div class="row g-3" id="catForm"></div><div class="text-danger small mt-2" id="catErr"></div></div>' +
      '<div class="modal-footer"><button class="btn btn-outline-secondary" data-bs-dismiss="modal" type="button">Hủy</button><button class="btn btn-primary" id="catSave" type="button">Lưu</button></div>' +
      '</div></div></div>';
    state.built = true;
    host.addEventListener('click', onClick);
    $('#catSearch').addEventListener('input', HAK.UI.debounce((e) => { state.q = e.target.value.trim(); renderRows(); }, 150));
    $('#catType').addEventListener('change', (e) => { state.type = e.target.value; renderRows(); });
    $('#catImport').addEventListener('change', onImport);
    root.addEventListener('hak:scope', (e) => { if (e.detail && e.detail.key === 'catalog') renderRows(); });
    $('#catSave').addEventListener('click', onSave);
    $('#catForm').addEventListener('input', onFormInput);
    $('#catForm').addEventListener('change', onFormInput);
  }

  function renderRows() {
    const q = keyName(state.q);
    $('#catNContracts').textContent = contracts().length; $('#catNCustomers').textContent = customers().length;
    document.querySelectorAll('#catalogRoot [data-ctab]').forEach((b) => b.classList.toggle('active', b.dataset.ctab === state.tab));
    $('#catTypeWrap').classList.toggle('d-none', state.tab === 'customers');
    $('#catScopeWrap').classList.toggle('d-none', state.tab === 'customers');
    const scope = HAK.Auth && HAK.Auth.scopeIds ? HAK.Auth.scopeIds('catalog') : null;   // v2.6.2: mặc định chỉ HĐ liên quan công ty đang làm
    $('#catAdd').classList.toggle('d-none', state.tab === 'exec');
    const act = (id, noDel, exec) => '<td class="text-nowrap text-end"><div class="btn-group btn-group-sm"><button class="btn btn-outline-primary" data-edit="' + esc(id) + '" type="button">Sửa</button>' +
      (exec ? '<button class="btn btn-outline-primary" data-exec="' + esc(id) + '" type="button" title="Chi tiết thực hiện (chứng thư)">🧪</button>' : '') +
      (noDel ? '' : '<button class="btn btn-outline-danger" data-del="' + esc(id) + '" type="button">🗑</button>') + '</div></td>';
    const typeBadge = (t) => '<span class="badge badge-soft">' + esc((TYPES[t] || {}).label || t) + '</span>';
    let head, rows, empty;
    if (state.tab !== 'customers') {
      const list = contracts(state.type).slice().sort(byDateDesc).filter((c) => relatedTo(c, scope)).filter((c) => !q || keyName([c.ship, c.tkhq, c.no, c.certNo, c.product, custName(c.customerId), custName(c.sellerId)].join(' ')).indexOf(q) >= 0);
      if (state.tab === 'contracts') {
        head = '<tr><th>Hình thức</th><th>Ngày ký</th><th>Số HĐ</th><th>Tàu</th><th>Bên bán / giao</th><th>Bên mua / nhận</th><th>Số TKHQ</th><th>Hàng hóa (BKLS)</th><th class="num">Đơn giá</th><th class="num">KL tạm tính</th><th class="num">Độ khô NM</th><th></th></tr>';
        rows = list.map((c) => '<tr><td>' + typeBadge(c.type) + '</td><td class="text-nowrap">' + esc(vnDate(c.date)) + '</td><td>' + esc(c.no) + '</td><td class="fw-semibold">' + esc(c.ship) + '</td>' +
          '<td>' + esc(custName(c.sellerId)) + '</td><td>' + esc(custName(c.customerId)) + '</td><td class="mono">' + esc(c.tkhq) + '</td><td class="small">' + esc(c.product) + '</td>' +
          '<td class="num text-nowrap">' + (c.priceUsd !== null ? fmtNum(c.priceUsd, 2) + ' ' + esc(c.currency || '') : '') + '</td><td class="num">' + fmtNum(c.qty, 2) + '</td><td class="num">' + fmtNum(c.dryFactory, 3) + '</td>' + act(c.id, false, true) + '</tr>').join('');
      } else {
        head = '<tr><th>Hình thức</th><th>Tàu</th><th>Số HĐ</th><th>Số chứng thư</th><th>Ngày CT</th><th class="num">KL tươi (MT)</th><th class="num">KL khô (BDMT)</th><th class="num">Độ ẩm %</th><th class="num">Độ khô</th><th>Bên giao</th><th>Kho xuất</th><th>Ngày cân</th><th></th></tr>';
        rows = list.map((c) => { const dk = dryActual(c); return '<tr><td>' + typeBadge(c.type) + '</td><td class="fw-semibold">' + esc(c.ship) + '</td><td>' + esc(c.no) + '</td><td class="mono">' + esc(c.certNo) + '</td><td class="text-nowrap">' + esc(vnDate(c.certDate)) + '</td>' +
          '<td class="num">' + fmtNum(c.mt, 2) + '</td><td class="num">' + fmtNum(c.bdmt, 2) + '</td><td class="num">' + fmtNum(c.moisture, 2) + '</td><td class="num">' + (dk ? fmtNum(dk, 4) : '') + '</td>' +
          '<td>' + esc(custName(c.deliverId)) + '</td><td>' + esc(whName(c.whId)) + '</td><td class="text-nowrap small">' + esc([vnDate(c.fromDate), vnDate(c.toDate)].filter(Boolean).join(' → ')) + '</td>' +
          '<td class="text-end"><button class="btn btn-sm btn-outline-primary" data-exec="' + esc(c.id) + '" type="button">' + (c.certNo || c.mt ? 'Sửa' : 'Nhập') + '</button></td></tr>'; }).join('');
      }
      empty = contracts().length ? 'Không có hợp đồng khớp bộ lọc.' + (scope ? ' Đang chỉ hiện hợp đồng liên quan công ty đang làm — bật <b>Xem tất cả công ty</b> để xem hết.' : '') : 'Chưa có hợp đồng. Bấm <b>＋ Thêm</b> hoặc <b>⬆ Nhập từ file Xuất hàng</b> (vd XUATHANG_DN.xlsx) để nạp sẵn danh sách lô.';
    } else {
      head = '<tr><th>Tên khách hàng</th><th>Loại</th><th>Địa chỉ</th><th>Quốc gia</th><th>MST / Mã số</th><th class="num">Số hợp đồng</th><th></th></tr>';
      const list = customers().slice().sort((a, b) => (a.kind === 'noibo' ? 0 : 1) - (b.kind === 'noibo' ? 0 : 1) || a.name.localeCompare(b.name))
        .filter((c) => !q || keyName([c.name, c.address, c.country, c.tax].join(' ')).indexOf(q) >= 0);
      rows = list.map((c) => '<tr><td class="fw-semibold">' + esc(c.name) + '</td><td><span class="badge badge-soft">' + esc(KINDS[c.kind] || '') + '</span></td><td class="small">' + esc(c.address) + '</td><td>' + esc(c.country) + '</td><td class="mono">' + esc(c.tax) + '</td>' +
        '<td class="num">' + contracts().filter((x) => x.customerId === c.id || x.sellerId === c.id).length + '</td>' + act(c.id, !!c.companyId) + '</tr>').join('');
      empty = customers().length ? 'Không có khách hàng khớp tìm kiếm.' : 'Chưa có khách hàng.';
    }
    $('#catHead').innerHTML = head; $('#catBody').innerHTML = rows;
    $('#catEmpty').innerHTML = empty; $('#catEmpty').classList.toggle('d-none', !!rows);
  }

  /* ---------- Biểu mẫu thêm / sửa ---------- */
  const inp = (id, label, col, val, opt) => {
    opt = opt || {};
    return '<div class="col-md-' + col + '"><label class="form-label" for="cf-' + id + '" id="cf-' + id + '-lbl">' + label + '</label>' +
      '<input class="form-control" id="cf-' + id + '" type="' + (opt.type || 'text') + '"' + (opt.step ? ' step="' + opt.step + '" inputmode="decimal"' : '') + (opt.list ? ' list="' + opt.list + '"' : '') +
      (opt.ro ? ' readonly' : '') + ' value="' + esc(val === null || val === undefined ? '' : val) + '" placeholder="' + esc(opt.ph || '') + '" autocomplete="off">' +
      (opt.help !== undefined ? '<div class="form-text" id="cf-' + id + '-help">' + opt.help + '</div>' : '') + '</div>';
  };
  const custSelect = (id, label, col, val, allowNew) => {
    const opts = customers().slice().sort((a, b) => (a.kind === 'noibo' ? 0 : 1) - (b.kind === 'noibo' ? 0 : 1) || a.name.localeCompare(b.name))
      .map((x) => '<option value="' + esc(x.id) + '"' + (x.id === val ? ' selected' : '') + '>' + esc(x.name) + (x.kind === 'noibo' ? ' (nội bộ)' : '') + '</option>').join('');
    return '<div class="col-md-' + col + '"><label class="form-label" for="cf-' + id + '" id="cf-' + id + '-lbl">' + label + '</label><select class="form-select" id="cf-' + id + '"><option value="">—</option>' + opts +
      (allowNew ? '<option value="__new">＋ Khách hàng mới…</option>' : '') + '</select>' +
      (allowNew ? '<div class="d-none mt-2" id="cf-' + id + '-new"><input class="form-control mb-1" id="cf-' + id + '-newName" placeholder="Tên khách hàng mới"><input class="form-control" id="cf-' + id + '-newAddr" placeholder="Địa chỉ"></div>' : '') + '</div>';
  };
  const secTitle = (t, id) => '<div class="col-12"' + (id ? ' id="' + id + '"' : '') + '><div class="sec-title mt-2 mb-0">' + t + '</div></div>';
  function openForm(kind, id) {
    const isC = kind !== 'customers', rec = id ? (isC ? contract(id) : customer(id)) : null;
    state.editing = { kind: isC ? 'contracts' : 'customers', id: rec ? rec.id : '' };
    $('#catErr').textContent = '';
    if (isC) {
      const last = contracts().slice().sort(byDateDesc)[0] || {};
      const c = rec || { type: state.type || 'xuatkhau', dryFactory: last.dryFactory || 0.48 };
      $('#catModalTitle').textContent = (rec ? 'Sửa ' : 'Thêm ') + 'hợp đồng';
      const products = Array.from(new Set(contracts().map((x) => x.product).filter(Boolean)));
      $('#catForm').innerHTML =
        secTitle('Thông tin hợp đồng') +
        '<div class="col-md-3"><label class="form-label" for="cf-type">Hình thức</label><select class="form-select" id="cf-type">' +
        Object.keys(TYPES).map((t) => '<option value="' + t + '"' + (t === c.type ? ' selected' : '') + '>' + esc(TYPES[t].label) + '</option>').join('') + '</select></div>' +
        inp('no', 'Số hợp đồng', 5, c.no, { ph: 'VD: UTXK/ĐN-ĐH/0626' }) + inp('date', 'Ngày ký', 4, c.date, { type: 'date' }) +
        inp('ship', 'Tàu / chuyến', 6, c.ship, { ph: 'VD: MV. FLORA PIONEER V153' }) + inp('tkhq', 'Số tờ khai hải quan (TKHQ)', 6, c.tkhq, { ph: 'Nếu có' }) +
        custSelect('sellerId', TYPES[c.type].a, 6, c.sellerId, true) + custSelect('customerId', TYPES[c.type].b, 6, c.customerId, true) +
        inp('product', 'Tên hàng hóa trên BKLS', 6, c.product, { list: 'cfProducts', ph: 'VD: Dăm gỗ keo lai FSC Controlled Wood' }) + '<datalist id="cfProducts">' + products.map((p) => '<option value="' + esc(p) + '">').join('') + '</datalist>' +
        inp('priceUsd', 'Đơn giá', 2, c.priceUsd, { type: 'number', step: 'any' }) +
        '<div class="col-md-1"><label class="form-label" for="cf-currency">Tiền</label><select class="form-select px-2" id="cf-currency">' + ['USD', 'VND'].map((x) => '<option' + (x === (c.currency || TYPES[c.type].cur) ? ' selected' : '') + '>' + x + '</option>').join('') + '</select></div>' +
        inp('qty', 'KL tạm tính (BDMT)', 3, c.qty, { type: 'number', step: 'any' }) +
        inp('dryFactory', 'Độ khô nhà máy (hệ số BKLS)', 3, c.dryFactory, { type: 'number', step: 'any', ph: '0.48' }) + inp('note', 'Ghi chú', 9, c.note) +
        '<div class="col-12"><div class="form-text">Số liệu chứng thư (số / ngày chứng thư, KL giám định, độ ẩm, bên giao, kho xuất, ngày cân) nhập ở tab <b>🧪 Chi tiết thực hiện</b> hoặc nút 🧪 ở bảng hợp đồng.</div></div>';
      onFormInput();
    } else {
      const c = rec || { kind: 'ngoai' }, ro = !!c.companyId;
      $('#catModalTitle').textContent = (rec ? 'Sửa ' : 'Thêm ') + 'khách hàng';
      $('#catForm').innerHTML =
        (ro ? '<div class="col-12"><div class="alert alert-info py-2 mb-0">Công ty trong nhóm — tên, địa chỉ, MST lấy theo <b>Cài đặt → Công ty</b>; ở đây chỉ sửa quốc gia / ghi chú.</div></div>' : '') +
        inp('name', 'Tên khách hàng', 9, c.name, { ph: 'VD: OCM FIBER TRADING CO., LTD', ro }) +
        '<div class="col-md-3"><label class="form-label" for="cf-kind">Loại</label><select class="form-select" id="cf-kind"' + (ro ? ' disabled' : '') + '>' +
        Object.keys(KINDS).filter((k) => ro || k !== 'noibo').map((k) => '<option value="' + k + '"' + (k === c.kind ? ' selected' : '') + '>' + KINDS[k] + '</option>').join('') + '</select></div>' +
        inp('address', 'Địa chỉ', 12, c.address, { ro }) + inp('country', 'Quốc gia', 6, c.country, { ph: 'VD: Japan' }) + inp('tax', 'MST / Mã số doanh nghiệp', 6, c.tax, { ro }) + inp('note', 'Ghi chú', 12, c.note);
    }
    bootstrap.Modal.getOrCreateInstance($('#catModal')).show();
  }
  /** Biểu mẫu RIÊNG "Chi tiết thực hiện" (1 hợp đồng = 1 chứng thư): thông tin hợp đồng chỉ để xem, không sửa được ở đây. */
  function openExec(id) {
    const c = contract(id); if (!c) return;
    state.editing = { kind: 'exec', id: c.id };
    $('#catErr').textContent = '';
    $('#catModalTitle').textContent = 'Chi tiết thực hiện — ' + (c.ship || c.no || c.tkhq);
    const t = TYPES[c.type] || TYPES.xuatkhau;
    const whOpts = '<option value="">—</option>' + (HAK.Config.data.warehouses || []).map((w) => '<option value="' + esc(w.id) + '"' + (w.id === c.whId ? ' selected' : '') + '>' + esc(w.name) + '</option>').join('');
    const ro = (label, val) => '<div class="col-6 col-md-4"><div class="small muted">' + esc(label) + '</div><div class="fw-semibold text-break">' + (val ? esc(val) : '<span class="muted">—</span>') + '</div></div>';
    $('#catForm').innerHTML =
      '<div class="col-12"><div class="border rounded p-2"><div class="row g-2">' +
      ro('Hình thức', t.label) + ro('Tàu / chuyến', c.ship) + ro('Số hợp đồng · ngày ký', [c.no, vnDate(c.date)].filter(Boolean).join(' · ')) +
      ro(t.a, custName(c.sellerId)) + ro(t.b, custName(c.customerId)) + ro('Số TKHQ · độ khô NM', [c.tkhq, c.dryFactory !== null ? fmtNum(c.dryFactory, 3) : ''].filter(Boolean).join(' · ')) +
      '</div><div class="form-text mt-1 mb-0">Thông tin hợp đồng chỉ để đối chiếu — sửa ở tab 🚢 Hợp đồng.</div></div></div>' +
      inp('certNo', 'Số chứng thư', 6, c.certNo, { ph: 'VD: 26E04GPT00232-07' }) + inp('certDate', 'Ngày chứng thư', 6, c.certDate, { type: 'date' }) +
      inp('mt', 'KL giám định — tấn tươi (MT)', 4, c.mt, { type: 'number', step: 'any' }) + inp('bdmt', 'KL giám định — tấn khô (BDMT)', 4, c.bdmt, { type: 'number', step: 'any', help: '' }) +
      inp('moisture', 'Độ ẩm (%)', 4, c.moisture, { type: 'number', step: 'any' }) +
      custSelect('deliverId', 'Bên giao hàng', 6, c.deliverId, false) +
      '<div class="col-md-6"><label class="form-label" for="cf-whId">Kho xuất</label><select class="form-select" id="cf-whId">' + whOpts + '</select></div>' +
      inp('fromDate', 'Ngày cân từ', 4, c.fromDate, { type: 'date' }) + inp('toDate', 'Ngày cân đến', 4, c.toDate, { type: 'date' }) +
      '<div class="col-md-4 d-flex align-items-end"><div class="form-check"><input class="form-check-input" type="checkbox" id="cf-filterTrips"' + (c.filterTrips ? ' checked' : '') + '><label class="form-check-label" for="cf-filterTrips">Lọc xe theo khoảng ngày cân khi in biên bản</label></div></div>';
    onFormInput();
    bootstrap.Modal.getOrCreateInstance($('#catModal')).show();
    $('#catModal').addEventListener('shown.bs.modal', () => { const f = $('#cf-certNo'); if (f) f.focus(); }, { once: true });
  }
  function onFormInput(e) {
    const kind = state.editing && state.editing.kind;
    if (kind === 'contracts') {
      ['sellerId', 'customerId'].forEach((k) => { const s = $('#cf-' + k); if (s) $('#cf-' + k + '-new').classList.toggle('d-none', s.value !== '__new'); });
      const t = TYPES[$('#cf-type').value] || TYPES.xuatkhau;
      $('#cf-sellerId-lbl').textContent = t.a; $('#cf-customerId-lbl').textContent = t.b;
      if (e && e.target && e.target.id === 'cf-type') $('#cf-currency').value = t.cur;
      return;
    }
    if (kind !== 'exec') return;
    const mt = num($('#cf-mt').value), bd = num($('#cf-bdmt').value), h = $('#cf-bdmt-help');
    if (h) h.textContent = mt > 0 && bd > 0 ? 'Độ khô thực tế: ' + G().fmtDec(bd / mt, 4) : '';
  }
  const fv = (id) => { const el = $('#cf-' + id); return el ? (el.type === 'checkbox' ? el.checked : el.value) : ''; };
  function onSave() {
    const ed = state.editing; if (!ed) return;
    let res;
    if (ed.kind === 'exec') {
      const o = Object.assign({}, contract(ed.id));                 // giữ nguyên thông tin hợp đồng, chỉ thay ô chứng thư
      EXEC_FIELDS.forEach((k) => { o[k] = fv(k); });
      res = upsertContract(o);
    } else if (ed.kind === 'contracts') {
      const o = Object.assign({}, ed.id ? contract(ed.id) : {}, { id: ed.id || uid('hd') });   // giữ nguyên số liệu chứng thư đã nhập ở tab 🧪
      INFO_FIELDS.forEach((k) => { o[k] = fv(k); });
      // Kiểm tra hợp đồng TRƯỚC — tránh tạo khách hàng mới rồi hợp đồng lại không lưu được.
      const err = validateContract(cleanContract(Object.assign({}, o, { sellerId: '', customerId: '' })));
      if (err) { $('#catErr').textContent = err; return; }
      for (const k of ['sellerId', 'customerId']) {
        if (o[k] !== '__new') continue;
        if (!String(fv(k + '-newName')).trim()) { $('#catErr').textContent = 'Chưa nhập tên khách hàng mới.'; return; }
        // trùng tên → dùng lại khách hàng đã có; khách mới: bên mua HĐ xuất khẩu = nước ngoài, còn lại = trong nước
        o[k] = ensureCustomer(fv(k + '-newName'), fv(k + '-newAddr'), o.type === 'xuatkhau' && k === 'customerId' ? 'ngoai' : 'trongnuoc').c.id;
      }
      res = upsertContract(o);
    } else {
      res = upsertCustomer({ id: ed.id, kind: fv('kind'), name: fv('name'), address: fv('address'), country: fv('country'), tax: fv('tax'), note: fv('note') });
    }
    if (res.error) { $('#catErr').textContent = res.error; return; }
    bootstrap.Modal.getOrCreateInstance($('#catModal')).hide();
    state.editing = null; renderRows(); changed();
    HAK.UI.toast('Đã lưu ' + (ed.kind === 'exec' ? 'chi tiết thực hiện của ' : ed.kind === 'contracts' ? 'hợp đồng ' : 'khách hàng ') + (ed.kind === 'customers' ? res.rec.name : (res.rec.no || res.rec.ship || res.rec.tkhq)) + '.', 'success');
  }
  function onClick(e) {
    const tab = e.target.closest('[data-ctab]');
    if (tab) { state.tab = tab.dataset.ctab; renderRows(); return; }
    if (e.target.closest('#catAdd')) { openForm(state.tab); return; }
    const ex = e.target.closest('[data-exec]');
    if (ex) { openExec(ex.dataset.exec); return; }
    const ed = e.target.closest('[data-edit]');
    if (ed) { openForm(state.tab === 'exec' ? 'contracts' : state.tab, ed.dataset.edit); return; }
    const del = e.target.closest('[data-del]');
    if (del) {
      HAK.UI.confirmClick(del, () => {
        const r = state.tab === 'customers' ? removeCustomer(del.dataset.del) : removeContract(del.dataset.del);
        if (r.error) HAK.UI.toast(r.error, 'warning'); else { renderRows(); changed(); HAK.UI.toast('Đã xóa.', 'info'); }
      }, 'Xóa?');
    }
  }
  async function onImport(e) {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    const { Loading, toast } = HAK.UI;
    Loading.show('Đang đọc "' + f.name + '"…');
    try {
      const info = await HAK.Excel.readFile(f);
      const r = importWorkbook(info.workbook);
      state.tab = 'contracts'; renderRows(); changed();
      toast('Đã nhập sheet "' + r.sheet + '": ' + r.rows + ' lô — thêm ' + r.addedContracts + ' hợp đồng, cập nhật ' + r.updated + ', thêm ' + r.addedCustomers + ' khách hàng' +
        (r.skipped ? '; bỏ qua ' + r.skipped + ' dòng lỗi (trùng TKHQ / số liệu sai)' : '') + '.', r.skipped ? 'warning' : 'success');
    } catch (err) { console.error(err); toast(err.message || String(err), 'error'); }
    finally { Loading.hide(); }
  }
  /** Báo cho các phần khác (biên bản — Phase 2) biết danh mục vừa đổi. */
  const changed = () => { try { window.dispatchEvent(new CustomEvent('hak:catalog')); } catch (e) { /* bỏ qua */ } };

  function render() { syncCompanies(); build(); renderRows(); }
  function init() { load(); syncCompanies(); build(); }

  load();   // có dữ liệu ngay khi các module khác cần (trước cả init)
  HAK.Catalog = {
    TYPES, init, render, load, save, syncCompanies,
    customers, contracts, customer, contract, byCompany, label, dryActual, relatedTo,
    upsertCustomer, removeCustomer, upsertContract, removeContract, importWorkbook,
    util: { tkhqOf, isoOf, vnDate }
  };
})(window);
