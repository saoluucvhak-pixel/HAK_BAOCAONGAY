/**
 * Xuất Excel (ExcelJS): từng báo cáo + các nút "Xuất tất cả" (tháng/ngày/lâm sản/ngân hàng).
 *
 * [Phase 4.2 — 2026-10-06] Tách NGUYÊN VĂN từ legacy-app.js (không đổi logic) để mỗi file < 800
 * dòng, dễ đọc/bảo trì. Kiểm chứng: `npm run test:export-golden` (36 file xuất khớp từng ô/chữ)
 * + toàn bộ bộ test. Import vòng với legacy-app.js (RESULTS/runReport) an toàn — chỉ dùng bên
 * trong hàm xử lý sự kiện, không dùng lúc nạp module (xem ARCHITECTURE.md).
 * @module services/export/excel-export
 */
import { fmtCell } from '../../components/report-table.js';
import { CONFIG } from '../../config/config.js';
import { BRAND, OUTER_BORDER_STYLE, THIN_BORDER } from '../../constants/brand.js';
import { CONGNO_COLS, HOAHONG_COLS, HOTRO_COLS, NHAPKEO_COLS, THANHTOAN_COLS, TONGHOPTRO_COLS, TROGIA_COLS, XECHO_COLS } from '../../constants/columns.js';
import { libs } from '../export-libs.js';
import { computeCongNo, computeHoTroOrTroGia, computeHoaHongDL, computeNhapKeo, computeThanhToan, computeTongHopHoTro, computeTongHopNgay, computeXeCho1h, sumCols } from '../report-service.js';
import { STATE, TABLES } from '../../store/state.js';
import { dateKeyToday, fmtDate, fmtTime, pad2, toExcelDate, toKeyFromInput } from '../../utils/date-utils.js';
import { alignOf } from '../../utils/hak-format.js';
import { $, downloadBlob } from '../../utils/dom-utils.js';
import { RESULTS } from '../../legacy-app.js';
import { companyNameFor, ddmmyyyy, reportDateLabel, reportTitle, unitNote } from './report-meta.js';

/* Dựng 1 sheet Excel (ExcelJS) theo đúng bố cục mẫu, có định dạng: tên công ty / tiêu đề / ngày /
   tiêu đề cột in đậm có nền / số có định dạng phân cách nghìn / viền ô / dòng Tổng cộng in đậm / độ rộng cột hợp lý */
/* Bảng màu thương hiệu dùng chung cho Excel + PDF, để hai bản xuất đồng bộ phong cách */
/* Độ rộng cột: ưu tiên độ dài tiêu đề + dữ liệu thực tế (trong giới hạn min/max theo kiểu dữ liệu),
   thay vì gán cố định theo kiểu — để cột không bị cắt chữ hoặc thừa khoảng trắng. */
function psColWidth(type, headerText, rows, key){
  var minW, maxW;
  switch(type){
    case 'int': minW=8; maxW=11; break;
    case 'money': minW=13; maxW=18; break;
    case 'kl': minW=11; maxW=15; break;
    case 'date': minW=11; maxW=13; break;
    case 'time': minW=9; maxW=10; break;
    case 'datekey': minW=11; maxW=13; break;
    default: minW=12; maxW=32; break;
  }
  var longest = (headerText||'').length;
  (rows||[]).forEach(function(r){
    var v = r[key];
    var s = (v==null) ? '' : (type==='money'||type==='kl') ? fmtCell(v,type) : (type==='date') ? fmtDate(v) : (type==='time') ? fmtTime(v) : (type==='datekey') ? fmtCell(v,'datekey') : String(v);
    if (s.length > longest) longest = s.length;
  });
  return Math.max(minW, Math.min(maxW, longest + 2));
}
function buildWorksheet(workbook, key, sheetName){
  var st = TABLES[key];
  if (!st) return;
  buildWorksheetCore(workbook, st.cols, st.view || st.rows || [], st.totals, sheetName||key, companyNameFor(key), reportTitle(key), reportDateLabel());
}
/**
 * [2026-09-22] Tách phần thân của buildWorksheet() cũ ra hàm riêng, nhận cols/rows/totals/
 * tiêu đề/ngày TRỰC TIẾP qua tham số (không đọc từ TABLES[key]/DOM nữa) — để dùng lại được cho
 * việc xuất "Báo cáo ngày" (tính lại dữ liệu riêng theo "Đến ngày", KHÔNG được đụng vào
 * TABLES/RESULTS đang hiển thị trên màn hình "Báo cáo tháng"). Logic vẽ sheet GIỮ NGUYÊN 100%
 * so với bản gốc — chỉ đổi cách lấy input (tham số thay vì TABLES[key]/document.querySelector).
 */
