/**
 * generator.js — Nghiệp vụ Logistics/Xuất khẩu: lọc dữ liệu cân, tự tính tổng, dựng "context"
 * (bộ biến placeholder) cho từng loại biên bản. KHÔNG chạm DOM và KHÔNG ghi file
 * (việc ghi Word do word.js đảm nhiệm) → có thể kiểm thử độc lập trong Node.
 *
 * Bốn loại biên bản:
 *   guikho     → Biên bản xác nhận hàng gửi kho (+ phụ lục bảng kê xe)
 *   uythac     → Biên bản giao nhận hàng hóa ủy thác xuất khẩu (theo từng tàu) + phụ lục phiếu cân
 *   dieuchuyen → Quyết định điều chuyển + Biên bản giao nhận điều chuyển nội bộ
 *   traodoi    → Bảng chi tiết cân hàng lô hàng trao đổi
 */
(function (root) {
  'use strict';
  const HAK = (root.HAK = root.HAK || {});
  const U = () => HAK.Excel.util;

  /* ===============================================================
   * 1. Định dạng số theo kiểu Việt Nam (1.234,56)
   * ============================================================= */
  const thousands = (s) => s.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const fmtInt = (n) => (n === null || n === undefined || isNaN(n)) ? '' : (n < 0 ? '-' : '') + thousands(String(Math.round(Math.abs(n))));
  /** n với d chữ số thập phân, làm tròn "half up" trên số nguyên để tránh sai số dấu phẩy động. */
  function fmtDec(n, d) {
    if (n === null || n === undefined || isNaN(n)) return '';
    const f = Math.pow(10, d), neg = n < 0;
    const v = Math.round(Math.abs(n) * f + 1e-9);
    const ip = Math.floor(v / f), fp = String(v % f).padStart(d, '0');
    return (neg ? '-' : '') + thousands(String(ip)) + (d ? ',' + fp : '');
  }
  /** kg → tấn, 2 số lẻ (20.755.430 kg → "20.755,43"). Làm tròn trên số nguyên kg. */
  const fmtTon = (kg) => fmtDec(kg / 1000, 2);
  const fmtTonRound = (kg) => fmtInt(Math.round(kg / 1000));
  const pad2 = (n) => String(n).padStart(2, '0');

  /** "2026-08-16" (input type=date) → "16/08/2026"; giữ nguyên nếu đã là dd/mm/yyyy. */
  function isoToVN(s) {
    if (!s) return '';
    const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? m[3] + '/' + m[2] + '/' + m[1] : String(s);
  }
  /** Bỏ dấu + ký tự lạ để làm tên file: "HJ TIANHE V.2610" → "HJTIANHE_V2610". */
  function slug(s) {
    const t = String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
    const m = t.match(/^(.*?)\s+(V\.?\s?\d.*)$/i);          // tách phần chuyến (V.2610) nếu có
    const a = (m ? m[1] : t).replace(/[^A-Za-z0-9]+/g, '');
    const b = m ? m[2].replace(/[^A-Za-z0-9]+/g, '') : '';
    return (a + (b ? '_' + b : '')) || 'Tau';
  }

  /* ===============================================================
   * 2. Lọc & thống kê
   * ============================================================= */
  /**
   * filter = { groups: Set|Array|null  (nhãn cột ghi chú; '' = dòng không nhãn; null = tất cả),
   *            from: 'yyyy-mm-dd'|'dd/mm/yyyy'|'' , to: ..., }
   */
  function toTs(s, endOfDay) {
    if (!s) return null;
    const p = U().parseDT(/^\d{4}-\d{2}-\d{2}$/.test(s) ? s : s);
    if (!p || !p.hasDate) return null;
    return Date.UTC(p.y, p.m - 1, p.d, endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0);
  }
  function filterRows(rows, filter) {
    filter = filter || {};
    const groups = filter.groups ? new Set(filter.groups) : null;
    const from = toTs(filter.from, false), to = toTs(filter.to, true);
    // v2.6.7: phạm vi "chuyển từ Xuất hàng kho gửi" — chỉ các đợt (tên file) đã chuyển + loại xe trả về (hình thức đích không có "xe trả về")
    const files = filter.files && filter.files.length ? new Set(filter.files) : null;
    const excl = filter.exclude && filter.exclude.length ? new Set(filter.exclude) : null;
    const fileOf = (r) => { const u = r.uid === undefined ? '' : String(r.uid), i = u.lastIndexOf('#'); return i < 0 ? '' : u.slice(0, i); };
    return rows.filter((r) => {
      if (files && r.uid !== undefined && !files.has(fileOf(r))) return false;
      if (excl && excl.has(r.uid !== undefined ? r.uid : r.idx)) return false;
      if (groups && !groups.has(r.note || '')) return false;
      if (from !== null && (r.ts1 === null || r.ts1 < from)) return false;
      if (to !== null && (r.ts1 === null || r.ts1 > to)) return false;
      return true;
    });
  }
  function summarize(rows) {
    const st = HAK.Excel.computeStats(rows);
    return {
      trips: st.trips, kg: st.kg, tons: fmtTon(st.kg), vehicles: st.plates,
      from: st.from, to: st.to, minTs: st.minTs, maxTs: st.maxTs, byPlate: st.byPlate
    };
  }

  /* ===============================================================
   * 3. Dựng các khối dùng chung
   * ============================================================= */
  const cfg = () => HAK.Config.data;
  const blank = () => cfg().general.blank || '………';
  const orBlank = (v) => (v === null || v === undefined || String(v).trim() === '') ? blank() : String(v);

  /** Thông tin 1 bên (công ty) → các biến {prefix}_name, _tax, ... */
  function party(c, prefix, role) {
    const rep = c.rep ? ((c.salutation ? c.salutation + ' ' : '') + c.rep) : '';
    const o = {};
    o[prefix + '_name'] = orBlank(c.name);
    o[prefix + '_name_upper'] = orBlank(c.name).toUpperCase();
    o[prefix + '_tax'] = orBlank(c.tax);
    o[prefix + '_address'] = orBlank(c.address);
    o[prefix + '_rep'] = orBlank(rep);
    o[prefix + '_repName'] = orBlank(c.rep);
    o[prefix + '_position'] = orBlank(c.position);
    o[prefix + '_short'] = orBlank(c.short || c.name);
    o[prefix + '_email'] = c.email || '';
    o[prefix + '_phone'] = c.phone || '';
    o[prefix + '_factory'] = orBlank(c.factory);
    o[prefix + '_kind'] = c.kind || 'Công ty';
    o[prefix + '_role'] = role || '';
    return o;
  }
  /** Thông tin kho → kho_giao / kho_nhan */
  function wh(w, prefix) {
    const o = {};
    o[prefix] = orBlank(w.name);
    o[prefix + '_short'] = orBlank(w.short || w.name);
    o[prefix + '_addr'] = w.address || '';
    o[prefix + '_full'] = w.address ? w.name + ' (' + w.address + ')' : orBlank(w.name);
    return o;
  }

  /** Ngày lập văn bản: dd/mm/yyyy | yyyy-mm-dd | rỗng → hôm nay. */
  function docDateParts(s) {
    let p = s ? U().parseDT(s) : null;
    if (!p || !p.hasDate) { const n = new Date(); p = { y: n.getFullYear(), m: n.getMonth() + 1, d: n.getDate() }; }
    return { date: pad2(p.d), month: pad2(p.m), year: String(p.y) };
  }
  /** Kỳ dữ liệu (tháng/năm) — lấy theo ngày cân sớm nhất, cho phép ghi đè "MM/YYYY". */
  function period(sum, override) {
    const m = override && String(override).match(/^(\d{1,2})\s*\/\s*(\d{4})$/);
    if (m) return { periodMonth: pad2(+m[1]), periodYear: m[2] };
    if (sum.minTs !== null) { const t = U().tsToParts(sum.minTs); return { periodMonth: pad2(t.m), periodYear: String(t.y) }; }
    const n = new Date(); return { periodMonth: pad2(n.getMonth() + 1), periodYear: String(n.getFullYear()) };
  }
  const monthCode = (per) => per.periodMonth + per.periodYear; // "032025"

  /** Dòng chi tiết phiếu cân cho bảng phụ lục. */
  function detailRows(rows, o) {
    o = o || {};
    const g = cfg().general;
    return rows.map((r, i) => {
      const n = i + 1;
      return {
        stt: String(n),
        ticket: o.renumber ? n + '/' + o.renumber + '/TĐ' : (r.ticket || ''),
        time1: r.time1 || '',
        time2: r.time2 || '',
        plate: r.plate,
        w1: fmtInt(r.tare),
        w2: fmtInt(r.gross),
        net: fmtInt(r.net),
        driver: r.driver || g.defaultDriver || '',
        carrier: r.carrier || o.defaultCarrier || g.defaultCarrier || '',
        wh: r.wh || o.defaultWh || ''
      };
    });
  }

  /** Phụ lục tổng hợp theo từng xe (biển số): số chuyến, từ ngày, đến ngày, khối lượng. */
  function plateRows(rows) {
    const map = new Map();
    rows.forEach((r) => {
      let p = map.get(r.plate);
      if (!p) { p = { plate: r.plate, trips: 0, kg: 0, min: Infinity, max: -Infinity }; map.set(r.plate, p); }
      p.trips++; p.kg += r.net;
      if (r.ts1 !== null) { p.min = Math.min(p.min, r.ts1); p.max = Math.max(p.max, r.ts1); }
    });
    return Array.from(map.values()).sort((a, b) => a.plate.localeCompare(b.plate)).map((p, i) => ({
      stt: String(i + 1), trips: String(p.trips), plate: p.plate,
      dFrom: isFinite(p.min) ? U().fmtDate(U().tsToParts(p.min)) : '',
      dTo: isFinite(p.max) ? U().fmtDate(U().tsToParts(p.max)) : '',
      tons: fmtTon(p.kg), note: ''
    }));
  }

  /** Dòng phiếu cân cho file Excel lưu trữ: khối lượng là SỐ (kg), giữ số phiếu gốc, ĐVVC ghi MÃ NGẮN (HAK / ĐH / QC …). */
  function excelRows(rows, o) {
    o = o || {};
    const g = cfg().general;
    return rows.map((r) => ({
      ticket: r.ticket || '', time1: r.time1 || '', time2: r.time2 || '', plate: r.plate,
      tare: r.tare === undefined ? null : r.tare, gross: r.gross === undefined ? null : r.gross, net: r.net,
      driver: r.driver || g.defaultDriver || '',
      carrier: r.carrierCode || r.carrier || o.defaultCarrier || g.defaultCarrier || '',
      wh: r.wh || o.defaultWh || '', whSrc: r.wh || ''
    }));
  }

  /** Khối thống kê chung (tổng xe, tổng tấn, thời gian…). */
  function totals(rows, sum) {
    return {
      trip: String(sum.trips), vehicles: String(sum.vehicles),
      weight: fmtTon(sum.kg), weightKg: fmtInt(sum.kg), weightRound: fmtTonRound(sum.kg),
      dateFrom: sum.from, dateTo: sum.to,
      totalLine: 'TỔNG CỘNG: ' + sum.trips + ' phiếu — ' + fmtInt(sum.kg) + ' kg (' + fmtTon(sum.kg) + ' tấn)'
    };
  }

  /** Bộ biến chung + bí danh theo danh sách placeholder người dùng yêu cầu. */
  function commonCtx(giao, nhan, khoG, khoN, sum, per, dateStr, giaoRole, nhanRole) {
    const dp = docDateParts(dateStr);
    const ctx = Object.assign({},
      party(giao, 'giao', giaoRole), party(nhan, 'nhan', nhanRole),
      khoG ? wh(khoG, 'kho_giao') : {}, khoN ? wh(khoN, 'kho_nhan') : {},
      per, dp, { place: cfg().general.place || 'Đà Nẵng' });
    // Bí danh: {{company}} {{address}} {{tax}} {{director}} {{position}} {{from}} {{to}}
    ctx.company = ctx.giao_name; ctx.address = ctx.giao_address; ctx.tax = ctx.giao_tax;
    ctx.director = ctx.giao_rep; ctx.position = ctx.giao_position;
    ctx.from = ctx.kho_giao || ''; ctx.to = ctx.kho_nhan || '';
    return ctx;
  }

  /* ===============================================================
   * 4. Bốn bộ dựng biên bản.  Mỗi hàm trả về:
   *    { files:[{tpl, name, data}], summary:{...}, warnings:[], errors:[] }
   * ============================================================= */
  function need(res, rows) {
    if (!rows.length) res.errors.push('Không có phiếu cân nào trong phạm vi đã chọn. Hãy kiểm tra bộ lọc ngày / nhãn.');
    return rows.length > 0;
  }
  const newRes = () => ({ files: [], summary: {}, warnings: [], errors: [] });

  /* ---------- 4.1 Trung chuyển gửi kho ---------- */
  function buildGuiKho(ds, p) {
    const res = newRes();
    const rows = filterRows(ds.rows, p.filter);
    if (!need(res, rows)) return res;
    const sum = summarize(rows);
    const giao = HAK.Config.company(p.giaoId), nhan = HAK.Config.company(p.nhanId);
    const kg = HAK.Config.warehouse(p.khoGiaoId), kn = HAK.Config.warehouse(p.khoNhanId);
    if (giao.id === nhan.id) res.warnings.push('Bên giao và bên nhận đang là cùng một công ty.');
    if (kg.id === kn.id) res.warnings.push('Kho gửi và kho nhận đang trùng nhau.');
    const per = period(sum, p.period);
    const ctx = Object.assign(
      commonCtx(giao, nhan, kg, kn, sum, per, p.docDate, 'chủ sở hữu hàng hóa', 'kho tiếp nhận'),
      totals(rows, sum),
      {
        dateFromShort: (sum.from || '').slice(0, 5),                        // "04/06" (dòng "ĐỢT 04/06 - 15/06/2026")
        appendix: plateRows(rows),                                          // (tổng hợp theo xe — dành cho mẫu tùy chỉnh)
        // Phụ lục bảng kê từng phiếu cân: xếp theo giờ cân lần 2 (giờ xe ra khỏi bàn cân), như mẫu
        table: detailRows(rows.slice().sort((a, b) => (a.ts2 !== null ? a.ts2 : (a.ts1 || 0)) - (b.ts2 !== null ? b.ts2 : (b.ts1 || 0))), { defaultWh: kg.short }),
        showDetail: true
      });
    // Mẫu theo tháng (phụ lục tổng hợp theo biển số) hoặc theo đợt (phụ lục từng phiếu cân)
    const thang = p.variant === 'thang';
    if (thang) { ctx.evidence = p.evidence || 'Phiếu xuất kho kiêm vận chuyển nội bộ (PXK)'; ctx.showDetail = !!p.showDetail; }
    res.files.push({ tpl: thang ? 'GuiKhoThang' : 'GuiKho', name: 'BienBanGuiKho_' + monthCode(per) + '.docx', data: ctx });
    const mm = per.periodMonth + '/' + per.periodYear;
    res.excel = {
      kind: 'A', fileName: 'BangChiTietCanHang_GuiKho_' + (thang ? 'Thang_' : 'Dot_') + monthCode(per) + '.xlsx',
      title: 'PHỤ LỤC — BẢNG CHI TIẾT CÂN HÀNG GỬI KHO — ' + (thang ? 'THÁNG ' + mm : 'ĐỢT ' + sum.from.slice(0, 5) + ' - ' + sum.to),
      lines: ['Bên giao: ' + giao.name + ' (' + giao.short + ')  —  Bên nhận: ' + nhan.name + '  —  Bàn cân xuất: ' + kg.name],
      totalLabel: 'TỔNG CỘNG ' + (thang ? 'THÁNG ' + mm : 'ĐỢT ' + sum.from.slice(0, 5) + ' - ' + sum.to) + ':',
      rows: excelRows(rows.slice().sort((a, b) => (a.ts2 !== null ? a.ts2 : (a.ts1 || 0)) - (b.ts2 !== null ? b.ts2 : (b.ts1 || 0)))),
      sign: { left: { title: 'ĐẠI DIỆN BÊN GIAO', org: giao.name }, right: { title: 'ĐẠI DIỆN BÊN NHẬN', org: nhan.name } }
    };
    res.summary = { 'Số lượt xe': sum.trips, 'Số xe (biển số)': sum.vehicles, 'Tổng khối lượng': ctx.weight + ' tấn', 'Thời gian': sum.from + ' → ' + sum.to, 'Kho gửi → nhận': kg.short + ' → ' + kn.short };
    return res;
  }

  /**
   * Khóa nhận diện 1 xe cho "Chọn xe trả về". r.idx = số dòng TRONG TỪNG FILE nên bị trùng khi gộp nhiều file Excel
   * → dùng r.uid (tên file + số dòng, gán ở mergeSlot() trong main.js). Hồ sơ lưu trữ cũ không có uid → lùi về idx (vẫn khớp vì
   * params.returned cũ cũng lưu idx).
   */
  const retKey = (r) => (r.uid !== undefined ? r.uid : r.idx);

  /** Xe trả về (người dùng chọn) → dòng, khối lượng, khối lượng thực giao. Dùng chung Ủy thác + Xuất kho gửi. */
  function returnedInfo(rows, p, sum) {
    const ret = new Set(p.returned || []);
    const retRows = rows.filter((r) => ret.has(retKey(r)));
    const retKg = retRows.reduce((a, r) => a + r.net, 0);
    return { retRows, retKg, deliveredKg: sum.kg - retKg };
  }

  /* ---------- 4.1b Xuất hàng kho gửi — BẢNG XÁC NHẬN HÀNG GỬI KHO XUẤT KHẨU (theo từng tàu) ---------- */
  function buildXuatKhoGui(ds, p) {
    const res = newRes();
    const rows = filterRows(ds.rows, p.filter);
    if (!need(res, rows)) return res;
    if (!String(p.ship || '').trim()) res.errors.push('Chưa nhập tên tàu.');
    if (res.errors.length) return res;
    const sum = summarize(rows);
    const giao = HAK.Config.company(p.giaoId), nhan = HAK.Config.company(p.nhanId);
    const kg = HAK.Config.warehouse(p.khoGiaoId), kn = HAK.Config.warehouse(p.khoNhanId);
    if (giao.id === nhan.id) res.warnings.push('Bên gửi và bên nhận đang là cùng một công ty.');
    const { retRows, retKg, deliveredKg } = returnedInfo(rows, p, sum);
    const per = period(sum, p.period);
    const ctx = Object.assign(
      commonCtx(giao, nhan, kg, kn, sum, per, p.docDate, 'chủ sở hữu hàng hóa', 'đại diện kho gửi'),
      totals(rows, sum),
      {
        ship: String(p.ship).trim().toUpperCase(),
        khoGuiCode: orBlank(p.khoGuiCode),
        weightScaleTon: fmtTon(sum.kg), weightScaleKg: fmtInt(sum.kg),
        returnedText: retRows.length ? fmtTon(retKg) + ' tấn (' + retRows.length + ' xe)' : 'Không có xe trả về',
        returnedTon: fmtTon(retKg), returnedKg: fmtInt(retKg), returnedTrip: String(retRows.length),
        weightDelivered: fmtTon(deliveredKg),
        table: detailRows(rows, { defaultWh: p.whLabel || '' }),          // phụ lục: toàn bộ phiếu qua cân (gross)
        returned: detailRows(retRows, { defaultWh: p.whLabel || '' }), hasReturned: retRows.length > 0
      });
    res.files.push({ tpl: 'XuatKhoGui', name: 'XuatKhoGui_' + slug(ctx.ship) + '.docx', data: ctx });
    res.excel = {
      kind: 'B', fileName: 'PhieuCan_' + slug(ctx.ship) + '_' + slug(giao.short) + '.xlsx',
      title: 'BẢNG CHI TIẾT CÂN ' + giao.short.toUpperCase() + ' XUẤT KHẨU - ' + ctx.ship,
      station: 'Trạm cân: ' + giao.short,
      note: giao.short + ' gửi kho tại ' + kn.short + ', ' + nhan.short + ' đại diện kho gửi' + (retRows.length ? '; trong đó xe trả về ' + retRows.length + ' xe (' + ctx.returnedTon + ' tấn)' : '') + '.',
      rows: excelRows(rows, { defaultWh: p.whLabel || '' })
    };
    res.summary = {
      'Tàu': ctx.ship, 'Bên gửi → nhận': giao.short + ' → ' + nhan.short, 'Thời gian xuất hàng': sum.from + ' → ' + sum.to,
      'Kho xuất → gửi đến': kg.short + ' → ' + kn.short, 'Khối lượng qua cân': ctx.weightScaleTon + ' tấn (' + sum.trips + ' xe)',
      'Xe trả về': retRows.length ? ctx.returnedTon + ' tấn (' + retRows.length + ' xe)' : 'Không có', 'Thực gửi/nhận': ctx.weightDelivered + ' tấn'
    };
    return res;
  }

  /* ---------- 4.2 Ủy thác xuất khẩu (theo từng tàu) ---------- */
  function buildUyThac(ds, p) {
    const res = newRes();
    const rows = filterRows(ds.rows, p.filter);
    if (!need(res, rows)) return res;
    if (!String(p.ship || '').trim()) res.errors.push('Chưa nhập tên tàu.');
    if (res.errors.length) return res;
    const N = U().parseNum;
    const sum = summarize(rows);
    const giao = HAK.Config.company(p.giaoId), nhan = HAK.Config.company(p.nhanId);
    if (giao.id === nhan.id) res.warnings.push('Bên ủy thác và bên nhận ủy thác đang là cùng một công ty.');

    // ---- khối lượng qua cân / xe trả về / thực giao ----
    const { retRows, retKg, deliveredKg } = returnedInfo(rows, p, sum);

    // ---- khối lượng giám định: tự tính tấn khô / độ ẩm khi thiếu ----
    let wet = N(p.certWet), dry = N(p.certDry), moist = N(p.moisture);
    let autoNote = '';
    if (wet !== null && moist !== null && dry === null) { dry = Math.round(wet * (1 - moist / 100) * 100) / 100; autoNote = 'Tấn khô được tự tính = tấn tươi × (1 − độ ẩm).'; }
    else if (wet !== null && dry !== null && moist === null) { moist = Math.round((1 - dry / wet) * 1e6) / 1e4; autoNote = 'Độ ẩm được tự tính từ tấn tươi và tấn khô.'; }
    if (autoNote) res.warnings.push(autoNote);
    if (moist !== null && (moist < 0 || moist > 100)) res.errors.push('Độ ẩm phải nằm trong khoảng 0–100%.');
    if (wet !== null && dry !== null && dry > wet) res.errors.push('Tấn khô lớn hơn tấn tươi — vui lòng kiểm tra lại.');
    if (res.errors.length) return res;
    const dTons = deliveredKg / 1000;
    if (wet !== null && Math.abs(wet - dTons) / Math.max(dTons, 1) > 0.02)
      res.warnings.push('Khối lượng giám định (tươi) ' + fmtDec(wet, 2) + ' tấn lệch ' + fmtDec(Math.abs(wet - dTons), 2) + ' tấn (' + fmtDec(Math.abs(wet - dTons) / dTons * 100, 2) + '%) so với thực giao ' + fmtTon(deliveredKg) + ' tấn.');

    const per = period(sum, p.period);
    const qty = N(p.contractQty);
    const ctx = Object.assign(
      commonCtx(giao, nhan, null, null, sum, per, p.docDate, 'chủ sở hữu hàng hóa', 'thực hiện thủ tục xuất khẩu'),
      totals(rows, sum),
      {
        ship: String(p.ship).trim().toUpperCase(),
        factory: orBlank(giao.factory),
        contractNo: orBlank(p.contractNo), contractDate: p.contractDate ? isoToVN(p.contractDate) : blank(),
        contractQtyText: qty !== null ? ' (khối lượng tạm tính trên hợp đồng: ' + fmtDec(qty, qty % 1 ? 2 : 0) + ' BDMT, tấn khô kiệt)' : '',
        certNo: orBlank(p.certNo), certDate: p.certDate ? isoToVN(p.certDate) : blank(),
        certWetText: wet !== null ? fmtDec(wet, 2) + ' tấn' : blank(),
        certDryText: dry !== null ? fmtDec(dry, 2) + ' tấn' : blank(),
        moistureText: moist !== null ? String(moist).replace('.', ',') + '%' : blank(),
        weightScaleTon: fmtTon(sum.kg), weightScaleKg: fmtInt(sum.kg),
        returnedText: retRows.length ? fmtTon(retKg) + ' tấn (' + retRows.length + ' xe)' : 'Không có xe trả về',
        returnedTon: fmtTon(retKg), returnedKg: fmtInt(retKg), returnedTrip: String(retRows.length),
        weightDelivered: fmtTon(deliveredKg),
        hasReturned: retRows.length > 0,
        table: detailRows(rows, { defaultWh: p.wh || '' }),
        returned: detailRows(retRows, { defaultWh: p.returnWh || '' })
      });
    // ghi đè: "xe trả về" nằm trong bảng qua cân nên tổng bảng = qua cân
    res.files.push({ tpl: 'UyThac', name: 'UyThac_' + slug(p.ship) + '.docx', data: ctx });
    res.excel = {
      kind: 'B', fileName: 'PhieuCan_' + slug(ctx.ship) + '_' + slug(giao.short) + '.xlsx',
      title: 'BẢNG CHI TIẾT CÂN ' + giao.short.toUpperCase() + ' XUẤT KHẨU - ' + ctx.ship,
      station: 'Trạm cân: ' + giao.short,
      note: giao.short + ' ủy thác cho ' + nhan.short + ' xuất khẩu' + (retRows.length ? '; trong đó xe trả về ' + retRows.length + ' xe (' + ctx.returnedTon + ' tấn)' : '') + '.',
      rows: excelRows(rows, { defaultWh: p.wh || '' })
    };
    res.summary = {
      'Tàu': ctx.ship, 'Bên ủy thác': giao.short, 'Thời gian xuất hàng': sum.from + ' → ' + sum.to,
      'Khối lượng qua cân': ctx.weightScaleTon + ' tấn (' + sum.trips + ' xe)',
      'Xe trả về': retRows.length ? ctx.returnedTon + ' tấn (' + retRows.length + ' xe)' : 'Không có',
      'Khối lượng thực giao': ctx.weightDelivered + ' tấn'
    };
    return res;
  }

  /* ---------- 4.3 Điều chuyển nội bộ: Quyết định + Biên bản ---------- */
  function buildDieuChuyen(ds, p) {
    const res = newRes();
    const rows = filterRows(ds.rows, p.filter);
    if (!need(res, rows)) return res;
    if (!String(p.qdNo || '').trim()) res.warnings.push('Chưa nhập số Quyết định — sẽ để trống để điền tay.');
    const sum = summarize(rows);
    const giao = HAK.Config.company(p.giaoId), nhan = HAK.Config.company(p.nhanId);
    const issuer = HAK.Config.company(p.issuerId);
    if (giao.id === nhan.id) res.warnings.push('Bên giao và bên nhận đang là cùng một đơn vị.');
    const kg = HAK.Config.warehouse(p.khoGiaoId), kn = HAK.Config.warehouse(p.khoNhanId);
    const per = period(sum, p.period);
    const wtype = p.weightType || cfg().general.defaultWeightType || 'Trung Chuyển';
    const giaoRole = (giao.kind === 'Chi nhánh' ? 'Chi nhánh xuất hàng' : 'Công ty xuất hàng') + ' — ' + kg.short;
    const nhanRole = nhan.kind + ' — ' + kn.name;
    const ctx = Object.assign(
      commonCtx(giao, nhan, kg, kn, sum, per, p.docDate, giaoRole, nhanRole),
      totals(rows, sum),
      party(issuer, 'issuer'),
      {
        issuer_name: orBlank(issuer.name), issuer_name_upper: orBlank(issuer.name).toUpperCase(), issuer_rep: orBlank(issuer.rep),
        giao_khoShort: kg.short, nhan_khoShort: kn.short,
        qdNo: orBlank(p.qdNo), qdDate: p.qdDate ? isoToVN(p.qdDate) : blank(),
        weightType: wtype,
        table: detailRows(rows, { defaultWh: kg.short })
      });
    const code = 'T' + monthCode(per);
    res.excel = {
      kind: 'A', fileName: 'BangChiTietCanHang_DieuChuyen_Thang_' + monthCode(per) + '.xlsx',
      title: 'PHỤ LỤC — BẢNG CHI TIẾT CÂN HÀNG ĐIỀU CHUYỂN NỘI BỘ — THÁNG ' + per.periodMonth + '/' + per.periodYear,
      lines: [p.qdNo ? '(Kèm theo Quyết định điều chuyển số: ' + p.qdNo + ' — ' + issuer.name + ')' : '',
        'Bên giao: ' + giao.name + ' (' + giao.short + ')  —  Bên nhận: ' + nhan.name + '  —  Kho đi: ' + kg.name + '  —  Kho đến: ' + kn.name],
      totalLabel: 'TỔNG CỘNG THÁNG ' + per.periodMonth + '/' + per.periodYear + ':',
      rows: excelRows(rows, { defaultWh: kg.short }),
      sign: { left: { title: 'ĐẠI DIỆN BÊN GIAO', org: giao.name }, right: { title: 'ĐẠI DIỆN BÊN NHẬN', org: nhan.name } }
    };
    res.files.push({ tpl: 'QuyetDinh', name: 'QuyetDinh_DieuChuyen_' + code + '.docx', data: ctx });
    res.files.push({ tpl: 'DieuChuyen', name: 'DieuChuyen_' + code + '.docx', data: ctx });
    res.summary = { 'Số lượt xe': sum.trips, 'Khối lượng': ctx.weight + ' tấn (làm tròn ' + ctx.weightRound + ')', 'Thời gian': sum.from + ' → ' + sum.to, 'Kho đi → đến': kg.short + ' → ' + kn.short };
    return res;
  }

  /* ---------- 4.4 Trao đổi hàng hóa ---------- */
  function buildTraoDoi(ds, p) {
    const res = newRes();
    const rows = filterRows(ds.rows, p.filter);
    if (!need(res, rows)) return res;
    if (!String(p.contractNo || '').trim()) res.warnings.push('Chưa nhập số hợp đồng trao đổi — sẽ để trống để điền tay.');
    const sum = summarize(rows);
    const giao = HAK.Config.company(p.giaoId), nhan = HAK.Config.company(p.nhanId);
    if (giao.id === nhan.id) res.warnings.push('Bên giao và bên nhận đang là cùng một công ty.');
    const kg = HAK.Config.warehouse(p.khoGiaoId), kn = HAK.Config.warehouse(p.khoNhanId);
    const per = period(sum, p.period);
    const ctx = Object.assign(
      commonCtx(giao, nhan, kg, kn, sum, per, p.docDate, 'đơn vị giao', 'đơn vị nhận'),
      totals(rows, sum),
      {
        contractNo: orBlank(p.contractNo),
        table: detailRows(rows, { renumber: p.renumber ? monthCode(per) : '', defaultCarrier: p.defaultCarrier || '' })
      });
    res.files.push({ tpl: 'TraoDoi', name: 'TraoDoi_' + monthCode(per) + '.docx', data: ctx });
    res.excel = {
      kind: 'A', fileName: 'BangChiTietCanHang_TraoDoi_Thang_' + monthCode(per) + '.xlsx',
      title: 'PHỤ LỤC — BẢNG CHI TIẾT CÂN HÀNG LÔ HÀNG TRAO ĐỔI — THÁNG ' + per.periodMonth + '/' + per.periodYear,
      lines: [String(p.contractNo || '').trim() ? '(Kèm theo Hợp đồng trao đổi số: ' + p.contractNo + ' giữa ' + giao.name + ' và ' + nhan.name + ')' : '',
        'Đơn vị giao: ' + giao.name + ' (' + giao.short + ')  —  Bàn cân xuất: ' + kg.name + '  —  Nơi giao hàng: ' + kn.name],
      totalLabel: 'TỔNG CỘNG THÁNG ' + per.periodMonth + '/' + per.periodYear + ':',
      rows: excelRows(rows, { defaultCarrier: p.defaultCarrier || '' }),           // giữ SỐ PHIẾU GỐC (không đánh lại n/MMYYYY/TĐ)
      sign: { left: { title: 'ĐẠI DIỆN BÊN GIAO', org: giao.name }, right: { title: 'ĐẠI DIỆN BÊN NHẬN', org: nhan.name } }
    };
    res.summary = { 'Số phiếu': sum.trips, 'Khối lượng': ctx.weight + ' tấn', 'Thời gian': sum.from + ' → ' + sum.to, 'Giao → nhận': giao.short + ' → ' + nhan.short };
    return res;
  }

  /* ---------- 4.5 Xuất khẩu (công ty tự xuất khẩu): Bảng tổng hợp hàng xuất khẩu qua cân ---------- */
  /** Tổng hợp theo ngày cân (ngày cân lần 1): số xe, qua cân, xe trả về, thực xuất (kg). */
  function dailyRows(rows, retSet) {
    const map = new Map();
    rows.forEach((r) => {
      const k = r.dateStr || '(không rõ ngày)';
      let d = map.get(k);
      if (!d) { d = { date: k, ts: r.ts1 === null ? Infinity : r.ts1, trips: 0, kg: 0, retKg: 0 }; map.set(k, d); }
      d.trips++; d.kg += r.net; if (retSet.has(retKey(r))) d.retKg += r.net;
      if (r.ts1 !== null && r.ts1 < d.ts) d.ts = r.ts1;
    });
    return Array.from(map.values()).sort((a, b) => a.ts - b.ts).map((d) => ({ date: d.date, trips: d.trips, kg: d.kg, retKg: d.retKg, delKg: d.kg - d.retKg }));
  }
  function buildXuatKhau(ds, p) {
    const res = newRes();
    const rows = filterRows(ds.rows, p.filter);
    if (!need(res, rows)) return res;
    if (!String(p.ship || '').trim()) res.errors.push('Chưa nhập tên tàu.');
    if (res.errors.length) return res;
    const sum = summarize(rows);
    const giao = HAK.Config.company(p.giaoId);
    const kg = HAK.Config.warehouse(p.khoGiaoId), kn = HAK.Config.warehouse(p.khoNhanId);
    const { retRows, retKg, deliveredKg } = returnedInfo(rows, p, sum);
    const per = period(sum, p.period);
    const days = dailyRows(rows, new Set(retRows.map(retKey)));
    const ctx = Object.assign(
      commonCtx(giao, giao, kg, kn, sum, per, p.docDate, 'chủ sở hữu hàng hóa', ''),
      totals(rows, sum),
      {
        ship: String(p.ship).trim().toUpperCase(),
        weightScaleTon: fmtTon(sum.kg), weightScaleKg: fmtInt(sum.kg),
        returnedText: retRows.length ? fmtTon(retKg) + ' tấn (' + retRows.length + ' xe)' : 'Không có xe trả về',
        returnedTon: fmtTon(retKg), returnedKg: fmtInt(retKg), returnedTrip: String(retRows.length),
        weightDelivered: fmtTon(deliveredKg), weightDeliveredKg: fmtInt(deliveredKg),
        days: days.map((d, i) => ({ stt: String(i + 1), date: d.date, trips: String(d.trips), kg: fmtInt(d.kg), retKg: d.retKg ? fmtInt(d.retKg) : '—', delKg: fmtInt(d.delKg) })),
        table: detailRows(rows, { defaultWh: kg.short }),
        returned: detailRows(retRows, { defaultWh: kg.short }), hasReturned: retRows.length > 0
      });
    res.files.push({ tpl: 'XuatKhau', name: 'XuatKhau_' + slug(ctx.ship) + '.docx', data: ctx });
    res.excel = {
      kind: 'B', fileName: 'PhieuCan_XuatKhau_' + slug(ctx.ship) + '_' + slug(giao.short) + '.xlsx',
      title: 'BẢNG TỔNG HỢP HÀNG XUẤT KHẨU QUA CÂN - ' + ctx.ship,
      station: 'Trạm cân: ' + kg.short,
      note: giao.short + ' xuất khẩu, hàng nạp lên tàu tại ' + kn.short + (retRows.length ? '; trong đó xe trả về ' + retRows.length + ' xe (' + ctx.returnedTon + ' tấn)' : '') + '.',
      rows: excelRows(rows, { defaultWh: kg.short }), daily: days
    };
    res.summary = {
      'Tàu': ctx.ship, 'Đơn vị xuất khẩu': giao.short, 'Thời gian xuất hàng': sum.from + ' → ' + sum.to,
      'Kho xuất → cảng': kg.short + ' → ' + kn.short, 'Khối lượng qua cân': ctx.weightScaleTon + ' tấn (' + sum.trips + ' xe)',
      'Xe trả về': retRows.length ? ctx.returnedTon + ' tấn (' + retRows.length + ' xe)' : 'Không có', 'Thực xuất': ctx.weightDelivered + ' tấn'
    };
    return res;
  }

  /* ---------- 4.6 Xuất bán: Biên bản giao nhận hàng hóa (như Trao đổi + hợp đồng mua bán, đơn giá / thành tiền) ---------- */
  /** Số tiền → chữ tiếng Việt: 1250000 → "Một triệu hai trăm năm mươi nghìn đồng chẵn". */
  function vnMoneyWords(n) {
    n = Math.round(n);
    if (!(n > 0)) return 'Không đồng';
    const dg = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];
    const three = (x, full) => {                       // full: có nhóm cao hơn → đọc "không trăm" / "lẻ"
      const h = Math.floor(x / 100), t = Math.floor(x / 10) % 10, u = x % 10;
      let s = (h > 0 || full) ? dg[h] + ' trăm' : '';
      if (t > 1) { s += ' ' + dg[t] + ' mươi'; s += u === 1 ? ' mốt' : u === 4 ? ' tư' : u === 5 ? ' lăm' : u > 0 ? ' ' + dg[u] : ''; }
      else if (t === 1) { s += ' mười'; s += u === 5 ? ' lăm' : u > 0 ? ' ' + dg[u] : ''; }
      else if (u > 0) { s += ((h > 0 || full) ? ' lẻ ' : ' ') + dg[u]; }
      return s.trim();
    };
    const under1e9 = (x, higher) => {
      const g = [x % 1000, Math.floor(x / 1000) % 1000, Math.floor(x / 1e6)], nm = ['', 'nghìn', 'triệu'], out = [];
      let hi = higher;
      for (let i = 2; i >= 0; i--) if (g[i] > 0) { out.push(three(g[i], hi) + (nm[i] ? ' ' + nm[i] : '')); hi = true; }
      return out.join(' ');
    };
    const b = Math.floor(n / 1e9), r = n % 1e9;
    let s = '';
    if (b > 0) s = (b >= 1e9 ? vnMoneyWords(b).replace(/ đồng chẵn$/, '') : under1e9(b, false)) + ' tỷ';
    if (r > 0) s += (s ? ' ' : '') + under1e9(r, b > 0);
    return s.charAt(0).toUpperCase() + s.slice(1) + ' đồng chẵn';
  }
  function buildXuatBan(ds, p) {
    const res = newRes();
    const rows = filterRows(ds.rows, p.filter);
    if (!need(res, rows)) return res;
    if (!String(p.contractNo || '').trim()) res.warnings.push('Chưa nhập số hợp đồng mua bán — sẽ để trống để điền tay.');
    const sum = summarize(rows);
    const giao = HAK.Config.company(p.giaoId), nhan = HAK.Config.company(p.nhanId);
    if (giao.id === nhan.id) res.warnings.push('Bên bán và bên mua đang là cùng một công ty.');
    const kg = HAK.Config.warehouse(p.khoGiaoId), kn = HAK.Config.warehouse(p.khoNhanId);
    const per = period(sum, p.period);
    // ---- đơn giá / thành tiền: tấn (2 số lẻ như in trong biên bản) × đơn giá ----
    const price = String(p.unitPrice || '').trim() === '' ? null : U().parseNum(p.unitPrice);
    if (String(p.unitPrice || '').trim() !== '' && (price === null || price < 0)) res.errors.push('Đơn giá không hợp lệ.');
    if (res.errors.length) return res;
    const tons = Math.round(sum.kg / 10) / 100;
    const amount = price !== null ? Math.round(tons * price) : null;
    const ctx = Object.assign(
      commonCtx(giao, nhan, kg, kn, sum, per, p.docDate, 'bên bán', 'bên mua'),
      totals(rows, sum),
      {
        contractNo: orBlank(p.contractNo),
        hasPrice: amount !== null, unitPrice: price !== null ? fmtDec(price, price % 1 ? 2 : 0) : '',
        amount: amount !== null ? fmtInt(amount) : '', amountWords: amount !== null ? vnMoneyWords(amount) : '',
        priceNote: String(p.priceNote || '').trim() ? ' (' + String(p.priceNote).trim() + ')' : '',
        table: detailRows(rows, { defaultCarrier: p.defaultCarrier || '' })            // giữ SỐ PHIẾU GỐC
      });
    res.files.push({ tpl: 'XuatBan', name: 'XuatBan_' + monthCode(per) + '.docx', data: ctx });
    const mm = per.periodMonth + '/' + per.periodYear;
    res.excel = {
      kind: 'A', fileName: 'BangChiTietCanHang_XuatBan_Thang_' + monthCode(per) + '.xlsx',
      title: 'BIÊN BẢN GIAO NHẬN HÀNG HÓA — BẢNG CHI TIẾT CÂN HÀNG XUẤT BÁN — THÁNG ' + mm,
      lines: [String(p.contractNo || '').trim() ? '(Theo Hợp đồng mua bán số: ' + p.contractNo + ' giữa ' + giao.name + ' (Bên bán) và ' + nhan.name + ' (Bên mua))' : '',
        'Bên bán: ' + giao.name + ' (' + giao.short + ')  —  Bên mua: ' + nhan.name + '  —  Bàn cân xuất: ' + kg.name + '  —  Nơi giao hàng: ' + kn.name,
        amount !== null ? 'Đơn giá: ' + ctx.unitPrice + ' đồng/tấn  —  Thành tiền: ' + ctx.amount + ' đồng' + ctx.priceNote + '. Bằng chữ: ' + ctx.amountWords + '.' : ''],
      totalLabel: 'TỔNG CỘNG THÁNG ' + mm + ':',
      rows: excelRows(rows, { defaultCarrier: p.defaultCarrier || '' }),
      sign: { left: { title: 'ĐẠI DIỆN BÊN BÁN', org: giao.name }, right: { title: 'ĐẠI DIỆN BÊN MUA', org: nhan.name } }
    };
    res.summary = { 'Số phiếu': sum.trips, 'Khối lượng': ctx.weight + ' tấn', 'Thời gian': sum.from + ' → ' + sum.to, 'Bán → mua': giao.short + ' → ' + nhan.short };
    if (amount !== null) res.summary['Thành tiền'] = ctx.amount + ' đồng';
    return res;
  }

  const BUILDERS = { guikho: buildGuiKho, xuatkhogui: buildXuatKhoGui, xuatkhau: buildXuatKhau, uythac: buildUyThac, dieuchuyen: buildDieuChuyen, traodoi: buildTraoDoi, xuatban: buildXuatBan };

  HAK.Generator = {
    fmtInt, fmtDec, fmtTon, fmtTonRound, isoToVN, slug, vnMoneyWords,
    filterRows, summarize, plateRows, detailRows, retKey,
    build(type, ds, params) {
      if (!ds || !ds.ok) return { files: [], summary: {}, warnings: [], errors: ['Chưa có dữ liệu Excel hợp lệ. Hãy thêm file ở mục "Nhập liệu".'] };
      return BUILDERS[type](ds, params);
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
