/**
 * exporter.js — Kết xuất Excel "file cân lưu trữ" (ExcelJS: có định dạng, công thức =SUM, cố định dòng tiêu đề, in ngang A4).
 *
 * Nhận `res.excel` do generator.js dựng sẵn (không tự tính nghiệp vụ):
 *   { kind:'A'|'B', fileName, title, lines:[..], totalLabel, rows:[..], sign:{left,right}, station, summary, note, split }
 *   rows[i] = { ticket, time1, time2, plate, tare, gross, net, carrier, driver, wh }   (khối lượng là SỐ, kg)
 *
 * Kiểu A — "Bảng chi tiết cân hàng" (Trung chuyển gửi kho / Trao đổi / Điều chuyển): 1 sheet, 10 cột, chữ ký 2 bên.
 * Kiểu B — "Phiếu cân" (Xuất hàng kho gửi / Ủy thác): sheet tổng "Phiếu cân" (+ 1 sheet cho mỗi kho nếu cột Kho có ≥ 2 giá trị).
 *
 * Không phụ thuộc DOM ngoài việc tải file → chạy được trong Node để kiểm thử (truyền ExcelJS qua root.ExcelJS).
 */
(function (root) {
  'use strict';
  const HAK = (root.HAK = root.HAK || {});
  const X = () => root.ExcelJS || (typeof require === 'function' ? require('exceljs') : null);

  const thin = { style: 'thin', color: { argb: 'FF808080' } };
  const BORDER = { top: thin, left: thin, bottom: thin, right: thin };
  const DOUBLE = { style: 'double', color: { argb: 'FF808080' } };
  const fill = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
  const NF = '#,##0';

  /** Tên sheet hợp lệ: ≤ 31 ký tự, không có \ / ? * [ ] : và không trùng. */
  function sheetName(wb, s) {
    let n = String(s || 'Sheet').replace(/[\\\/?*\[\]:]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 31) || 'Sheet';
    let k = 2, base = n;
    while (wb.getWorksheet(n)) n = base.slice(0, 31 - String(k).length - 1) + ' ' + (k++);
    return n;
  }
  const sum = (rows, k) => rows.reduce((a, r) => a + (+r[k] || 0), 0);
  const fmtTonVN = (kg) => HAK.Generator ? HAK.Generator.fmtTon(kg) : String(Math.round(kg / 10) / 100);
  /** Độ rộng cột theo nội dung dài nhất (giới hạn min–max). */
  const widthOf = (rows, k, min, max, head) => Math.max(min, Math.min(max, Math.max(String(head || '').length, ...rows.map((r) => String(r[k] || '').length)) + 3));

  function pageSetup(ws, headRow, lastCol) {
    ws.pageSetup = { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, horizontalCentered: true,
      margins: { left: 0.4, right: 0.4, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 } };
    if (headRow) ws.pageSetup.printTitlesRow = headRow + ':' + headRow;
    ws.headerFooter = { oddFooter: '&C&"Times New Roman,Italic"&9Trang &P / &N' };
    ws.views = [{ state: 'frozen', ySplit: headRow, showGridLines: true }];
  }

  /* ---------------------------------------------------------------
   * Kiểu A — Bảng chi tiết cân hàng
   * ------------------------------------------------------------- */
  function sheetA(wb, spec) {
    const ws = wb.addWorksheet(sheetName(wb, 'Chi tiết cân hàng'));
    const F = 'Times New Roman', rows = spec.rows, lines = (spec.lines || []).filter(Boolean);
    const cols = ['STT', 'Số phiếu', 'Ngày giờ cân 1', 'Ngày giờ cân 2', 'Biển số', 'Cân lần 1 (kg)', 'Cân lần 2 (kg)', 'KL Hàng (kg)', 'Đơn vị vận chuyển', 'Tài xế / Khách hàng'];
    const widths = [6, widthOf(rows, 'ticket', 14, 22, 'Số phiếu'), 19, 19, 13, 14, 14, 14, widthOf(rows, 'carrier', 18, 44, cols[8]), widthOf(rows, 'driver', 20, 32, cols[9])];
    ws.columns = widths.map((w) => ({ width: w }));

    let r = 1;
    ws.mergeCells(r, 1, r, 10);
    Object.assign(ws.getCell(r, 1), { value: spec.title, font: { name: F, size: 13, bold: true }, alignment: { horizontal: 'center', vertical: 'middle' } });
    ws.getRow(r).height = 20; r++;
    lines.forEach((t) => {
      ws.mergeCells(r, 1, r, 10);
      Object.assign(ws.getCell(r, 1), { value: t, font: { name: F, size: 10, italic: true }, alignment: { horizontal: 'left', vertical: 'middle', wrapText: true } });
      ws.getRow(r).height = t.length > 170 ? 28 : 16; r++;
    });
    r++;                                                     // dòng trống
    const head = r;
    cols.forEach((t, i) => Object.assign(ws.getCell(r, i + 1), { value: t, font: { name: F, size: 11, bold: true }, fill: fill('FFD9E2F3'), border: BORDER, alignment: { horizontal: 'center', vertical: 'middle', wrapText: true } }));
    ws.getRow(r).height = 27; r++;

    const first = r;
    const shortCode = rows.every((x) => String(x.carrier || '').length <= 8);   // mã ngắn (HAK / ĐH / QC …) → căn giữa
    const S = {                                              // style dùng chung (không tạo object mới mỗi ô)
      c: { font: { name: F, size: 10 }, border: BORDER, alignment: { horizontal: 'center', vertical: 'middle' } },
      n: { font: { name: F, size: 10 }, border: BORDER, alignment: { horizontal: 'right', vertical: 'middle' }, numFmt: NF },
      l: { font: { name: F, size: 10 }, border: BORDER, alignment: { horizontal: 'left', vertical: 'middle' } }
    };
    const put = (row, c, v, s) => { const cell = row.getCell(c); cell.value = v; cell.font = s.font; cell.border = s.border; cell.alignment = s.alignment; if (s.numFmt) cell.numFmt = s.numFmt; };
    rows.forEach((x, i) => {
      const row = ws.getRow(r++);
      put(row, 1, i + 1, S.c); put(row, 2, x.ticket, S.c); put(row, 3, x.time1, S.c); put(row, 4, x.time2, S.c); put(row, 5, x.plate, S.c);
      put(row, 6, x.tare, S.n); put(row, 7, x.gross, S.n); put(row, 8, x.net, S.n); put(row, 9, x.carrier, shortCode ? S.c : S.l); put(row, 10, x.driver, S.l);
    });
    const last = r - 1;
    // dòng tổng cộng: =SUM(H..) kèm giá trị đã tính sẵn (để trình xem không tính công thức vẫn thấy số)
    ws.mergeCells(r, 1, r, 7);
    const tot = { font: { name: F, size: 11, bold: true }, fill: fill('FFFFE699'), border: BORDER };
    for (let c = 1; c <= 10; c++) Object.assign(ws.getCell(r, c), tot);
    Object.assign(ws.getCell(r, 1), { value: spec.totalLabel || 'TỔNG CỘNG:', alignment: { horizontal: 'right', vertical: 'middle' } });
    Object.assign(ws.getCell(r, 8), { value: { formula: 'SUM(H' + first + ':H' + last + ')', result: sum(rows, 'net') }, numFmt: NF, alignment: { horizontal: 'right', vertical: 'middle' } });
    ws.getRow(r).height = 18;
    r += 3;
    if (spec.sign) {
      const s = spec.sign;
      Object.assign(ws.getCell(r, 1), { value: s.left && s.left.title, font: { name: F, size: 11, bold: true } });
      Object.assign(ws.getCell(r, 7), { value: s.right && s.right.title, font: { name: F, size: 11, bold: true } });
      r++;
      Object.assign(ws.getCell(r, 1), { value: s.left && s.left.org, font: { name: F, size: 10, italic: true } });
      Object.assign(ws.getCell(r, 7), { value: s.right && s.right.org, font: { name: F, size: 10, italic: true } });
    }
    pageSetup(ws, head, 10);
    return ws;
  }

  /* ---------------------------------------------------------------
   * Kiểu B — Phiếu cân (sheet tổng + sheet theo kho)
   * ------------------------------------------------------------- */
  function sheetB(wb, name, o) {
    // o: { title, station, note, rows, withWh, totalLabel, summaryColor }
    const ws = wb.addWorksheet(sheetName(wb, name));
    const F = 'Arial', rows = o.rows, withWh = o.withWh;
    const cols = withWh
      ? ['Số phiếu', 'Nơi cân', 'Ngày giờ cân 1', 'Ngày giờ cân 2', 'Biển số', 'Đơn vị vận chuyển', 'Cân lần 1 (kg)', 'Cân lần 2 (kg)', 'KL Hàng (kg)']
      : ['Số phiếu', 'Ngày giờ cân 1', 'Ngày giờ cân 2', 'Biển số', 'Đơn vị vận chuyển', 'Cân lần 1 (kg)', 'Cân lần 2 (kg)', 'KL Hàng (kg)'];
    const n = cols.length;
    const widths = withWh
      ? [widthOf(rows, 'ticket', 16, 22, cols[0]), widthOf(rows, 'wh', 12, 28, cols[1]), 20, 20, 12, widthOf(rows, 'carrier', 16, 44, cols[5]), 14, 14, 14]
      : [widthOf(rows, 'ticket', 16, 22, cols[0]), 20, 20, 12, widthOf(rows, 'carrier', 16, 44, cols[4]), 14, 14, 14];
    ws.columns = widths.map((w) => ({ width: w }));
    const mergeTo = withWh ? 8 : 7;

    let r = 1;
    ws.mergeCells(r, 1, r, mergeTo);
    Object.assign(ws.getCell(r, 1), { value: o.title, font: { name: F, size: 13, bold: true }, alignment: { vertical: 'middle' } });
    ws.getRow(r).height = 20; r++;
    if (o.station) {
      ws.mergeCells(r, 1, r, mergeTo);
      Object.assign(ws.getCell(r, 1), { value: o.station, font: { name: F, size: 10, bold: true } }); r++;
    }
    ws.mergeCells(r, 1, r, mergeTo);
    Object.assign(ws.getCell(r, 1), { value: o.note, font: { name: F, size: 9, italic: true, color: { argb: 'FF555555' } }, alignment: { wrapText: true, vertical: 'top' } });
    ws.getRow(r).height = (o.note || '').length > 120 ? 26 : 15; r++;
    r++;
    const head = r;
    cols.forEach((t, i) => Object.assign(ws.getCell(r, i + 1), { value: t, font: { name: F, size: 10, bold: true, color: { argb: 'FFFFFFFF' } }, fill: fill('FF1F4E78'), border: BORDER, alignment: { horizontal: 'center', vertical: 'middle', wrapText: true } }));
    ws.getRow(r).height = 24; r++;
    const first = r;
    const T = { font: { name: F, size: 9 }, border: BORDER, alignment: { horizontal: 'left', vertical: 'middle' } };
    const C = { font: { name: F, size: 9 }, border: BORDER, alignment: { horizontal: 'center', vertical: 'middle' } };
    const N = { font: { name: F, size: 9 }, border: BORDER, alignment: { horizontal: 'right', vertical: 'middle' }, numFmt: NF };
    const put = (row, c, v, s) => { const cell = row.getCell(c); cell.value = v; cell.font = s.font; cell.border = s.border; cell.alignment = s.alignment; if (s.numFmt) cell.numFmt = s.numFmt; };
    rows.forEach((x) => {
      const row = ws.getRow(r++);
      let c = 1;
      put(row, c++, x.ticket, T);
      if (withWh) put(row, c++, x.wh, C);
      put(row, c++, x.time1, T); put(row, c++, x.time2, T); put(row, c++, x.plate, T); put(row, c++, x.carrier, T);
      put(row, c++, x.tare, N); put(row, c++, x.gross, N); put(row, c++, x.net, N);
    });
    const last = r - 1;
    const tot = { font: { name: F, size: 9, bold: true }, fill: fill('FFD9E2F3'), border: { top: DOUBLE, bottom: DOUBLE, left: thin, right: thin } };
    for (let c = 1; c <= n; c++) Object.assign(ws.getCell(r, c), tot);
    ws.getCell(r, 1).value = 'TỔNG CỘNG';
    const L = String.fromCharCode(64 + n);
    Object.assign(ws.getCell(r, n), { value: { formula: 'SUM(' + L + first + ':' + L + last + ')', result: sum(rows, 'net') }, numFmt: NF, alignment: { horizontal: 'right' } });
    ws.getRow(r).height = 16;
    pageSetup(ws, head, n);
    return ws;
  }

  /** Sheet "Theo ngày" (Xuất khẩu): ngày · số xe · qua cân · xe trả về · thực xuất (kg), dòng tổng =SUM. */
  function dailySheet(wb, spec) {
    const ws = wb.addWorksheet(sheetName(wb, 'Theo ngày')), F = 'Arial', d = spec.daily;
    ws.columns = [14, 10, 18, 18, 18].map((w) => ({ width: w }));
    ws.mergeCells(1, 1, 1, 5); Object.assign(ws.getCell(1, 1), { value: 'TỔNG HỢP KHỐI LƯỢNG THEO NGÀY — ' + (spec.title || '').replace(/^.*?- /, ''), font: { name: F, size: 13, bold: true } });
    ws.getRow(1).height = 20;
    ['Ngày', 'Số xe', 'Qua cân (kg)', 'Xe trả về (kg)', 'Thực xuất (kg)'].forEach((t, i) => Object.assign(ws.getCell(3, i + 1), { value: t, font: { name: F, size: 10, bold: true, color: { argb: 'FFFFFFFF' } }, fill: fill('FF1F4E78'), border: BORDER, alignment: { horizontal: 'center', vertical: 'middle', wrapText: true } }));
    ws.getRow(3).height = 24;
    d.forEach((x, i) => [x.date, x.trips, x.kg, x.retKg, x.delKg].forEach((v, c) => {
      const cell = ws.getCell(4 + i, c + 1); cell.value = v; cell.border = BORDER; cell.font = { name: F, size: 9 };
      if (c > 0) { cell.numFmt = NF; cell.alignment = { horizontal: 'right' }; }
    }));
    const r = 4 + d.length, last = r - 1;
    for (let c = 1; c <= 5; c++) Object.assign(ws.getCell(r, c), { font: { name: F, size: 9, bold: true }, fill: fill('FFD9E2F3'), border: { top: DOUBLE, bottom: DOUBLE, left: thin, right: thin } });
    ws.getCell(r, 1).value = 'TỔNG CỘNG';
    ['B', 'C', 'D', 'E'].forEach((L, i) => Object.assign(ws.getCell(r, i + 2), { value: { formula: 'SUM(' + L + '4:' + L + last + ')', result: d.reduce((a, x) => a + x[['trips', 'kg', 'retKg', 'delKg'][i]], 0) }, numFmt: NF, alignment: { horizontal: 'right' } }));
    ws.pageSetup = { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: '3:3' };
    ws.views = [{ state: 'frozen', ySplit: 3 }];
  }

  function sheetsB(wb, spec) {
    const rows = spec.rows, kg = sum(rows, 'net');
    const note = (rows.length + ' phiếu - ' + fmtTonVN(kg) + ' tấn' + (spec.note ? ' - ' + spec.note : ''));
    // Nhóm theo kho (cột "Kho" của Excel). Chỉ tách sheet khi có ≥ 2 kho khác nhau và mọi dòng đều có kho.
    const groups = new Map();
    rows.forEach((x) => { const k = x.whSrc || ''; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(x); });
    const split = spec.split !== false && groups.size >= 2 && !groups.has('');
    sheetB(wb, 'Phiếu cân', { title: spec.title, station: spec.station, note, rows, withWh: true });
    if (split) {
      groups.forEach((list, k) => {
        const g = sum(list, 'net');
        sheetB(wb, 'Xuất kho ' + k, {
          title: (spec.title || '').replace(/^BẢNG\s+/i, '').replace(/^CHI TIẾT CÂN/i, 'CHI TIẾT PHIẾU CÂN') + ' (KHO ' + k.toUpperCase() + ')',
          note: list.length + ' phiếu - ' + fmtTonVN(g) + ' tấn - Kho ' + k + (spec.note ? ' - ' + spec.note : ''),
          rows: list, withWh: false
        });
      });
    }
    let n = split ? groups.size + 1 : 1;
    if (spec.daily && spec.daily.length) { dailySheet(wb, spec); n++; }
    return n;
  }

  /* ---------------------------------------------------------------
   * API
   * ------------------------------------------------------------- */
  function build(spec) {
    const E = X();
    if (!E) throw new Error('Thư viện ExcelJS chưa được nạp (libs/exceljs.min.js).');
    const wb = new E.Workbook();
    wb.creator = 'QUẢN LÝ XUẤT HÀNG'; wb.created = new Date();
    const sheets = spec.kind === 'B' ? sheetsB(wb, spec) : (sheetA(wb, spec), 1);
    return { workbook: wb, sheets };
  }
  /** Ghi ra Buffer/ArrayBuffer (Node: Buffer; trình duyệt: ArrayBuffer). */
  async function toBuffer(spec) {
    if (!X() && HAK.UI && HAK.UI.needLib) await HAK.UI.needLib('exceljs');   // trình duyệt: ExcelJS nạp khi cần
    const b = build(spec); return { buffer: await b.workbook.xlsx.writeBuffer(), sheets: b.sheets };
  }

  /** Trình duyệt: dựng + tải file .xlsx */
  async function download(spec) {
    const out = await toBuffer(spec);
    const blob = new Blob([out.buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    HAK.Word.Files.saveBlob(blob, spec.fileName);
    return { name: spec.fileName, sheets: out.sheets, rows: spec.rows.length };
  }

  HAK.Exporter = { build, toBuffer, download };
  if (typeof module !== 'undefined' && module.exports) module.exports = HAK.Exporter;
})(typeof window !== 'undefined' ? window : globalThis);