function buildWorksheetCore(workbook, cols, rows, totals, sheetName, companyName, title, dateLabel){
  var ncols = cols.length;
  var ws = workbook.addWorksheet((sheetName).slice(0,31), {
    views: [{ state:'frozen', ySplit:5, showGridLines:false }],
    pageSetup: { orientation:'landscape', fitToPage:true, fitToWidth:1, fitToHeight:0,
      margins:{ left:0.3, right:0.3, top:0.4, bottom:0.4, header:0.2, footer:0.2 },
      printTitlesRow: '5:5' }
  });

  ws.mergeCells(1,1,1,ncols);
  var c1 = ws.getCell(1,1); c1.value = companyName; c1.font = { bold:true, size:14, color:{argb:BRAND.headerFillARGB} };
  ws.mergeCells(2,1,2,ncols);
  var c2 = ws.getCell(2,1); c2.value = title; c2.font = { bold:true, size:13 }; c2.alignment = { horizontal:'center' };
  ws.mergeCells(3,1,3,ncols);
  var c3 = ws.getCell(3,1); c3.value = dateLabel + unitNote(cols, dateLabel); c3.font = { size:10, italic:true, color:{argb:'FF555555'} }; c3.alignment = { horizontal:'center' };
  ws.getRow(1).height = 20; ws.getRow(2).height = 18;
  // đường kẻ mảnh dưới khối tiêu đề để tách biệt với bảng dữ liệu
  for (var ci=1; ci<=ncols; ci++){ ws.getCell(4,ci).border = { bottom:{style:'thin', color:{argb:BRAND.lineARGB}} }; }

  var headerRowIdx = 5;
  var headerRow = ws.getRow(headerRowIdx);
  cols.forEach(function(c,i){
    var cell = headerRow.getCell(i+1);
    cell.value = c[1];
    cell.font = { bold:true, color:{argb:BRAND.headerTextARGB} };
    cell.fill = { type:'pattern', pattern:'solid', fgColor:{ argb:BRAND.headerFillARGB }, bgColor:{ argb:BRAND.headerFillARGB } };
    cell.border = THIN_BORDER;
    cell.alignment = { vertical:'middle', horizontal: alignOf(c[2]), wrapText:true };
  });
  headerRow.height = 30;
  headerRow.commit();

  rows.forEach(function(r, ridx){
    var row = ws.getRow(headerRowIdx+1+ridx);
    var isZebra = (ridx % 2 === 1);
    cols.forEach(function(c,i){
      var isNum = (c[2]==='money'||c[2]==='kl'||c[2]==='int');
      var cell = row.getCell(i+1);
      var v = r[c[0]];
      if (i === 0 && r._label){
        cell.value = r._label; cell.font = { italic:true }; // dòng "Số dư đầu kỳ"
      } else if (isNum){
        cell.value = (v==null||isNaN(v)) ? null : v;
        cell.numFmt = c[2]==='kl' ? '#,##0.00' : '#,##0';
        cell.alignment = { horizontal:'right' };
      } else if (c[2]==='date'){
        // [CHUẨN HAK] Ô ngày là NGÀY THẬT của Excel (lọc/sắp xếp/tính được), hiển thị dd/mm/yyyy.
        cell.value = toExcelDate(v);
        cell.numFmt = 'dd/mm/yyyy';
        cell.alignment = { horizontal:'center' };
      } else if (c[2]==='time'){
        cell.value = fmtTime(v);
        cell.alignment = { horizontal:'center' };
      } else if (c[2]==='datekey'){
        cell.value = toExcelDate(v == null ? null : String(v).replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3'));
        cell.numFmt = 'dd/mm/yyyy';
        cell.alignment = { horizontal:'center' };
      } else {
        cell.value = v==null ? '' : v;
        cell.alignment = { vertical:'middle' };
      }
      cell.border = THIN_BORDER;
      if (isZebra) cell.fill = { type:'pattern', pattern:'solid', fgColor:{ argb:BRAND.zebraFillARGB }, bgColor:{ argb:BRAND.zebraFillARGB } };
    });
    row.commit();
  });

  if (totals){
    var totalRow = ws.getRow(headerRowIdx+1+rows.length);
    cols.forEach(function(c,i){
      var cell = totalRow.getCell(i+1);
      if (i===0){ cell.value = 'Tổng cộng'; }
      else if (totals.hasOwnProperty(c[0])){
        cell.value = totals[c[0]];
        cell.numFmt = c[2]==='kl' ? '#,##0.00' : '#,##0';
        cell.alignment = { horizontal:'right' };
      }
      cell.font = { bold:true };
      cell.fill = { type:'pattern', pattern:'solid', fgColor:{ argb:BRAND.totalFillARGB }, bgColor:{ argb:BRAND.totalFillARGB } };
      cell.border = { top:{style:'double', color:{argb:BRAND.headerFillARGB}}, bottom:{style:'thin'}, left:{style:'thin'}, right:{style:'thin'} };
    });
    totalRow.commit();
  }

  // viền ngoài đậm quanh toàn bộ bảng (từ dòng tiêu đề cột đến dòng cuối) cho cảm giác 1 khối bảng rõ ràng
  var lastRowIdx = headerRowIdx + rows.length + (totals?1:0);
  for (var ci=1; ci<=ncols; ci++){
    var topCell = ws.getCell(headerRowIdx, ci); topCell.border = Object.assign({}, topCell.border, { top:{style:OUTER_BORDER_STYLE, color:{argb:BRAND.headerFillARGB}} });
    var botCell = ws.getCell(lastRowIdx, ci); botCell.border = Object.assign({}, botCell.border, { bottom:{style:OUTER_BORDER_STYLE, color:{argb:BRAND.headerFillARGB}} });
  }
  for (var ri=headerRowIdx; ri<=lastRowIdx; ri++){
    var leftCell = ws.getCell(ri,1); leftCell.border = Object.assign({}, leftCell.border, { left:{style:OUTER_BORDER_STYLE, color:{argb:BRAND.headerFillARGB}} });
    var rightCell = ws.getCell(ri,ncols); rightCell.border = Object.assign({}, rightCell.border, { right:{style:OUTER_BORDER_STYLE, color:{argb:BRAND.headerFillARGB}} });
  }

  ws.autoFilter = { from:{row:headerRowIdx, column:1}, to:{row:headerRowIdx, column:ncols} };
  cols.forEach(function(c,i){ ws.getColumn(i+1).width = psColWidth(c[2], c[1], rows, c[0]); });
}
export async function exportExcel(key){
  var st = TABLES[key];
  if (!st){ return; }
  var workbook = new libs.ExcelJS.Workbook();
  buildWorksheet(workbook, key, key);
  var buf = await workbook.xlsx.writeBuffer();
  var blob = new Blob([buf], { type:'application/octet-stream' });
  var d = new Date();
  downloadBlob(blob, 'BaoCaoNgay_' + d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate()) + '_' + key + '.xlsx');
}
/* "Xuất tất cả" của mục Báo cáo tổng hợp — chỉ gồm 9 báo cáo gỗ keo (không gồm BKLS lâm sản,
   vì BKLS có nút "Xuất tất cả" riêng ngay trong mục Tổng hợp lâm sản — xem exportLamSanExcel()). */
