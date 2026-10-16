/**
 * config.js — Cấu hình mặc định + lưu trữ cục bộ (localStorage, có dự phòng bộ nhớ RAM).
 *
 * Toàn bộ dữ liệu công ty / kho / cài đặt chung đều SỬA ĐƯỢC trên giao diện (mục ⚙️ Cài đặt),
 * không hardcode trong logic sinh biên bản. Các giá trị ở đây chỉ là dữ liệu khởi tạo.
 */
(function (root) {
  'use strict';
  const HAK = (root.HAK = root.HAK || {});

  /* ---------------------------------------------------------------
   * 1. Lưu trữ an toàn (localStorage có thể bị chặn khi mở file://)
   * ------------------------------------------------------------- */
  const mem = {};
  /**
   * Ghi: localStorage (đồng bộ) + bản sao ngầm sang IndexedDB (HAK.DB kho "kv") → localStorage đầy / bị xóa vẫn khôi phục được ở lần mở sau
   * (HAK.Backup.boot). set() trả false CHỈ KHI cả hai đều không lưu được; khi đó gọi HAK.Store.onError(key) để giao diện báo người dùng.
   */
  HAK.Store = {
    onError: null,
    lastError: null,
    _fail(key) { this.lastError = { key, at: Date.now() }; if (typeof this.onError === 'function') { try { this.onError(key); } catch (e) { /* noop */ } } },
    get(key, def) {
      try {
        const v = root.localStorage.getItem(key);
        if (v !== null) return JSON.parse(v);
      } catch (e) { /* bỏ qua, dùng RAM */ }
      return key in mem ? mem[key] : def;
    },
    set(key, val) {
      mem[key] = val;
      let ls = false;
      try { root.localStorage.setItem(key, JSON.stringify(val)); ls = true; }
      catch (e) { /* đầy / bị chặn */ }
      const db = HAK.DB && HAK.DB.usable() ? HAK.DB : null;
      if (db) db.kvPut(key, val, ls).catch(() => { if (!ls) this._fail(key); });
      if (!ls && !db) { this._fail(key); return false; }
      return true;
    },
    remove(key) {
      delete mem[key];
      try { root.localStorage.removeItem(key); } catch (e) { /* noop */ }
      if (HAK.DB && HAK.DB.usable()) HAK.DB.kvDel(key).catch(() => { /* bỏ qua */ });
    },
    /** Mọi khóa của app (tiền tố "hak.") — dùng cho sao lưu toàn bộ. */
    keys() {
      const ks = new Set(Object.keys(mem));
      try { for (let i = 0; i < root.localStorage.length; i++) ks.add(root.localStorage.key(i)); } catch (e) { /* noop */ }
      return Array.from(ks).filter((k) => k.indexOf('hak.') === 0).sort();
    }
  };

  /* ---------------------------------------------------------------
   * 2. Dữ liệu khởi tạo: danh sách công ty
   *    kind: 'Công ty' | 'Chi nhánh'  (dùng cho câu chữ "BÊN GIAO (Chi nhánh xuất hàng — …)")
   * ------------------------------------------------------------- */
  const DEFAULT_COMPANIES = [
    {
      id: 'hak', kind: 'Công ty',
      cua: 'CÔNG TY TNHH HOÀNG ANH KHÔI', khoXuat: 'w_dn',
      name: 'Công ty TNHH Hoàng Anh Khôi', short: 'HAK',
      tax: '0401447476',
      address: 'Thửa đất số 1182, tờ bản đồ số 38, Thôn Thạch Nham Tây, Xã Bà Nà, TP. Đà Nẵng, Việt Nam',
      rep: 'Võ Văn Phụng', salutation: 'Ông', position: 'Giám đốc',
      factory: 'Nhà máy Hoàng Anh Khôi', email: 'hak.dn.ng@gmail.com', phone: '0911749449'
    },
    {
      id: 'dh', kind: 'Công ty',
      cua: 'Công ty TNHH SXTMDV Đại Hiệp', khoXuat: 'w_dh',
      name: 'Công ty TNHH SX-TM-DV Đại Hiệp', short: 'Đại Hiệp',
      tax: '4000858740',
      address: 'Thôn Phú Quý, Xã Đại Lộc, TP. Đà Nẵng, Việt Nam',
      rep: 'Võ Thị Như Ngọc', salutation: 'Bà', position: 'Phó Giám đốc',
      factory: 'Nhà máy Đại Hiệp', email: 'daihiepct2017@gmail.com', phone: '02353.762678'
    },
    {
      id: 'qn', kind: 'Công ty',
      cua: 'Công ty TNHH Hoàng Anh Khôi Quảng Nam', khoXuat: 'w_qc',
      name: 'Công ty TNHH Hoàng Anh Khôi Quảng Nam', short: 'HAKQN',
      tax: '4000956057',
      address: 'Cụm Công nghiệp Quế Cường, Xã Quế Sơn Trung, TP. Đà Nẵng, Việt Nam',
      rep: 'Võ Thị Như Ngọc', salutation: 'Bà', position: 'Phó Giám đốc',
      factory: 'Nhà máy Quế Cường', email: 'hoangangkhoiqn2019@gmail.com', phone: '0914404449'
    },
    {
      id: 'cn', kind: 'Chi nhánh',
      cua: 'CN Công ty TNHH Hoàng Anh Khôi', khoXuat: 'w_qs',
      name: 'Chi Nhánh Công ty TNHH Hoàng Anh Khôi', short: 'CN Quế Sơn',
      tax: '0401447476-001',
      address: 'Cụm Công nghiệp Đông Phú, Xã Quế Sơn, TP. Đà Nẵng, Việt Nam',
      rep: 'Võ Thị Như Ngọc', salutation: 'Bà', position: 'Phó Giám đốc',
      factory: 'Nhà máy Quế Sơn', email: 'chinhanhqueson@gmail.com', phone: '0911749449'
    }
  ];

  /* ---------------------------------------------------------------
   * 3. Dữ liệu khởi tạo: danh sách kho / cảng
   *    type: 'Kho xuất' | 'Kho nhận' | 'Kho gửi' | 'Cảng' | 'Kho khác'
   * ------------------------------------------------------------- */
  /* Nhóm hiển thị trong dropdown suy ra từ type:
   *   'Kho xuất'                → nhóm "Xuất kho tại (địa chỉ)"
   *   'Kho nhận' | 'Cảng' | ... → nhóm "Nhập kho tại"                                  */
  const DEFAULT_WAREHOUSES = [
    // --- Xuất kho tại (địa chỉ) ---
    { id: 'w_dn', name: 'Kho Hoàng Anh Khôi Đà Nẵng', short: 'Kho HAK Đà Nẵng', type: 'Kho xuất', label: 'HAK Đà Nẵng', code: 'HAKĐN',
      address: 'Thửa đất số 1182, tờ bản đồ số 38, thôn Thạch Nham Tây, xã Bà Nà, TP Đà Nẵng, Việt Nam.' },
    { id: 'w_qc', name: 'Kho Hoàng Anh Khôi Quế Cường', short: 'Kho HAK Quế Cường', type: 'Kho xuất', label: 'HAK Quế Cường', code: 'HAKQC',
      address: 'CCN Quế Cường, Xã Quế Sơn Trung, TP Đà Nẵng' },
    { id: 'w_dh', name: 'Kho Thành phẩm Đại Hiệp', short: 'Kho Đại Hiệp', type: 'Kho xuất', label: 'Đại Hiệp', code: 'ĐH',
      address: 'Thôn Phú Quý, Xã Đại Lộc, Tp Đà Nẵng' },
    { id: 'w_qs', name: 'Kho Hoàng Anh Khôi Quế Sơn (Chi Nhánh Công ty TNHH Hoàng Anh Khôi)', short: 'Kho Quế Sơn', type: 'Kho xuất', label: 'HAK Quế Sơn', code: 'HAKQS',
      address: 'CCN Đông Phú, Xã Quế Sơn, TP Đà Nẵng' },
    { id: 'w_dq', name: 'Kho Dung Quất', short: 'Kho Dung Quất', type: 'Kho xuất', label: 'Dung Quất', code: 'DQ',
      address: 'Kho Dung Quất, Tỉnh Quảng Ngãi' },
    // --- Nhập kho tại ---
    { id: 'w_ts', name: 'Cầu cảng Tiên Sa, Tp Đà Nẵng', short: 'Cảng Tiên Sa', type: 'Cảng', address: '' },
    { id: 'w_n_dq', name: 'Kho Dung Quất, Quảng Ngãi', short: 'Kho Dung Quất', type: 'Kho nhận', address: '' },
    { id: 'w_cdq', name: 'Cầu cảng Dung Quất, Quảng Ngãi', short: 'Cảng Dung Quất', type: 'Cảng', address: '' },
    { id: 'w_n_hak', name: 'Công ty TNHH Hoàng Anh Khôi tọa lạc tại xã Bà Nà, TP Đà Nẵng', short: 'Kho HAK (Bà Nà)', type: 'Kho nhận', address: '' },
    { id: 'w_n_qn', name: 'Công ty TNHH Hoàng Anh Khôi Quảng Nam tọa lạc tại xã Quế Sơn Trung, Tp Đà Nẵng', short: 'Kho HAK QN (Quế Sơn Trung)', type: 'Kho nhận', address: '' },
    { id: 'w_n_cn', name: 'CN Công ty TNHH Hoàng Anh Khôi, Xã Quế Sơn Trung, Tp Đà Nẵng', short: 'Kho CN HAK (Quế Sơn Trung)', type: 'Kho nhận', address: '' },
    { id: 'w_n_dh', name: 'Công ty TNHH SXTMDV Đại Hiệp tọa lạc tại Xã Đại Lộc, TP Đà Nẵng', short: 'Kho Đại Hiệp (Đại Lộc)', type: 'Kho nhận', address: '' }
  ];

  /* Bảng đổi mã đơn vị vận chuyển (cột mã trong "danh sách xe chạy tàu") → tên đầy đủ in ở cột ĐVVC */
  const DEFAULT_CARRIERS = [
    { code: 'HAK',    name: 'Công Ty TNHH Hoàng Anh Khôi' },
    { code: 'HAK QN', name: 'Công Ty TNHH Hoàng Anh Khôi Quảng Nam' },
    { code: 'ĐH',     name: 'Công Ty TNHH SX TM DV Đại Hiệp' },
    { code: 'HHH',    name: 'CÔNG TY TNHH DỊCH VỤ VÀ VẬN TẢI HÙNG HOÀNG HOA' }
  ];

  /* Chứng từ xuất hàng (BKLS + PXKKVCNB): "Về việc | Lý do xuất kho" chọn nhanh */
  const DEFAULT_OPERATIONS = [
    { veViec: 'Vận chuyển dăm gỗ Xuất khẩu',       lyDo: 'Xuất khẩu dăm gỗ' },
    { veViec: 'Vận chuyển dăm gỗ Trung chuyển kho', lyDo: 'Trung chuyển dăm gỗ' },
    { veViec: 'Vận chuyển dăm gỗ Trao đổi',         lyDo: 'Trao đổi dăm gỗ' },
    { veViec: 'Vận chuyển dăm gỗ Xuất bán',         lyDo: 'Xuất bán dăm gỗ' }
  ];
  /* Hình thức → nghiệp vụ mặc định (chỉ số trong DEFAULT_OPERATIONS) và có lập BKLS hay không (Trung chuyển / Điều chuyển nội bộ: chỉ PXKKVCNB) */
  HAK.CHUNGTU = {
    xuatkhau:   { op: 0, bkls: true },
    uythac:     { op: 0, bkls: true },
    xuatkhogui: { op: 0, bkls: false },   // v2.6.7: không lập BKLS — BKLS ở hình thức đích khi chuyển (Xuất khẩu / Ủy thác / Xuất bán)
    xuatban:    { op: 3, bkls: true },
    traodoi:    { op: 2, bkls: true },
    guikho:     { op: 1, bkls: false },
    dieuchuyen: { op: 1, bkls: false }
  };

  const DEFAULT_GENERAL = {
    place: 'Đà Nẵng',           // Nơi lập quyết định: "Đà Nẵng, ngày … tháng … năm …"
    blank: '………',             // Ký hiệu thay cho giá trị bỏ trống (để điền tay sau khi in)
    autoSwap: true,             // Tự hoán đổi Cân lần 1 / Cân lần 2 khi lần 1 > lần 2
    defaultCarrier: '',         // Đơn vị vận chuyển mặc định khi Excel không có cột này
    defaultDriver: '',          // Tài xế mặc định khi Excel không có cột này
    defaultWeightType: 'Trung Chuyển'
  };

  /* ---------------------------------------------------------------
   * 4. Danh mục mẫu (template) — KHÔNG hardcode nội dung, chỉ khai báo tên file
   * ------------------------------------------------------------- */
  HAK.TEMPLATE_DEFS = {
    GuiKho:     { file: 'GuiKho.docx',     title: 'Biên bản giao nhận hàng gửi kho theo đợt (phụ lục bảng kê từng phiếu cân)' },
    GuiKhoThang:{ file: 'GuiKhoThang.docx',title: 'Biên bản xác nhận hàng gửi kho theo tháng (phụ lục tổng hợp theo biển số)' },
    XuatKhoGui: { file: 'XuatKhoGui.docx', title: 'Bảng xác nhận hàng gửi kho xuất khẩu — theo từng tàu (phụ lục phiếu cân)' },
    UyThac:     { file: 'UyThac.docx',     title: 'Biên bản giao nhận hàng hóa ủy thác xuất khẩu (kèm phụ lục phiếu cân)' },
    DieuChuyen: { file: 'DieuChuyen.docx', title: 'Biên bản giao nhận hàng hóa điều chuyển nội bộ' },
    QuyetDinh:  { file: 'QuyetDinh.docx',  title: 'Quyết định điều chuyển hàng hóa' },
    TraoDoi:    { file: 'TraoDoi.docx',    title: 'Bảng chi tiết cân hàng — lô hàng trao đổi' },
    XuatKhau:   { file: 'XuatKhau.docx',   title: 'Bảng tổng hợp hàng xuất khẩu qua cân — theo từng tàu (tổng hợp theo ngày + phụ lục phiếu cân)' },
    XuatBan:    { file: 'XuatBan.docx',    title: 'Biên bản giao nhận hàng hóa — lô hàng xuất bán (hợp đồng mua bán, đơn giá / thành tiền)' }
  };

  /* ---------------------------------------------------------------
   * 5. Tài liệu placeholder (hiển thị ở Cài đặt → Mẫu)
   * ------------------------------------------------------------- */
  HAK.PLACEHOLDERS = [
    ['{{company}} {{address}} {{tax}}', 'Tên / địa chỉ / MST của BÊN GIAO (chủ hàng)'],
    ['{{director}} {{position}}', 'Người đại diện (kèm Ông/Bà) & chức vụ của BÊN GIAO'],
    ['{{giao_name}} {{giao_tax}} {{giao_address}} {{giao_rep}} {{giao_position}} {{giao_short}} {{giao_role}}', 'Đầy đủ thông tin BÊN GIAO'],
    ['{{nhan_name}} {{nhan_tax}} {{nhan_address}} {{nhan_rep}} {{nhan_position}} {{nhan_short}} {{nhan_role}}', 'Đầy đủ thông tin BÊN NHẬN'],
    ['{{from}} {{to}}', 'Kho giao (đi) / Kho nhận (đến) — tên kho'],
    ['{{kho_giao}} {{kho_nhan}} {{kho_giao_full}} {{kho_nhan_full}} {{kho_giao_short}} {{kho_nhan_short}}', 'Tên kho, tên + địa chỉ, tên rút gọn'],
    ['{{dateFrom}} {{dateTo}}', 'Ngày bắt đầu / kết thúc dữ liệu (dd/mm/yyyy)'],
    ['{{periodMonth}} {{periodYear}}', 'Tháng / năm của kỳ dữ liệu (MM, yyyy)'],
    ['{{date}} {{month}} {{year}} {{place}}', 'Ngày / tháng / năm lập văn bản; nơi lập'],
    ['{{weight}} {{weightKg}} {{weightRound}}', 'Tổng khối lượng: tấn (2 số lẻ) / kg / tấn làm tròn'],
    ['{{trip}} {{vehicles}}', 'Tổng số lượt xe (phiếu) / số xe (biển số) khác nhau'],
    ['{{#table}} {{stt}} {{ticket}} {{time1}} {{time2}} {{plate}} {{w1}} {{w2}} {{net}} {{driver}} {{carrier}} {{wh}} {{/table}}', 'Bảng chi tiết từng phiếu cân (lặp hàng bảng, không giới hạn dòng)'],
    ['{{#appendix}} {{stt}} {{trips}} {{plate}} {{dFrom}} {{dTo}} {{tons}} {{note}} {{/appendix}}', 'Tổng hợp theo từng xe (dùng cho mẫu tùy chỉnh)'],
    ['{{khoGuiCode}}', 'Xuất kho gửi: ký hiệu kho gửi (vd HAKĐN) ghi ở "Đại diện kho gửi …"'],
    ['{{dateFromShort}}', 'Ngày bắt đầu dạng dd/mm (dòng "ĐỢT 04/06 - 15/06/2026")'],
    ['{{totalLine}}', 'Dòng tổng cộng dựng sẵn: "TỔNG CỘNG: n phiếu — x kg (y tấn)"'],
    ['{{ship}} {{contractNo}} {{contractDate}} {{certNo}} {{certDate}} {{certWetText}} {{certDryText}} {{moistureText}}', 'Ủy thác: tên tàu, hợp đồng, chứng thư, khối lượng giám định, độ ẩm'],
    ['{{weightScaleTon}} {{weightScaleKg}} {{returnedText}} {{returnedTon}} {{returnedKg}} {{returnedTrip}} {{weightDelivered}}', 'Ủy thác: qua cân / xe trả về / thực giao'],
    ['{{#returned}}…{{/returned}} {{#hasReturned}}…{{/hasReturned}}', 'Ủy thác: bảng xe trả về (chỉ hiện khi có xe trả về)'],
    ['{{qdNo}} {{qdDate}} {{issuer_name}} {{issuer_rep}}', 'Điều chuyển: số / ngày Quyết định, đơn vị ban hành, người ký'],
    ['{{#showDetail}}…{{/showDetail}}', 'Gửi kho: khối điều kiện (luôn hiện; dành cho mẫu tùy chỉnh)']
  ];

  /* ---------------------------------------------------------------
   * 6. Nạp / lưu cấu hình
   * ------------------------------------------------------------- */
  const KEY = 'hak.config.v1';
  const VER = 2;   // v2: danh sách kho theo instruction dự án + bật mặc định "Tự hoán đổi"

  const clone = (o) => JSON.parse(JSON.stringify(o));

  HAK.Config = {
    data: null,
    load() {
      const saved = HAK.Store.get(KEY, null) || {};
      const migrate = Object.keys(saved).length && saved.ver !== VER;   // cấu hình cũ (trước v2)
      if (migrate) { delete saved.warehouses; saved.general = Object.assign({}, saved.general, { autoSwap: true }); }
      this.data = {
        ver: VER,
        companies: Array.isArray(saved.companies) && saved.companies.length ? saved.companies : clone(DEFAULT_COMPANIES),
        warehouses: Array.isArray(saved.warehouses) && saved.warehouses.length ? saved.warehouses : clone(DEFAULT_WAREHOUSES),
        general: Object.assign(clone(DEFAULT_GENERAL), saved.general || {}),
        carrierCodes: Array.isArray(saved.carrierCodes) && saved.carrierCodes.length ? saved.carrierCodes : clone(DEFAULT_CARRIERS)
      };
      // tên cũ tạm dùng của mã HHH → tên đầy đủ theo phiếu cân mẫu
      this.data.carrierCodes.forEach((c) => { if (c.code === 'HHH' && c.name === 'Công ty Hùng Hoàng Hoa') c.name = 'CÔNG TY TNHH DỊCH VỤ VÀ VẬN TẢI HÙNG HOÀNG HOA'; });
      if (migrate) this.save();
      return this.data;
    },
    /** Kho nhập tay trong form (chỉ tồn tại trong phiên, không lưu vào danh mục) */
    custom: {},
    save() { return HAK.Store.set(KEY, this.data); },
    reset() { HAK.Store.remove(KEY); return this.load(); },
    company(id) { return this.data.companies.find((c) => c.id === id) || this.data.companies[0]; },
    warehouse(id) { return this.custom[id] || this.data.warehouses.find((w) => w.id === id) || this.data.warehouses[0]; },
    /** Ghi phụ lục ('label') / ký hiệu ('code') của kho. Cấu hình lưu từ bản cũ chưa có 2 thuộc tính này → lấy theo kho mặc định cùng id. */
    whAttr(w, attr) {
      if (typeof w[attr] === 'string') return w[attr].trim();
      const d = DEFAULT_WAREHOUSES.find((x) => x.id === w.id);
      return d && d[attr] ? d[attr] : '';
    },
    /** Thuộc tính phụ của công ty ('cua' = tên ghi ở cột Của, 'khoXuat' = id kho xuất mặc định). Cấu hình lưu từ bản cũ chưa có → lấy theo công ty mặc định cùng id. */
    companyAttr(c, key) {
      if (typeof c[key] === 'string' && c[key].trim()) return c[key].trim();
      const d = DEFAULT_COMPANIES.find((x) => x.id === c.id);
      return (d && d[key]) || (key === 'cua' ? c.name : '');
    },
    /** Danh sách "Về việc | Lý do xuất kho". */
    operations() { return Array.isArray(this.data.operations) && this.data.operations.length ? this.data.operations : DEFAULT_OPERATIONS; },
    newId(prefix) { return prefix + Date.now().toString(36) + Math.floor(Math.random() * 1e3).toString(36); },
    defaults() { return { companies: clone(DEFAULT_COMPANIES), warehouses: clone(DEFAULT_WAREHOUSES), general: clone(DEFAULT_GENERAL), carrierCodes: clone(DEFAULT_CARRIERS) }; }
  };
  HAK.Config.load();
})(typeof window !== 'undefined' ? window : globalThis);
