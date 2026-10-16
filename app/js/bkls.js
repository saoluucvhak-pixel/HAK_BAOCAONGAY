/**
 * bkls.js — Bảng kê lâm sản (BKLS, Mẫu số 01): Word (tổng / từng xe) + PDF (tổng / từng xe).
 * Port từ bộ công cụ BKLS_PXKKVCNB cũ (07_gen_word_pdf.js), tách khỏi DOM: mọi dữ liệu truyền qua tham số.
 *
 *   ctx = { g, snapshot }
 *     g = { tenChu, mstChu, diaChiChu, dienThoaiChu, email, xuatKhoTai, noiDen, nguonGoc, maHs }   (bên xuất = chủ lâm sản, điểm đi/đến)
 *     v2.7.6: maHs thay chữ cố định sau "Mã HS (…):" của mẫu (trước in "B11 3"); trống → dấu chấm để điền tay. g.maHs undefined → giữ như mẫu.
 *     snapshot = kết quả readSnapshot() — các dòng tĩnh của file mẫu (dùng để vẽ PDF & giữ nguyên dòng người dùng không nhập)
 *   lot = { soBkls, heSoBdmt, ngayLap ('yyyy-mm-dd'|''), ngayLapTheoXe, benMuaTen, benMuaMst, benMuaDiaChi, benMuaDt, benMuaEmail,
 *           trips: [{ ngayCanDate:Date, bienSoRaw, tenTaiXe, klHangKg }] }
 *
 * Word: thay chữ trực tiếp trên XML của BKLS_mau.docx (giữ nguyên định dạng mẫu). Từng xe: ghép chuỗi XML, mỗi xe 1 trang.
 * PDF: jsPDF + font Roboto (hỗ trợ tiếng Việt), bám bố cục file Word mẫu. jsPDF/tài sản được nạp khi cần (ensureAssets).
 */