export async function exportAllExcel(){
  if (!RESULTS){ alert('Chưa có dữ liệu báo cáo. Hãy bấm LẬP BÁO CÁO trước.'); return; }
  var workbook = new libs.ExcelJS.Workbook();
  var sheets = [
    ['nhapkeo', 'BK_NHAPKEO'], ['thanhtoan', 'BK_TTTKEO'], ['congno', 'BC_CONGNO'],
    ['xecho', 'BK_NHAPKEO_1H'], ['tonghop', 'TH_NXT'], ['hotro', 'BK_TIENHT'],
    ['trogia', 'BK_TROGIA'], ['tonghoptro', 'TH_TIENHOTRO'], ['hoahong', 'TH_HHDL']
  ];
  sheets.forEach(function(s){
    var key = s[0], sheetName = s[1];
    var st = TABLES[key];
    if (!st || !st.view) return;
    buildWorksheet(workbook, key, sheetName);
  });
  var buf = await workbook.xlsx.writeBuffer();
  var blob = new Blob([buf], { type:'application/octet-stream' });
  var d = new Date();
  downloadBlob(blob, 'BaoCaoNgay_' + d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate()) + '_TatCa.xlsx');
}
/**
 * [2026-09-22] "Báo cáo ngày" — file Excel THỨ 2 xuất kèm khi bấm "Xuất tất cả Excel" (theo yêu
 * cầu người dùng: tách "Xuất tất cả Excel" thành 2 file — "Báo cáo tháng" ở trên, GIỮ NGUYÊN
 * không đổi; và "Báo cáo ngày" ở đây, MỚI). Tính lại đúng 9 báo cáo gỗ keo giống hệt
 * exportAllExcel() ở trên, nhưng CHỈ lấy dữ liệu ĐẾN "Đến ngày" (coi như 1 ngày báo cáo —
 * fromKey=toKey=Đến ngày), khớp đúng cấu trúc "bản mẫu" (file Excel đối chiếu người dùng gửi:
 * BK_NHAPKEO/BK_TTTKEO/... là snapshot 1 ngày). RIÊNG "Tổng hợp Nhập/Thanh toán" vẫn giữ đúng
 * khoảng Từ ngày→Đến ngày như báo cáo tháng (theo đúng yêu cầu, và đúng bản mẫu:
 * TH_NHAPXUAT_THANHTOAN có nhiều ngày, không phải snapshot 1 ngày).
 *
 * Tính HOÀN TOÀN RIÊNG bằng compute*() thuần, không đụng STATE.filtered/TABLES/RESULTS đang
 * hiển thị trên màn hình (Báo cáo tháng) — bấm xuất Excel không làm đổi gì trên giao diện.
 */
