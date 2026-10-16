/**
 * report.js — 📊 Báo cáo tổng hợp: cộng các hồ sơ trong 🗄️ Lưu trữ theo loại biên bản / tháng / tàu.
 *
 * - Khối lượng: "qua cân" (tổng phiếu cân), "xe trả về" và "thực giao" = qua cân − xe trả về
 *   (xe trả về chỉ có ở Ủy thác xuất khẩu và Xuất hàng kho gửi; các loại khác thực giao = qua cân).
 * - Chống cộng trùng: hồ sơ cùng loại + cùng tàu (hoặc cùng bên giao/nhận + kho) mà khoảng ngày CHỒNG NHAU thì chỉ tính hồ sơ
 *   mới nhất; các hồ sơ cũ bị bỏ tick mặc định. Người dùng có thể tick lại / bỏ tick từng hồ sơ (lưu trong trình duyệt).
 * - Lọc thời gian theo NGÀY BẮT ĐẦU của hồ sơ (ngày cân sớm nhất).
 * - Không có tổng chung của mọi loại: cùng một lô hàng có thể đi qua nhiều loại biên bản (gửi kho → xuất khẩu…).
 * Phần tính toán (compute) không phụ thuộc DOM → kiểm thử được trong Node.
 */
(function (root) {
  'use strict';
  const HAK = (root.HAK = root.HAK || {});
  const OFF_KEY = 'hak.report.manual';
  const TYPES = [['xuatkhau', '📤', 'Xuất khẩu'], ['uythac', '🚢', 'Ủy thác xuất khẩu'], ['xuatkhogui', '📦', 'Xuất hàng kho gửi'], ['xuatban', '💰', 'Xuất bán'], ['guikho', '📄', 'Trung chuyển gửi kho'], ['dieuchuyen', '🔄', 'Điều chuyển nội bộ'], ['traodoi', '🤝', 'Trao đổi hàng hóa']];
  const HAS_RET = { xuatkhau: true, uythac: true, xuatkhogui: true };
  const G = () => HAK.Generator;

  const dmyToTs = (s) => { const m = String(s || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); return m ? Date.UTC(+m[3], +m[2] - 1, +m[1]) : null; };
  const monthOf = (s) => { const m = String(s || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); return m ? m[3] + '-' + m[2].padStart(2, '0') : '(không rõ)'; };
  const isoToTs = (s) => { const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : null; };
  const typeName = (t) => { const x = TYPES.find((a) => a[0] === t); return x ? x[1] + ' ' + x[2] : t; };

  /* ---------------------------------------------------------------
   * Tính toán
   * ------------------------------------------------------------- */
  /** Đánh dấu hồ sơ trùng (khoảng ngày chồng nhau trong cùng nhóm) — giữ bản mới nhất. */
  function markDuplicates(recs) {
    const groups = new Map();
    recs.forEach((r) => {
      const k = r.type + '|' + (r.ship || (r.giao + '>' + r.nhan + '|' + (r.kho || '')));
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(r);
    });
    groups.forEach((list) => {
      list.sort((a, b) => b.updatedAt - a.updatedAt);
      const kept = [];
      list.forEach((r) => {
        const hit = kept.find((k) => r.fromTs !== null && k.fromTs !== null && r.fromTs <= k.toTs && k.fromTs <= r.toTs);
        if (hit) { r.dup = true; r.dupOf = hit.title; } else { r.dup = false; kept.push(r); }
      });
    });
  }

  /**
   * @param {object[]} metas  hồ sơ từ HAK.Archive.list() (đã ensureStats)
   * @param {object}   opt    { from:'yyyy-mm-dd', to:'yyyy-mm-dd', manual:{id:true|false} }
   */
  function compute(metas, opt) {
    opt = opt || {};
    const manual = opt.manual || {}, f = isoToTs(opt.from), t = isoToTs(opt.to);
    const recs = metas.map((m) => Object.assign({}, m, { fromTs: dmyToTs(m.from), toTs: dmyToTs(m.to) || dmyToTs(m.from), month: monthOf(m.from) }));
    recs.forEach((r) => { if (r.toTs === null) r.toTs = r.fromTs; });
    markDuplicates(recs);
    const inRange = (r) => (f === null || (r.fromTs !== null && r.fromTs >= f)) && (t === null || (r.fromTs !== null && r.fromTs <= t));
    recs.forEach((r) => {
      r.inRange = inRange(r);
      r.include = manual[r.id] !== undefined ? !!manual[r.id] : !r.dup;
      r.retKg = HAS_RET[r.type] ? (r.retKg || 0) : 0; r.retTrips = HAS_RET[r.type] ? (r.retTrips || 0) : 0;
      r.delKg = r.kg - r.retKg;
    });
    const used = recs.filter((r) => r.inRange && r.include);
    const byType = {};
    TYPES.forEach(([k]) => { byType[k] = { n: 0, trips: 0, kg: 0, retTrips: 0, retKg: 0, delKg: 0 }; });
    const months = new Map();
    used.forEach((r) => {
      const b = byType[r.type] || (byType[r.type] = { n: 0, trips: 0, kg: 0, retTrips: 0, retKg: 0, delKg: 0 });
      b.n++; b.trips += r.trips; b.kg += r.kg; b.retTrips += r.retTrips; b.retKg += r.retKg; b.delKg += r.delKg;
      if (!months.has(r.month)) months.set(r.month, {});
      const mo = months.get(r.month); mo[r.type] = (mo[r.type] || 0) + r.delKg;
    });
    const ships = used.filter((r) => HAS_RET[r.type]).sort((a, b) => (a.fromTs || 0) - (b.fromTs || 0));
    return { recs: recs.sort((a, b) => b.updatedAt - a.updatedAt), used, byType, months: Array.from(months.entries()).sort((a, b) => a[0] < b[0] ? -1 : 1), ships };
  }

  /* ---------------------------------------------------------------
   * Xuất Excel
   * ------------------------------------------------------------- */
  const XF = 'Arial', XNF = '#,##0.00', XNI = '#,##0';
  /** Vẽ 1 sheet kiểu báo cáo (tiêu đề + ghi chú + tiêu đề cột + dữ liệu [+ dòng tổng]) — dùng chung cho mọi sheet của toExcel/toExcelCarrier. */
  function buildSheet(wb, name, title, sub, cols, rows, opt) {
    opt = opt || {};
    const thin = { style: 'thin', color: { argb: 'FF808080' } }, B = { top: thin, left: thin, bottom: thin, right: thin };
    const ws = wb.addWorksheet(name);
    ws.columns = cols.map((c) => ({ width: c.w }));
    ws.mergeCells(1, 1, 1, cols.length); Object.assign(ws.getCell(1, 1), { value: title, font: { name: XF, size: 13, bold: true } });
    ws.mergeCells(2, 1, 2, cols.length); Object.assign(ws.getCell(2, 1), { value: sub, font: { name: XF, size: 9, italic: true, color: { argb: 'FF555555' } }, alignment: { wrapText: true, vertical: 'top' } });
    ws.getRow(2).height = 26;
    cols.forEach((c, i) => Object.assign(ws.getCell(4, i + 1), { value: c.h, font: { name: XF, size: 10, bold: true, color: { argb: 'FFFFFFFF' } }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } }, border: B, alignment: { horizontal: 'center', vertical: 'middle', wrapText: true } }));
    ws.getRow(4).height = 28;
    rows.forEach((r, ri) => cols.forEach((c, i) => {
      const cell = ws.getCell(5 + ri, i + 1);
      cell.value = r[i]; cell.border = B; cell.font = { name: XF, size: 9 };
      if (c.n) { cell.numFmt = c.n; cell.alignment = { horizontal: 'right' }; }
    }));
    let last = 4 + rows.length;
    if (opt.total && rows.length) {                                       // dòng tổng: =SUM cho các cột số
      last++;
      cols.forEach((c, i) => {
        const cell = ws.getCell(last, i + 1);
        cell.border = { top: { style: 'double', color: { argb: 'FF808080' } }, bottom: { style: 'double', color: { argb: 'FF808080' } }, left: thin, right: thin };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E2F3' } }; cell.font = { name: XF, size: 9, bold: true };
        if (i === 0) cell.value = 'TỔNG CỘNG';
        else if (c.n) {
          const L = String.fromCharCode(65 + i), res = rows.reduce((a, r) => a + (+r[i] || 0), 0);
          cell.value = { formula: 'SUM(' + L + '5:' + L + (last - 1) + ')', result: res }; cell.numFmt = c.n; cell.alignment = { horizontal: 'right' };
        }
      });
    }
    ws.views = [{ state: 'frozen', ySplit: 4 }];
    ws.pageSetup = { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: '4:4' };
    return ws;
  }
  function newWorkbook() {
    const E = root.ExcelJS || (typeof require === 'function' ? require('exceljs') : null);
    if (!E) throw new Error('Thư viện ExcelJS chưa được nạp.');
    const wb = new E.Workbook(); wb.creator = 'QUẢN LÝ XUẤT HÀNG'; wb.created = new Date();
    return wb;
  }
  async function toExcel(model) {
    if (!root.ExcelJS && HAK.UI && HAK.UI.needLib) await HAK.UI.needLib('exceljs');   // ExcelJS nạp khi cần
    const wb = newWorkbook(), sheet = (name, title, sub, cols, rows, opt) => buildSheet(wb, name, title, sub, cols, rows, opt);
    const T = (kg) => kg / 1000, NF = XNF, NI = XNI;
    const range = model.rangeText || 'Tất cả thời gian';
    const note = 'Nguồn: hồ sơ trong Lưu trữ (' + range + '). Thực giao = qua cân − xe trả về. Không cộng chung các loại vì một lô hàng có thể đi qua nhiều loại biên bản.';
    // 1. Tổng hợp theo loại
    sheet('Tổng hợp', 'BÁO CÁO TỔNG HỢP THEO LOẠI BIÊN BẢN', note,
      [{ h: 'Loại biên bản', w: 30 }, { h: 'Số hồ sơ', w: 10, n: NI }, { h: 'Số xe', w: 10, n: NI }, { h: 'Qua cân (tấn)', w: 16, n: NF }, { h: 'Xe trả về', w: 10, n: NI }, { h: 'Xe trả về (tấn)', w: 16, n: NF }, { h: 'Thực giao (tấn)', w: 16, n: NF }],
      TYPES.map(([k, ic, nm]) => { const b = model.byType[k]; return [nm, b.n, b.trips, T(b.kg), b.retTrips, T(b.retKg), T(b.delKg)]; }));
    // 2. Theo tháng
    sheet('Theo tháng', 'BÁO CÁO THEO THÁNG (TẤN THỰC GIAO)', note + ' Tháng tính theo ngày bắt đầu của hồ sơ.',
      [{ h: 'Tháng', w: 12 }].concat(TYPES.map(([k, ic, nm]) => ({ h: nm, w: 20, n: NF }))),
      model.months.map(([mo, v]) => [mo.split('-').reverse().join('/')].concat(TYPES.map(([k]) => T(v[k] || 0)))), { total: true });
    // 3. Theo tàu
    sheet('Theo tàu', 'BÁO CÁO THEO TÀU (XUẤT KHẨU / ỦY THÁC / XUẤT HÀNG KHO GỬI)', note,
      [{ h: 'Tàu', w: 24 }, { h: 'Loại', w: 24 }, { h: 'Từ ngày', w: 12 }, { h: 'Đến ngày', w: 12 }, { h: 'Bên giao', w: 14 }, { h: 'Bên nhận', w: 14 }, { h: 'Số xe', w: 9, n: NI }, { h: 'Qua cân (tấn)', w: 15, n: NF }, { h: 'Xe trả về', w: 9, n: NI }, { h: 'Xe trả về (tấn)', w: 15, n: NF }, { h: 'Thực giao (tấn)', w: 15, n: NF }],
      model.ships.map((r) => [r.ship || r.title, typeName(r.type).replace(/^\S+\s/, ''), r.from, r.to, r.giao, r.nhan, r.trips, T(r.kg), r.retTrips, T(r.retKg), T(r.delKg)]), { total: true });
    // 4. Danh sách hồ sơ
    sheet('Hồ sơ', 'DANH SÁCH HỒ SƠ ĐƯỢC TÍNH', note,
      [{ h: 'Hồ sơ', w: 34 }, { h: 'Loại', w: 24 }, { h: 'Từ ngày', w: 12 }, { h: 'Đến ngày', w: 12 }, { h: 'Số xe', w: 9, n: NI }, { h: 'Qua cân (tấn)', w: 15, n: NF }, { h: 'Thực giao (tấn)', w: 15, n: NF }],
      model.used.slice().sort((a, b) => (a.fromTs || 0) - (b.fromTs || 0)).map((r) => [r.title, typeName(r.type).replace(/^\S+\s/, ''), r.from, r.to, r.trips, T(r.kg), T(r.delKg)]));
    return wb;
  }
  /** sheetRows: [[tàu/đợt, ngày, ĐVVC, số xe, tấn, xe trả về, tấn trả về], …] (đã gộp theo ngày+ĐVVC, xem aggCarrierDaily). */
  async function toExcelCarrier(sheetRows, rangeText) {
    if (!root.ExcelJS && HAK.UI && HAK.UI.needLib) await HAK.UI.needLib('exceljs');   // v2.6.4: sửa sót — trước đây chỉ chạy khi ExcelJS đã được nạp bởi nút Excel khác
    const wb = newWorkbook();
    const note = 'Nguồn: các dòng phiếu cân của hồ sơ trong Lưu trữ (' + (rangeText || 'toàn bộ thời gian') + '), gộp theo tàu/đợt · ngày · đơn vị vận chuyển. Tàu (Xuất khẩu/Ủy thác/Xuất hàng kho gửi) gộp theo tên; các loại còn lại (Trung chuyển gửi kho/Điều chuyển nội bộ/Trao đổi hàng hóa/Xuất bán) không có tàu nên mỗi hồ sơ là 1 đợt riêng. Đơn vị vận chuyển đọc từ cột ĐVVC/nhà xe/chủ xe trong Excel cân — dòng không có sẽ gộp vào "(Không xác định)".';
    buildSheet(wb, 'ĐVVC theo tàu-đợt', 'BÁO CÁO ĐƠN VỊ VẬN CHUYỂN THEO TÀU / ĐỢT — CHI TIẾT THEO NGÀY', note,
      [{ h: 'Tàu / Đợt', w: 34 }, { h: 'Ngày', w: 12 }, { h: 'Đơn vị vận chuyển', w: 26 }, { h: 'Số xe', w: 9, n: XNI }, { h: 'Tấn', w: 14, n: XNF }, { h: 'Trong đó xe trả về', w: 12, n: XNI }, { h: 'Tấn trả về', w: 14, n: XNF }],
      sheetRows);
    return wb;
  }

  /* ---------------------------------------------------------------
   * 📑 Báo cáo XUẤT HÀNG theo hợp đồng (v2.5 Phase 3) — 2 sheet đúng cột file XUATHANG_DN:
   *   NL_DH_XB (mỗi hợp đồng / lô 1 dòng) + NL_PC_XH (mỗi phiếu cân 1 dòng); cột bổ sung đặt SAU các cột gốc.
   * Dùng lại model.used (lọc ngày + chống trùng + tick chọn của trang Báo cáo). xhLots / xhTrips không đụng DOM → Phase 4 (Google Sheet) dùng lại.
   * Hồ sơ → hợp đồng: mã hợp đồng lưu trong hồ sơ (meta.contract, từ v2.5.2); hồ sơ cũ → ghép theo tên tàu (duy nhất 1 hợp đồng cùng hình thức).
   * Ngày xuất = ngày cân (Thủy chốt 27/09/2026). Số BKLS = số app đã cấp (HAK.Bkls.tripNo, cùng thứ tự xe như lúc tạo BKLS).
   * ------------------------------------------------------------- */
  const XH_TYPES = ['xuatkhau', 'uythac', 'xuatban', 'traodoi'];
  const XH_M3 = 0.7;                                            // Khối lượng (M3) = tấn / 0,7 (như file XUATHANG_DN)
  const shipKey = (s) => {
    const n = HAK.Excel && HAK.Excel.util ? HAK.Excel.util.norm(s) : String(s || '').toLowerCase();
    return n.replace(/[^a-z0-9]/g, '').replace(/^tau/, '').replace(/^mv/, '');   // "TÀU MV.GREEN PEGASUS V.152" ≡ "MV. GREEN PEGASUS V152"
  };
  function contractFor(r) {
    const K = HAK.Catalog; if (!K) return null;
    if (r.contract) { const c = K.contract(r.contract); if (c) return c; }
    const sk = shipKey(r.ship); if (!sk) return null;
    const hit = K.contracts(r.type).filter((c) => shipKey(c.ship) === sk);
    return hit.length === 1 ? hit[0] : null;
  }
  /** Gộp hồ sơ đang tính theo hợp đồng. Hợp đồng chưa có hồ sơ vẫn có dòng nếu ngày ký trong khoảng lọc (bỏ trống = tất cả). */
  function xhLots(used, opt) {
    opt = opt || {};
    const K = HAK.Catalog, lots = new Map(), unlinked = [];
    const blank = (c, type, ship) => ({ key: '', c, type, ship, recs: [], trips: 0, kg: 0, retTrips: 0, retKg: 0, delKg: 0, fromTs: null, toTs: null, from: '', to: '', bklsFirst: '', bklsLast: '' });
    used.filter((r) => XH_TYPES.indexOf(r.type) >= 0).forEach((r) => {
      const c = contractFor(r);
      const key = c ? c.id : 'ship:' + r.type + ':' + (shipKey(r.ship) || r.id);
      if (!c) unlinked.push(r);
      let L = lots.get(key);
      if (!L) { L = blank(c, c ? c.type : r.type, c ? c.ship : (r.ship || '')); L.key = key; lots.set(key, L); }
      L.recs.push(r); L.trips += r.trips; L.kg += r.kg; L.retTrips += r.retTrips || 0; L.retKg += r.retKg || 0;
      if (r.fromTs !== null && (L.fromTs === null || r.fromTs < L.fromTs)) { L.fromTs = r.fromTs; L.from = r.from; }
      if (r.toTs !== null && (L.toTs === null || r.toTs > L.toTs)) { L.toTs = r.toTs; L.to = r.to || r.from; }
    });
    if (K) {
      const f = isoToTs(opt.from), t = isoToTs(opt.to);
      K.contracts().filter((c) => XH_TYPES.indexOf(c.type) >= 0 && !lots.has(c.id) && (!opt.scope || !K.relatedTo || K.relatedTo(c, opt.scope))).forEach((c) => {
        const ts = isoToTs(c.date);
        if ((f !== null || t !== null) && (ts === null || (f !== null && ts < f) || (t !== null && ts > t))) return;
        const L = blank(c, c.type, c.ship); L.key = c.id; lots.set(c.id, L);
      });
    }
    const out = Array.from(lots.values());
    out.forEach((L) => { L.delKg = L.kg - L.retKg; L.sortTs = (L.c && isoToTs(L.c.date)) || L.fromTs || 0; });
    out.sort((a, b) => a.sortTs - b.sortTs || (a.ship || '').localeCompare(b.ship || ''));
    return { lots: out, unlinked };
  }
  /** Đọc lại dòng phiếu cân của mọi hồ sơ thuộc các lô → [{ lot, rec, row, isRet, bkls }] (ghi bklsFirst/bklsLast vào lô). */
  async function xhTrips(lots, onStep) {
    const out = [], total = lots.reduce((a, L) => a + L.recs.length, 0);
    let n = 0;
    for (const L of lots) {
      for (const r of L.recs.slice().sort((a, b) => (a.fromTs || 0) - (b.fromTs || 0))) {
        if (onStep) onStep(++n, total);
        const d = await HAK.Archive.load(r.id), p = d.params || {};
        const rows = G().filterRows(d.rows || [], p.filter);
        const ret = new Set(HAS_RET[r.type] ? (p.returned || []) : []);
        const so = (r.modes || []).indexOf('bkls') >= 0 && HAK.Bkls && HAK.Bkls.tripNo ? String(p.bklsSoBkls || '').trim() : '';
        let iM = 0, iT = 0;
        rows.forEach((row) => {
          const isRet = ret.has(G().retKey(row));
          const no = so ? (isRet ? HAK.Bkls.tripNo(so + '-TV', iT++) : HAK.Bkls.tripNo(so, iM++)) : '';
          if (no && !isRet) { if (!L.bklsFirst) L.bklsFirst = no; L.bklsLast = no; }
          out.push({ lot: L, rec: r, row, isRet, bkls: no });
        });
      }
    }
    return out;
  }
  /** Sheet dạng bảng dữ liệu: tiêu đề ở DÒNG 1 như file gốc (dán / đồng bộ Google Sheet được), cố định dòng 1, có lọc. */
  function buildTable(wb, name, cols, rows) {
    const ws = wb.addWorksheet(name);
    ws.columns = cols.map((c) => ({ header: c.h, width: c.w, style: c.n ? { numFmt: c.n } : {} }));
    const hr = ws.getRow(1);
    hr.font = { name: XF, size: 10, bold: true, color: { argb: 'FFFFFFFF' } }; hr.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }; hr.height = 30;
    cols.forEach((c, i) => { hr.getCell(i + 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: c.x ? 'FF7F7F7F' : 'FF1F4E78' } }; });
    ws.addRows(rows);
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
    return ws;
  }
  /** Mã lô dùng làm khóa ghi đè khi đồng bộ Google Sheet: SỐ TKHQ; không có TKHQ → mã hợp đồng / mã nhóm hồ sơ của app. */
  const lotKey = (L) => (L.c && L.c.tkhq ? String(L.c.tkhq) : L.c ? 'HD:' + L.c.id : 'LO:' + L.key);
  /**
   * Dữ liệu 2 sheet (+ sheet "Chưa gắn HĐ" nếu có) — DÙNG CHUNG cho Excel (toExcelXuatHang) và Google Sheet (HAK.GSync).
   * @returns {{name, cols:[{h,w,n?,x?}], rows:any[][], keyCol?}[]}  Ngày là đối tượng Date (00:00 UTC).
   */
  function xhSheetRows(lots, trips, unlinked) {
    const K = HAK.Catalog, C = HAK.Config, out = [];
    const D = (iso) => { const ts = isoToTs(iso); return ts === null ? null : new Date(ts); };
    const Ddmy = (s) => { const ts = dmyToTs(s); return ts === null ? null : new Date(ts); };
    const tk = (s) => (/^\d{1,15}$/.test(s || '') ? +s : (s || null));
    const nz = (v) => (v === null || v === undefined || v === '' ? null : v);
    const cust = (id) => (K && id ? K.customer(id) : null) || {};
    const whName = (id) => { const w = id ? (C.data.warehouses || []).find((x) => x.id === id) : null; return w ? w.name : ''; };
    const tl = (t) => (K && K.TYPES[t] ? K.TYPES[t].label : t);
    const DF = 'dd/mm/yyyy', T2 = '#,##0.00', KG = '#,##0';
    // ---- NL_DH_XB ----
    out.push({ name: 'NL_DH_XB', keyCol: 'Mã lô (app)', cols: [
      { h: 'STT', w: 6 }, { h: 'Ngày đơn hàng', w: 12, n: DF }, { h: 'SỐ TKHQ', w: 15, n: '0' }, { h: 'TÀU', w: 32 }, { h: 'KHÁCH HÀNG', w: 34 }, { h: 'ĐC KHACH HÀNG', w: 40 },
      { h: 'TÊN HH_BKLS', w: 30 }, { h: 'ĐƠN GIÁ (USD)', w: 12, n: T2 }, { h: 'KL_MT', w: 12, n: T2 }, { h: 'KL_BDMT', w: 12, n: T2 }, { h: 'ĐỘ KHÔ', w: 9, n: '0.0000' },
      { h: 'ĐỘ KHÔ NHÀ MÁY', w: 10, n: '0.000' }, { h: 'NL_Từ ngày', w: 12, n: DF }, { h: 'NL_Đến ngày', w: 12, n: DF }, { h: 'Lọc Xe', w: 7 }, { h: 'Kho xuất', w: 24 },
      { h: 'Hình thức', w: 12, x: 1 }, { h: 'Số hợp đồng', w: 20, x: 1 }, { h: 'Bên bán / giao', w: 30, x: 1 }, { h: 'ĐƠN GIÁ (VND)', w: 14, n: KG, x: 1 },
      { h: 'Số chứng thư', w: 20, x: 1 }, { h: 'Ngày chứng thư', w: 12, n: DF, x: 1 }, { h: 'Số hồ sơ', w: 8, x: 1 }, { h: 'Cân từ ngày', w: 12, n: DF, x: 1 }, { h: 'Cân đến ngày', w: 12, n: DF, x: 1 },
      { h: 'Số xe qua cân', w: 10, n: KG, x: 1 }, { h: 'KL qua cân (tấn)', w: 14, n: T2, x: 1 }, { h: 'Xe trả về', w: 9, n: KG, x: 1 }, { h: 'KL trả về (tấn)', w: 13, n: T2, x: 1 },
      { h: 'Thực giao (tấn)', w: 14, n: T2, x: 1 }, { h: 'KL_MT − thực giao (tấn)', w: 14, n: T2, x: 1 }, { h: 'Số BKLS từ', w: 22, x: 1 }, { h: 'Số BKLS đến', w: 22, x: 1 }, { h: 'Ghi chú', w: 34, x: 1 }, { h: 'Mã lô (app)', w: 18, x: 1 }
    ], rows: lots.map((L, i) => {
      const c = L.c || {}, b = cust(c.customerId), dry = K && L.c ? K.dryActual(c) : null, hasRec = L.recs.length > 0;
      return [i + 1, D(c.date), tk(c.tkhq), L.ship || null, b.name || null, b.address || null, c.product || null, c.currency === 'VND' ? null : nz(c.priceUsd),
        nz(c.mt), nz(c.bdmt), dry, nz(c.dryFactory), D(c.fromDate), D(c.toDate), c.filterTrips ? 'x' : null, whName(c.whId) || null,
        tl(L.type), c.no || null, cust(c.sellerId).name || null, c.currency === 'VND' ? nz(c.priceUsd) : null, c.certNo || null, D(c.certDate), L.recs.length,
        Ddmy(L.from), Ddmy(L.to), hasRec ? L.trips : null, hasRec ? L.kg / 1000 : null, hasRec ? L.retTrips : null, hasRec ? L.retKg / 1000 : null, hasRec ? L.delKg / 1000 : null,
        hasRec && c.mt ? c.mt - L.delKg / 1000 : null, L.bklsFirst || null, L.bklsLast || null,
        L.c ? (hasRec ? null : 'Chưa có hồ sơ cân trong Lưu trữ') : 'Chưa gắn hợp đồng trong Danh mục (ghép theo tên tàu không được)', lotKey(L)];
    }) });
    // ---- NL_PC_XH ----
    out.push({ name: 'NL_PC_XH', keyCol: 'Mã lô (app)', cols: [
      { h: 'Số phiếu', w: 14 }, { h: 'Ngày giờ cân 1', w: 19 }, { h: 'Ngày giờ cân 2', w: 19 }, { h: 'Biển số 1', w: 12 }, { h: 'Cân lần 1', w: 10, n: KG }, { h: 'Cân lần 2', w: 10, n: KG },
      { h: 'KL Hàng (KG)', w: 11, n: KG }, { h: 'Đơn vị vận chuyển', w: 34 }, { h: 'Tên tài xế', w: 18 }, { h: 'Khối lượng (Tấn)', w: 11, n: T2 }, { h: 'Ngày xuất', w: 11, n: DF },
      { h: 'Số BKLS', w: 22 }, { h: 'Khối lượng (M3)', w: 11, n: T2 }, { h: 'NGƯỜI CÂN', w: 16 }, { h: 'SỐ TKHQ', w: 15, n: '0' }, { h: 'TÀU XUẤT', w: 30 },
      { h: 'Hình thức', w: 12, x: 1 }, { h: 'Xe trả về', w: 8, x: 1 }, { h: 'Số hợp đồng', w: 20, x: 1 }, { h: 'Hồ sơ', w: 30, x: 1 }, { h: 'Mã lô (app)', w: 18, x: 1 }
    ], rows: trips.map((t) => {
      const r = t.row, c = t.lot.c || {}, tn = (r.net || 0) / 1000;
      return [r.ticket || null, r.time1 || null, r.time2 || null, r.plate || null, nz(r.tare), nz(r.gross), nz(r.net), r.carrier || null, r.driver || null, tn, Ddmy(r.dateStr),
        t.bkls || null, tn / XH_M3, r.weigher || null, tk(c.tkhq), t.lot.ship || null, tl(t.lot.type), t.isRet ? 'x' : null, c.no || null, t.rec.title || null, lotKey(t.lot)];
    }) });
    if (unlinked.length) out.push({ name: 'Chưa gắn HĐ', cols: [{ h: 'Hồ sơ', w: 40 }, { h: 'Hình thức', w: 14 }, { h: 'Tàu', w: 30 }, { h: 'Từ ngày', w: 12 }, { h: 'Đến ngày', w: 12 }, { h: 'Số xe', w: 8, n: KG }, { h: 'Tấn', w: 12, n: T2 }],
      rows: unlinked.map((r) => [r.title, tl(r.type), r.ship || null, r.from, r.to, r.trips, r.kg / 1000]) });
    return out;
  }
  async function toExcelXuatHang(lots, trips, unlinked, rangeText) {
    if (!root.ExcelJS && HAK.UI && HAK.UI.needLib) await HAK.UI.needLib('exceljs');
    const wb = newWorkbook();
    xhSheetRows(lots, trips, unlinked).forEach((sh) => buildTable(wb, sh.name, sh.cols, sh.rows));
    wb.title = 'Báo cáo Xuất hàng — ' + (rangeText || 'toàn bộ thời gian');
    return wb;
  }

  /* ---------------------------------------------------------------
   * Theo đơn vị vận chuyển (theo tàu, chi tiết theo ngày)
   * Không lưu sẵn: đọc lại các dòng phiếu cân của hồ sơ từ 🗄️ Lưu trữ khi cần (HAK.Archive.load),
   * gộp theo ngày + đơn vị vận chuyển (cột "carrier" đọc từ Excel: ĐVVC/nhà xe/chủ xe).
   * ------------------------------------------------------------- */
  const BATCH_TYPES = [['guikho', '📄', 'Đợt Trung chuyển gửi kho'], ['dieuchuyen', '🔄', 'Đợt Điều chuyển nội bộ'], ['traodoi', '🤝', 'Đợt Trao đổi hàng hóa'], ['xuatban', '💰', 'Đợt Xuất bán']];
  const carrierCache = new Map(); // "ship:<tên tàu>" | "rec:<id hồ sơ>" → Promise<[{date, carrier, kg, ret}]>
  /** Gộp rows đã tải của 1 tàu → theo ngày+ĐVVC và tổng theo ĐVVC. Hàm thuần, test được. */
  function aggCarrierDaily(rows) {
    const byKey = new Map();
    rows.forEach((r) => {
      const k = r.date + '|' + r.carrier;
      let a = byKey.get(k);
      if (!a) { a = { date: r.date, carrier: r.carrier, trips: 0, kg: 0, retTrips: 0, retKg: 0 }; byKey.set(k, a); }
      a.trips++; a.kg += r.kg;
      if (r.ret) { a.retTrips++; a.retKg += r.kg; }
    });
    const ts = (d) => { const t = dmyToTs(d); return t === null ? Infinity : t; };
    const byDate = Array.from(byKey.values()).sort((a, b) => (ts(a.date) - ts(b.date)) || a.carrier.localeCompare(b.carrier, 'vi'));
    const byCarrierMap = new Map();
    byDate.forEach((a) => {
      let c = byCarrierMap.get(a.carrier);
      if (!c) { c = { carrier: a.carrier, trips: 0, kg: 0, retTrips: 0, retKg: 0 }; byCarrierMap.set(a.carrier, c); }
      c.trips += a.trips; c.kg += a.kg; c.retTrips += a.retTrips; c.retKg += a.retKg;
    });
    return { byDate, byCarrier: Array.from(byCarrierMap.values()).sort((a, b) => b.kg - a.kg) };
  }

  /* ---------------------------------------------------------------
   * Giao diện
   * ------------------------------------------------------------- */
  let metas = [], model = null;
  const $ = (s) => document.querySelector(s);
  const esc = (s) => HAK.UI.esc(s);
  const ton = (kg) => G().fmtTon(kg);
  /** Nhãn 1 hồ sơ "đợt" (Trung chuyển / Điều chuyển / Trao đổi / Xuất bán — không có tàu, mỗi hồ sơ là 1 đợt riêng). */
  const recLabel = (r) => r.from + (r.to && r.to !== r.from ? ' → ' + r.to : '') + ' · ' + (r.giao || '?') + (r.nhan ? ' → ' + r.nhan : '') + ' (' + typeName(r.type).replace(/^\S+\s/, '') + ')';
  /** Danh sách nhóm để chọn: tàu (gộp theo tên) + từng đợt của 4 loại còn lại. Dùng chung cho dropdown và xuất Excel. */
  function carrierGroups() {
    const out = [];
    Array.from(new Set(model.ships.map((r) => r.ship || r.title))).forEach((name) => out.push({ key: 'ship:' + name, label: name, group: '🚢 Theo tàu (Xuất khẩu / Ủy thác / Xuất hàng kho gửi)' }));
    BATCH_TYPES.forEach(([k, ic, gname]) => {
      model.used.filter((r) => r.type === k).sort((a, b) => (a.fromTs || 0) - (b.fromTs || 0)).forEach((r) => out.push({ key: 'rec:' + r.id, label: recLabel(r), group: ic + ' ' + gname }));
    });
    return out;
  }
  /** Khóa 1 lượt cân (như khử trùng khi gộp đợt ở main.js mergeSlot). */
  const tripKey = (r) => (r.ticket || '') + '|' + r.plate + '|' + (r.ts1 !== null && r.ts1 !== undefined ? r.ts1 : r.time1) + (r.ticket ? '' : '|' + r.net);
  /** Tải (có cache) toàn bộ dòng phiếu cân của 1 nhóm ("ship:<tên tàu>" gộp mọi hồ sơ cùng tên, hoặc "rec:<id>" đúng 1 đợt). */
  function loadGroupRows(key) {
    if (carrierCache.has(key)) return carrierCache.get(key);
    const recs = key.indexOf('ship:') === 0 ? model.ships.filter((r) => (r.ship || r.title) === key.slice(5))
      : model.used.filter((r) => r.id === key.slice(4));
    const p = (async () => {
      const out = [], seen = new Set();
      // v2.6.7: cùng một xe có thể nằm ở hồ sơ Xuất hàng kho gửi VÀ hồ sơ Xuất khẩu / Ủy thác chuyển từ nó → hồ sơ đích tính trước, kho gửi bỏ phiếu trùng
      const ordered = recs.slice().sort((a, b) => (a.type === 'xuatkhogui') - (b.type === 'xuatkhogui'));
      for (const r of ordered) {
        const d = await HAK.Archive.load(r.id);
        const ret = new Set((d.params && d.params.returned) || []);
        (d.rows || []).forEach((row) => {
          const k = tripKey(row); if (seen.has(k)) return; seen.add(k);
          out.push({
            date: row.dateStr || '(không rõ ngày)',
            carrier: (row.carrier || '').trim() || '(Không xác định)',
            kg: row.net || 0,
            ret: ret.has(HAK.Generator.retKey(row)),
            k, t: r.type
          });
        });
      }
      return out;
    })();
    carrierCache.set(key, p);
    return p;
  }
  async function drawCarrier(key, label) {
    const box = $('#repCarrierBody'); if (!box) return;
    if (!key) { box.innerHTML = '<div class="muted small">Chọn tàu hoặc đợt ở trên để xem chi tiết theo đơn vị vận chuyển.</div>'; return; }
    box.innerHTML = '<div class="muted small">⏳ Đang tải dữ liệu…</div>';
    let rows;
    try { rows = await loadGroupRows(key); }
    catch (e) { box.innerHTML = '<div class="text-danger small">' + esc(e.message || String(e)) + '</div>'; return; }
    if ($('#repCarrierShip').value !== key) return; // người dùng đã đổi lựa chọn khi đang tải
    const { byDate, byCarrier } = aggCarrierDaily(rows);
    if (!byDate.length) { box.innerHTML = '<div class="muted small">Chưa có dòng phiếu cân nào.</div>'; return; }
    const hasRet = byCarrier.some((c) => c.retTrips);
    const retTh = hasRet ? '<th class="num">Trong đó trả về</th>' : '';
    const retTd = (a) => hasRet ? '<td class="num">' + (a.retTrips ? a.retTrips + ' xe · ' + ton(a.retKg) : '—') + '</td>' : '';
    box.innerHTML =
      '<div class="tbl-wrap mb-3"><table class="table table-sm"><thead><tr><th>Ngày</th><th>Đơn vị vận chuyển</th><th class="num">Số xe</th><th class="num">Tấn</th>' + retTh + '</tr></thead><tbody>' +
      byDate.map((a) => '<tr><td class="text-nowrap">' + esc(a.date) + '</td><td>' + esc(a.carrier) + '</td><td class="num">' + a.trips.toLocaleString('vi-VN') + '</td><td class="num">' + ton(a.kg) + '</td>' + retTd(a) + '</tr>').join('') +
      '</tbody></table></div>' +
      '<div class="small fw-semibold mb-2">Tổng theo đơn vị vận chuyển — ' + esc(label || '') + '</div>' +
      '<div class="tbl-wrap"><table class="table table-sm"><thead><tr><th>Đơn vị vận chuyển</th><th class="num">Số xe</th><th class="num">Tấn</th>' + retTh + '</tr></thead><tbody>' +
      byCarrier.map((c) => '<tr><td>' + esc(c.carrier) + '</td><td class="num">' + c.trips.toLocaleString('vi-VN') + '</td><td class="num fw-semibold">' + ton(c.kg) + '</td>' + retTd(c) + '</tr>').join('') +
      '</tbody></table></div>';
  }
  function drawCarrierSelect() {
    const sel = $('#repCarrierShip'); if (!sel) return;
    const prev = sel.value;
    const groups = carrierGroups();
    const byGroup = new Map();
    groups.forEach((g) => { if (!byGroup.has(g.group)) byGroup.set(g.group, []); byGroup.get(g.group).push(g); });
    sel.innerHTML = '<option value="">— Chọn tàu hoặc đợt —</option>' + Array.from(byGroup.entries()).map(([gname, items]) =>
      '<optgroup label="' + esc(gname) + '">' + items.map((g) => '<option value="' + esc(g.key) + '">' + esc(g.label) + '</option>').join('') + '</optgroup>').join('');
    sel.disabled = !groups.length;
    const hit = groups.find((g) => g.key === prev);
    sel.value = hit ? prev : '';
    drawCarrier(hit ? prev : '', hit ? hit.label : '');
  }
  const manualGet = () => HAK.Store.get(OFF_KEY, {}) || {};
  const opts = () => ({ from: $('#repFrom').value, to: $('#repTo').value, manual: manualGet(), scope: HAK.Auth && HAK.Auth.scopeIds ? HAK.Auth.scopeIds('report') : null });

  function rangeText() {
    const a = $('#repFrom').value, b = $('#repTo').value, v = (s) => s.split('-').reverse().join('/');
    return a || b ? 'từ ' + (a ? v(a) : '…') + ' đến ' + (b ? v(b) : '…') : 'toàn bộ thời gian';
  }

  function draw() {
    // v2.6.2: mặc định chỉ hồ sơ của công ty làm việc (công tắc "Xem tất cả công ty") — áp cho mọi bảng / Excel / Google Sheet của trang
    const scope = HAK.Auth && HAK.Auth.scopeIds ? HAK.Auth.scopeIds('report') : null;
    model = compute(scope ? metas.filter((m) => scope.indexOf(HAK.Auth.companyOfMeta(m)) >= 0) : metas, opts()); model.rangeText = rangeText();
    const empty = !metas.length;
    $('#repEmpty').classList.toggle('d-none', !empty); $('#repMain').classList.toggle('d-none', empty);
    if (empty) return;
    // --- thẻ tổng ---
    $('#repCards').innerHTML = TYPES.map(([k, ic, nm]) => {
      const b = model.byType[k];
      return '<div class="col-6 col-lg"><div class="card h-100"><div class="card-body py-3"><div class="small muted">' + ic + ' ' + esc(nm) + '</div>' +
        '<div class="sum-big" style="font-size:1.5rem">' + ton(b.delKg) + ' <span class="small muted">tấn</span></div>' +
        '<div class="small muted">' + b.n + ' hồ sơ · ' + b.trips.toLocaleString('vi-VN') + ' xe' + (HAS_RET[k] && b.retTrips ? ' · trả về ' + b.retTrips + ' xe' : '') + '</div></div></div></div>';
    }).join('');
    // --- bảng theo loại ---
    $('#repByType').innerHTML = TYPES.map(([k, ic, nm]) => { const b = model.byType[k];
      return '<tr><td>' + ic + ' ' + esc(nm) + '</td><td class="num">' + b.n + '</td><td class="num">' + b.trips.toLocaleString('vi-VN') + '</td><td class="num">' + ton(b.kg) + '</td><td class="num">' + (HAS_RET[k] ? (b.retTrips ? b.retTrips + ' xe · ' + ton(b.retKg) : '—') : '—') + '</td><td class="num fw-semibold">' + ton(b.delKg) + '</td></tr>'; }).join('');
    // --- theo tháng ---
    $('#repMonthHead').innerHTML = '<tr><th>Tháng</th>' + TYPES.map(([k, ic, nm]) => '<th class="num">' + esc(nm) + '</th>').join('') + '</tr>';
    const tot = {};
    $('#repMonthBody').innerHTML = model.months.map(([mo, v]) => '<tr><td class="fw-semibold">' + mo.split('-').reverse().join('/') + '</td>' + TYPES.map(([k]) => { tot[k] = (tot[k] || 0) + (v[k] || 0); return '<td class="num">' + (v[k] ? ton(v[k]) : '—') + '</td>'; }).join('') + '</tr>').join('') +
      (model.months.length ? '<tr class="fw-bold"><td>Tổng</td>' + TYPES.map(([k]) => '<td class="num">' + ton(tot[k] || 0) + '</td>').join('') + '</tr>' : '<tr><td colspan="6" class="muted text-center">Không có số liệu trong khoảng đã chọn.</td></tr>');
    // --- theo tàu ---
    $('#repShips').innerHTML = model.ships.length ? model.ships.map((r) => '<tr><td class="fw-semibold">' + esc(r.ship || r.title) + '</td><td>' + esc(typeName(r.type)) + '</td><td class="text-nowrap">' + esc(r.from) + (r.to && r.to !== r.from ? ' → ' + esc(r.to) : '') + '</td><td>' + esc(r.giao) + (r.nhan ? ' → ' + esc(r.nhan) : '') + '</td><td class="num">' + r.trips.toLocaleString('vi-VN') + '</td><td class="num">' + ton(r.kg) + '</td><td class="num">' + (r.retTrips ? r.retTrips + ' xe · ' + ton(r.retKg) : '—') + '</td><td class="num fw-semibold">' + ton(r.delKg) + '</td></tr>').join('')
      : '<tr><td colspan="8" class="muted text-center">Chưa có hồ sơ Ủy thác / Xuất hàng kho gửi trong khoảng đã chọn.</td></tr>';
    // --- danh sách hồ sơ (tick chọn) ---
    const visible = model.recs.filter((r) => r.inRange);
    $('#repRecCount').textContent = model.used.length + ' / ' + visible.length + ' hồ sơ đang được tính';
    $('#repRecBody').innerHTML = visible.map((r) => '<tr' + (r.include ? '' : ' class="opacity-50"') + '><td><input class="form-check-input" type="checkbox" data-id="' + r.id + '"' + (r.include ? ' checked' : '') + '></td>' +
      '<td class="mono">' + esc(r.title) + '</td><td>' + esc(typeName(r.type)) + '</td><td class="text-nowrap">' + esc(r.from) + (r.to && r.to !== r.from ? ' → ' + esc(r.to) : '') + '</td><td class="num">' + r.trips.toLocaleString('vi-VN') + '</td><td class="num">' + ton(r.kg) + '</td>' +
      '<td class="small">' + (r.dup ? '<span class="text-warning">⚠ trùng kỳ với ' + esc(r.dupOf) + '</span>' : '') + '</td></tr>').join('');
    $('#repDupNote').classList.toggle('d-none', !model.recs.some((r) => r.inRange && r.dup));
    carrierCache.clear(); // tập hồ sơ đang tính vừa đổi (lọc ngày / tick chọn) → cache theo tàu cũ không còn đúng
    drawCarrierSelect();
    drawXuatHang();
    if (HAK.GSync) HAK.GSync.renderStatus();
  }

  /** Thẻ 📑 Xuất hàng theo hợp đồng: chỉ dùng số liệu tóm tắt của hồ sơ (không đọc lại phiếu cân) → vẽ nhanh. */
  function drawXuatHang() {
    const body = $('#repXHBody'); if (!body) return;
    const { lots, unlinked } = xhLots(model.used, opts());
    const K = HAK.Catalog, tl = (t) => (K && K.TYPES[t] ? K.TYPES[t].label : t), cu = (id) => (K && id && K.customer(id) ? K.customer(id).name : '');
    body.innerHTML = lots.length ? lots.map((L) => {
      const c = L.c || {}, has = L.recs.length > 0, diff = has && c.mt ? c.mt - L.delKg / 1000 : null;
      return '<tr' + (has ? '' : ' class="opacity-50"') + '><td><span class="badge badge-soft">' + esc(tl(L.type)) + '</span></td><td class="fw-semibold">' + esc(L.ship || '—') + '</td>' +
        '<td class="mono small">' + esc(c.tkhq || c.no || (L.c ? '' : '⚠ chưa gắn HĐ')) + '</td><td class="small">' + esc(cu(c.customerId)) + '</td>' +
        '<td class="num">' + L.recs.length + '</td><td class="num">' + (has ? L.trips.toLocaleString('vi-VN') : '—') + '</td><td class="num fw-semibold">' + (has ? ton(L.delKg) : '—') + '</td>' +
        '<td class="num">' + (c.mt ? G().fmtDec(c.mt, 2) : '—') + '</td><td class="num">' + (diff !== null ? G().fmtDec(diff, 2) : '—') + '</td></tr>';
    }).join('') : '<tr><td colspan="9" class="muted text-center">Chưa có hợp đồng / hồ sơ Xuất khẩu, Ủy thác, Xuất bán, Trao đổi trong khoảng đã chọn.</td></tr>';
    const w = $('#repXHWarn');
    w.innerHTML = unlinked.length ? '⚠ ' + unlinked.length + ' hồ sơ chưa gắn được hợp đồng (lúc lập không chọn hợp đồng và tên tàu không khớp đúng 1 hợp đồng cùng hình thức): ' +
      unlinked.slice(0, 5).map((r) => '<b>' + esc(r.ship || r.title) + '</b>').join(', ') + (unlinked.length > 5 ? '…' : '') +
      '. Vẫn xuất phiếu cân nhưng trống SỐ TKHQ — lập lại biên bản có chọn hợp đồng (hồ sơ tự gắn), hoặc sửa tên tàu trong Danh mục cho khớp.' : '';
    w.classList.toggle('d-none', !unlinked.length);
  }

  async function render() {
    if (!$('#page-report')) return;
    try { metas = await HAK.Archive.ensureStats(await HAK.Archive.list()); } catch (e) { console.error(e); metas = []; }
    draw();
  }

  function init() {
    if (!$('#page-report')) return;
    ['#repFrom', '#repTo'].forEach((s) => $(s).addEventListener('change', draw));
    if ($('#repScopeWrap') && HAK.Auth && HAK.Auth.scopeSwitch) $('#repScopeWrap').innerHTML = HAK.Auth.scopeSwitch('report');
    root.addEventListener('hak:scope', (e) => { if (e.detail && e.detail.key === 'report') draw(); });
    $('#repRecBody').addEventListener('change', (e) => {
      const cb = e.target.closest('input[data-id]'); if (!cb) return;
      const m = manualGet(); m[cb.dataset.id] = cb.checked; HAK.Store.set(OFF_KEY, m); draw();
    });
    $('#repReset').addEventListener('click', () => { HAK.Store.remove(OFF_KEY); $('#repFrom').value = ''; $('#repTo').value = ''; draw(); });
    $('#repCarrierShip').addEventListener('change', (e) => drawCarrier(e.target.value, e.target.selectedOptions[0] ? e.target.selectedOptions[0].textContent : ''));
    $('#repXlsCarrier').addEventListener('click', async () => {
      const { toast, Loading } = HAK.UI;
      try {
        const groups = model ? carrierGroups() : [];
        if (!groups.length) { toast('Không có tàu hoặc đợt nào trong khoảng đã chọn để xuất.', 'warning'); return; }
        Loading.show('Đang tải dữ liệu đơn vị vận chuyển — ' + groups.length + ' mục…');
        const sheetRows = [], all = [];
        for (let i = 0; i < groups.length; i++) { Loading.set(Math.round((i / groups.length) * 100)); all.push(await loadGroupRows(groups[i].key)); }
        // v2.6.7: xe kho gửi đã có ở hồ sơ hình thức khác (vd Xuất bán chuyển từ kho gửi — nằm ở nhóm khác) → không cộng lại ở nhóm tàu kho gửi
        const taken = new Set();
        all.forEach((rows) => rows.forEach((x) => { if (x.t !== 'xuatkhogui') taken.add(x.k); }));
        for (let i = 0; i < groups.length; i++) {
          const g = groups[i];
          const rows = all[i].filter((x) => x.t !== 'xuatkhogui' || !taken.has(x.k));
          aggCarrierDaily(rows).byDate.forEach((a) => sheetRows.push([g.label, a.date, a.carrier, a.trips, a.kg / 1000, a.retTrips, a.retKg / 1000]));
        }
        Loading.hide();
        if (!sheetRows.length) { toast('Không có dữ liệu đơn vị vận chuyển trong khoảng đã chọn.', 'warning'); return; }
        const wb = await toExcelCarrier(sheetRows, model.rangeText);
        const buf = await wb.xlsx.writeBuffer();
        const d = new Date(), p2 = (n) => String(n).padStart(2, '0'), name = 'BaoCaoDVVC_TheoTau_' + d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate()) + '.xlsx';
        HAK.Word.Files.saveBlob(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), name);
        toast('Đã xuất: ' + name, 'success');
      } catch (e) { Loading.hide(); console.error(e); toast(e.message || String(e), 'error'); }
    });
    $('#repXlsXH').addEventListener('click', async () => {
      const { toast, Loading } = HAK.UI;
      try {
        const { lots, unlinked } = model ? xhLots(model.used, opts()) : { lots: [], unlinked: [] };
        if (!lots.length) { toast('Chưa có hợp đồng / hồ sơ Xuất khẩu, Ủy thác, Xuất bán, Trao đổi trong khoảng đã chọn.', 'warning'); return; }
        Loading.show('Đang đọc phiếu cân từ Lưu trữ…');
        const trips = await xhTrips(lots, (i, n) => Loading.set(Math.round(i / n * 90), 'Đang đọc hồ sơ ' + i + ' / ' + n + '…'));
        Loading.set(95, 'Đang ghi file Excel (' + trips.length.toLocaleString('vi-VN') + ' phiếu)…');
        const wb = await toExcelXuatHang(lots, trips, unlinked, model.rangeText), buf = await wb.xlsx.writeBuffer();
        const d = new Date(), p2 = (n) => String(n).padStart(2, '0'), name = 'XuatHang_' + d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate()) + '.xlsx';
        HAK.Word.Files.saveBlob(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), name);
        Loading.hide();
        toast('Đã xuất: ' + name + ' — ' + lots.length + ' hợp đồng, ' + trips.length.toLocaleString('vi-VN') + ' phiếu cân' + (unlinked.length ? ' (có ' + unlinked.length + ' hồ sơ chưa gắn hợp đồng)' : '') + '.', unlinked.length ? 'warning' : 'success');
      } catch (e) { Loading.hide(); console.error(e); toast(e.message || String(e), 'error'); }
    });
    $('#repGsXH').addEventListener('click', (e) => {
      const { toast, Loading } = HAK.UI;
      if (!HAK.GSync) return;
      // Chỉ lô CÓ hồ sơ cân: lô chỉ có trong Danh mục không gửi → phiếu cũ nhập tay trên Sheet không bị xóa.
      // v2.6.7 (Thủy chốt 28/09/2026): Trao đổi hàng hóa KHÔNG đồng bộ lên Google Sheet (vẫn có trong báo cáo + Excel Xuất hàng).
      const lots = model ? xhLots(model.used, opts()).lots.filter((L) => L.recs.length && L.type !== 'traodoi') : [];
      if (!lots.length) { toast('Không có lô nào có hồ sơ cân trong khoảng đã chọn để đồng bộ.', 'warning'); return; }
      // v2.6.3: mỗi lô về Sheet của công ty BÊN XUẤT (công ty của hồ sơ đầu tiên của lô)
      const coOfLot = (L) => (HAK.Auth && HAK.Auth.companyOfMeta ? HAK.Auth.companyOfMeta(L.recs[0]) : '') || (HAK.Auth && HAK.Auth.company ? HAK.Auth.company() : '');
      const byKey = new Map(lots.map((L) => [lotKey(L), coOfLot(L)]));
      const cos = Array.from(new Set(byKey.values())), ready = cos.filter((c) => HAK.GSync.configured(c));
      const nm = (cid) => { const c = (HAK.Config.data.companies || []).find((x) => x.id === cid); return c ? (c.short || c.name) : (cid || '?'); };
      if (!ready.length) { toast('Chưa cài Google Sheet cho ' + cos.map(nm).join(', ') + ' — vào Cài đặt → Chung → ☁ Đồng bộ Google Sheet.', 'warning'); return; }
      HAK.UI.confirmClick(e.currentTarget, async () => {
        try {
          Loading.show('Đang đọc phiếu cân từ Lưu trữ…');
          const trips = await xhTrips(lots, (i, n) => Loading.set(Math.round(i / n * 40), 'Đang đọc hồ sơ ' + i + ' / ' + n + '…'));
          const r = await HAK.GSync.push(xhSheetRows(lots, trips, []), (i, n, k, name) => Loading.set(40 + Math.round((i - 1) / n * 60), 'Đang ghi Google Sheet ' + name + ' — lần ' + i + ' / ' + n + ' (' + k + ' lô)…'), (key) => byKey.get(key));
          Loading.hide();
          const parts = r.per.map((p) => p.skipped ? p.name + ': chưa cài Sheet — bỏ qua ' + p.lots + ' lô' : p.error ? p.name + ': LỖI — ' + p.error : p.name + ': ' + p.lots + ' lô, ' + p.added.toLocaleString('vi-VN') + ' phiếu (thay ' + p.removed.toLocaleString('vi-VN') + ' phiếu cũ)');
          const bad = r.per.some((p) => p.skipped || p.error);
          toast((bad ? 'Đồng bộ Google Sheet xong một phần. ' : 'Đã đồng bộ Google Sheet. ') + parts.join(' · ') + '.', r.per.some((p) => p.error) ? 'error' : bad ? 'warning' : 'success');
        } catch (err) { Loading.hide(); console.error(err); toast('Đồng bộ Google Sheet chưa xong: ' + (err.message || err) + ' — các lô đã gửi trước đó vẫn được ghi; bấm lại để gửi tiếp.', 'error'); }
      }, 'Bấm lần nữa: ghi đè ' + lots.length + ' lô' + (cos.length > 1 ? ' → ' + cos.length + ' Sheet' : ''));
    });
    $('#repXls').addEventListener('click', async () => {
      const { toast } = HAK.UI;
      try {
        if (!model || !model.used.length) { toast('Chưa có số liệu để xuất.', 'warning'); return; }
        const wb = await toExcel(model), buf = await wb.xlsx.writeBuffer();
        const d = new Date(), p2 = (n) => String(n).padStart(2, '0'), name = 'BaoCaoTongHop_' + d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate()) + '.xlsx';
        HAK.Word.Files.saveBlob(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), name);
        toast('Đã xuất: ' + name, 'success');
      } catch (e) { console.error(e); toast(e.message || String(e), 'error'); }
    });
  }

  HAK.Report = { compute, toExcel, toExcelCarrier, aggCarrierDaily, render, init, TYPES, xhLots, xhTrips, xhSheetRows, toExcelXuatHang };
  if (typeof module !== 'undefined' && module.exports) module.exports = HAK.Report;
})(typeof window !== 'undefined' ? window : globalThis);
