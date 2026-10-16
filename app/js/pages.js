/**
 * pages.js — 4 trang sinh biên bản (Gửi kho / Ủy thác / Điều chuyển / Trao đổi).
 * Mỗi trang gồm: bộ lọc phạm vi dữ liệu · form thông số · khung "kết quả tự tính" · nút Sinh biên bản.
 * Form được khai báo dạng dữ liệu (DOCS) nên thêm/bớt trường rất dễ.
 */
(function (root) {
  'use strict';
  const HAK = (root.HAK = root.HAK || {});
  const { $, $$, esc, toast, Loading, debounce, todayISO } = HAK.UI;
  const G = () => HAK.Generator;
  const fmtInt = (n) => G().fmtInt(n);

  /* ===============================================================
   * Bảng kê lâm sản (BKLS) — dùng chung cho các loại biên bản có xuất BKLS (xem BKLS_TYPES bên dưới).
   * autoBuyer: true → "Bên mua/nhận" có thể để trống, generateBkls() sẽ tự lấy theo công ty "Bên nhận" (nhanId) đã chọn.
   * hasReturned: true → loại này có "Chọn xe trả về" (extra:'returned') → hiện thêm ô "Nơi nhận hàng trả về" và
   *   generateBkls() sẽ tự tách riêng: BKLS chính (không tính xe trả về) + BKLS TRẢ VỀ (chiều ngược lại, số = Số BKLS + "-TV").
   * ============================================================= */
  /* v2.7.1 (Thủy 30/09/2026): nguồn gốc lâm sản mặc định mới. Form đã lưu còn đúng câu mặc định cũ → tự đổi sang câu mới (saved());
   * câu người dùng tự sửa thì giữ nguyên. Giữ đồng bộ với HAK.Bkls.DEFAULT_NGUON_GOC (bkls.js). */
  const NGUON_GOC_DEF = 'Dăm gỗ keo sản xuất từ nguyên liệu gỗ keo rừng trồng mua từ cá nhân và hộ gia đình';
  const NGUON_GOC_OLD = 'Dăm gỗ keo sản xuất mua nguyên liệu gỗ keo rừng từ hộ gia đình và dăm gỗ keo mua từ Chi nhánh Công ty TNHH Hoàng Anh Khôi.';
  /* v2.7.6 (Thủy chọn phương án A): ô "Mã HS" ở tab BKLS thay chữ cố định "B11 3" trong mẫu BKLS. Mặc định theo hình thức:
   * Xuất khẩu / Ủy thác xuất khẩu = 4401220090 (v2.7.7 Thủy: đúng mã 10 số trên tờ khai, bản v2.7.6 ghi thiếu "00" → 4401.22.90);
   * hàng nội địa để trống (mục chỉ áp dụng XNK). Hồ sơ cũ trong Lưu trữ chưa có ô này → lấy mặc định của hình thức. In nguyên văn ô nhập, không tự định dạng. */
  const MA_HS_DEF = { xuatkhau: '4401220090', uythac: '4401220090', xuatkhogui: '4401220090' };
  const MA_HS_OLD = '4401.22.90';   // mặc định sai của v2.7.6 → form đã lưu còn đúng giá trị này thì tự đổi (saved())
  const maHsOf = (type, p) => {
    const v = p.bklsMaHs !== undefined ? String(p.bklsMaHs || '').trim() : (MA_HS_DEF[type] || '');
    return v === MA_HS_OLD && MA_HS_DEF[type] ? MA_HS_DEF[type] : v;   // hồ sơ lập bằng v2.7.6 (mặc định sai) → tạo lại BKLS ra mã đúng
  };
  function bklsGroup(autoBuyer, hasReturned, maHsDef) {
    const fields = [
      { id: 'bklsSoBkls', label: 'Số BKLS', type: 'text', ph: 'VD: 010/2026/BKLS', col: 4, help: true },   // help: gợi ý số kế tiếp (bklsHint)
      { id: 'bklsHeSo', label: 'Hệ số RMT → BDMT', type: 'text', def: '0.468', col: 3 },
      { id: 'bklsNgayLap', label: 'Ngày lập bảng kê', type: 'date', col: 3 },
      { id: 'bklsNgayLapXe', label: 'Bản từng xe: lấy ngày cân của từng xe', type: 'check', def: true, col: 2 },
      { id: 'bklsBenMuaTen', label: 'Tên bên mua / nhận chuyển giao', type: 'text',
        ph: autoBuyer ? 'Để trống = tự lấy theo "Bên nhận/Bên mua" đã chọn ở trên' : 'Bắt buộc nhập tay', col: 8 },
      { id: 'bklsBenMuaMst', label: 'Số GCN / MSDN / MST bên mua', type: 'text', col: 4 },
      { id: 'bklsBenMuaDc', label: 'Địa chỉ bên mua', type: 'text', col: 12 },
      { id: 'bklsBenMuaDt', label: 'Số điện thoại bên mua (không bắt buộc)', type: 'text', col: 6 },
      { id: 'bklsBenMuaEmail', label: 'Email bên mua (không bắt buộc)', type: 'text', col: 6 },
      { id: 'bklsNguonGoc', label: 'Nguồn gốc lâm sản (mục 7)', type: 'text',
        def: NGUON_GOC_DEF, col: 9 },
      { id: 'bklsMaHs', label: 'Mã HS (xuất / nhập khẩu)', type: 'text', def: maHsDef || '',
        ph: maHsDef ? '' : 'Hàng nội địa: để trống', col: 3 }
    ];
    if (hasReturned) fields.push(
      { id: 'bklsTvNoiDen', label: 'BKLS TRẢ VỀ — Nơi nhận hàng trả về', type: 'text',
        ph: 'Để trống = tự lấy ngược lại nơi xuất kho ban đầu. Có xe trả về → tự tách riêng 1 bộ BKLS (số = Số BKLS + "-TV"), chủ lâm sản và bên mua/nhận đều là bên xuất (nhận lại hàng của chính mình).', col: 12 }
    );
    fields.push(
      // v2.7.1 (Thủy chốt phương án A): bản tổng liệt kê từng BKLS con theo ngày ở mục 5 "Hồ sơ kèm theo" → bản tổng nhiều tờ
      { id: 'bklsListTrips', label: 'Bản tổng: liệt kê BKLS từng xe theo ngày ở mục 5 "Hồ sơ kèm theo" (bỏ tick = bản tổng gọn 1 trang)', type: 'check', def: true, col: 12 },
      { id: 'bklsTotalDocx', label: 'BKLS Tổng — Word', type: 'check', def: true, col: 3 },
      { id: 'bklsTotalPdf', label: 'BKLS Tổng — PDF', type: 'check', def: true, col: 3 },
      { id: 'bklsTripDocx', label: 'BKLS Từng xe — Word', type: 'check', def: true, col: 3 },
      { id: 'bklsTripPdf', label: 'BKLS Từng xe — PDF', type: 'check', def: true, col: 3 }
    );
    return { title: 'Bảng kê lâm sản (BKLS)', zone: 'bkls', fields };
  }
  /** Các loại biên bản có lập kèm BKLS (phải khớp HAK.CHUNGTU[*].bkls trong config.js) + có tự gợi ý "Bên mua" từ nhanId hay không. */
  const BKLS_TYPES = { xuatkhau: false, uythac: false, xuatkhogui: false, xuatban: true, traodoi: true };
  /** Các loại có "Chọn xe trả về" (extra:'returned') → BKLS tách riêng phần trả về. */
  const BKLS_HAS_RETURNED = { xuatkhau: true, uythac: true, xuatkhogui: true, xuatban: false, traodoi: false };
  /** v2.6.7 (Thủy chốt 28/09/2026): Xuất hàng kho gửi CHỈ lập biên bản — BKLS lập ở hình thức đích (Xuất khẩu / Ủy thác / Xuất bán) khi hàng chuyển chủ sở hữu.
   *  BKLS_TYPES vẫn giữ xuatkhogui để hồ sơ cũ trong Lưu trữ tạo lại được BKLS đã lập. */
  const PAGE_NO_BKLS = ['xuatkhogui'];
  const pageBkls = (type) => BKLS_TYPES[type] !== undefined && PAGE_NO_BKLS.indexOf(type) < 0;
  /** v2.6.7 — Chuyển hình thức: trang nguồn → các trang đích (xem convertTo). */
  const CONV_FROM = { xuatkhogui: ['xuatkhau', 'uythac', 'xuatban'] };

  /** v2.5 Phase 2 — ô "Chọn hợp đồng" (📇 Danh mục) cho các trang có hợp đồng theo tàu; key trang = key hình thức trong HAK.Catalog.TYPES. */
  const contractGroup = () => ({ title: 'Hợp đồng (từ Danh mục)', zone: 'party', fields: [{ id: 'contractId', label: 'Chọn hợp đồng — tự điền tàu, các bên, số liệu hợp đồng / chứng thư, hệ số BKLS', type: 'contract', col: 12 }] });

  /* ===============================================================
   * Khai báo form từng loại biên bản
   *   type: company | warehouse | text | date | check | select
   *   col : độ rộng cột Bootstrap (md)
   * ============================================================= */
  const DOCS = {
    guikho: {
      icon: '📄', title: 'Trung chuyển gửi kho',
      desc: 'Biên bản giao nhận hàng gửi kho + phụ lục bảng kê từng phiếu cân (STT, phiếu, giờ cân, biển số, cân 1/2, KL, ĐVVC).',
      groups: [
        { title: 'Các bên', zone: 'party', fields: [
          { id: 'giaoId', label: 'Bên giao (chủ hàng)', type: 'company', def: 'qn', col: 6 },
          { id: 'nhanId', label: 'Bên nhận (kho tiếp nhận)', type: 'company', def: 'hak', col: 6 } ] },
        { title: 'Kho gửi / kho nhận', zone: 'kho', fields: [
          { id: 'khoGiaoId', label: 'Kho gửi (xuất kho tại — bàn cân xuất)', type: 'warehouse', def: 'w_qc', col: 6 },
          { id: 'khoNhanId', label: 'Kho nhận (nhập kho tại)', type: 'warehouse', def: 'w_n_hak', col: 6 } ] },
        { title: 'Thông tin biên bản', zone: 'doc', fields: [
          { id: 'variant', label: 'Mẫu biên bản', type: 'select', def: 'dot', col: 12, options: [['dot', 'Giao nhận theo đợt — phụ lục bảng kê từng phiếu cân'], ['thang', 'Xác nhận theo tháng — phụ lục tổng hợp theo biển số']] },
          { id: 'period', label: 'Đợt tháng (MM/YYYY)', type: 'text', ph: 'Tự động theo dữ liệu', col: 4 },
          { id: 'docDate', label: 'Ngày lập', type: 'date', col: 4, today: true },
          { id: 'evidence', label: 'Căn cứ chứng từ (mẫu theo tháng)', type: 'text', def: 'Phiếu xuất kho kiêm vận chuyển nội bộ (PXK) — trạng thái Đã phát hành', col: 12 },
          { id: 'showDetail', label: 'Kèm phụ lục 2: chi tiết từng phiếu cân (mẫu theo tháng)', type: 'check', col: 12 } ] }
      ]
      // Trung chuyển gửi kho: không lập BKLS (giống HAK.CHUNGTU.guikho.bkls = false)
    },
    xuatkhogui: {
      icon: '📦', title: 'Xuất hàng kho gửi',
      desc: 'Bảng xác nhận hàng gửi kho xuất khẩu theo từng tàu: khối lượng xuống cảng, trừ xe trả về, thực gửi/nhận + phụ lục phiếu cân.',
      groups: [
        { title: 'Tàu', zone: 'party', fields: [
          { id: 'ship', label: 'Tên tàu / chuyến', type: 'text', req: true, ph: 'VD: JR SOPHIA V.2501', col: 12 },
          { id: 'whLabel', label: 'Ghi vào cột "Kho xuất" ở phụ lục', type: 'whopt', attr: 'label', def: 'HAK Đà Nẵng', col: 6 },
          { id: 'khoGuiCode', label: 'Ký hiệu kho gửi', type: 'whopt', attr: 'code', def: 'HAKĐN', col: 6 } ] },
        { title: 'Các bên', zone: 'party', fields: [
          { id: 'giaoId', label: 'Bên gửi (chủ hàng)', type: 'company', def: 'qn', col: 6 },
          { id: 'nhanId', label: 'Bên nhận — đại diện kho gửi', type: 'company', def: 'hak', col: 6 } ] },
        { title: 'Kho', zone: 'kho', fields: [
          { id: 'khoGiaoId', label: 'Kho xuất (kho gửi)', type: 'warehouse', def: 'w_qc', col: 6 },
          { id: 'khoNhanId', label: 'Kho gởi đến', type: 'warehouse', def: 'w_dn', col: 6 } ] },
        { title: 'Thông tin biên bản', zone: 'doc', fields: [
          { id: 'period', label: 'Đợt tháng (MM/YYYY)', type: 'text', ph: 'Tự động', col: 4 },
          { id: 'docDate', label: 'Ngày lập', type: 'date', col: 4, today: true } ] }
        // v2.6.7: không lập BKLS ở trang này (xem PAGE_NO_BKLS)
      ],
      extra: 'returned'
    },
    xuatkhau: {
      icon: '📤', title: 'Xuất khẩu',
      desc: 'Bảng tổng hợp hàng xuất khẩu qua cân theo từng tàu (công ty tự xuất khẩu): tổng hợp theo ngày, xe trả về, thực xuất + phụ lục phiếu cân.',
      groups: [
        contractGroup(),
        { title: 'Tàu', zone: 'party', fields: [
          { id: 'ship', label: 'Tên tàu / chuyến', type: 'text', req: true, ph: 'VD: JR SOPHIA V.2501', col: 12 } ] },
        { title: 'Đơn vị xuất khẩu', zone: 'party', fields: [
          { id: 'giaoId', label: 'Đơn vị xuất khẩu (chủ hàng)', type: 'company', def: 'hak', col: 12 } ] },
        { title: 'Kho xuất / cảng', zone: 'kho', fields: [
          { id: 'khoGiaoId', label: 'Kho xuất (bàn cân)', type: 'warehouse', def: 'w_dn', col: 6 },
          { id: 'khoNhanId', label: 'Cảng / nơi nạp hàng lên tàu', type: 'warehouse', def: 'w_ts', col: 6 } ] },
        { title: 'Thông tin bảng tổng hợp', zone: 'doc', fields: [
          { id: 'period', label: 'Đợt tháng (MM/YYYY)', type: 'text', ph: 'Tự động', col: 4 },
          { id: 'docDate', label: 'Ngày lập', type: 'date', col: 4, today: true } ] },
        bklsGroup(BKLS_TYPES.xuatkhau, BKLS_HAS_RETURNED.xuatkhau, MA_HS_DEF.xuatkhau)
      ],
      extra: 'returned'
    },
    uythac: {
      icon: '🚢', title: 'Ủy thác xuất khẩu',
      desc: 'Biên bản giao nhận hàng hóa ủy thác xuất khẩu theo từng tàu + phụ lục toàn bộ phiếu cân + danh sách xe trả về.',
      groups: [
        contractGroup(),
        { title: 'Tàu', zone: 'party', fields: [
          { id: 'ship', label: 'Tên tàu / chuyến', type: 'text', req: true, ph: 'VD: HJ TIANHE V.2610', col: 6 },
          { id: 'wh', label: 'Kho xuất (điền cột "Kho xuất" ở phụ lục)', type: 'whopt', attr: 'label', ph: 'VD: Kho Thành phẩm Đại Hiệp', col: 6 } ] },
        { title: 'Các bên', zone: 'party', fields: [
          { id: 'giaoId', label: 'Bên ủy thác (chủ hàng)', type: 'company', def: 'dh', col: 6 },
          { id: 'nhanId', label: 'Bên nhận ủy thác (đứng tên xuất khẩu)', type: 'company', def: 'hak', col: 6 } ] },
        // v2.6.8: BKLS "Vận chuyển từ … đến …" lấy từ 2 ô này (trước đây trang Ủy thác không có → BKLS ghi cứng "Công ty TNHH Hoàng Anh Khôi" / "Cảng Tiên Sa")
        { title: 'Kho xuất / cảng', zone: 'kho', fields: [
          { id: 'khoGiaoId', label: 'Kho xuất (bàn cân) — "Vận chuyển từ" trên BKLS', type: 'warehouse', def: 'w_dh', col: 6 },
          { id: 'khoNhanId', label: 'Cảng / nơi nạp hàng — "Vận chuyển đến" trên BKLS', type: 'warehouse', def: 'w_ts', col: 6 } ] },
        { title: 'Hợp đồng ủy thác', zone: 'party', fields: [
          { id: 'contractNo', label: 'Số hợp đồng', type: 'text', ph: 'UTXK/ĐN-ĐH/0626', col: 5 },
          { id: 'contractDate', label: 'Ngày ký', type: 'date', col: 3 },
          { id: 'contractQty', label: 'KL tạm tính (BDMT)', type: 'text', ph: '6500', col: 4 } ] },
        { title: 'Chứng thư giám định', zone: 'party', fields: [
          { id: 'certNo', label: 'Số chứng thư', type: 'text', ph: '26E04GPT00232-07', col: 6 },
          { id: 'certDate', label: 'Ngày chứng thư', type: 'date', col: 6 },
          { id: 'certWet', label: 'KL giám định — tấn tươi', type: 'text', ph: '13.010,81', col: 4 },
          { id: 'certDry', label: 'KL giám định — tấn khô', type: 'text', ph: 'Để trống = tự tính', col: 4 },
          { id: 'moisture', label: 'Độ ẩm (%)', type: 'text', ph: '49,9818', col: 4 } ] },
        { title: 'Thông tin biên bản', zone: 'doc', fields: [
          { id: 'returnWh', label: 'Kho nhận xe trả về', type: 'text', def: 'Kho Hoàng Anh Khôi Đà Nẵng', col: 6 },
          { id: 'period', label: 'Đợt tháng (MM/YYYY)', type: 'text', ph: 'Tự động', col: 3 },
          { id: 'docDate', label: 'Ngày lập', type: 'date', col: 3, today: true } ] },
        bklsGroup(BKLS_TYPES.uythac, BKLS_HAS_RETURNED.uythac, MA_HS_DEF.uythac)
      ],
      extra: 'returned'
    },
    dieuchuyen: {
      icon: '🔄', title: 'Điều chuyển nội bộ',
      desc: 'Sinh đồng thời Quyết định điều chuyển và Biên bản giao nhận (Công ty ⇄ Chi nhánh).',
      groups: [
        { title: 'Chiều điều chuyển', zone: 'party', fields: [
          { id: 'direction', label: 'Chiều', type: 'select', def: 'cn2ct', col: 6, options: [['cn2ct', 'Chi nhánh → Công ty (Kho Quế Sơn → Kho Đà Nẵng)'], ['ct2cn', 'Công ty → Chi nhánh']] },
          { id: 'issuerId', label: 'Đơn vị ban hành Quyết định', type: 'company', def: 'hak', col: 6 },
          { id: 'khoGiaoId', label: 'Kho đi', type: 'warehouse', def: 'w_qs', col: 6 },
          { id: 'khoNhanId', label: 'Kho đến (nhập kho tại)', type: 'warehouse', def: 'w_n_hak', col: 6 } ] },
        { title: 'Quyết định', zone: 'party', fields: [
          { id: 'qdNo', label: 'Số Quyết định', type: 'text', ph: '01/2026/ĐCXK', col: 4 },
          { id: 'qdDate', label: 'Ngày ký Quyết định', type: 'date', col: 4, today: true },
          { id: 'period', label: 'Đợt tháng (MM/YYYY)', type: 'text', ph: 'Tự động', col: 4 },
          { id: 'weightType', label: 'Kiểu cân ghi trong biên bản', type: 'text', def: 'Trung Chuyển', col: 6 },
          { id: 'zip', label: 'Đóng gói 2 file thành 1 tệp ZIP', type: 'check', col: 6 } ] }
      ],
      hidden: ['giaoId', 'nhanId'],    // 2 bên tự suy ra từ chiều điều chuyển
      zoneLabels: { party: 'Quyết định & chiều' }   // v2.7.0 Thủy chốt: Chiều điều chuyển để tab 2, chung với Quyết định
    },
    traodoi: {
      icon: '🤝', title: 'Trao đổi hàng hóa',
      desc: 'Bảng chi tiết cân hàng — lô hàng trao đổi (STT, phiếu, xe, tài xế, khối lượng, đơn vị vận chuyển).',
      groups: [
        contractGroup(),
        { title: 'Các bên', zone: 'party', fields: [
          { id: 'giaoId', label: 'Đơn vị giao', type: 'company', def: 'qn', col: 6 },
          { id: 'nhanId', label: 'Đơn vị nhận', type: 'company', def: 'hak', col: 6 } ] },
        { title: 'Bàn cân / nơi giao hàng', zone: 'kho', fields: [
          { id: 'khoGiaoId', label: 'Bàn cân xuất', type: 'warehouse', def: 'w_qc', col: 6 },
          { id: 'khoNhanId', label: 'Nơi giao hàng', type: 'warehouse', def: 'w_ts', col: 6 } ] },
        { title: 'Hợp đồng & trình bày', zone: 'doc', fields: [
          { id: 'contractNo', label: 'Hợp đồng trao đổi số', type: 'text', ph: '01.26/HĐTĐ-HAK-QC', col: 6 },
          { id: 'period', label: 'Tháng (MM/YYYY)', type: 'text', ph: 'Tự động', col: 3 },
          { id: 'docDate', label: 'Ngày lập', type: 'date', col: 3, today: true },
          { id: 'defaultCarrier', label: 'Đơn vị vận chuyển mặc định (khi Excel không có cột này)', type: 'text', col: 8 },
          { id: 'renumber', label: 'Đánh số lại phiếu theo mẫu n/MMYYYY/TĐ', type: 'check', def: true, col: 4 } ] },
        bklsGroup(BKLS_TYPES.traodoi, BKLS_HAS_RETURNED.traodoi)
      ]
    },
    xuatban: {
      icon: '💰', title: 'Xuất bán',
      desc: 'Biên bản giao nhận hàng hóa — lô hàng xuất bán (bảng chi tiết cân hàng, hợp đồng mua bán, đơn giá / thành tiền bằng số và bằng chữ).',
      groups: [
        contractGroup(),
        { title: 'Các bên', zone: 'party', fields: [
          { id: 'giaoId', label: 'Bên bán', type: 'company', def: 'hak', col: 6 },
          { id: 'nhanId', label: 'Bên mua', type: 'company', def: 'dh', col: 6 } ] },
        { title: 'Bàn cân / nơi giao hàng', zone: 'kho', fields: [
          { id: 'khoGiaoId', label: 'Bàn cân xuất', type: 'warehouse', def: 'w_dn', col: 6 },
          { id: 'khoNhanId', label: 'Nơi giao hàng', type: 'warehouse', def: 'w_ts', col: 6 } ] },
        { title: 'Hợp đồng mua bán & giá', zone: 'doc', fields: [
          { id: 'contractNo', label: 'Hợp đồng mua bán số', type: 'text', ph: '01.26/HĐMB-HAK-ĐH', col: 6 },
          { id: 'period', label: 'Tháng (MM/YYYY)', type: 'text', ph: 'Tự động', col: 3 },
          { id: 'docDate', label: 'Ngày lập', type: 'date', col: 3, today: true },
          { id: 'unitPrice', label: 'Đơn giá (đồng/tấn)', type: 'text', ph: 'VD: 1.250.000 — để trống = không in giá', col: 6 },
          { id: 'priceNote', label: 'Ghi chú giá', type: 'text', ph: 'VD: chưa bao gồm thuế GTGT', col: 6 },
          { id: 'defaultCarrier', label: 'Đơn vị vận chuyển mặc định (khi Excel không có cột này)', type: 'text', col: 12 } ] },
        bklsGroup(BKLS_TYPES.xuatban, BKLS_HAS_RETURNED.xuatban)
      ],
      zoneLabels: { doc: 'Giá & biên bản' }
    }
  };

  /* Trạng thái riêng từng trang */
  const ST = {};
  Object.keys(DOCS).forEach((k) => { ST[k] = { filter: { groups: null, from: '', to: '' }, returned: new Set(), built: false, bklsDupKey: '' }; });

  const cfg = () => HAK.Config.data;
  /** Dữ liệu Excel của đúng loại biên bản `type` (mỗi loại có file riêng — xem HAK.App.slots). */
  const getDs = (type) => { const s = HAK.App && HAK.App.slots[type]; return (s && s.ds && s.ds.ok) ? s.ds : null; };
  const fid = (type, id) => 'f-' + type + '-' + id;

  /* ===============================================================
   * Dựng HTML
   * ============================================================= */
  function companyOptions(sel) {
    return cfg().companies.map((c) => '<option value="' + esc(c.id) + '"' + (c.id === sel ? ' selected' : '') + '>' + esc(c.short ? c.short + ' — ' + c.name : c.name) + '</option>').join('');
  }
  /** Dropdown kho: 2 nhóm "Xuất kho tại (địa chỉ)" / "Nhập kho tại" (theo type) + "Nhập tay…". `first` = nhóm đứng trước. */
  const WH_CUSTOM = '__custom';
  function whOptions(sel, first) {
    const isX = (w) => w.type === 'Kho xuất' || w.type === 'Kho gửi';
    const opt = (w) => '<option value="' + esc(w.id) + '"' + (w.id === sel ? ' selected' : '') + '>' + esc(isX(w) && w.address ? w.name + ' — ' + w.address : w.name) + '</option>';
    const grp = (label, list) => list.length ? '<optgroup label="' + label + '">' + list.map(opt).join('') + '</optgroup>' : '';
    const xs = cfg().warehouses.filter(isX), ns = cfg().warehouses.filter((w) => !isX(w));
    const gx = grp('Xuất kho tại (địa chỉ)', xs), gn = grp('Nhập kho tại', ns);
    return (first === 'nhap' ? gn + gx : gx + gn) + '<option value="' + WH_CUSTOM + '"' + (sel === WH_CUSTOM ? ' selected' : '') + '>✎ Khác — nhập tay…</option>';
  }
  /** Dropdown "ghi phụ lục" / "ký hiệu" lấy từ danh mục kho (Cài đặt → Kho). val không nằm trong danh sách → chọn "Khác — nhập tay…". */
  function whAttrList(attr) {
    const out = [];
    cfg().warehouses.forEach((w) => { const v = HAK.Config.whAttr(w, attr); if (v && out.indexOf(v) < 0) out.push(v); });
    return out;
  }
  function whAttrOptions(attr, val) {
    const list = whAttrList(attr);
    return '<option value="">— Không điền —</option>' +
      list.map((v) => '<option value="' + esc(v) + '"' + (v === val ? ' selected' : '') + '>' + esc(v) + '</option>').join('') +
      '<option value="' + WH_CUSTOM + '"' + (val && list.indexOf(val) < 0 ? ' selected' : '') + '>✎ Khác — nhập tay…</option>';
  }
  /** Giá trị thật của ô dropdown "whopt" (nếu chọn nhập tay thì lấy chữ trong ô nhập). */
  function whoptValue(sel) {
    if (sel.value !== WH_CUSTOM) return sel.value;
    const t = document.getElementById(sel.id + '__txt');
    return t ? t.value : '';
  }
  const whFirst = (id) => (/Nhan/.test(id) ? 'nhap' : 'xuat');
  function saved(type) {
    const sv = HAK.Store.get('hak.form.' + type, {}) || {};
    // BKLS bản PDF mặc định BẬT (như trang Chứng từ cũ). Form đã lưu từ bản trước (PDF đang tắt) → bật 1 lần duy nhất;
    // về sau người dùng tự tắt thì giữ đúng lựa chọn đó.
    const mig = 'hak.mig.bklsPdf.' + type;
    if (BKLS_TYPES[type] !== undefined && !HAK.Store.get(mig, false)) { sv.bklsTotalPdf = true; sv.bklsTripPdf = true; HAK.Store.set(mig, true); }
    if (String(sv.bklsNguonGoc || '').trim() === NGUON_GOC_OLD) sv.bklsNguonGoc = NGUON_GOC_DEF;   // v2.7.1 câu mặc định cũ → mới
    if (String(sv.bklsMaHs || '').trim() === MA_HS_OLD && MA_HS_DEF[type]) sv.bklsMaHs = MA_HS_DEF[type];   // v2.7.7 mã HS thiếu "00" → đủ 10 số
    return sv;
  }

  function fieldHtml(type, f, sv) {
    const id = fid(type, f.id);
    const val = sv[f.id] !== undefined ? sv[f.id] : (f.def !== undefined ? f.def : '');
    const lbl = '<label class="form-label' + (f.req ? ' req' : '') + '" for="' + id + '">' + esc(f.label) + '</label>';
    let ctl = '';
    if (f.type === 'company') ctl = '<select class="form-select" id="' + id + '" data-kind="company">' + companyOptions(val) + '</select>';
    else if (f.type === 'warehouse') ctl = '<select class="form-select" id="' + id + '" data-kind="warehouse">' + whOptions(val, whFirst(f.id)) + '</select>' +
      '<div class="wh-custom mt-2' + (val === WH_CUSTOM ? '' : ' d-none') + '" id="' + id + '-custom">' +
      '<input type="text" class="form-control mb-1" id="' + id + '__name" placeholder="Tên kho / nơi nhập, xuất" value="' + esc(sv[f.id + '__name'] || '') + '" autocomplete="off">' +
      '<input type="text" class="form-control" id="' + id + '__addr" placeholder="Địa chỉ (không bắt buộc)" value="' + esc(sv[f.id + '__addr'] || '') + '" autocomplete="off"></div>';
    else if (f.type === 'whopt') {
      const custom = val && whAttrList(f.attr).indexOf(val) < 0;
      ctl = '<select class="form-select" id="' + id + '" data-kind="whopt" data-attr="' + f.attr + '">' + whAttrOptions(f.attr, val) + '</select>' +
        '<input type="text" class="form-control mt-2' + (custom ? '' : ' d-none') + '" id="' + id + '__txt" placeholder="' + esc(f.ph || 'Nhập tay') + '" value="' + esc(custom ? val : '') + '" autocomplete="off">';
    }
    else if (f.type === 'contract') ctl = '<div class="d-flex flex-wrap gap-2"><select class="form-select" style="flex:1 1 16rem;min-width:0;max-width:100%" id="' + id + '" data-kind="contract">' + contractOptions(type, val) + '</select>' +
      '<button class="btn btn-outline-primary" type="button" data-ct-act="refill" title="Điền lại các ô từ hợp đồng đang chọn">↻ Điền lại</button>' +
      '<a class="btn btn-outline-secondary" href="#/catalog" title="Mở Danh mục hợp đồng & khách hàng">📇 Danh mục</a></div>' +
      '<div class="mt-2" id="ctMsg-' + type + '"></div>';
    else if (f.type === 'select') ctl = '<select class="form-select" id="' + id + '">' + f.options.map((o) => '<option value="' + esc(o[0]) + '"' + (o[0] === val ? ' selected' : '') + '>' + esc(o[1]) + '</option>').join('') + '</select>';
    else if (f.type === 'date') ctl = '<input type="date" class="form-control" id="' + id + '" value="' + esc(f.today ? todayISO() : '') + '">';
    else if (f.type === 'check') return '<div class="col-md-' + f.col + '"><div class="form-check mt-2"><input class="form-check-input" type="checkbox" id="' + id + '"' + (val ? ' checked' : '') + '><label class="form-check-label" for="' + id + '">' + esc(f.label) + '</label></div></div>';
    else ctl = '<input type="text" class="form-control" id="' + id + '" value="' + esc(val) + '" placeholder="' + esc(f.ph || '') + '" autocomplete="off">';
    if (f.help) ctl += '<div class="form-text" id="' + id + '-help"></div>';   // chỗ hiển thị gợi ý động (vd. số BKLS kế tiếp)
    return '<div class="col-md-' + f.col + '">' + lbl + ctl + '</div>';
  }

  /**
   * v2.6.2: công ty làm việc (HAK.Auth.company) = bên xuất MẶC ĐỊNH mỗi lần mở app (vẫn đổi được trên trang).
   * Đổi bên xuất thì kho xuất / bàn cân lấy theo kho xuất mặc định của công ty (Cài đặt → Công ty). Điều chuyển tự suy bên theo chiều → bỏ qua.
   */
  function companyDefaults(type, sv) {
    const co = HAK.Auth && HAK.Auth.company ? HAK.Auth.company() : '';
    if (!co || (DOCS[type].hidden || []).indexOf('giaoId') >= 0 || !fieldDef(type, 'giaoId') || sv.giaoId === co) return sv;
    sv.giaoId = co;
    const c = cfg().companies.find((x) => x.id === co), kx = c ? HAK.Config.companyAttr(c, 'khoXuat') : '';
    if (kx && fieldDef(type, 'khoGiaoId') && cfg().warehouses.some((w) => w.id === kx)) sv.khoGiaoId = kx;
    return sv;
  }
  /** v2.7.0 biểu tượng nét mảnh (HAK.Icons); chưa có → dùng emoji cũ. */
  const ico = (name, emoji) => (HAK.Icons && HAK.Icons.has(name) ? HAK.Icons.svg(name) + ' ' : emoji + ' ');
  function buildPage(type) {
    const D = DOCS[type], sv = companyDefaults(type, saved(type));
    const sec = $('#page-' + type);
    const groupHtml = (g) => {
      const fields = g.fields.filter((f) => !(D.hidden || []).includes(f.id));
      if (!fields.length) return '';
      return '<div class="card mb-3"><div class="card-body"><div class="sec-title">' + esc(g.title) + '</div><div class="row g-3">' +
        fields.map((f) => fieldHtml(type, f, sv)).join('') + '</div></div></div>';
    };
    const extra = D.extra === 'returned' ? (
      '<div class="card mb-3"><div class="card-body"><div class="sec-title">Xe trả về (không lên được tàu)</div>' +
      '<div class="d-flex flex-wrap align-items-center gap-2"><button class="btn btn-outline-primary" id="btnReturn-' + type + '" type="button">' + ico('truck', '🚛') + 'Chọn xe trả về</button>' +
      '<span id="retSummary-' + type + '" class="muted">Chưa chọn — mặc định "Không có xe trả về".</span></div>' +
      '<div class="form-text">Khối lượng thực giao = khối lượng qua cân − khối lượng xe trả về. Bảng phụ lục "xe trả về" chỉ xuất hiện khi có chọn xe.</div></div></div>') : '';
    // ---- bộ lọc ----
    const filterHtml =
      '<div class="card mb-3"><div class="card-body"><div class="sec-title">Phạm vi dữ liệu lấy từ Excel</div>' +
      '<div id="chips-' + type + '" class="d-none"></div>' +
      '<div class="row g-2 align-items-end"><div class="col-6 col-md-4"><label class="form-label">Từ ngày</label><input type="date" class="form-control" id="from-' + type + '"></div>' +
      '<div class="col-6 col-md-4"><label class="form-label">Đến ngày</label><input type="date" class="form-control" id="to-' + type + '"></div>' +
      '<div class="col-12 col-md-4 d-grid"><button class="btn btn-outline-secondary" id="resetFlt-' + type + '" type="button">Đặt lại bộ lọc</button></div></div>' +
      '<div class="form-text">Bỏ trống ngày = lấy toàn bộ dữ liệu trong file Excel.</div><div id="convNote-' + type + '"></div></div></div>';
    // ---- v2.7.0: chia vùng nhập liệu thành tab (vùng không có nhóm nào thì bỏ tab) ----
    const zones = ZONES.map(([z, lb]) => ({ z, lb: (D.zoneLabels || {})[z] || lb,
      html: z === 'data' ? filterHtml + extra : D.groups.filter((g) => g.zone === z).map(groupHtml).join('') })).filter((x) => x.html);
    const navHtml = '<div class="zone-nav" id="zones-' + type + '" role="tablist">' + zones.map((x, i) =>
      '<button type="button" class="zone-tab" role="tab" data-zone="' + x.z + '"><span class="zl"><b>' + (i + 1) + '</b><span>' + esc(x.lb) + '</span></span><span class="zs"></span></button>').join('') + '</div>';
    const panesHtml = zones.map((x, i) => '<div class="zone-pane" role="tabpanel" data-zone="' + x.z + '" hidden>' + x.html +
      '<div class="zone-foot">' + (i ? '<button class="btn btn-sm btn-outline-secondary" type="button" data-zone-go="' + zones[i - 1].z + '">‹ Quay lại</button>' : '<span></span>') +
      (i < zones.length - 1 ? '<button class="btn btn-sm btn-primary" type="button" data-zone-go="' + zones[i + 1].z + '">Tiếp: ' + esc(zones[i + 1].lb) + ' ›</button>'
        : '<span class="small muted text-end">Đủ thông tin → bấm <b>Tạo biên bản</b> ở khung Kết quả.</span>') + '</div></div>').join('');

    sec.innerHTML =
      '<div class="d-flex align-items-start gap-3 mb-3"><div class="fs-1 page-ico">' + (HAK.Icons && HAK.Icons.has(type) ? HAK.Icons.svg(type) : D.icon) + '</div><div><h4 class="mb-1">' + esc(D.title) + '</h4><div class="muted">' + esc(D.desc) + '</div></div></div>' +
      '<div id="noData-' + type + '" class="alert alert-warning d-none">Chưa có dữ liệu Excel cho loại biên bản này. <a href="#/file" class="alert-link" data-filetype="' + type + '">Nhập liệu cho loại này</a> để bắt đầu.</div>' +
      navHtml +
      '<div class="row g-3"><div class="col-xl-8">' +
      '<div class="card zone-body">' + panesHtml + '</div>' +
      '</div><div class="col-xl-4"><div class="sticky-side">' +
      '<div class="card mb-3"><div class="card-header">' + ico('calc', '🧮') + 'Kết quả tự tính</div><div class="card-body">' +
      '<div class="row text-center mb-3"><div class="col-6"><div class="sum-big" id="sumTrips-' + type + '">0</div><div class="muted small">xe (phiếu cân)</div></div>' +
      '<div class="col-6"><div class="sum-big" id="sumTons-' + type + '">0</div><div class="muted small">tấn</div></div></div>' +
      '<ul class="sum-list" id="sumList-' + type + '"></ul></div></div>' +
      '<div id="msgs-' + type + '" class="mb-3"></div>' +
      '<div class="d-grid gap-2"><button class="btn btn-primary btn-lg" id="gen-' + type + '" type="button">' + ico('word', '⚡') + 'Tạo biên bản (Word)</button>' +
      '<div class="row g-2"><div class="col-6 d-grid"><button class="btn btn-outline-primary" id="pdf-' + type + '" type="button">' + ico('printer', '🖨️') + 'Tải PDF</button></div>' +
      '<div class="col-6 d-grid"><button class="btn btn-outline-success" id="xls-' + type + '" type="button" title="Bảng cân chi tiết (Excel) để lưu trữ">' + ico('sheet', '📊') + 'Xuất Excel</button></div></div>' +
      (pageBkls(type) ? '<button class="btn btn-outline-dark" id="bkls-' + type + '" type="button">' + ico('bkls', '🧾') + 'Tạo BKLS (Tổng + Từng xe)</button>' : '') +
      '</div>' +
      '<div class="form-text text-center mt-2" id="genHint-' + type + '"></div>' +
      (CONV_FROM[type] ? '<div class="border-top mt-3 pt-3"><div class="fw-semibold mb-1">' + ico('convert', '➡') + 'Chuyển sang hình thức khác</div>' +
        '<div class="small muted mb-2">Hàng xuất ở kho gửi để bán / xuất khẩu / ủy thác: chép phiếu cân (đúng phạm vi đang lọc, tàu, xe trả về, bên gửi, kho xuất) sang trang đích để lập thêm biên bản và <b>BKLS</b> (khi hàng chuyển chủ sở hữu). Mỗi đợt chỉ 1 hình thức.</div>' +
        '<div class="d-flex flex-wrap gap-2">' + CONV_FROM[type].map((t) => '<button class="btn btn-sm btn-outline-primary" type="button" data-conv="' + t + '">' + DOCS[t].icon + ' ' + esc(DOCS[t].title) + '</button>').join('') + '</div>' +
        '<div class="small mt-2" id="convState-' + type + '"></div></div>' : '') +
      '</div></div></div>';

    bind(type);
    ST[type].built = true;
    showZone(type, zoneSaved()[type]);
  }

  /* ===============================================================
   * v2.7.0 Phân vùng nhập liệu theo tab (Thủy chốt 29/09/2026) — cùng thứ tự ở mọi trang biên bản.
   * Các ô ở tab ẩn vẫn nằm trong trang (chỉ hidden) → collect() / tạo biên bản / BKLS không đổi.
   * ============================================================= */
  const ZONES = [['data', 'Dữ liệu cân'], ['party', 'Hợp đồng & bên'], ['kho', 'Kho & cảng'], ['doc', 'Biên bản'], ['bkls', 'BKLS']];
  const ZONE_KEY = 'hakui.zone';     // tab đang mở của từng trang — chỉ là tiện lợi trên máy này (không mang tiền tố 'hak.' → không vào sao lưu)
  function zoneSaved() { try { return JSON.parse(root.localStorage.getItem(ZONE_KEY) || '{}') || {}; } catch (e) { return {}; } }
  function showZone(type, z) {
    const nav = $('#zones-' + type); if (!nav) return;
    const tabs = $$('.zone-tab', nav);
    if (!tabs.some((b) => b.dataset.zone === z)) z = tabs[0].dataset.zone;
    tabs.forEach((b) => { const on = b.dataset.zone === z; b.classList.toggle('active', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); });
    $$('#page-' + type + ' .zone-pane').forEach((p) => { p.hidden = p.dataset.zone !== z; });
    ST[type].zone = z;
    try { const m = zoneSaved(); m[type] = z; root.localStorage.setItem(ZONE_KEY, JSON.stringify(m)); } catch (e) { /* bị chặn → chỉ không nhớ tab */ }
  }
  /** Ô còn thiếu theo từng vùng — đúng các điều kiện mà generate() (generator: tên tàu) / generateBkls() (bklsMissing) kiểm tra. rows = phiếu trong phạm vi (null = chưa có dữ liệu). */
  function zoneIssues(type, rows) {
    const out = {}, add = (z, id, label) => { (out[z] = out[z] || []).push({ id, label }); };
    if (!rows) add('data', null, 'Chưa có dữ liệu Excel');
    else if (!rows.length) add('data', null, 'Không có phiếu cân nào trong phạm vi đang lọc');
    const p = collect(type), ship = fieldDef(type, 'ship');
    if (ship && ship.req && !String(p.ship || '').trim()) add(zoneOfField(type, 'ship'), 'ship', ship.label);
    if (pageBkls(type)) bklsMissing(type, p, !!(rows && rows.length)).m.forEach((x) => add('bkls', x.id, x.label));
    return out;
  }
  const zoneOfField = (type, id) => { const g = DOCS[type].groups.find((x) => x.fields.some((f) => f.id === id)); return g ? g.zone : 'data'; };
  function renderZones(type, rows) {
    const nav = $('#zones-' + type); if (!nav) return;
    const iss = zoneIssues(type, rows);
    $$('.zone-tab', nav).forEach((b) => {
      const z = b.dataset.zone, n = (iss[z] || []).length, s = b.querySelector('.zs');
      s.className = 'zs ' + (!n ? 'ok' : z === 'bkls' ? 'warn' : 'bad');        // BKLS: nhắc (vàng) — chỉ bắt buộc khi bấm Tạo BKLS
      s.textContent = n ? String(n) : '✓';
      b.title = n ? 'Còn thiếu: ' + iss[z].map((x) => x.label).join('; ') : 'Đã đủ các ô bắt buộc';
    });
  }
  /** Mở đúng tab chứa ô `id` (null = bộ lọc ngày), tô đỏ ô đó tới khi sửa. */
  function focusField(type, id) {
    const el = id ? $('#' + fid(type, id)) : $('#from-' + type); if (!el) return;
    const pane = el.closest('.zone-pane'); if (pane) showZone(type, pane.dataset.zone);
    if (id) { const off = () => el.classList.remove('is-invalid'); el.classList.add('is-invalid'); el.addEventListener('input', off, { once: true }); el.addEventListener('change', off, { once: true }); }
    try { el.focus({ preventScroll: true }); el.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) { /* bỏ qua */ }
  }
  const ERR_FIELD = [[/tên tàu/i, 'ship'], [/Độ ẩm/, 'moisture'], [/Tấn khô/, 'certDry'], [/Đơn giá/, 'unitPrice'], [/phiếu cân nào/, null]];
  function focusError(type, msg) { const hit = ERR_FIELD.find((e) => e[0].test(msg)); if (hit && (hit[1] === null || fieldDef(type, hit[1]))) focusField(type, hit[1]); }

  /* ===============================================================
   * Gắn sự kiện
   * ============================================================= */
  function bind(type) {
    const sec = $('#page-' + type);
    const save = debounce(() => saveForm(type), 300);
    window.addEventListener('hak:flush', () => saveForm(type));
    const upd = debounce(() => updateSummary(type), 120);
    sec.addEventListener('input', (e) => { if (e.target.closest('.card-body') && e.target.id && e.target.id.indexOf('f-') === 0) { save(); upd(); } });
    sec.addEventListener('change', (e) => {
      if (e.target.id === fid(type, 'direction')) applyDirection(type);
      if (e.target.dataset && e.target.dataset.kind === 'warehouse') toggleCustomWh(e.target);
      if (e.target.dataset && e.target.dataset.kind === 'whopt') toggleCustomTxt(e.target);
      if (e.target.dataset && e.target.dataset.kind === 'contract') { applyContract(type); return; }
      if (e.target.id && e.target.id.indexOf('f-') === 0) { save(); upd(); }
    });
    sec.addEventListener('click', (e) => {                  // ↻ Điền lại · Dùng số liệu hợp đồng · Giữ như đang nhập
      const b = e.target.closest('[data-ct-act]'); if (!b) return;
      const act = b.dataset.ctAct;
      if (act === 'refill') { if (!selectedContract(type)) { toast('Chưa chọn hợp đồng.', 'warning'); return; } applyContract(type); }
      else resolveConflicts(type, act === 'over');
    });
    $('#from-' + type).addEventListener('change', (e) => { ST[type].filter.from = e.target.value; updateSummary(type); });
    $('#to-' + type).addEventListener('change', (e) => { ST[type].filter.to = e.target.value; updateSummary(type); });
    $('#resetFlt-' + type).addEventListener('click', () => { resetFilter(type); });
    $('#gen-' + type).addEventListener('click', () => generate(type));
    $('#pdf-' + type).addEventListener('click', () => generate(type, 'pdf'));
    $('#xls-' + type).addEventListener('click', () => generate(type, 'xlsx'));
    if (pageBkls(type)) {
      $('#bkls-' + type).addEventListener('click', () => generateBkls(type));
      sec.addEventListener('click', (e) => {                // "Dùng <số kế tiếp>" dưới ô Số BKLS
        const a = e.target.closest('[data-bkls-next]'); if (!a) return;
        e.preventDefault();
        $('#' + fid(type, 'bklsSoBkls')).value = a.dataset.bklsNext;
        save(); upd();
      });
    }
    if (DOCS[type].extra === 'returned') $('#btnReturn-' + type).addEventListener('click', () => openReturnModal(type));
    if (CONV_FROM[type]) sec.addEventListener('click', (e) => { const b = e.target.closest('[data-conv]'); if (b) convertTo(type, b.dataset.conv); });
    sec.addEventListener('click', (e) => {                  // v2.7.0 tab vùng nhập liệu + nút Quay lại / Tiếp
      const b = e.target.closest('.zone-tab, [data-zone-go]'); if (!b) return;
      showZone(type, b.dataset.zoneGo || b.dataset.zone);
      if (b.dataset.zoneGo) { const nav = $('#zones-' + type); if (nav && nav.getBoundingClientRect().top < 0) nav.scrollIntoView({ block: 'start', behavior: 'smooth' }); }
    });
  }

  /* ===============================================================
   * v2.6.7 ➡ Chuyển Xuất hàng kho gửi → Xuất khẩu / Ủy thác / Xuất bán (Thủy chốt 28/09/2026, phương án A — chép đợt).
   * Chép (các) đợt Excel góp phần vào phạm vi đang lọc sang hình thức đích + mang theo: tàu, lọc ngày / nhãn, chỉ các đợt đó (filter.files),
   * xe trả về (đích có "xe trả về") hoặc loại xe trả về khỏi phạm vi (Xuất bán — filter.exclude), bên gửi → bên xuất, kho xuất.
   * Bên nhận ủy thác / bên mua: chọn theo hợp đồng ở trang đích. Mỗi đợt 1 hình thức (đợt đã chuyển sang hình thức khác → chặn).
   * ============================================================= */
  const fileOfUid = (u) => { u = String(u === undefined ? '' : u); const i = u.lastIndexOf('#'); return i < 0 ? '' : u.slice(0, i); };
  async function convertTo(src, dst) {
    const ds = getDs(src); if (!ds) { toast('Chưa có dữ liệu Excel để chuyển.', 'warning'); return; }
    const p = collect(src);
    if (fieldDef(src, 'ship') && !String(p.ship || '').trim()) { toast('Nhập tên tàu trước khi chuyển.', 'warning'); focusField(src, 'ship'); return; }
    const rows = G().filterRows(ds.rows, p.filter);
    if (!rows.length) { toast('Không có phiếu cân nào trong phạm vi đang lọc.', 'warning'); return; }
    const files = Array.from(new Set(rows.map((r) => fileOfUid(r.uid)).filter(Boolean)));
    const list = ((HAK.App.slots[src] && HAK.App.slots[src].batches) || []).filter((b) => files.indexOf(b.fileName) >= 0 && b.ds && b.ds.ok);
    if (!list.length) { toast('Không tìm thấy đợt Excel của phạm vi này.', 'error'); return; }
    const other = list.filter((b) => b.conv && b.conv.to && b.conv.to !== dst);
    if (other.length) {
      toast('Mỗi đợt chỉ chuyển sang 1 hình thức: ' + other.map((b) => '"' + b.fileName + '" đã chuyển sang ' + DOCS[b.conv.to].title).join('; ') +
        '. Muốn đổi: vào Nhập liệu → ' + DOCS[other[0].conv.to].title + ' → xóa đợt đã chép, rồi chuyển lại.', 'warning');
      return;
    }
    HAK.UI.Loading.show('Đang chuyển ' + list.length + ' đợt sang ' + DOCS[dst].title + '…');
    let ok = false;
    try { ok = await HAK.App.copyBatches(src, list, dst); }
    catch (e) { console.error(e); toast('Không chuyển được: ' + (e.message || e), 'error'); return; }
    finally { HAK.UI.Loading.hide(); }
    if (!ok) { toast('Không đọc được dữ liệu đợt ở trang đích.', 'error'); return; }
    // ---- điền sẵn trang đích ----
    const put = (id, val) => { const f = fieldDef(dst, id); if (f && val !== undefined && val !== null && val !== '') setField(dst, f, String(val)); };
    put('ship', p.ship);
    put('giaoId', p.giaoId);                                  // bên gửi (chủ hàng) → đơn vị xuất khẩu / bên ủy thác / bên bán
    put('khoGiaoId', p.khoGiaoId);                            // kho xuất (kho gửi) → kho xuất / bàn cân xuất
    put('wh', p.whLabel);                                     // Ủy thác: cột "Kho xuất" ở phụ lục
    saveForm(dst);
    // ---- phạm vi: đúng các đợt đã chuyển + lọc ngày / nhãn; xe trả về ----
    const hasRet = DOCS[dst].extra === 'returned', ret = p.returned || [];
    ST[dst].filter = { groups: p.filter.groups ? new Set(p.filter.groups) : null, from: p.filter.from || '', to: p.filter.to || '', files, exclude: hasRet ? null : ret.slice(), fromType: src, fromShip: p.ship || '' };
    ST[dst].returned = new Set(hasRet ? ret : []);
    renderConv(src);
    showZone(dst, 'party');                                   // bước tiếp theo ở trang đích: chọn hợp đồng
    location.hash = '#/' + dst;
    if (ST[dst].built) { renderFilter(dst); updateSummary(dst); }
    toast('Đã chuyển ' + rows.length + ' xe (' + list.length + ' đợt) sang ' + DOCS[dst].title + (!hasRet && ret.length ? ' — đã loại ' + ret.length + ' xe trả về' : '') +
      '. Chọn hợp đồng' + (pageBkls(dst) ? ', nhập số BKLS' : '') + ' rồi tạo biên bản' + (pageBkls(dst) ? ' + BKLS' : '') + '.', 'success');
  }
  /** Trang nguồn: đợt đang dùng đã chuyển sang đâu. Trang đích: ghi chú phạm vi "chuyển từ kho gửi" + nút bỏ giới hạn. */
  function renderConv(type) {
    const st = $('#convState-' + type);
    if (st) {
      const bs = ((HAK.App.slots[type] && HAK.App.slots[type].batches) || []).filter((b) => b.conv && DOCS[b.conv.to]);
      st.innerHTML = bs.length ? bs.map((b) => '<div class="text-info">➡ "' + esc(b.fileName) + '" đã chuyển sang <a href="#/' + b.conv.to + '">' + esc(DOCS[b.conv.to].title) + '</a></div>').join('') : '';
    }
    const nb = $('#convNote-' + type), f = ST[type] && ST[type].filter;
    if (!nb) return;
    if (!f || !f.files || !f.files.length) { nb.innerHTML = ''; return; }
    nb.innerHTML = '<div class="alert alert-info py-2 px-3 mt-2 mb-0 small">➡ Phạm vi chuyển từ <b>' + esc((DOCS[f.fromType] || {}).title || 'hình thức khác') + '</b>' + (f.fromShip ? ' — tàu <b>' + esc(f.fromShip) + '</b>' : '') +
      ': chỉ lấy đợt ' + f.files.map((x) => '<span class="mono">' + esc(x) + '</span>').join(', ') + (f.exclude && f.exclude.length ? ', đã loại ' + f.exclude.length + ' xe trả về' : '') +
      '. Bấm "Đặt lại bộ lọc" để lấy toàn bộ dữ liệu của trang này.</div>';
  }

  function resetFilter(type) {
    const ds = getDs(type);
    ST[type].filter = { groups: null, from: '', to: '' };
    if (ds) ST[type].filter.groups = new Set(ds.stats.groups.map((g) => g.label));
    ST[type].returned.clear();
    renderFilter(type); updateSummary(type);
  }

  /** Hiện/ẩn 2 ô nhập tay khi chọn "Khác — nhập tay…" */
  function toggleCustomWh(sel) {
    const box = document.getElementById(sel.id + '-custom');
    if (box) box.classList.toggle('d-none', sel.value !== WH_CUSTOM);
  }

  function toggleCustomTxt(sel) {
    const t = document.getElementById(sel.id + '__txt');
    if (t) { t.classList.toggle('d-none', sel.value !== WH_CUSTOM); if (sel.value === WH_CUSTOM) t.focus(); }
  }

  /** Chiều điều chuyển → tự chọn bên giao/nhận và kho đi/đến mặc định. */
  function pickCompany(kind) { return cfg().companies.find((c) => c.kind === kind) || cfg().companies[0]; }
  function applyDirection(type) {
    const dir = $('#' + fid(type, 'direction')).value;
    const byKind = (k, pref) => (cfg().companies.find((c) => c.id === pref) || pickCompany(k)).id;
    const whBy = (id) => (cfg().warehouses.find((w) => w.id === id) || cfg().warehouses[0]).id;
    // Kho đi lấy từ nhóm "Xuất kho tại", kho đến lấy từ nhóm "Nhập kho tại"
    const kg = $('#' + fid(type, 'khoGiaoId')), kn = $('#' + fid(type, 'khoNhanId'));
    kg.value = dir === 'cn2ct' ? whBy('w_qs') : whBy('w_dn');
    kn.value = dir === 'cn2ct' ? whBy('w_n_hak') : whBy('w_n_cn');
    toggleCustomWh(kg); toggleCustomWh(kn);
    saveForm(type); updateSummary(type);
  }

  /* ===============================================================
   * 📑 Chọn hợp đồng từ Danh mục (v2.5 Phase 2 — phương án A):
   * chọn 1 lần → điền vào các ô sẵn có (vẫn sửa tay được). Ô đang có chữ NHẬP TAY khác hợp đồng → hỏi trước khi ghi đè.
   * "Nhập tay" = khác rỗng, khác mặc định, khác giá trị app đã điền lần trước (lưu ở hak.ctfill.<loại>).
   * ============================================================= */
  const hasCatalog = () => !!(HAK.Catalog && HAK.Catalog.TYPES);
  const fieldDef = (type, id) => { for (const g of DOCS[type].groups) { const f = g.fields.find((x) => x.id === id); if (f) return f; } return null; };
  function contractOptions(type, sel) {
    const list = hasCatalog() ? HAK.Catalog.contracts(type).slice().sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.ship || '').localeCompare(a.ship || '')) : [];
    const tl = hasCatalog() && HAK.Catalog.TYPES[type] ? HAK.Catalog.TYPES[type].label : '';
    const opt = (c) => '<option value="' + esc(c.id) + '"' + (c.id === sel ? ' selected' : '') + '>' + esc(HAK.Catalog.label(c) + (c.date ? ' · ' + HAK.Catalog.util.vnDate(c.date) : '')) + '</option>';
    const head = '<option value="">' + esc(list.length ? '— Không dùng danh mục (nhập tay) —' : '— Chưa có hợp đồng ' + tl + ' trong Danh mục —') + '</option>';
    // v2.6.2: hợp đồng liên quan công ty đang làm lên trước; hợp đồng công ty khác vẫn chọn được (nhóm riêng) — "mặc định, vẫn đổi được".
    const co = HAK.Auth && HAK.Auth.company ? HAK.Auth.company() : '';
    if (!co || !HAK.Catalog.relatedTo) return head + list.map(opt).join('');
    const mine = list.filter((c) => HAK.Catalog.relatedTo(c, [co])), other = list.filter((c) => mine.indexOf(c) < 0);
    const cn = (cfg().companies.find((x) => x.id === co) || {}).short || co;
    return head + (mine.length ? '<optgroup label="Hợp đồng của ' + esc(cn) + '">' + mine.map(opt).join('') + '</optgroup>' : '') +
      (other.length ? '<optgroup label="Hợp đồng công ty khác">' + other.map(opt).join('') + '</optgroup>' : '');
  }
  /** Số → chữ kiểu Việt ("13.010,81"); đúng 3 chữ số lẻ thì thêm 0 để parseNum không hiểu nhầm là phần nghìn ("54,1230"). */
  function numTxt(n) {
    if (n === null || n === undefined || n === '' || !isFinite(+n)) return '';
    const s = String(+n), neg = s[0] === '-', [i, d] = s.replace('-', '').split('.');
    return (neg ? '-' : '') + i.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (d ? ',' + (d.length === 3 ? d + '0' : d) : '');
  }
  /** Hợp đồng → { v: {idÔ: giá trị}, notes: [], filter: {from,to}|null } — chỉ các ô CÓ trên trang `type`. */
  function contractValues(type, c) {
    const K = HAK.Catalog, v = {}, notes = [];
    const has = (id) => !!fieldDef(type, id);
    const coOf = (cu) => (cu && cu.companyId && cfg().companies.some((x) => x.id === cu.companyId) ? cu.companyId : '');
    const own = (id, val) => { if (has(id)) v[id] = val === null || val === undefined ? '' : String(val); };   // ô "thuộc" hợp đồng: không có số liệu → để trống (tránh sót số của hợp đồng trước)
    const pick = (id, val) => { if (has(id) && val) v[id] = String(val); };                                    // ô chọn (công ty, kho): chỉ đổi khi hợp đồng có
    const seller = K.customer(c.sellerId), buyer = K.customer(c.customerId), deliver = K.customer(c.deliverId);
    own('ship', c.ship); own('contractNo', c.no); own('contractDate', c.date); own('contractQty', numTxt(c.qty));
    own('certNo', c.certNo); own('certDate', c.certDate); own('certWet', numTxt(c.mt)); own('certDry', numTxt(c.bdmt)); own('moisture', numTxt(c.moisture));
    const lbl = (id) => (fieldDef(type, id) || {}).label || id;
    const giao = coOf(seller) || coOf(deliver);
    if (has('giaoId')) { if (giao) pick('giaoId', giao); else if (seller) notes.push('"' + seller.name + '" không phải công ty trong nhóm → ô "' + lbl('giaoId') + '" giữ nguyên.'); }
    const nhan = coOf(buyer);
    if (has('nhanId')) { if (nhan) pick('nhanId', nhan); else if (buyer) notes.push('"' + buyer.name + '" không phải công ty trong nhóm → ô "' + lbl('nhanId') + '" giữ nguyên' + (has('bklsBenMuaTen') ? '; đã điền vào Bên mua trên BKLS.' : '.')); }
    if (has('bklsBenMuaTen')) {
      if (BKLS_TYPES[type] && nhan) ['bklsBenMuaTen', 'bklsBenMuaMst', 'bklsBenMuaDc', 'bklsBenMuaDt', 'bklsBenMuaEmail'].forEach((k) => own(k, ''));   // để trống = BKLS tự lấy theo Bên nhận/Bên mua
      else if (buyer) {
        const co = nhan ? HAK.Config.company(nhan) : null;
        own('bklsBenMuaTen', buyer.name); own('bklsBenMuaMst', buyer.tax); own('bklsBenMuaDc', buyer.address);
        own('bklsBenMuaDt', co ? co.phone : ''); own('bklsBenMuaEmail', co ? co.email : '');
      }
    }
    if (c.dryFactory > 0) pick('bklsHeSo', String(c.dryFactory));
    if (c.whId && cfg().warehouses.some((w) => w.id === c.whId)) {
      pick('khoGiaoId', c.whId);
      if (has('wh')) own('wh', HAK.Config.whAttr(cfg().warehouses.find((w) => w.id === c.whId), 'label'));
    }
    if (has('unitPrice') && c.priceUsd !== null && c.priceUsd !== undefined) {
      if (c.currency === 'VND') own('unitPrice', numTxt(c.priceUsd));
      else notes.push('Đơn giá hợp đồng tính ' + (c.currency || 'USD') + ' — biên bản in đồng/tấn nên không điền ô Đơn giá.');
    }
    const filter = c.filterTrips && (c.fromDate || c.toDate) ? { from: c.fromDate || '', to: c.toDate || '' } : null;
    return { v, notes, filter };
  }
  /** Giá trị hiện tại / gán giá trị cho 1 ô form theo kiểu ô. */
  function fieldValue(type, f) {
    const el = $('#' + fid(type, f.id)); if (!el) return '';
    return f.type === 'whopt' ? whoptValue(el) : el.value;
  }
  function setField(type, f, val) {
    const el = $('#' + fid(type, f.id)); if (!el) return;
    if (f.type === 'whopt') {
      const t = document.getElementById(el.id + '__txt'), inList = !val || whAttrList(f.attr).indexOf(val) >= 0;
      el.value = inList ? val : WH_CUSTOM;
      if (t) { t.value = inList ? '' : val; t.classList.toggle('d-none', inList); }
    } else if (f.type === 'company' || f.type === 'warehouse') {
      if (Array.from(el.options).some((o) => o.value === val)) el.value = val;
      if (f.type === 'warehouse') toggleCustomWh(el);
    } else el.value = val;
  }
  const ctFillKey = (type) => 'hak.ctfill.' + type;
  /** Áp khoảng ngày cân của hợp đồng (nếu hợp đồng bật "Lọc xe theo khoảng ngày cân"). */
  function applyContractFilter(type, flt) {
    if (!flt) return false;
    ST[type].filter.from = flt.from; ST[type].filter.to = flt.to;
    $('#from-' + type).value = flt.from; $('#to-' + type).value = flt.to;
    return true;
  }
  function selectedContract(type) {
    const sel = $('#' + fid(type, 'contractId'));
    return sel && sel.value && hasCatalog() ? HAK.Catalog.contract(sel.value) : null;
  }
  function applyContract(type) {
    const box = $('#ctMsg-' + type); if (!box) return;
    ST[type].ctPending = null;
    const c = selectedContract(type);
    if (!c) { box.innerHTML = ''; return; }
    const { v, notes, filter } = contractValues(type, c);
    const last = HAK.Store.get(ctFillKey(type), {}) || {};
    const done = [], conflicts = [];
    Object.keys(v).forEach((id) => {
      const f = fieldDef(type, id), cur = String(fieldValue(type, f) || '').trim(), nv = v[id];
      if (cur === nv.trim()) { last[id] = nv; return; }
      const def = f.def !== undefined && f.type !== 'check' ? String(f.def) : '';
      if (!cur || cur === def || cur === String(last[id] || '').trim()) { setField(type, f, nv); last[id] = nv; done.push(f.label); }
      else conflicts.push({ f, cur, nv });
    });
    HAK.Store.set(ctFillKey(type), last);
    const flt = applyContractFilter(type, filter);
    saveForm(type); updateSummary(type);
    ST[type].ctPending = conflicts.length ? conflicts : null;
    renderContractMsg(type, c, done.length, notes, flt ? filter : null);
  }
  function renderContractMsg(type, c, nDone, notes, flt) {
    const box = $('#ctMsg-' + type), cf = ST[type].ctPending || [];
    const vnD = HAK.Catalog.util.vnDate;
    let h = '<div class="small text-success">✔ ' + (nDone ? 'Đã điền ' + nDone + ' ô' : 'Các ô đã khớp') + ' theo hợp đồng <b>' + esc(HAK.Catalog.label(c)) + '</b>.' +
      (flt ? ' Đã lọc ngày cân ' + esc(vnD(flt.from) || '…') + ' → ' + esc(vnD(flt.to) || '…') + '.' : '') + '</div>';
    if (flt && getDs(type) && !currentRows(type).length)
      h += '<div class="small text-danger">⚠ File cân đang nạp không có phiếu nào trong khoảng ngày của hợp đồng — kiểm tra lại file, hoặc bấm "Đặt lại bộ lọc" để lấy toàn bộ.</div>';
    if (notes.length) h += '<div class="small text-muted">' + notes.map((n) => 'ℹ ' + esc(n)).join('<br>') + '</div>';
    if (cf.length) h += '<div class="alert alert-warning py-2 px-3 mt-2 mb-0 small"><b>' + cf.length + ' ô đang có dữ liệu nhập tay khác hợp đồng:</b><ul class="alert-list mb-2">' +
      cf.map((x) => '<li>' + esc(x.f.label) + ': <span class="mono">' + esc(x.cur) + '</span> → <span class="mono">' + esc(x.nv || '(để trống)') + '</span></li>').join('') + '</ul>' +
      '<div class="d-flex flex-wrap gap-2"><button class="btn btn-sm btn-warning" type="button" data-ct-act="over">Dùng số liệu hợp đồng</button>' +
      '<button class="btn btn-sm btn-outline-secondary" type="button" data-ct-act="keep">Giữ như đang nhập</button></div></div>';
    box.innerHTML = h;
  }
  function resolveConflicts(type, overwrite) {
    const cf = ST[type].ctPending || [], last = HAK.Store.get(ctFillKey(type), {}) || {};
    if (overwrite) { cf.forEach((x) => { setField(type, x.f, x.nv); last[x.f.id] = x.nv; }); HAK.Store.set(ctFillKey(type), last); saveForm(type); updateSummary(type); }
    ST[type].ctPending = null;
    const alertBox = $('#ctMsg-' + type + ' .alert'); if (alertBox) alertBox.remove();
    toast(overwrite ? 'Đã ghi ' + cf.length + ' ô theo hợp đồng.' : 'Giữ nguyên ' + cf.length + ' ô đang nhập tay.', 'info');
  }
  /** Danh mục vừa đổi / mở lại trang → dựng lại danh sách hợp đồng (giữ lựa chọn nếu còn). */
  function refreshContracts(type) {
    const sel = ST[type].built ? $('#' + fid(type, 'contractId')) : null; if (!sel) return;
    const cur = sel.value;
    sel.innerHTML = contractOptions(type, cur);
    if (sel.value !== cur) { saveForm(type); const b = $('#ctMsg-' + type); if (b) b.innerHTML = ''; }
  }

  /* ===============================================================
   * Đọc / lưu giá trị form
   * ============================================================= */
  function collect(type) {
    const D = DOCS[type], p = {};
    D.groups.forEach((g) => g.fields.forEach((f) => {
      const el = $('#' + fid(type, f.id));
      if (!el) return;
      p[f.id] = f.type === 'check' ? el.checked : (f.type === 'whopt' ? whoptValue(el) : el.value).trim();
      if (f.type === 'warehouse' && p[f.id] === WH_CUSTOM) {       // kho nhập tay → đăng ký tạm để Config.warehouse() tìm được
        const nm = ($('#' + fid(type, f.id) + '__name').value || '').trim(), ad = ($('#' + fid(type, f.id) + '__addr').value || '').trim();
        const cid = '__c_' + type + '_' + f.id;
        HAK.Config.custom[cid] = { id: cid, name: nm, short: nm, address: ad, type: 'Kho nhập tay' };
        p[f.id] = cid;
      }
    }));
    const stt = ST[type];
    const ds = getDs(type);
    const allLabels = ds ? ds.stats.groups.map((g) => g.label) : [];
    const sel = stt.filter.groups;
    p.filter = { groups: sel && sel.size < allLabels.length ? Array.from(sel) : null, from: stt.filter.from, to: stt.filter.to };
    if (stt.filter.files && stt.filter.files.length) p.filter.files = stt.filter.files.slice();          // v2.6.7: phạm vi chuyển từ kho gửi
    if (stt.filter.exclude && stt.filter.exclude.length) p.filter.exclude = stt.filter.exclude.slice();
    if (D.extra === 'returned') p.returned = Array.from(stt.returned);
    if (type === 'dieuchuyen') {
      const ct = pickCompany('Công ty'), cn = pickCompany('Chi nhánh');
      const hak = cfg().companies.find((c) => c.id === 'hak') || ct, cnn = cfg().companies.find((c) => c.id === 'cn') || cn;
      p.giaoId = p.direction === 'cn2ct' ? cnn.id : hak.id;
      p.nhanId = p.direction === 'cn2ct' ? hak.id : cnn.id;
      p.docDate = p.qdDate;
    }
    return p;
  }
  function saveForm(type) {
    const o = {};
    DOCS[type].groups.forEach((g) => g.fields.forEach((f) => {
      const el = $('#' + fid(type, f.id));
      if (!el || f.type === 'date') return;                  // ngày luôn mặc định là hôm nay
      o[f.id] = f.type === 'check' ? el.checked : (f.type === 'whopt' ? whoptValue(el) : el.value);
      if (f.type === 'warehouse') { o[f.id + '__name'] = $('#' + fid(type, f.id) + '__name').value; o[f.id + '__addr'] = $('#' + fid(type, f.id) + '__addr').value; }
    }));
    HAK.Store.set('hak.form.' + type, o);
  }

  /* ===============================================================
   * Bộ lọc + tóm tắt trực tiếp
   * ============================================================= */
  function renderFilter(type) {
    const ds = getDs(type), box = $('#chips-' + type);
    renderConv(type);
    $('#noData-' + type).classList.toggle('d-none', !!ds);
    $('#gen-' + type).disabled = !ds; $('#pdf-' + type).disabled = !ds; $('#xls-' + type).disabled = !ds;
    if (pageBkls(type)) $('#bkls-' + type).disabled = !ds;
    if (!ds) { box.innerHTML = ''; return; }
    const groups = ds.stats.groups;
    if (!ST[type].filter.groups) ST[type].filter.groups = new Set(groups.map((g) => g.label));
    // Cột ghi chú/nhãn của Excel chỉ là ghi nháp → KHÔNG dùng làm điều kiện lọc (tập nhãn luôn đầy đủ = lấy toàn bộ dòng).
    box.innerHTML = '';
    const iso = (ts) => { const t = HAK.Excel.util.tsToParts(ts); return t.y + '-' + String(t.m).padStart(2, '0') + '-' + String(t.d).padStart(2, '0'); };
    ['from', 'to'].forEach((k) => {
      const el = $('#' + k + '-' + type);
      el.value = ST[type].filter[k] || '';
      if (ds.stats.minTs !== null) { el.min = iso(ds.stats.minTs); el.max = iso(ds.stats.maxTs); }
    });
  }

  function currentRows(type) {
    const ds = getDs(type); if (!ds) return [];
    const p = collect(type);
    return G().filterRows(ds.rows, p.filter);
  }

  function updateSummary(type) {
    if (pageBkls(type)) bklsHint(type);
    const ds = getDs(type);
    const list = $('#sumList-' + type);
    if (!ds) { $('#sumTrips-' + type).textContent = '0'; $('#sumTons-' + type).textContent = '0'; list.innerHTML = ''; renderZones(type, null); return; }
    const rows = currentRows(type), sum = G().summarize(rows);
    $('#sumTrips-' + type).textContent = fmtInt(sum.trips);
    $('#sumTons-' + type).textContent = G().fmtTon(sum.kg);
    const li = (a, b) => '<li><span>' + esc(a) + '</span><b>' + esc(b) + '</b></li>';
    let html = li('Thời gian', rows.length ? sum.from + ' → ' + sum.to : '—') + li('Số xe (biển số)', fmtInt(sum.vehicles)) + li('Tổng kg', fmtInt(sum.kg) + ' kg');
    if (DOCS[type].extra === 'returned') {
      const ret = rows.filter((r) => ST[type].returned.has(G().retKey(r)));
      const rk = ret.reduce((a, r) => a + r.net, 0);
      html += li('Xe trả về', ret.length ? ret.length + ' xe · ' + G().fmtTon(rk) + ' t' : 'Không có') + li('Thực giao', G().fmtTon(sum.kg - rk) + ' tấn');
      const el = $('#retSummary-' + type);
      el.textContent = ST[type].returned.size ? 'Đã chọn ' + ST[type].returned.size + ' xe' + (ret.length !== ST[type].returned.size ? ' (' + ret.length + ' xe nằm trong phạm vi hiện tại)' : '') : 'Chưa chọn — mặc định "Không có xe trả về".';
    }
    if (type === 'dieuchuyen') html += li('Khối lượng làm tròn', G().fmtTonRound(sum.kg) + ' tấn');
    const warnRows = rows.filter((r) => r.warn && r.warn.length).length;
    if (warnRows) html += li('Dòng có cảnh báo', warnRows + ' dòng');
    list.innerHTML = html;
    $('#genHint-' + type).textContent = rows.length ? 'Sẽ tạo: ' + fileHint(type) : '';
    renderZones(type, rows);
  }
  function fileHint(type) {
    return { guikho: 'BienBanGuiKho_MMYYYY.docx', xuatkhogui: 'XuatKhoGui_<TênTàu>.docx', xuatkhau: 'XuatKhau_<TênTàu>.docx', xuatban: 'XuatBan_MMYYYY.docx', uythac: 'UyThac_<TênTàu>.docx', dieuchuyen: 'QuyetDinh_… + DieuChuyen_TMMYYYY.docx', traodoi: 'TraoDoi_MMYYYY.docx' }[type];
  }

  /* ===============================================================
   * Sinh biên bản
   * ============================================================= */
  function showMessages(type, res) {
    const box = $('#msgs-' + type);
    let h = '';
    if (res.errors.length) h += '<div class="alert alert-danger py-2 mb-2"><ul class="alert-list">' + res.errors.map((e) => '<li>' + esc(e) + '</li>').join('') + '</ul></div>';
    if (res.warnings.length) h += '<div class="alert alert-warning py-2 mb-2"><ul class="alert-list">' + res.warnings.map((e) => '<li>' + esc(e) + '</li>').join('') + '</ul></div>';
    box.innerHTML = h;
  }

  /** Lưu hồ sơ vào 🗄️ Lưu trữ (không bao giờ làm hỏng việc xuất file). */
  async function archive(type, params, res, ds, mode) {
    try { return !!(HAK.Archive && await HAK.Archive.save(type, params, res, ds, mode)); } catch (e) { console.warn(e); return false; }
  }
  const SAVED = ' · đã lưu vào Lưu trữ';

  /** src (tùy chọn) = { ds, params } lấy từ hồ sơ Lưu trữ → dựng lại mà không cần file Excel cân. */
  async function generate(type, mode, src) {
    const ds = src ? src.ds : getDs(type);
    if (!ds) { toast('Chưa có dữ liệu Excel.', 'error'); return; }
    const params = src ? src.params : collect(type);
    let res;
    try { res = G().build(type, ds, params); }
    catch (e) { console.error(e); toast('Lỗi khi tính dữ liệu: ' + e.message, 'error'); return; }
    showMessages(type, res);
    if (res.errors.length) { toast(res.errors[0], 'error'); if (!src) focusError(type, res.errors[0]); return; }
    const btn = $('#' + (mode === 'pdf' ? 'pdf-' : mode === 'xlsx' ? 'xls-' : 'gen-') + type); btn.disabled = true;
    if (mode === 'pdf') {                                     // PDF: dựng bản in từ DOCX → hộp thoại in → "Lưu dưới dạng PDF"
      Loading.show('Đang dựng bản in PDF…');
      try {
        await HAK.Word.Pdf.print(res.files, {
          title: res.files[res.files.length - 1].name, onProgress: Loading.set,
          beforePrint: () => { Loading.hide(); toast('Trong hộp thoại in, chọn máy in "Lưu dưới dạng PDF" (Save as PDF) rồi bấm Lưu. Nên tắt mục "Đầu trang và chân trang".', 'info'); }
        });
        await archive(type, params, res, ds, 'pdf');
      } catch (e) { console.error(e); toast(e.message || String(e), 'error'); }
      finally { Loading.hide(); btn.disabled = false; }
      return;
    }
    if (mode === 'xlsx') {                                    // Excel lưu trữ: bảng cân chi tiết (kiểu A / kiểu B) — dữ liệu do generator dựng sẵn ở res.excel
      Loading.show('Đang xuất file Excel…');
      try {
        if (!res.excel) throw new Error('Loại biên bản này chưa có dữ liệu xuất Excel.');
        await new Promise((ok) => setTimeout(ok, 30));      // cho vòng quay "Đang xuất…" kịp hiện trước khi dựng file
        const out = await HAK.Exporter.download(res.excel);
        const sv = await archive(type, params, res, ds, 'xlsx');
        toast('Đã xuất: ' + out.name + ' (' + out.rows.toLocaleString('vi-VN') + ' phiếu' + (out.sheets > 1 ? ', ' + out.sheets + ' sheet' : '') + ')' + (sv ? SAVED : ''), 'success');
      } catch (e) { console.error(e); toast(e.message || String(e), 'error'); }
      finally { Loading.hide(); btn.disabled = false; }
      return;
    }
    Loading.show('Đang tạo biên bản…');
    try {
      const zipName = res.files.length > 1 ? res.files[res.files.length - 1].name.replace(/\.docx$/, '') + '.zip' : '';
      const done = await HAK.Word.Files.generateAndSave(res.files, { zip: !!params.zip, zipName, onProgress: Loading.set });
      const names = params.zip && done.length > 1 ? zipName : done.map((d) => d.name).join(', ');
      const sv = await archive(type, params, res, ds, 'word');
      toast('Đã sinh: ' + names + (res.warnings.length ? ' (có ' + res.warnings.length + ' lưu ý)' : '') + (sv ? SAVED : ''), 'success');
    } catch (e) {
      console.error(e); toast(e.message || String(e), 'error');
    } finally { Loading.hide(); btn.disabled = false; }
  }

  /* ===============================================================
   * Bảng kê lâm sản (BKLS) — Tổng + Từng xe, sinh song song với biên bản.
   * Dùng HAK.Bkls (bkls.js) và HAK.Issued (records.js) y nguyên, không sửa 2 file đó.
   * ============================================================= */
  /** So khớp 1 dòng phiếu cân giữa mảng đã gộp (ds.rows) và mảng gốc từng đợt (b.ds.rows): dùng uid (tên file + số dòng) gán ở mergeSlot(). */
  const rowKey = (r) => G().retKey(r);

  /** Ô BKLS còn thiếu (dùng chung cho nút Tạo BKLS và trạng thái tab). needBuyer = có xe chính (không phải xe trả về) cần bên mua. */
  function bklsMissing(type, p, needBuyer) {
    const nhan = p.nhanId ? HAK.Config.company(p.nhanId) : null;
    const autoBuyer = !!(BKLS_TYPES[type] && nhan);
    const benMuaTen = (p.bklsBenMuaTen || (autoBuyer ? nhan.name : '')).trim();
    const m = [];
    if (!p.bklsSoBkls) m.push({ id: 'bklsSoBkls', label: 'Số BKLS' });
    if (!(parseFloat(p.bklsHeSo) > 0)) m.push({ id: 'bklsHeSo', label: 'Hệ số RMT → BDMT (phải lớn hơn 0)' });
    if (needBuyer && !benMuaTen) m.push({ id: 'bklsBenMuaTen', label: 'Tên bên mua / nhận chuyển giao' });
    return { m, nhan, autoBuyer, benMuaTen };
  }
  /** Gợi ý dưới ô "Số BKLS": số gần nhất đã lập của bên xuất đang chọn (bỏ qua số "-TV" trả về) + link dùng số kế tiếp. */
  function bklsHint(type) {
    const box = $('#' + fid(type, 'bklsSoBkls') + '-help'); if (!box) return;
    const sel = $('#' + fid(type, 'giaoId')), cid = sel ? sel.value : '';
    const last = HAK.Issued && cid ? HAK.Issued.list.find((r) => r.kind === 'bkls' && r.cid === cid && !/-TV$/.test(r.soBkls || '')) : null;
    if (!last) { box.innerHTML = ''; return; }
    const next = HAK.Issued.nextBklsNo(last.soBkls);
    box.innerHTML = 'Số gần nhất: <b>' + esc(last.soBkls) + '</b>' + (next ? ' · <a href="#" data-bkls-next="' + esc(next) + '">Dùng ' + esc(next) + '</a>' : '');
  }

  /** src (tùy chọn) = { ds, params } lấy từ hồ sơ Lưu trữ → tạo lại BKLS không cần file Excel cân (không ghi lại nhật ký chứng từ). */
  async function generateBkls(type, src) {
    const ds = src ? src.ds : getDs(type);
    if (!ds) { toast('Chưa có dữ liệu Excel.', 'error'); return; }
    const p = src ? src.params : collect(type);
    const rowsAll = G().filterRows(ds.rows, p.filter);
    if (!rowsAll.length) { toast('Không có phiếu cân nào trong phạm vi đã chọn. Hãy kiểm tra bộ lọc ngày.', 'error'); return; }
    const want = { totalDocx: p.bklsTotalDocx, totalPdf: p.bklsTotalPdf, tripDocx: p.bklsTripDocx, tripPdf: p.bklsTripPdf };
    if (!Object.keys(want).some((k) => want[k])) { toast('Chọn ít nhất một bản BKLS cần tạo (Tổng / Từng xe).', 'warning'); return; }

    // Xe trả về (chỉ những loại có "Chọn xe trả về") → tách riêng, KHÔNG tính vào BKLS chính.
    const hasReturned = !!BKLS_HAS_RETURNED[type];
    const retSet = hasReturned ? new Set(p.returned || []) : new Set();   // p.returned = danh sách xe trả về đang chọn (hoặc đã lưu trong hồ sơ)
    const rowsMain = rowsAll.filter((r) => !retSet.has(G().retKey(r)));
    const rowsReturned = rowsAll.filter((r) => retSet.has(G().retKey(r)));

    const chk = bklsMissing(type, p, rowsMain.length > 0), nhan = chk.nhan, autoBuyer = chk.autoBuyer, benMuaTen = chk.benMuaTen;
    // v2.7.1 đơn vị vận chuyển cho mục 5 BKLS tổng — cùng thứ tự ưu tiên với phụ lục biên bản (generator.detailRows): Excel / danh sách xe → ĐVVC mặc định của trang → Cài đặt chung
    const dvvcOf = (r) => r.carrier || p.defaultCarrier || (HAK.Config.data.general || {}).defaultCarrier || '';
    if (chk.m.length) { toast('Chưa thể tạo BKLS — cần bổ sung: ' + chk.m.map((x) => x.label).join('; ') + '.', 'warning'); if (!src) focusField(type, chk.m[0].id); return; }
    const benMuaMst = p.bklsBenMuaMst || (autoBuyer ? (nhan.tax || '') : '');
    const benMuaDc = p.bklsBenMuaDc || (autoBuyer ? (nhan.address || '') : '');

    // Các đợt (file Excel) góp phần vào phạm vi đang lọc — ghi nhật ký theo từng đợt để mục 🏠 Tổng quan nhận biết đúng "đã lập BKLS".
    const slBatches = src ? [] : ((HAK.App.slots[type] && HAK.App.slots[type].batches) || []).filter((b) => b.ds && b.ds.ok);
    const perBatchFor = (subset) => {
      const keys = new Set(subset.map(rowKey));
      return slBatches.map((b) => ({ b, sub: G().filterRows(b.ds.rows, p.filter).filter((r) => keys.has(rowKey(r))) })).filter((x) => x.sub.length);
    };
    const perBatchMain = perBatchFor(rowsMain), perBatchTv = perBatchFor(rowsReturned);
    const batchLabel = (perBatchMain[0] || perBatchTv[0] || {}).b;
    const batchLabelName = batchLabel ? batchLabel.fileName : (p.ship || p.contractNo || p.period || DOCS[type].title);

    // Các điều cần người dùng xác nhận (gộp vào MỘT lần bấm lại): trùng số BKLS, phạm vi quá nhiều xe cho bản từng xe.
    const confirmMsgs = [];
    if (HAK.Issued && !src) {                   // tạo lại từ Lưu trữ = in lại bản đã lập → không cảnh báo trùng với chính nó
      const conflicts = HAK.Issued.checkBkls({ cid: p.giaoId, so: p.bklsSoBkls, type, batch: batchLabelName });
      if (conflicts.length) confirmMsgs.push('Số BKLS ' + p.bklsSoBkls + ' có thể đã dùng cho đợt khác: ' + conflicts.slice(0, 3).map((c) => '"' + c.rec.batch + '"').join(', ') + '.');
    }
    const tripMax = (want.tripDocx || want.tripPdf) ? Math.max(rowsMain.length, rowsReturned.length) : 0;
    if (tripMax > HAK.Bkls.TRIP_SPLIT_OVER) {
      confirmMsgs.push('Phạm vi đang có ' + fmtInt(tripMax) + ' xe — bản từng xe sẽ tự chia thành ' + HAK.Bkls.tripRanges(tripMax).length +
        ' file (≤ ' + fmtInt(HAK.Bkls.TRIP_PART_SIZE) + ' xe/file, số BKLS từng xe vẫn liên tục) và có thể mất vài phút. Nếu quên lọc ngày, hãy chọn lại phạm vi.');
    }
    const confirmKey = p.bklsSoBkls + '|' + rowsAll.length + '|' + confirmMsgs.length;
    if (confirmMsgs.length && ST[type].bklsDupKey !== confirmKey) {
      ST[type].bklsDupKey = confirmKey;
      toast('⚠ ' + confirmMsgs.join(' ') + ' Bấm "🧾 Tạo BKLS" lần nữa nếu vẫn muốn tạo.', 'warning');
      return;
    }
    ST[type].bklsDupKey = '';

    const giao = HAK.Config.company(p.giaoId);
    const kg = p.khoGiaoId ? HAK.Config.warehouse(p.khoGiaoId) : null;
    const kn = p.khoNhanId ? HAK.Config.warehouse(p.khoNhanId) : null;
    const xuatKhoTai = kg ? (kg.address || kg.name) : '';
    const noiDen = kn ? (kn.address || kn.name) : '';
    const gCommon = {
      tenChu: HAK.Config.companyAttr(giao, 'cua'), mstChu: (giao.tax || '').trim(), diaChiChu: (giao.address || '').trim(),
      dienThoaiChu: (giao.phone || '').trim(), email: (giao.email || '').trim(), nguonGoc: p.bklsNguonGoc || NGUON_GOC_DEF,
      maHs: maHsOf(type, p)   // v2.7.6
    };
    const btn = $('#bkls-' + type) || {}; btn.disabled = true;
    Loading.show('Đang tạo BKLS…');
    try {
      const out = [];              // { key, label, name, blob, kind: 'main'|'tv' }
      let ctxMain = null;

      // ---- BKLS chính (không tính xe trả về) ----
      if (rowsMain.length) {
        ctxMain = { g: Object.assign({}, gCommon, { xuatKhoTai, noiDen }) };
        const lotMain = {
          soBkls: p.bklsSoBkls, heSoBdmt: parseFloat(p.bklsHeSo), ngayLap: p.bklsNgayLap, ngayLapTheoXe: p.bklsNgayLapXe, listTrips: p.bklsListTrips !== false,
          benMuaTen, benMuaMst, benMuaDiaChi: benMuaDc, benMuaDt: p.bklsBenMuaDt, benMuaEmail: p.bklsBenMuaEmail,
          trips: rowsMain.map((r) => ({ ngayCanDate: HAK.Bkls.parseDMY(r.dateStr), bienSoRaw: r.plate, tenTaiXe: r.driver || '', klHangKg: r.net || 0, donViVc: dvvcOf(r) }))
        };
        const baseMain = 'BKLS_' + G().slug(DOCS[type].title) + '_' + String(p.bklsSoBkls).replace(/[\\/:*?"<>|\s]+/g, '-');
        const o = await HAK.Bkls.generate(ctxMain, lotMain, want, baseMain, (msg, pct) => Loading.set(pct, msg));
        o.forEach((x) => out.push(Object.assign(x, { kind: 'main' })));
      } else if (rowsReturned.length) {
        Loading.set(0, 'Toàn bộ xe trong phạm vi đều là xe trả về — chỉ tạo BKLS trả về…');
      }

      // ---- BKLS TRẢ VỀ (chiều ngược lại: chủ lâm sản = bên mua/nhận = bên xuất, tự nhận lại hàng của mình) ----
      if (hasReturned && rowsReturned.length) {
        const soBklsTv = p.bklsSoBkls + '-TV';
        const noiDenTv = (p.bklsTvNoiDen || '').trim() || (p.returnWh || '').trim() || xuatKhoTai || '';   // Ủy thác: "Kho nhận xe trả về"; loại khác: đảo ngược điểm xuất kho ban đầu
        const xuatKhoTaiTv = noiDen || '';                                                    // điểm xuất phát của lượt trả về = điểm đến của biên bản chính
        const ctxTv = { g: Object.assign({}, gCommon, { xuatKhoTai: xuatKhoTaiTv, noiDen: noiDenTv }) };
        if (ctxMain && ctxMain.snapshot) ctxTv.snapshot = ctxMain.snapshot;   // dùng lại snapshot đã đọc, đỡ đọc lại file mẫu lần 2
        const lotTv = {
          soBkls: soBklsTv, heSoBdmt: parseFloat(p.bklsHeSo), ngayLap: p.bklsNgayLap, ngayLapTheoXe: p.bklsNgayLapXe, listTrips: p.bklsListTrips !== false,
          // Chủ lâm sản vẫn là bên xuất (giao) — Bên mua/nhận trên BKLS trả về CŨNG là chính công ty đó (tự nhận lại hàng của mình).
          benMuaTen: giao.name, benMuaMst: (giao.tax || ''), benMuaDiaChi: (giao.address || ''), benMuaDt: (giao.phone || ''), benMuaEmail: (giao.email || ''),
          trips: rowsReturned.map((r) => ({ ngayCanDate: HAK.Bkls.parseDMY(r.dateStr), bienSoRaw: r.plate, tenTaiXe: r.driver || '', klHangKg: r.net || 0, donViVc: dvvcOf(r) }))
        };
        const baseTv = 'BKLS_' + G().slug(DOCS[type].title) + '_TraVe_' + soBklsTv.replace(/[\\/:*?"<>|\s]+/g, '-');
        const oTv = await HAK.Bkls.generate(ctxTv, lotTv, want, baseTv, (msg, pct) => Loading.set(pct, 'Trả về: ' + msg));
        oTv.forEach((x) => out.push(Object.assign(x, { kind: 'tv' })));
      }

      // Nhiều file (bản từng xe bị chia phần) → gói 1 ZIP để trình duyệt không hỏi tải hàng chục file; ít file → tải từng file như cũ.
      if (out.length > 4) {
        Loading.set(99, 'Đang gói ZIP ' + out.length + ' file…');
        const z = new JSZip();
        out.forEach((o) => z.file(o.name, o.blob, { binary: true }));
        const zipName = 'BKLS_' + G().slug(DOCS[type].title) + '_' + String(p.bklsSoBkls).replace(/[\\/:*?"<>|\s]+/g, '-') + '.zip';
        HAK.Word.Files.saveBlob(await z.generateAsync({ type: 'blob', compression: 'STORE' }), zipName);
      } else out.forEach((o) => HAK.Word.Files.saveBlob(o.blob, o.name));

      if (HAK.Issued) {
        for (const { b, sub } of perBatchMain) {
          const sumB = G().summarize(sub);
          const old = HAK.Issued.list.find((r) => r.kind === 'bkls' && r.cid === p.giaoId && r.type === type && r.batch === b.fileName && r.soBkls === p.bklsSoBkls);
          if (old) await HAK.Issued.remove(old.id);
          await HAK.Issued.add({ kind: 'bkls', type, cid: p.giaoId, cua: (giao.short || giao.name), batch: b.fileName, from: sumB.from, to: sumB.to, trips: sumB.trips, kg: sumB.kg, soBkls: p.bklsSoBkls, benMua: benMuaTen, outputs: Object.keys(want).filter((k) => want[k]) });
        }
        if (hasReturned && rowsReturned.length) {
          const soBklsTv = p.bklsSoBkls + '-TV';
          for (const { b, sub } of perBatchTv) {
            const sumB = G().summarize(sub);
            const old = HAK.Issued.list.find((r) => r.kind === 'bkls' && r.cid === p.giaoId && r.type === type && r.batch === b.fileName && r.soBkls === soBklsTv);
            if (old) await HAK.Issued.remove(old.id);
            await HAK.Issued.add({ kind: 'bkls', type, cid: p.giaoId, cua: (giao.short || giao.name), batch: b.fileName, from: sumB.from, to: sumB.to, trips: sumB.trips, kg: sumB.kg, soBkls: soBklsTv, benMua: giao.name, outputs: Object.keys(want).filter((k) => want[k]) });
          }
        }
      }

      const warn = [];
      const thieu = [['MST', gCommon.mstChu], ['địa chỉ', gCommon.diaChiChu], ['số điện thoại', gCommon.dienThoaiChu], ['email', gCommon.email]].filter((x) => !x[1]).map((x) => x[0]);
      if (thieu.length) warn.push('Bên xuất chưa có ' + thieu.join(', ') + ' (Cài đặt → Công ty): dòng tương ứng trên BKLS giữ nguyên như file mẫu.');
      if (rowsMain.length && !benMuaMst) warn.push('Chưa có MST bên mua.');
      const zeroAll = rowsAll.filter((r) => !(r.net > 0)).length;
      if (zeroAll) warn.push(zeroAll + ' xe có khối lượng bằng 0 nên ra 0 tấn trên BKLS.');
      const nMain = out.filter((o) => o.kind === 'main').length, nTv = out.filter((o) => o.kind === 'tv').length;
      const parts = [];
      if (nMain) parts.push(nMain + ' bản chính');
      if (nTv) parts.push(nTv + ' bản trả về (' + rowsReturned.length + ' xe)');
      // Lưu hồ sơ vào Lưu trữ (cùng hồ sơ với biên bản của đợt này nếu đã có) → tải lại BKLS sau mà không cần file Excel cân.
      const sv = await archive(type, p, {
        files: [{ name: out[0].name.replace(/_(tong|tung_xe)(_phan\d+)?\.\w+$/, '') }],
        summary: { 'Số BKLS': p.bklsSoBkls, 'Bên mua': benMuaTen || giao.name }
      }, ds, 'bkls');
      toast('Đã tạo ' + out.length + ' bản BKLS: ' + parts.join(' + ') + '.' + (out.length > 4 ? ' Đã gói chung vào 1 file ZIP.' : '') + (sv ? SAVED + '.' : '') + (warn.length ? ' Lưu ý: ' + warn.join(' ') : ''), warn.length ? 'warning' : 'success');
      bklsHint(type);
    } catch (e) {
      console.error(e); toast('Lỗi khi tạo BKLS: ' + e.message, 'error');
    } finally { Loading.hide(); btn.disabled = false; }
  }

  /* ===============================================================
   * Modal chọn xe trả về (Ủy thác)
   * ============================================================= */
  let retType = 'uythac';
  function openReturnModal(type) {
    if (type) retType = type;
    const ds = getDs(type);
    if (!ds) { toast('Chưa có dữ liệu Excel.', 'error'); return; }
    $('#retSearch').value = ''; $('#retPasteMsg').textContent = ''; $('#retPaste').value = '';
    renderReturnList();
    bootstrap.Modal.getOrCreateInstance($('#returnModal')).show();
  }
  function renderReturnList() {
    const rows = currentRows(retType), q = $('#retSearch').value.trim().toLowerCase();
    const set = ST[retType].returned;
    let shown = rows.filter((r) => !q || r.ticket.toLowerCase().includes(q) || r.plate.toLowerCase().includes(q));
    const total = shown.length;
    // hiển thị các xe đã chọn lên đầu để dễ kiểm tra
    const K = G().retKey;
    shown = shown.sort((a, b) => (set.has(K(b)) ? 1 : 0) - (set.has(K(a)) ? 1 : 0)).slice(0, 300);
    $('#retBody').innerHTML = shown.map((r) =>
      '<tr><td><input class="form-check-input" type="checkbox" data-key="' + esc(K(r)) + '"' + (set.has(K(r)) ? ' checked' : '') + '></td>' +
      '<td class="mono">' + esc(r.ticket || '(dòng ' + r.idx + ')') + '</td><td>' + esc(r.time1) + '</td><td>' + esc(r.plate) + '</td><td class="num">' + fmtInt(r.net) + '</td></tr>').join('');
    $('#retInfo').textContent = 'Hiển thị ' + shown.length + ' / ' + total + ' phiếu' + (total > 300 ? ' — gõ tìm kiếm để thu hẹp.' : '.');
    $('#retCount').textContent = 'Đã chọn: ' + set.size + ' xe';
  }
  function initReturnModal() {
    $('#retSearch').addEventListener('input', debounce(renderReturnList, 150));
    $('#retBody').addEventListener('change', (e) => {
      const cb = e.target.closest('input[data-key]'); if (!cb) return;
      const s = ST[retType].returned, i = cb.dataset.key;
      if (cb.checked) s.add(i); else s.delete(i);
      $('#retCount').textContent = 'Đã chọn: ' + s.size + ' xe'; updateSummary(retType);
    });
    $('#retClear').addEventListener('click', () => { ST[retType].returned.clear(); renderReturnList(); updateSummary(retType); });
    $('#retApply').addEventListener('click', () => {
      const tokens = $('#retPaste').value.split(/[\s,;]+/).filter(Boolean);
      const rows = currentRows(retType), miss = [];
      let add = 0;
      tokens.forEach((t) => {
        const hit = rows.filter((r) => r.ticket === t || r.ticket.startsWith(t + '/'));
        if (!hit.length) miss.push(t); else hit.forEach((r) => { const k = G().retKey(r); if (!ST[retType].returned.has(k)) { ST[retType].returned.add(k); add++; } });
      });
      $('#retPasteMsg').innerHTML = '<span class="' + (miss.length ? 'text-warning' : 'text-success') + '">Đã thêm ' + add + ' xe' + (miss.length ? '; không tìm thấy: ' + esc(miss.join(', ')) : '') + '</span>';
      renderReturnList(); updateSummary(retType);
    });
  }

  /* ===============================================================
   * API công khai
   * ============================================================= */
  function refreshSelects() {
    Object.keys(DOCS).forEach((type) => {
      if (!ST[type].built) return;
      $$('#page-' + type + ' select[data-kind]').forEach((sel) => {
        if (sel.dataset.kind === 'whopt') {                  // dropdown ghi phụ lục / ký hiệu: dựng lại theo danh mục kho
          const cur = whoptValue(sel), t = document.getElementById(sel.id + '__txt');
          sel.innerHTML = whAttrOptions(sel.dataset.attr, cur);
          const custom = sel.value === WH_CUSTOM;
          if (t) { t.classList.toggle('d-none', !custom); if (custom) t.value = cur; }
          return;
        }
        const cur = sel.value;
        sel.innerHTML = sel.dataset.kind === 'company' ? companyOptions(cur) : whOptions(cur, whFirst(sel.id));
        if (!Array.from(sel.options).some((o) => o.value === cur)) sel.selectedIndex = 0;
      });
      updateSummary(type);
    });
  }

  HAK.Pages = {
    DOCS,
    init() {
      Object.keys(DOCS).forEach(buildPage); initReturnModal();
      window.addEventListener('hak:catalog', () => Object.keys(DOCS).forEach(refreshContracts));   // Danh mục thêm / sửa / xóa hợp đồng
    },
    /** Khi dữ liệu Excel thay đổi: đặt lại bộ lọc & tóm tắt cho mọi trang */
    onData(only) {
      Object.keys(DOCS).forEach((t) => {
        if ((!only || only === t) && ST[t].built) {
          ST[t].filter = { groups: null, from: '', to: '' }; ST[t].returned.clear(); renderFilter(t);
          const c = selectedContract(t);                   // hợp đồng đang chọn có "lọc theo khoảng ngày cân" → giữ khoảng ngày đó cho dữ liệu mới
          if (c) applyContractFilter(t, contractValues(t, c).filter);
          updateSummary(t);
        }
      });
    },
    show(type) { if (ST[type].built) { refreshContracts(type); renderFilter(type); updateSummary(type); } },
    refreshSelects, generate, generateBkls,
    /** Loại biên bản có lập BKLS hay không (dùng ở Lưu trữ). */
    hasBkls: (t) => pageBkls(t),
    /** Dùng cho kiểm thử tự động */
    _collect: collect
  };
})(window);