export async function exportNgayExcel(){
  if (!RESULTS || !STATE.filtered){ return; }
  var ctx = STATE.filtered;
  var fromKey = toKeyFromInput($('#fFrom').value);
  var toKey = toKeyFromInput($('#fTo').value);
  var denKey = toKey != null ? toKey : (fromKey != null ? fromKey : dateKeyToday());
  var denISO = $('#fTo').value || $('#fFrom').value || (function(){ var d = new Date(); return d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate()); })();
  var ngayLabel = 'Ngày ' + ddmmyyyy(denISO);

  var nhap = computeNhapKeo(ctx.phieucan, denKey, denKey);
  var xecho = computeXeCho1h(nhap.rows);
  var tt = computeThanhToan(ctx.dntt, ctx.phieucanBySoCT, denKey, denKey);
  var congno = computeCongNo(ctx.phieucan, ctx.dnttBySoCT, denKey);
  var hotro = computeHoTroOrTroGia(ctx.phieucan, STATE.dmht, denKey, denKey, 'Cuối tháng', 'Tiền hỗ trợ');
  var trogia = computeHoTroOrTroGia(ctx.phieucan, STATE.dmht, denKey, denKey, 'Khi thanh toán', 'Tiền trợ giá');
  var tonghoptro = computeTongHopHoTro(hotro.rows);
  var hoahong = computeHoaHongDL(ctx.dntt, ctx.phieucanBySoCT, STATE.dmdl, denKey, denKey);
  // Tổng hợp Nhập/Thanh toán: KHÔNG rút về 1 ngày — giữ đúng khoảng Từ ngày→Đến ngày.
  var tonghop = computeTongHopNgay(ctx.phieucan, ctx.dntt, ctx.phieucanBySoCT, fromKey, toKey);

  var workbook = new libs.ExcelJS.Workbook();
  var company = CONFIG.TEN_CONG_TY;
  var sheets = [
    ['nhapkeo', 'BK_NHAPKEO', NHAPKEO_COLS, nhap.rows, { 'KL hàng (KG)': nhap.totalKL, 'Thành tiền': nhap.totalTien }, ngayLabel],
    ['thanhtoan', 'BK_TTTKEO', THANHTOAN_COLS, tt.rows, { 'Khối lượng': tt.totalKL, 'Thành tiền': tt.totalTien }, ngayLabel],
    ['congno', 'BC_CONGNO', CONGNO_COLS, congno.rows, { 'KL hàng (KG)': congno.totalKL, 'Thành tiền': congno.totalTien }, ngayLabel],
    ['xecho', 'BK_NHAPKEO_1H', XECHO_COLS, xecho, null, ngayLabel],
    ['tonghop', 'TH_NXT', tonghop.cols, tonghop.rows, tonghop.totals, reportDateLabel()],
    ['hotro', 'BK_TIENHT', HOTRO_COLS, hotro.rows, { 'Khối lượng_Tấn': hotro.totalKL, 'Tiền hỗ trợ': hotro.totalTien }, ngayLabel],
    ['trogia', 'BK_TROGIA', TROGIA_COLS, trogia.rows, { 'Khối lượng_Tấn': trogia.totalKL, 'Tiền trợ giá': trogia.totalTien }, ngayLabel],
    ['tonghoptro', 'TH_TIENHOTRO', TONGHOPTRO_COLS, tonghoptro, sumCols(tonghoptro, ['Khối lượng_Tấn','Tiền hỗ trợ','Khấu trừ thuế TNCN','Còn thanh toán']), ngayLabel],
    ['hoahong', 'TH_HHDL', HOAHONG_COLS, hoahong, sumCols(hoahong, ['Khối lượng thanh toán','Tiền hoa hồng']), ngayLabel]
  ];
  sheets.forEach(function(s){
    buildWorksheetCore(workbook, s[2], s[3], s[4], s[1], company, reportTitle(s[0]), s[5]);
  });
  var buf = await workbook.xlsx.writeBuffer();
  var blob = new Blob([buf], { type:'application/octet-stream' });
  var d = new Date();
  downloadBlob(blob, 'BaoCaoNgay_' + d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate()) + '_BaoCaoNgay.xlsx');
}
/* "Xuất tất cả" riêng của mục Tổng hợp lâm sản — 3 sheet BKLS Chi tiết + Tổng hợp + Tổng hợp
   theo Tàu (mẫu WO chính thức xuất riêng qua nút "Xuất mẫu WO", không gộp vào đây). */