(function (root) {
  'use strict';
  const HAK = (root.HAK = root.HAK || {});
  const WNS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const XMLNS = 'http://www.w3.org/XML/1998/namespace';
  const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  const tick = () => new Promise((r) => setTimeout(r, 0));   // nhường luồng cho giao diện

  /* ================= nạp tài sản (lazy) ================= */
  const loadScript = (src) => HAK.UI.loadScript(src);    // bộ nạp dùng chung (ui.js)
  async function ensureAssets(needPdf) {
    if (!HAK.BklsAssets) await loadScript('js/bkls-assets.js');
    if (needPdf && !(root.jspdf && root.jspdf.jsPDF)) await loadScript('libs/jspdf.umd.min.js');
  }
  function b64ToBuf(b64) {
    const bin = atob(b64), u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return u.buffer;
  }
  const templateBuffer = () => b64ToBuf(HAK.BklsAssets.template);

  /* ================= tiện ích số / ngày / chữ ================= */
  const DON_VI = ['', 'nghìn', 'triệu', 'tỷ'];
  const SO_CHU = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];
  function doc3(n, first) {
    const tram = Math.floor(n / 100), du = n % 100, chuc = Math.floor(du / 10), dv = du % 10, p = [];
    if (tram > 0 || !first) p.push(SO_CHU[tram] + ' trăm');
    if (chuc === 0) { if (dv > 0) { if (tram > 0 || !first) p.push('lẻ'); p.push(SO_CHU[dv]); } }
    else if (chuc === 1) { p.push('mười'); if (dv === 1) p.push('một'); else if (dv === 5) p.push('lăm'); else if (dv > 0) p.push(SO_CHU[dv]); }
    else { p.push(SO_CHU[chuc] + ' mươi'); if (dv === 1) p.push('mốt'); else if (dv === 5) p.push('lăm'); else if (dv > 0) p.push(SO_CHU[dv]); }
    return p.join(' ').trim();
  }
  function soThanhChu(x) {
    let ng = Math.trunc(x), le = Math.round((x - ng) * 100);
    if (le === 100) { ng += 1; le = 0; }
    let chu;
    if (ng === 0) chu = 'không';
    else {
      const gr = []; let n = ng;
      while (n > 0) { gr.push(n % 1000); n = Math.floor(n / 1000); }
      const parts = [];
      for (let i = gr.length - 1; i >= 0; i--) {
        if (gr[i] === 0) continue;
        parts.push(doc3(gr[i], i === gr.length - 1));
        if (DON_VI[i]) parts.push(DON_VI[i]);
      }
      chu = parts.join(' ');
    }
    if (le > 0) chu += ' phẩy ' + doc3(le, true);
    return chu.charAt(0).toUpperCase() + chu.slice(1);
  }
  function formatSoVN(n) {
    const sign = n < 0 ? '-' : ''; n = Math.abs(n);
    const p = n.toFixed(2).split('.');
    return sign + p[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + p[1];
  }
  const isValidDate = (d) => d instanceof Date && !isNaN(d);
  function fmtDateVN(d) {
    if (!isValidDate(d)) return '...';
    const p = (x) => String(x).padStart(2, '0');
    return p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + d.getFullYear();
  }
  function parseIsoDate(str) {
    const m = String(str || '').match(/^(\d{4})-(\d{2})-(\d{2})$/); if (!m) return null;
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return isNaN(d) ? null : d;
  }
  /** 'dd/mm/yyyy' → Date (null nếu sai) */
  function parseDMY(str) {
    const m = String(str || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); if (!m) return null;
    const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
    return isNaN(d) ? null : d;
  }
  const r2 = (x) => Math.round(x * 100) / 100;
  const escapeXmlText = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  function stripLabelPrefix(line) { return line ? String(line).replace(/^[^:]*:\s*/, '').trim() : ''; }

  /* ================= giá trị điền vào mẫu ================= */
  function splitCongTyHeader(tenChu) {
    const up = String(tenChu || '').replace(/\s+/g, ' ').trim().toUpperCase();
    if (!up) return null;
    const m = up.match(/^(.*?\bTNHH)\s+(.+)$/);
    return m ? { line1: m[1], line2: m[2] } : { line1: up, line2: '' };
  }
  const kyNgayTextOf = (d) => isValidDate(d) ? 'Ngày ' + d.getDate() + ' tháng ' + (d.getMonth() + 1) + ' năm ' + d.getFullYear() : 'Ngày ..... tháng ..... năm ..........';

  /** Ghép lại dòng "Số điện thoại: ..., Địa chỉ Email: ..." — phần nào để trống thì giữ như file mẫu. */
  function buildLienHeLine(originalLine, phone, email) {
    if (!originalLine || (!phone && !email)) return originalLine;
    const idx = originalLine.indexOf('Địa chỉ Email:'); if (idx < 0) return originalLine;
    const phonePart = phone ? 'Số điện thoại: ' + phone + ', ' : originalLine.slice(0, idx);
    const emailPart = email ? 'Địa chỉ Email: ' + email : originalLine.slice(idx);
    return phonePart + emailPart;
  }
  function lienHeMuaLineOf(lot) {
    const dt = (lot.benMuaDt || '').trim(), em = (lot.benMuaEmail || '').trim();
    if (!dt && !em) return null;
    return 'Số điện thoại: ' + (dt || '...................') + ', Địa chỉ Email: ' + (em || '…………………………');
  }
  function kyDateForTrip(trip, lot) {
    const nhap = parseIsoDate(lot.ngayLap);
    if (lot.ngayLapTheoXe !== false) return isValidDate(trip.ngayCanDate) ? trip.ngayCanDate : nhap;
    return nhap || (isValidDate(trip.ngayCanDate) ? trip.ngayCanDate : null);
  }
  const MA_HS_LABEL = 'Mã HS (áp dụng đối với lâm sản nhập khẩu, xuất khẩu): ';
  function commonValues(ctx, lot, kyDate) {
    const g = ctx.g, h = splitCongTyHeader(g.tenChu);
    return {
      congTyLine1: h ? h.line1 : null, congTyLine2: h ? h.line2 : null,
      kyNgayText: kyNgayTextOf(kyDate), lienHeMuaLine: lienHeMuaLineOf(lot),
      tenChuLamSanLine: g.tenChu ? 'Tên chủ lâm sản(4): ' + g.tenChu : null,
      mstChuLamSanLine: g.mstChu ? 'Số GCN/MSDN/GPTL/ĐKHĐ/CCCD/CMND/HC(5): ' + g.mstChu : null,
      diaChiChuLamSanLine: g.diaChiChu ? 'Địa chỉ(6): ' + g.diaChiChu : null,
      nguonGocLine: g.nguonGoc ? 'Nguồn gốc(7): ' + g.nguonGoc : null,
      maHsLine: g.maHs === undefined ? null : MA_HS_LABEL + (g.maHs || '……………………'),
      tenMuaLine: 'Tên tổ chức, cá nhân(4): ' + lot.benMuaTen,
      mstLine: 'Số GCN/MSDN/GPTL/ĐKHĐ/CCCD/CMND/HC(5): ' + lot.benMuaMst,
      diaChiLine: 'Địa chỉ(6): ' + lot.benMuaDiaChi,
      lienHeLine: buildLienHeLine(ctx.snapshot && ctx.snapshot.lienHeChuLamSan, g.dienThoaiChu, g.email)
    };
  }
  function aggregateValues(ctx, lot) {
    const dates = lot.trips.map((t) => t.ngayCanDate).filter(isValidDate);
    const tongRmt = r2(lot.trips.reduce((s, t) => s + (t.klHangKg || 0), 0) / 1000);
    const tongBdmt = r2(tongRmt * lot.heSoBdmt);
    const ngayDau = dates.length ? new Date(Math.min.apply(null, dates)) : null;
    const ngayCuoi = dates.length ? new Date(Math.max.apply(null, dates)) : null;
    const soNgay = ngayDau && ngayCuoi ? Math.round((ngayCuoi - ngayDau) / 86400000) + 1 : '...';
    const g = ctx.g, diemDi = diemDiOf(g), diemDen = diemDenOf(g);
    return Object.assign({ soBklsLine: 'Số(1): ' + lot.soBkls }, commonValues(ctx, lot, parseIsoDate(lot.ngayLap) || ngayCuoi), {
      khoiLuongLine: 'Khối lượng/trọng lượng (bằng số và chữ): ' + formatSoVN(tongRmt) + ' (' + soThanhChu(tongRmt) + '). Đơn vị tính : Tấn (RMT)',
      soLuongLine: 'Số lượng (bằng số và chữ): ' + formatSoVN(tongBdmt) + ' (' + soThanhChu(tongBdmt) + '). Đơn vị tính: BDMT',
      vanChuyenLine: 'Thông tin vận chuyển (nếu có): thời gian vận chuyển: ' + soNgay + ' ngày; Ngày ' + fmtDateVN(ngayDau) + ' đến Ngày ' + fmtDateVN(ngayCuoi) +
        '; Vận chuyển từ: ' + diemDi + ' đến: ' + diemDen + '.',
      hoSo: hoSoOf(lot)                                   // v2.7.1: null = không liệt kê (bỏ tick / không có xe)
    });
  }
  /* v2.6.8: điểm đi / đến KHÔNG còn ghi cứng "Công ty TNHH Hoàng Anh Khôi" / "Cảng Tiên Sa Đà Nẵng" (sai với bên xuất khác HAK).
   * Thiếu kho xuất → địa chỉ chủ lâm sản (bên xuất); thiếu nơi đến → để trống "………" cho dễ thấy mà điền tay. */
  const BLANK_PLACE = '………';
  const diemDiOf = (g) => String(g.xuatKhoTai || '').trim() || String(g.diaChiChu || '').trim() || BLANK_PLACE;
  const diemDenOf = (g) => String(g.noiDen || '').trim() || BLANK_PLACE;
  function tripValues(ctx, lot, trip, soRieng) {
    const rmt = r2((trip.klHangKg || 0) / 1000), bdmt = r2(rmt * lot.heSoBdmt);
    const g = ctx.g, diemDi = diemDiOf(g), diemDen = diemDenOf(g);
    return Object.assign({ soBklsLine: 'Số(1): ' + soRieng }, commonValues(ctx, lot, kyDateForTrip(trip, lot)), {
      khoiLuongLine: 'Khối lượng/trọng lượng (bằng số và chữ): ' + formatSoVN(rmt) + ' (' + soThanhChu(rmt) + '). Đơn vị tính : Tấn (RMT)',
      soLuongLine: 'Số lượng (bằng số và chữ): ' + formatSoVN(bdmt) + ' (' + soThanhChu(bdmt) + '). Đơn vị tính: BDMT',
      vanChuyenLine: 'Thông tin vận chuyển (nếu có): Ngày ' + fmtDateVN(trip.ngayCanDate) + '; Vận chuyển từ: ' + diemDi + ' đến: ' + diemDen +
        '; Phương tiện vận chuyển: ' + trip.bienSoRaw + '; Người vận chuyển: ' + (trip.tenTaiXe || '...................') + '.'
    });
  }
  const soRiengOf = (lot, i) => lot.soBkls + '-' + String(i + 1).padStart(4, '0');

  /* ================= v2.7.1 Mục 5 "Hồ sơ kèm theo" của bản TỔNG: liệt kê từng BKLS con (Thủy chốt phương án A) =================
   * Ngày (đậm) → Đơn vị vận chuyển (nghiêng) → từng BKLS con 1 dòng. Gom theo ĐVVC trong ngày thay vì ghi tên ĐVVC trên từng dòng:
   * tên công ty vận tải dài → mỗi dòng sẽ xuống 2 dòng, bản tổng dài gấp đôi.
   * Trả về { head, rows: [{ k: 'day'|'dv'|'it', t }], lines } — dùng chung cho Word và PDF. Số / khối lượng từng dòng = đúng số in trên
   * BKLS từng xe (tripValues: MT = r2(kg/1000), BDMT = r2(MT × hệ số)); tổng ngày / ĐVVC = cộng các dòng con (có thể lệch vài 0,01 so với mục 3). */
  const fmtIntVN = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const plateKey = (x) => String(x || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
  const NO_DV = '………';
  function hoSoOf(lot) {
    const n = lot.trips.length;
    if (!lot.listTrips || !n) return null;
    const newAgg = () => ({ list: [], veh: new Set(), mt: 0, bdmt: 0 });
    const days = new Map(), allVeh = new Set(), allDv = new Set();
    let noDv = 0;
    lot.trips.forEach((t, i) => {
      const d = isValidDate(t.ngayCanDate) ? t.ngayCanDate : null, key = d ? d.getTime() : Infinity;
      if (!days.has(key)) days.set(key, Object.assign(newAgg(), { d, dvs: new Map() }));
      const day = days.get(key), dvName = String(t.donViVc || '').trim(), dvKey = dvName.toUpperCase();
      if (!day.dvs.has(dvKey)) day.dvs.set(dvKey, Object.assign(newAgg(), { name: dvName || NO_DV }));
      const dv = day.dvs.get(dvKey), mt = r2((t.klHangKg || 0) / 1000), bdmt = r2(mt * lot.heSoBdmt), pk = plateKey(t.bienSoRaw);
      if (dvName) allDv.add(dvKey); else noDv++;
      [day, dv].forEach((g) => { if (pk) g.veh.add(pk); g.mt += mt; g.bdmt += bdmt; });
      if (pk) allVeh.add(pk);
      day.list.push(i);
      dv.list.push('+ BKLS số: ' + soRiengOf(lot, i) + ', KL: ' + formatSoVN(mt) + ' MT – ' + formatSoVN(bdmt) + ' BDMT, số xe: ' +
        (String(t.bienSoRaw || '').trim() || '………') + ', tài xế: ' + (String(t.tenTaiXe || '').trim() || '………'));
    });
    const sumTxt = (g) => fmtIntVN(g.list.length) + ' BKLS, ' + fmtIntVN(g.veh.size) + ' xe, ' + formatSoVN(r2(g.mt)) + ' MT, ' + formatSoVN(r2(g.bdmt)) + ' BDMT';
    const rows = [];
    Array.from(days.keys()).sort((a, b) => a - b).forEach((k) => {
      const day = days.get(k);
      rows.push({ k: 'day', t: 'Ngày ' + (day.d ? fmtDateVN(day.d) : '(không rõ ngày)') + ': ' + sumTxt(day) });
      day.dvs.forEach((dv) => {
        rows.push({ k: 'dv', t: 'Đơn vị vận chuyển: ' + dv.name + ' — ' + fmtIntVN(dv.list.length) + ' BKLS, ' + fmtIntVN(dv.veh.size) + ' xe' });   // khối lượng đã có ở dòng ngày → dòng ĐVVC gọn 1 dòng
        dv.list.forEach((it) => rows.push({ k: 'it', t: it }));
      });
    });
    const head = fmtIntVN(n) + ' Bảng kê lâm sản từng xe (số ' + soRiengOf(lot, 0) + (n > 1 ? ' đến ' + soRiengOf(lot, n - 1) : '') + '); ' +
      fmtIntVN(allVeh.size) + ' xe vận chuyển, ' + fmtIntVN(n) + ' lượt; ' + fmtIntVN(allDv.size) + ' đơn vị vận chuyển' +
      (noDv ? ' (' + fmtIntVN(noDv) + ' BKLS chưa có đơn vị vận chuyển)' : '') + '.';
    return { head, rows, lines: rows.length };
  }

  /* ================= đọc dòng tĩnh của file mẫu ================= */
  async function readSnapshot(templateBuf) {
    const zip = await JSZip.loadAsync(templateBuf);
    const xmlDoc = new DOMParser().parseFromString(await zip.file('word/document.xml').async('string'), 'application/xml');
    const paragraphs = Array.from(xmlDoc.getElementsByTagNameNS(WNS, 'p'));
    const out = {};
    let mstOcc = 0, diaChiOcc = 0, dtOcc = 0, expectLine2 = false;
    for (const p of paragraphs) {
      const trimmed = Array.from(p.getElementsByTagNameNS(WNS, 't')).map((n) => n.textContent).join('').trim();
      if (expectLine2) { expectLine2 = false; if (trimmed) out.congTyHeaderLine2 = trimmed; continue; }
      if (!trimmed) continue;
      if (trimmed.startsWith('Mẫu số')) out.mauSo = trimmed;
      else if (trimmed.startsWith('CÔNG TY') && !out.congTyHeaderLine1) { out.congTyHeaderLine1 = trimmed; expectLine2 = true; }
      else if (trimmed.startsWith('CỘNG HÒA')) out.quocHieu = trimmed;
      else if (trimmed.startsWith('Độc lập')) out.tieuNgu = trimmed;
      else if (trimmed.startsWith('Tờ số(')) out.toSoLine = trimmed;
      else if (trimmed.startsWith('Tên chủ lâm sản(4):')) out.tenChuLamSan = trimmed;
      else if (trimmed.startsWith('Số GCN/MSDN/GPTL/ĐKHĐ/CCCD/CMND/HC(5):')) { mstOcc++; if (mstOcc === 1) out.mstChuLamSan = trimmed; }
      else if (trimmed.startsWith('Địa chỉ(6):')) { diaChiOcc++; if (diaChiOcc === 1) out.diaChiChuLamSan = trimmed; }
      else if (trimmed.startsWith('Số điện thoại')) { dtOcc++; if (dtOcc === 1) out.lienHeChuLamSan = trimmed; else if (dtOcc === 2) out.lienHeMua = trimmed; }
      else if (trimmed.startsWith('Tên loài')) out.tenLoai = trimmed;
      else if (trimmed.startsWith('Nhóm loài')) out.nhomLoai = trimmed;
      else if (trimmed.startsWith('Nguồn gốc(7):')) out.nguonGoc = trimmed;
      else if (trimmed.startsWith('Mã HS')) out.maHS = trimmed;
      else if (trimmed.startsWith('Giá trị')) out.giaTri = trimmed;
      else if (trimmed.startsWith('Thông tin về lô khai thác')) out.thongTinLoKhaiThac = trimmed;
      else if (trimmed.startsWith('Thông tin khác có liên quan')) out.thongTinKhac = trimmed;
      else if (trimmed.startsWith('Thông tin chi tiết tại Bảng kê khai kèm theo')) out.thongTinChiTiet = trimmed;
      else if (trimmed.startsWith('Hồ sơ kèm theo')) out.hoSoKemTheo = trimmed;
      else if (trimmed.startsWith('Đà Nẵng,')) {
        const cut = trimmed.indexOf('TỔ CHỨC');
        if (cut >= 0) { out.kyNgayLine = trimmed.slice(0, cut).trim(); out.kyToChucLine = trimmed.slice(cut).trim(); } else out.kyNgayLine = trimmed;
      }
      else if (trimmed.startsWith('(Ký,')) out.kyChuThichLine = trimmed;
    }
    return out;
  }

  /* ================= Word: bản tổng (thay chữ trên DOM) ================= */
  function applySubstitutions(rootNode, values) {
    let mstOcc = 0, diaChiOcc = 0, dtOcc = 0, hdrState = 0;   // hdrState: 0 chưa gặp, 1 chờ dòng 2 tiêu đề, 2 xong
    for (const p of Array.from(rootNode.getElementsByTagNameNS(WNS, 'p'))) {
      const tNodes = Array.from(p.getElementsByTagNameNS(WNS, 't'));
      if (!tNodes.length) continue;
      const trimmed = tNodes.map((n) => n.textContent).join('').trim();
      const setText = (txt) => {
        tNodes[0].textContent = txt; tNodes[0].setAttributeNS(XMLNS, 'xml:space', 'preserve');
        for (let i = 1; i < tNodes.length; i++) tNodes[i].textContent = '';
      };
      if (hdrState === 1 && trimmed) {
        hdrState = 2;
        if (values.congTyLine2 != null) { tNodes[0].textContent = values.congTyLine2; tNodes[0].setAttributeNS(XMLNS, 'xml:space', 'preserve'); }
      } else if (hdrState === 0 && trimmed.startsWith('CÔNG TY')) { hdrState = 1; if (values.congTyLine1) setText(values.congTyLine1); }
      else if (trimmed.indexOf('TỔ CHỨC/CÁ NHÂN LẬP') >= 0) {
        if (values.kyNgayText) for (const t of tNodes) if (/^Ngày\s+\d+\s+tháng\s+\d+\s+năm\s+\d+$/.test(t.textContent.trim())) t.textContent = values.kyNgayText;
      }
      else if (trimmed.startsWith('Số(1):')) setText(values.soBklsLine);
      else if (trimmed.startsWith('Tên chủ lâm sản(4):')) { if (values.tenChuLamSanLine) setText(values.tenChuLamSanLine); }
      else if (trimmed.startsWith('Tên tổ chức, cá nhân(4):')) setText(values.tenMuaLine);
      else if (trimmed.startsWith('Số GCN/MSDN/GPTL/ĐKHĐ/CCCD/CMND/HC(5):')) {
        mstOcc++;
        if (mstOcc === 1) { if (values.mstChuLamSanLine) setText(values.mstChuLamSanLine); } else if (mstOcc === 2) setText(values.mstLine);
      }
      else if (trimmed.startsWith('Địa chỉ(6):')) {
        diaChiOcc++;
        if (diaChiOcc === 1) { if (values.diaChiChuLamSanLine) setText(values.diaChiChuLamSanLine); } else if (diaChiOcc === 2) setText(values.diaChiLine);
      }
      else if (trimmed.startsWith('Nguồn gốc(7):')) { if (values.nguonGocLine) setText(values.nguonGocLine); }
      else if (trimmed.startsWith('Mã HS')) { if (values.maHsLine) setText(values.maHsLine); }
      else if (trimmed.startsWith('Khối lượng/trọng lượng')) setText(values.khoiLuongLine);
      else if (trimmed.startsWith('Số lượng (bằng số và chữ):')) setText(values.soLuongLine);
      else if (trimmed.startsWith('Thông tin vận chuyển')) setText(values.vanChuyenLine);
      else if (trimmed.startsWith('Số điện thoại')) {
        dtOcc++;
        if (dtOcc === 1 && values.lienHeLine) setText(values.lienHeLine); else if (dtOcc === 2 && values.lienHeMuaLine) setText(values.lienHeMuaLine);
      }
    }
  }
  /* ================= Bố cục: giữ mỗi bảng kê vừa ĐÚNG 1 trang A4 =================
   * File mẫu gần chạm đáy trang (sau đoạn cam kết chỉ dư ~0,1 cm cho bảng chữ ký cao ≥ 3,2 cm) → trên Word, bản từng xe
   * (dòng "Thông tin vận chuyển" dài hơn) bị đẩy bảng ký sang trang 2. Xử lý trên chuỗi XML, KHÔNG đổi nội dung chữ:
   *  - dòng trống giữa các mục (≈0,75 cm/dòng) thu còn 4pt; bỏ các khối trống thừa SAU phần ký (bảng nổi rỗng, dòng trống). */
  const COMPACT_P = '<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="160" w:lineRule="exact"/><w:rPr><w:sz w:val="4"/></w:rPr></w:pPr></w:p>';
  const END_P = '<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="20" w:lineRule="exact"/><w:rPr><w:sz w:val="2"/></w:rPr></w:pPr></w:p>';
  /** Tách document.xml → { header, body (không gồm sectPr), sectPr, footer }. */
  function splitDoc(xmlStr) {
    const bodyOpen = xmlStr.match(/<w:body\b[^>]*>/), bodyCloseIdx = xmlStr.lastIndexOf('</w:body>');
    if (!bodyOpen || bodyCloseIdx < 0) throw new Error('Không tìm thấy nội dung (w:body) trong file mẫu BKLS.');
    const start = bodyOpen.index + bodyOpen[0].length;
    let body = xmlStr.slice(start, bodyCloseIdx), sectPr = '';
    const sect = body.match(/<w:sectPr\b[\s\S]*<\/w:sectPr>\s*$/);
    if (sect) { sectPr = sect[0]; body = body.slice(0, sect.index); }
    return { header: xmlStr.slice(0, start), body, sectPr, footer: xmlStr.slice(bodyCloseIdx) };
  }
  /** Các khối cấp cao nhất trong thân văn bản (đoạn / bảng / sdt) → [{ s, e }]. */
  function topBlocks(xml) {
    const re = /<(\/?)w:(p|tbl|sdt)(?=[\s>\/])[^>]*?(\/?)>/g, out = [];
    let depth = 0, s = -1, m;
    while ((m = re.exec(xml))) {
      if (m[1]) { if (--depth === 0) out.push({ s, e: re.lastIndex }); }
      else if (m[3]) { if (depth === 0) out.push({ s: m.index, e: re.lastIndex }); }
      else { if (depth++ === 0) s = m.index; }
    }
    return out;
  }
  const isEmptyBlock = (x) => !/<w:t(?:\s[^>]*)?>[^<]*\S/.test(x) && !/<w:(drawing|pict|object)\b|w:type="page"|<w:sectPr\b|<w:bookmarkStart\b/.test(x);
  /** Bảng CUỐI trang (bảng chữ ký): bỏ chiều cao tối thiểu của hàng + dòng trống cuối ô — chúng chỉ "chừa chỗ ký" phía dưới,
   *  mà dưới bảng cuối vốn đã là khoảng trắng tới hết trang → tờ in giữ nguyên, nhưng Word không còn đẩy bảng sang trang 2. */
  function relaxTailTable(tbl) {
    tbl = tbl.replace(/<w:trHeight\b[^>]*\/>/g, '');
    if ((tbl.match(/<w:tbl>/g) || []).length > 1) return tbl;                       // có bảng lồng → chỉ bỏ chiều cao hàng
    return tbl.replace(/(<w:tc>)([\s\S]*?)(<\/w:tc>)/g, (m, o, inner, c) => {
      const bl = topBlocks(inner).filter((b) => /^<w:p\b/.test(inner.slice(b.s, b.e)));
      let k = bl.length;
      while (k > 1 && isEmptyBlock(inner.slice(bl[k - 1].s, bl[k - 1].e))) k--;     // ô phải còn ít nhất 1 đoạn
      return k === bl.length ? m : o + inner.slice(0, bl[k].s) + inner.slice(bl[bl.length - 1].e) + c;
    });
  }
  function compactBody(body) {
    const bl = topBlocks(body);
    let last = bl.length - 1;
    while (last >= 0 && isEmptyBlock(body.slice(bl[last].s, bl[last].e))) last--;
    if (last < 0) return body;
    let out = '', pos = 0;
    for (let i = 0; i <= last; i++) {
      let x = body.slice(bl[i].s, bl[i].e);
      if (/^<w:p\b/.test(x) && isEmptyBlock(x)) x = COMPACT_P;
      else if (i === last && /^<w:tbl\b/.test(x)) x = relaxTailTable(x);
      out += body.slice(pos, bl[i].s) + x;
      pos = bl[i].e;
    }
    return out + (body.slice(pos).match(/<w:bookmarkEnd\b[^>]*\/>/g) || []).join('');   // giữ điểm đóng bookmark (nếu có)
  }

  /** v2.7.1 Word tổng: ghi mục 5 (dòng tổng nối vào đoạn "Hồ sơ kèm theo", sau đó mỗi ngày 1 dòng đậm + mỗi BKLS con 1 dòng)
   *  và đổi "Tổng số tờ: 1" thành trường NUMPAGES (Word tự đếm lại khi mở / in; giá trị tạm = ước tính). */
  function applyHoSo(xmlDoc, hoSo) {
    if (!hoSo) return;
    const W = (tag) => xmlDoc.createElementNS(WNS, 'w:' + tag);
    const attr = (el, k, v) => { el.setAttributeNS(WNS, 'w:' + k, v); return el; };
    const run = (text, opt) => {
      const r = W('r'), rp = W('rPr');
      if (opt.bold) rp.appendChild(W('b'));
      if (opt.italic) rp.appendChild(W('i'));
      rp.appendChild(attr(W('color'), 'val', '000000'));
      rp.appendChild(attr(W('sz'), 'val', String(opt.sz))); rp.appendChild(attr(W('szCs'), 'val', String(opt.sz)));
      const t = W('t'); t.setAttributeNS(XMLNS, 'xml:space', 'preserve'); t.textContent = text;
      r.appendChild(rp); r.appendChild(t); return r;
    };
    const para = (text, opt) => {
      const p = W('p'), pp = W('pPr');
      pp.appendChild(attr(attr(W('spacing'), 'before', String(opt.before || 0)), 'after', '0'));
      pp.appendChild(attr(attr(W('ind'), 'left', String(opt.left)), 'hanging', String(opt.hanging || 0)));
      pp.appendChild(attr(W('jc'), 'val', 'left'));
      p.appendChild(pp); p.appendChild(run(text, opt)); return p;
    };
    const paras = Array.from(xmlDoc.getElementsByTagNameNS(WNS, 'p'));
    const textOf = (p) => Array.from(p.getElementsByTagNameNS(WNS, 't')).map((n) => n.textContent).join('').trim();
    const hp = paras.find((p) => textOf(p).startsWith('Hồ sơ kèm theo'));
    if (hp) {
      hp.appendChild(run(hoSo.head, { sz: 23 }));
      let at = hp.nextSibling, lastP = null;
      const STY = { day: { bold: true, sz: 22, left: 180, before: 60 }, dv: { italic: true, sz: 21, left: 180, before: 20 }, it: { sz: 19, left: 240, hanging: 120 } };   // 9,5pt — 1 dòng / BKLS con kể cả tên tài xế dài
      hoSo.rows.forEach((r) => { lastP = para(r.t, STY[r.k]); hp.parentNode.insertBefore(lastP, at); });
      if (lastP) attr(lastP.getElementsByTagNameNS(WNS, 'spacing')[0], 'after', '120');   // cách đoạn cam kết phía dưới
    }
    const tp = paras.find((p) => textOf(p).startsWith('Tờ số'));
    if (tp) {                                            // "Tờ số(2): 1 Tổng số tờ:1" → số cuối = trường NUMPAGES
      const ts = Array.from(tp.getElementsByTagNameNS(WNS, 't')), last = ts[ts.length - 1], r = last && last.parentNode;
      if (r && /^\s*\d+\s*$/.test(last.textContent)) {
        last.textContent = String(Math.max(1, 1 + Math.ceil(Math.max(0, hoSo.lines - 4) / 60)));   // tạm tính ≈ 60 dòng / trang (Word tự đếm lại)
        const f = attr(W('fldSimple'), 'instr', ' NUMPAGES ');
        r.parentNode.insertBefore(f, r); f.appendChild(r);
      }
    }
  }

  async function docxTotal(templateBuf, ctx, lot) {
    const zip = await JSZip.loadAsync(templateBuf);
    const xmlDoc = new DOMParser().parseFromString(await zip.file('word/document.xml').async('string'), 'application/xml');
    const agg = aggregateValues(ctx, lot);
    applySubstitutions(xmlDoc, agg);
    applyHoSo(xmlDoc, agg.hoSo);
    let s = new XMLSerializer().serializeToString(xmlDoc);
    const d = splitDoc(s);
    s = d.header + compactBody(d.body) + END_P + d.sectPr + d.footer;          // vừa 1 trang (xem compactBody)
    if (!s.startsWith('<?xml')) s = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n' + s;
    zip.file('word/document.xml', s);
    return zip.generateAsync({ type: 'blob', mimeType: DOCX_MIME, compression: 'DEFLATE', compressionOptions: { level: 6 } });
  }

  /* ================= Word: từng xe (ghép chuỗi XML, mỗi xe 1 trang) ================= */
  function buildParagraphSplice(paragraphXml, nsAttrs, keepRest) {
    const MARKER = '\u0001__GT_MARKER__\u0001';
    const doc = new DOMParser().parseFromString('<w:tmpwrap ' + nsAttrs + '>' + paragraphXml + '</w:tmpwrap>', 'application/xml');
    const p = doc.getElementsByTagNameNS(WNS, 'p')[0]; if (!p) return null;
    const tNodes = Array.from(p.getElementsByTagNameNS(WNS, 't')); if (!tNodes.length) return null;
    tNodes[0].textContent = MARKER; tNodes[0].setAttributeNS(XMLNS, 'xml:space', 'preserve');
    if (!keepRest) for (let i = 1; i < tNodes.length; i++) tNodes[i].textContent = '';
    const filled = new XMLSerializer().serializeToString(p), idx = filled.indexOf(MARKER);
    return idx < 0 ? null : { prefix: filled.slice(0, idx), suffix: filled.slice(idx + MARKER.length) };
  }
  function findAllParagraphSpans(xmlStr) {
    const spans = [], re = /<w:p(?=[\s/>])[^>]*\/>|<w:p(?=[\s/>])[^>]*>[\s\S]*?<\/w:p>/g;
    let m; while ((m = re.exec(xmlStr))) spans.push(m[0]);
    return spans;
  }
  function extractParagraphText(pXml) {
    const re = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g; let out = '', m;
    while ((m = re.exec(pXml))) out += m[1];
    return out.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  }
  function buildSpliceMap(recordXml, nsAttrs) {
    const map = {};
    let mstOcc = 0, diaChiOcc = 0, dtOcc = 0, hdrState = 0;
    const register = (key, originalXml, keepRest) => { const sp = buildParagraphSplice(originalXml, nsAttrs, keepRest); if (sp) map[key] = Object.assign({ originalXml }, sp); };
    for (const span of findAllParagraphSpans(recordXml)) {
      const trimmed = extractParagraphText(span).trim(); if (!trimmed) continue;
      if (hdrState === 1) { hdrState = 2; register('congTyLine2', span, true); }
      else if (hdrState === 0 && trimmed.startsWith('CÔNG TY')) { hdrState = 1; register('congTyLine1', span); }
      else if (trimmed.indexOf('TỔ CHỨC/CÁ NHÂN LẬP') >= 0) {
        const dm = /(<w:t(?:\s[^>]*)?>)Ngày\s+\d+\s+tháng\s+\d+\s+năm\s+\d+(<\/w:t>)/.exec(span);
        if (dm) map.kyNgayText = { originalXml: span, prefix: span.slice(0, dm.index + dm[1].length), suffix: span.slice(dm.index + dm[0].length - dm[2].length) };
      }
      else if (trimmed.startsWith('Số(1):')) register('soBklsLine', span);
      else if (trimmed.startsWith('Tên chủ lâm sản(4):')) register('tenChuLamSanLine', span);
      else if (trimmed.startsWith('Tên tổ chức, cá nhân(4):')) register('tenMuaLine', span);
      else if (trimmed.startsWith('Số GCN/MSDN/GPTL/ĐKHĐ/CCCD/CMND/HC(5):')) { mstOcc++; if (mstOcc === 1) register('mstChuLamSanLine', span); else if (mstOcc === 2) register('mstLine', span); }
      else if (trimmed.startsWith('Địa chỉ(6):')) { diaChiOcc++; if (diaChiOcc === 1) register('diaChiChuLamSanLine', span); else if (diaChiOcc === 2) register('diaChiLine', span); }
      else if (trimmed.startsWith('Nguồn gốc(7):')) register('nguonGocLine', span);
      else if (trimmed.startsWith('Mã HS')) register('maHsLine', span);
      else if (trimmed.startsWith('Khối lượng/trọng lượng')) register('khoiLuongLine', span);
      else if (trimmed.startsWith('Số lượng (bằng số và chữ):')) register('soLuongLine', span);
      else if (trimmed.startsWith('Thông tin vận chuyển')) register('vanChuyenLine', span);
      else if (trimmed.startsWith('Số điện thoại')) { dtOcc++; if (dtOcc === 1) register('lienHeLine', span); else if (dtOcc === 2) register('lienHeMuaLine', span); }
    }
    return map;
  }
  /** from/to (không bắt buộc): chỉ dựng xe thứ from..to-1 — dùng khi chia nhiều file; số BKLS từng xe vẫn đánh theo thứ tự toàn đợt. */
  async function docxPerVehicle(templateBuf, ctx, lot, onProgress, from, to) {
    const zip = await JSZip.loadAsync(templateBuf);
    const xmlStr = await zip.file('word/document.xml').async('string');
    const dd = splitDoc(xmlStr);
    const recordXml = compactBody(dd.body), sectPrXml = dd.sectPr, header = dd.header, footer = dd.footer;   // 1 xe = đúng 1 trang (xem compactBody)
    const rootTag = xmlStr.match(/<w:document\b[^>]*>/);
    const nsAttrs = rootTag ? rootTag[0].replace(/^<w:document\b/, '').replace(/>$/, '').trim() : 'xmlns:w="' + WNS + '"';
    const spliceMap = buildSpliceMap(recordXml, nsAttrs);
    const required = ['soBklsLine', 'tenMuaLine', 'mstLine', 'diaChiLine', 'khoiLuongLine', 'soLuongLine', 'vanChuyenLine'];
    const missing = required.filter((k) => !spliceMap[k]);
    if (missing.length) throw new Error('Không dò được cấu trúc đoạn văn trong file mẫu BKLS cho: ' + missing.join(', '));
    const count = (k) => recordXml.split(spliceMap[k].originalXml).length - 1;
    const optional = ['congTyLine1', 'congTyLine2', 'tenChuLamSanLine', 'mstChuLamSanLine', 'diaChiChuLamSanLine', 'nguonGocLine', 'maHsLine', 'lienHeLine', 'lienHeMuaLine', 'kyNgayText']
      .filter((k) => spliceMap[k] && count(k) === 1);
    const allKeys = required.concat(optional);
    for (const k of allKeys) { const c = count(k); if (c !== 1) throw new Error('Đoạn văn "' + k + '" xuất hiện ' + c + ' lần trong file mẫu (cần đúng 1 lần) — không thể ghép an toàn.'); }

    // Sang trang: gắn "pageBreakBefore" vào đoạn đầu của mỗi xe từ xe thứ 2 (không chèn thêm đoạn ngắt riêng → không phát sinh
    // dòng trống đầu trang). Đoạn đầu mẫu mà là đoạn được thay chữ / không phải đoạn văn → dùng đoạn ngắt tí hon dự phòng.
    const first = topBlocks(recordXml)[0], firstXml = first ? recordXml.slice(first.s, first.e) : '';
    const canPbb = /^<w:p\b/.test(firstXml) && !/\/>$/.test(firstXml) && !allKeys.some((k) => spliceMap[k].originalXml === firstXml);
    let recordNext = recordXml, sep = '';
    if (canPbb) {
      let p2 = firstXml;
      if (/<w:pPr>/.test(p2)) {
        const pp = p2.match(/<w:pPr>(?:\s*<w:(?:pStyle|keepNext|keepLines)\b[^>]*\/>)*/)[0];     // đúng thứ tự phần tử trong pPr
        p2 = p2.replace(pp, pp + '<w:pageBreakBefore/>');
      } else p2 = p2.replace(/^<w:p\b[^>]*>/, (o) => o + '<w:pPr><w:pageBreakBefore/></w:pPr>');
      recordNext = recordXml.slice(0, first.s) + p2 + recordXml.slice(first.e);
    } else sep = '<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="20" w:lineRule="exact"/><w:rPr><w:sz w:val="2"/></w:rPr></w:pPr><w:r><w:rPr><w:sz w:val="2"/></w:rPr><w:br w:type="page"/></w:r></w:p>';

    // Đánh số mục (1. Thông tin chủ lâm sản … 5. Hồ sơ kèm theo) BẮT ĐẦU LẠI TỪ 1 cho từng xe: mỗi xe dùng một danh sách
    // đánh số riêng (w:num mới cùng abstractNum, startOverride = 1) — trước đây xe thứ 2 ra "6. … 10.".
    const numF = zip.file('word/numbering.xml');
    let numXml = numF ? await numF.async('string') : '';
    const numIds = Array.from(new Set((recordXml.match(/<w:numId w:val="\d+"\/>/g) || []).map((x) => x.match(/\d+/)[0]))).filter((x) => x !== '0');
    const lvls = Array.from(new Set((recordXml.match(/<w:ilvl w:val="\d+"\/>/g) || []).map((x) => x.match(/\d+/)[0])));
    const absOf = {};
    numIds.forEach((id) => { const m = numXml.match(new RegExp('<w:num w:numId="' + id + '"[^>]*>[\\s\\S]*?<w:abstractNumId w:val="(\\d+)"')); if (m) absOf[id] = m[1]; });
    const renum = numXml && numIds.length && numIds.every((id) => absOf[id] !== undefined);
    let nextNum = renum ? Math.max(0, ...(numXml.match(/<w:num w:numId="\d+"/g) || []).map((x) => +x.match(/\d+/)[0])) + 1 : 0;
    const newNums = [];
    const lvlOv = lvls.map((l) => '<w:lvlOverride w:ilvl="' + l + '"><w:startOverride w:val="1"/></w:lvlOverride>').join('');

    const parts = [];
    const a = from || 0, b = to === undefined ? lot.trips.length : to, total = b - a;
    for (let i = a; i < b; i++) {
      const values = tripValues(ctx, lot, lot.trips[i], soRiengOf(lot, i));
      let rec = i === a ? recordXml : recordNext;
      for (const k of allKeys) {
        if (values[k] == null) continue;
        const sp = spliceMap[k];
        rec = rec.replace(sp.originalXml, () => sp.prefix + escapeXmlText(values[k]) + sp.suffix);
      }
      if (renum && i > a) {
        const map = {};
        numIds.forEach((id) => { map[id] = String(nextNum); newNums.push('<w:num w:numId="' + nextNum + '"><w:abstractNumId w:val="' + absOf[id] + '"/>' + lvlOv + '</w:num>'); nextNum++; });
        rec = rec.replace(/<w:numId w:val="(\d+)"\/>/g, (m, id) => (map[id] ? '<w:numId w:val="' + map[id] + '"/>' : m));
      }
      if (i > a && sep) parts.push(sep);
      parts.push(rec);
      if (onProgress && ((i - a) % 200 === 0 || i === b - 1)) onProgress(i - a + 1, total);
      if ((i - a) % 300 === 0) await tick();
    }
    let s = header + parts.join('') + END_P + sectPrXml + footer;
    parts.length = 0;
    if (!s.startsWith('<?xml')) s = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n' + s;
    zip.file('word/document.xml', s);
    if (renum && newNums.length) zip.file('word/numbering.xml', numXml.replace('</w:numbering>', newNums.join('') + '</w:numbering>'));
    // Mức nén 3 (thay vì 6): file hàng nghìn trang nén nhanh gấp ~2 lần, dung lượng chỉ lớn hơn ~20%.
    return zip.generateAsync({ type: 'blob', mimeType: DOCX_MIME, compression: 'DEFLATE', compressionOptions: { level: 3 } });
  }

  /* ================= PDF (jsPDF + Roboto) ================= */
  function registerFont(doc) {
    const A = HAK.BklsAssets;
    doc.addFileToVFS('Roboto-Regular.ttf', A.fontRegular); doc.addFont('Roboto-Regular.ttf', 'Roboto', 'normal');
    doc.addFileToVFS('Roboto-Bold.ttf', A.fontBold); doc.addFont('Roboto-Bold.ttf', 'Roboto', 'bold');
    doc.setFont('Roboto', 'normal');
  }
  /** pages = [{ values }]. 1 trang cho bản tổng; nhiều trang (mỗi xe 1 trang) cho bản từng xe. */
  async function buildPdf(snap, pages, onProgress) {
    const { jsPDF } = root.jspdf;
    const doc = new jsPDF({ unit: 'pt', format: 'a4', compress: true });
    registerFont(doc);
    const pageWidth = doc.internal.pageSize.getWidth(), pageBottomLimit = 790, marginX = 42, maxWidth = pageWidth - marginX * 2, colDividerX = marginX + maxWidth * 0.52;

    for (let idx = 0; idx < pages.length; idx++) {
      const page = pages[idx];
      if (idx > 0) doc.addPage();
      const startPage = doc.getNumberOfPages(), hoSo = page.values.hoSo;   // v2.7.1: bản tổng có liệt kê → nhiều tờ
      let y = 40;
      const newPageIfNeeded = (lh) => { if (y + lh > pageBottomLimit) { doc.addPage(); y = 40; } };
      doc.setFont('Roboto', 'normal'); doc.setFontSize(9);
      doc.text(snap.mauSo || 'Mẫu số 01. Bảng kê lâm sản', marginX, y);
      y += 14;
      const tableTop = y, innerPad = 8, rightColWidth = marginX + maxWidth - colDividerX;

      doc.setFont('Roboto', 'bold'); doc.setFontSize(10);
      const rawTenChu = stripLabelPrefix(page.values.tenChuLamSanLine) || stripLabelPrefix(snap.tenChuLamSan);
      const congTyFallback = [snap.congTyHeaderLine1, snap.congTyHeaderLine2].filter(Boolean).join(' ');
      const congTyLines = doc.splitTextToSize((rawTenChu || congTyFallback || '').toUpperCase(), colDividerX - marginX - innerPad * 2);
      congTyLines.forEach((l, i) => doc.text(l, marginX + innerPad, tableTop + 14 + i * 12));

      doc.setFont('Roboto', 'bold'); doc.setFontSize(10.5);
      const rightCenterX = colDividerX + rightColWidth / 2;
      doc.text(snap.quocHieu || 'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM', rightCenterX, tableTop + 14, { align: 'center' });
      doc.setFont('Roboto', 'normal'); doc.setFontSize(10);
      const tieuNgu = snap.tieuNgu || 'Độc lập - Tự do - Hạnh phúc';
      doc.text(tieuNgu, rightCenterX, tableTop + 28, { align: 'center' });
      const tnW = doc.getTextWidth(tieuNgu);
      doc.setLineWidth(0.6); doc.line(rightCenterX - tnW / 2, tableTop + 30, rightCenterX + tnW / 2, tableTop + 30);

      const row2Y = tableTop + Math.max(40, 16 + congTyLines.length * 12);
      doc.setFont('Roboto', 'normal'); doc.setFontSize(10);
      const soLines = doc.splitTextToSize(page.values.soBklsLine || '', maxWidth * 0.52 - innerPad * 2);
      soLines.forEach((l, i) => doc.text(l, marginX + innerPad, row2Y + 14 + i * 12));
      const toSoXY = [colDividerX + innerPad, row2Y + 14];
      if (!hoSo) doc.text(snap.toSoLine || 'Tờ số(2): 1 Tổng số tờ:1', toSoXY[0], toSoXY[1]);
      const row3Y = row2Y + Math.max(22, 8 + soLines.length * 12);

      doc.setFont('Roboto', 'bold'); doc.setFontSize(14);
      doc.text('BẢNG KÊ LÂM SẢN', marginX + maxWidth / 2, row3Y + 18, { align: 'center' });
      const tableBottom = row3Y + 26;

      const qrW = 70, qrH = 65, qrX = marginX + maxWidth - qrW, qrY = row3Y + 2;
      try {
        doc.addImage(HAK.BklsAssets.qr, 'JPEG', qrX, qrY, qrW, qrH);
        doc.setFont('Roboto', 'normal'); doc.setFontSize(7);
        doc.text('Mã QR', qrX + qrW / 2, qrY + qrH + 9, { align: 'center' });
      } catch (e) { /* bỏ qua nếu không hỗ trợ addImage */ }
      y = Math.max(tableBottom + 12, qrY + qrH + 18);

      const addLine = (text, opts) => {
        if (!text) return; opts = opts || {};
        doc.setFont('Roboto', opts.bold ? 'bold' : 'normal'); doc.setFontSize(opts.size || 10.5);
        doc.splitTextToSize(text, maxWidth).forEach((l) => { newPageIfNeeded(15); doc.text(l, marginX, y); y += 15; });
        y += opts.gapAfter || 0;
      };
      let sectionNum = 1;
      const addSection = (title) => { addLine(sectionNum + '.' + title, { bold: true }); sectionNum++; };
      const bulletIndent = 14;
      const addBullet = (text) => {
        if (!text) return;
        doc.setFont('Roboto', 'normal'); doc.setFontSize(10.5);
        doc.splitTextToSize(text, maxWidth - bulletIndent).forEach((l, i) => {
          newPageIfNeeded(15);
          if (i === 0) doc.text('-  ' + l, marginX, y); else doc.text(l, marginX + bulletIndent, y);
          y += 15;
        });
      };
      const v = page.values;
      addSection('Thông tin chủ lâm sản:');
      addBullet(v.tenChuLamSanLine || snap.tenChuLamSan);
      addBullet(v.mstChuLamSanLine || snap.mstChuLamSan);
      addBullet(v.diaChiChuLamSanLine || snap.diaChiChuLamSan);
      addBullet(v.lienHeLine || snap.lienHeChuLamSan);
      addSection('Thông tin tổ chức, cá nhân mua/nhận chuyển giao quyền sở hữu:');
      addBullet(v.tenMuaLine); addBullet(v.mstLine); addBullet(v.diaChiLine);
      const lhm = v.lienHeMuaLine || snap.lienHeMua; if (lhm) addBullet(lhm);
      addSection('Thông tin về lâm sản:');
      addBullet(snap.tenLoai); addBullet(snap.nhomLoai);
      addBullet(v.nguonGocLine || snap.nguonGoc);
      addBullet(v.maHsLine || snap.maHS);
      if (snap.giaTri) addBullet(snap.giaTri);
      addBullet(v.khoiLuongLine); addBullet(v.soLuongLine);
      if (snap.thongTinLoKhaiThac) addBullet(snap.thongTinLoKhaiThac);
      if (snap.thongTinKhac) addBullet(snap.thongTinKhac);
      if (snap.thongTinChiTiet) addSection(snap.thongTinChiTiet);
      addLine(v.vanChuyenLine);
      if (hoSo) {
        addSection(snap.hoSoKemTheo || 'Hồ sơ kèm theo (nếu có):');
        addLine(hoSo.head);
        hoSo.rows.forEach((r) => {
          if (r.k === 'day') { y += 3; addLine(r.t, { bold: true, size: 10 }); return; }
          const ind = r.k === 'dv' ? 6 : 12;                // PDF không có font nghiêng → dòng ĐVVC in thường, thụt ít hơn dòng BKLS con
          doc.setFont('Roboto', 'normal'); doc.setFontSize(9.5);
          doc.splitTextToSize(r.t, maxWidth - 24).forEach((l, i) => { newPageIfNeeded(13); doc.text(l, marginX + (i ? 24 : ind), y); y += 13; });
        });
      } else if (snap.hoSoKemTheo) addSection(snap.hoSoKemTheo);
      y += 8;
      addLine('Chúng tôi/Tôi cam kết những nội dung kê khai trong bảng kê này là đúng sự thật và chịu trách nhiệm trước pháp luật về sự trung thực của thông tin./.');
      y += 22;

      newPageIfNeeded(60);
      doc.setFont('Roboto', 'normal'); doc.setFontSize(10.5);
      const kyNoi = ((snap.kyNgayLine || '').split(',')[0] || '').trim() || 'Đà Nẵng';
      const kyNgayPdf = v.kyNgayText ? kyNoi + ', ' + v.kyNgayText : (snap.kyNgayLine || 'Đà Nẵng, ngày ..... tháng ..... năm ..........');
      doc.text(kyNgayPdf, pageWidth - marginX, y, { align: 'right' }); y += 14;
      doc.setFont('Roboto', 'bold');
      doc.text(snap.kyToChucLine || 'TỔ CHỨC/CÁ NHÂN LẬP BẢNG KÊ', pageWidth - marginX, y, { align: 'right' }); y += 13;
      doc.setFont('Roboto', 'normal'); doc.setFontSize(9);
      doc.text(snap.kyChuThichLine || '(Ký, ghi rõ họ tên, đóng dấu đối với tổ chức)', pageWidth - marginX, y, { align: 'right' });
      if (hoSo) {                                        // biết số tờ thật rồi mới ghi "Tờ số / Tổng số tờ" ở tờ đầu
        const endPage = doc.getNumberOfPages();
        doc.setPage(startPage); doc.setFont('Roboto', 'normal'); doc.setFontSize(10);
        doc.text('Tờ số(2): 1 Tổng số tờ: ' + (endPage - startPage + 1), toSoXY[0], toSoXY[1]);
        doc.setPage(endPage);
      }

      if (onProgress && (idx % 25 === 0 || idx === pages.length - 1)) onProgress(idx + 1, pages.length);
      if (idx % 40 === 0) await tick();
    }
    return doc.output('blob');
  }

  /* ================= điều phối ================= */
  /** Bản từng xe: tối đa TRIP_SPLIT_OVER xe → 1 file như cũ; nhiều hơn → chia đều thành các file ≤ TRIP_PART_SIZE xe
   *  (tránh chuỗi XML hàng trăm MB làm treo/tràn bộ nhớ trình duyệt, và file Word quá nặng không mở nổi). */
  const TRIP_SPLIT_OVER = 1500, TRIP_PART_SIZE = 1000;
  function tripRanges(n) {
    if (n <= TRIP_SPLIT_OVER) return [[0, n]];
    const parts = Math.ceil(n / TRIP_PART_SIZE), size = Math.ceil(n / parts), r = [];
    for (let a = 0; a < n; a += size) r.push([a, Math.min(n, a + size)]);
    return r;
  }
  /**
   * Sinh các bản BKLS được chọn.
   * want = { totalDocx, totalPdf, tripDocx, tripPdf } ; trả về [{ key, label, name, blob }]
   * onProgress(msg, pct)
   */
  async function generate(ctx, lot, want, baseName, onProgress) {
    await ensureAssets(!!(want.totalPdf || want.tripPdf));
    const tpl = templateBuffer(), out = [], step = onProgress || function () {};
    const n = lot.trips.length;
    const jobs = ['totalDocx', 'totalPdf', 'tripDocx', 'tripPdf'].filter((k) => want[k]);
    let done = 0;
    const pct = (frac) => ((done + frac) / jobs.length) * 100;
    if (!ctx.snapshot) ctx.snapshot = await readSnapshot(tpl);
    const tripPages = (a, b) => lot.trips.slice(a, b).map((t, j) => ({ values: tripValues(ctx, lot, t, soRiengOf(lot, a + j)) }));
    const add = (key, label, name, blob) => out.push({ key, label, name, blob });
    const ranges = tripRanges(n), split = ranges.length > 1;
    const pad = (i) => String(i + 1).padStart(Math.max(2, String(ranges.length).length), '0');
    const partLabel = (pi, a, b) => split ? ' — phần ' + (pi + 1) + '/' + ranges.length + ': xe ' + (a + 1) + '–' + b : ' — ' + n + ' trang';
    const partName = (pi, ext) => baseName + '_tung_xe' + (split ? '_phan' + pad(pi) : '') + ext;
    if (want.totalDocx) { step('BKLS tổng (Word)…', pct(0)); add('totalDocx', 'BKLS TỔNG (Word)', baseName + '_tong.docx', await docxTotal(tpl, ctx, lot)); done++; }
    if (want.totalPdf) { step('BKLS tổng (PDF)…', pct(0)); add('totalPdf', 'BKLS TỔNG (PDF)', baseName + '_tong.pdf', await buildPdf(ctx.snapshot, [{ values: aggregateValues(ctx, lot) }])); done++; }
    if (want.tripDocx) {
      for (let pi = 0; pi < ranges.length; pi++) {
        const [a, b] = ranges[pi], tag = split ? ' phần ' + (pi + 1) + '/' + ranges.length : '';
        add('tripDocx', 'BKLS TỪNG XE' + partLabel(pi, a, b) + ' (Word)', partName(pi, '.docx'),
          await docxPerVehicle(tpl, ctx, lot, (d, t) => step('BKLS từng xe (Word)' + tag + ' ' + (a + d) + '/' + n + '…', pct((pi + d / t) / ranges.length)), a, b));
      }
      done++;
    }
    if (want.tripPdf) {
      for (let pi = 0; pi < ranges.length; pi++) {
        const [a, b] = ranges[pi], tag = split ? ' phần ' + (pi + 1) + '/' + ranges.length : '';
        add('tripPdf', 'BKLS TỪNG XE' + partLabel(pi, a, b) + ' (PDF)', partName(pi, '.pdf'),
          await buildPdf(ctx.snapshot, tripPages(a, b), (d, t) => step('BKLS từng xe (PDF)' + tag + ' ' + (a + d) + '/' + n + '…', pct((pi + d / t) / ranges.length))));
      }
      done++;
    }
    step('Xong', 100);
    return out;
  }

  HAK.Bkls = {
    ensureAssets, readSnapshot, generate, aggregateValues, tripValues, docxTotal, docxPerVehicle, buildPdf,
    /** Số BKLS riêng của xe thứ i (0-based) trong bộ số `soBkls` — đúng số in trên bản từng xe (báo cáo Xuất hàng dùng lại). */
    tripNo: (soBkls, i) => soRiengOf({ soBkls }, i),
    soThanhChu, formatSoVN, parseDMY, splitCongTyHeader, stripLabelPrefix, templateBuffer, tripRanges, TRIP_SPLIT_OVER, TRIP_PART_SIZE,
    DEFAULT_NGUON_GOC: 'Dăm gỗ keo sản xuất từ nguyên liệu gỗ keo rừng trồng mua từ cá nhân và hộ gia đình',   // v2.7.1 — giữ đồng bộ với NGUON_GOC_DEF (pages.js)
    DEFAULT_HE_SO: 0.468
  };
})(window);