export async function exportLamSanExcel(){
  if (!RESULTS){ alert('Chưa có dữ liệu báo cáo. Hãy bấm LẬP BÁO CÁO trước.'); return; }
  var workbook = new libs.ExcelJS.Workbook();
  var sheets = [ ['bklsct', 'TH_XUATHANG_01'], ['bklsth', 'TH_XUATHANG_02'], ['tautonghop', 'TONGHOP_THEO_TAU'] ];
  sheets.forEach(function(s){
    var key = s[0], sheetName = s[1];
    var st = TABLES[key];
    if (!st || !st.view) return;
    buildWorksheet(workbook, key, sheetName);
  });
  var buf = await workbook.xlsx.writeBuffer();
  var blob = new Blob([buf], { type:'application/octet-stream' });
  var d = new Date();
  downloadBlob(blob, 'BangKeLamSan_' + d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate()) + '.xlsx');
}
/* "Xuất tất cả" riêng của mục Báo cáo ngân hàng — 3 sheet dạng bảng (mẫu 02/TNDN
   chính thức có nút xuất riêng "Xuất mẫu 02/TNDN", phiếu nhập kho hàng loạt có nút
   xuất riêng "Xuất phiếu nhập kho", không gộp vào đây). */
export async function exportBankExcel(){
  if (!RESULTS){ alert('Chưa có dữ liệu báo cáo. Hãy bấm LẬP BÁO CÁO trước.'); return; }
  var workbook = new libs.ExcelJS.Workbook();
  var sheets = [ ['tienvay', 'BKCT_TIENVAY'], ['thtt', 'THTT_NH'], ['tndn', 'BK02_TNDN'], ['pnk', 'PHIEU_NHAPKHO'] ];
  sheets.forEach(function(s){
    var key = s[0], sheetName = s[1];
    var st = TABLES[key];
    if (!st || !st.view) return;
    buildWorksheet(workbook, key, sheetName);
  });
  var buf = await workbook.xlsx.writeBuffer();
  var blob = new Blob([buf], { type:'application/octet-stream' });
  var d = new Date();
  downloadBlob(blob, 'BaoCaoNganHang_' + d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate()) + '.xlsx');
}
