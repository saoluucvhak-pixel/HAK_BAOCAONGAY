/**
 * Mẫu chính thức "Bảng kê khai hàng hoá xuất khẩu đạt tiêu chí WO" (modal + Excel + PDF).
 *
 * [Phase 4.2 — 2026-10-06] Tách NGUYÊN VĂN từ legacy-app.js (không đổi logic) để mỗi file < 800
 * dòng, dễ đọc/bảo trì. Kiểm chứng: `npm run test:export-golden` (36 file xuất khớp từng ô/chữ)
 * + toàn bộ bộ test. Import vòng với legacy-app.js (RESULTS/runReport) an toàn — chỉ dùng bên
 * trong hàm xử lý sự kiện, không dùng lúc nạp module (xem ARCHITECTURE.md).
 * @module services/export/wo-form
 */
import { CONFIG } from '../../config/config.js';
import { BRAND, OUTER_BORDER_STYLE, THIN_BORDER } from '../../constants/brand.js';
import { libs } from '../export-libs.js';
import { storageService } from '../storage-service.js';
import { STATE, TABLES } from '../../store/state.js';
import { fmtDate, pad2, toExcelDate } from '../../utils/date-utils.js';
import { $, downloadBlob } from '../../utils/dom-utils.js';
import { fmtKL, fmtMoney } from '../../utils/number-utils.js';
import { ensurePdfFont, forcePdfMoneyColumnWidths } from './pdf-export.js';

/* ============================================================
   [EXPORT_SERVICE] Xuất mẫu chính thức "BẢNG KÊ KHAI HÀNG HÓA XUẤT KHẨU ĐẠT
   TIÊU CHÍ WO" (Mẫu theo Thông tư 05/2018/TT-BCT, dựa trên dữ liệu báo cáo BKLS
   xuất khẩu - Chi tiết)
   ============================================================ */
var WO_CAM_KET = 'Công ty cam kết số liệu, thông tin khai báo trên là đúng và chịu trách nhiệm trước pháp luật về thông tin, số liệu đã khai.';
var WO_CHUKY = 'Người đại diện theo pháp luật của thương nhân\n(Ký, đóng dấu, ghi rõ họ, tên)';
function woTodayLabel(noiLap){
  var d = new Date();
  return (noiLap||'Đà Nẵng') + ', ngày ' + pad2(d.getDate()) + ' tháng ' + pad2(d.getMonth()+1) + ' năm ' + d.getFullYear();
}
function loadWOInfo(){
  // Cùng cơ chế với loadBankInfo() ở trên — xem ghi chú tại đó.
  var saved = storageService.get(CONFIG.STORAGE_KEYS.WO_INFO, null);
  return saved || Object.assign({}, CONFIG.DEFAULT_WO_INFO || {});
}
function saveWOInfo(info){ storageService.set(CONFIG.STORAGE_KEYS.WO_INFO, info); }
function fillWOForm(info){
  $('#woMaSoThue').value = info.maSoThue || '';
  $('#woToKhai').value = info.toKhai || '';
  $('#woDiaChiThuMua').value = info.diaChiThuMua || '';
  $('#woNguoiPhuTrach').value = info.nguoiPhuTrach || '';
  $('#woCccdPhuTrach').value = info.cccdPhuTrach || '';
  $('#woTieuChi').value = info.tieuChi || 'WO';
  $('#woTenHangHoa').value = info.tenHangHoa || 'Dăm gỗ keo';
  $('#woSoLuongKho').value = info.soLuongKho || '';
  $('#woTriGiaFOB').value = info.triGiaFOB || '';
  $('#woNoiLap').value = info.noiLap || 'Đà Nẵng';
}
function readWOForm(){
  return {
    maSoThue: $('#woMaSoThue').value.trim(),
    toKhai: $('#woToKhai').value.trim(),
    diaChiThuMua: $('#woDiaChiThuMua').value.trim(),
    nguoiPhuTrach: $('#woNguoiPhuTrach').value.trim(),
    cccdPhuTrach: $('#woCccdPhuTrach').value.trim(),
    tieuChi: $('#woTieuChi').value.trim() || 'WO',
    tenHangHoa: $('#woTenHangHoa').value.trim() || 'Dăm gỗ keo',
    soLuongKho: $('#woSoLuongKho').value.trim(),
    triGiaFOB: $('#woTriGiaFOB').value.trim(),
    noiLap: $('#woNoiLap').value.trim() || 'Đà Nẵng'
  };
}
export function openWOModal(){
  if (!TABLES['bklsct'] || !(TABLES['bklsct'].rows||[]).length){
    alert('Chưa có dữ liệu báo cáo BKLS xuất khẩu. Hãy vào "Tổng hợp lâm sản", chọn khoảng ngày rồi bấm LẬP BÁO CÁO trước.');
    return;
  }
  fillWOForm(loadWOInfo());
  $('#woModalOverlay').classList.add('active');
}
export function closeWOModal(){ $('#woModalOverlay').classList.remove('active'); }
/* Ghép "Ngày cấp" CCCD từ HD_NCC (khớp cùng khóa Mã hợp đồng + Họ và tên chủ rừng như computeXuatHang01) */
function computeWORows(){
  var st = TABLES['bklsct'];
  var rows = (st && (st.view || st.rows)) || [];
  return rows.map(function(r){
    var k = (r['Mã hợp đồng']||'') + '||' + (r['Họ và tên người bán']||'');
    var hd = STATE.hdmbByKey[k] || {};
    var ngayCap = hd['Ngày cấp'] ? fmtDate(hd['Ngày cấp']) : '';
    return {
      ngay: r['Ngày BKLS'],
      tenNguoiBan: r['Họ và tên người bán'],
      diaChi: r['Địa chỉ thường trú'],
      cccdNgayCap: (r['Số CCCD']||'') + (ngayCap ? (' ' + ngayCap) : ''),
      tenNguyenLieu: r['Tên nguyên liệu'],
      maHS: CONFIG.MA_HS,
      noiKhaiThac: r['Địa điểm khai thác'],
      soLuong: r['Khối lượng (Tấn)'],
      donGia: r['Đơn giá'],
      tongTriGia: r['Thanh toán'],
      ghiChu: r.STT
    };
  });
}
/** Dòng "TỔNG CỘNG" của bảng WO (tách khỏi buildWOWorksheet để hàm < 100 dòng — mã giữ nguyên văn). */
function writeWOTotalRow(ws, rows, totalRow){
  ws.mergeCells(totalRow,2,totalRow,4);
  var totKL=0, totTT=0;
  rows.forEach(function(r){ totKL += r.soLuong||0; totTT += r.tongTriGia||0; });
  ws.getCell(totalRow,2).value = 'TỔNG CỘNG';
  ws.getCell(totalRow,8).value = totKL; ws.getCell(totalRow,8).numFmt='#,##0.00';
  ws.getCell(totalRow,10).value = totTT; ws.getCell(totalRow,10).numFmt='#,##0';
  for (var ci2=1; ci2<=11; ci2++){
    var c2 = ws.getCell(totalRow,ci2);
    c2.font = { bold:true };
    c2.fill = { type:'pattern', pattern:'solid', fgColor:{argb:BRAND.totalFillARGB}, bgColor:{argb:BRAND.totalFillARGB} };
    c2.border = { top:{style:'double', color:{argb:BRAND.headerFillARGB}}, bottom:{style:'thin'}, left:{style:'thin'}, right:{style:'thin'} };
    if (ci2===8||ci2===10) c2.alignment = { horizontal:'right' };
  }
}
/** Viền ngoài đậm quanh toàn bộ bảng WO, từ dòng tiêu đề (8) tới dòng tổng (mã giữ nguyên văn). */
function applyWOOuterBorder(ws, NCOLS, totalRow){
  // viền ngoài đậm quanh toàn bộ bảng (đồng bộ phong cách với các báo cáo khác)
  for (var ciOuter=1; ciOuter<=NCOLS; ciOuter++){
    var topC = ws.getCell(8, ciOuter); topC.border = Object.assign({}, topC.border, { top:{style:OUTER_BORDER_STYLE, color:{argb:BRAND.headerFillARGB}} });
    var botC = ws.getCell(totalRow, ciOuter); botC.border = Object.assign({}, botC.border, { bottom:{style:OUTER_BORDER_STYLE, color:{argb:BRAND.headerFillARGB}} });
  }
  for (var riOuter=8; riOuter<=totalRow; riOuter++){
    var leftC = ws.getCell(riOuter,1); leftC.border = Object.assign({}, leftC.border, { left:{style:OUTER_BORDER_STYLE, color:{argb:BRAND.headerFillARGB}} });
    var rightC = ws.getCell(riOuter,NCOLS); rightC.border = Object.assign({}, rightC.border, { right:{style:OUTER_BORDER_STYLE, color:{argb:BRAND.headerFillARGB}} });
  }
}
function buildWOWorksheet(workbook, rows, info){
  var ws = workbook.addWorksheet('Bảng kê', { views:[{ state:'frozen', ySplit:9 }] });
  var NCOLS = 11; // A..K
  function mergeVal(r1,c1,r2,c2,value,opts){
    ws.mergeCells(r1,c1,r2,c2);
    var cell = ws.getCell(r1,c1);
    cell.value = value;
    cell.font = (opts && opts.font) || {};
    cell.alignment = (opts && opts.alignment) || { vertical:'middle', wrapText:true };
    return cell;
  }
  mergeVal(1,1,1,NCOLS, 'BẢNG KÊ KHAI HÀNG HÓA XUẤT KHẨU ĐẠT TIÊU CHÍ "' + info.tieuChi + '"',
    { font:{bold:true,size:13,color:{argb:BRAND.headerFillARGB}}, alignment:{horizontal:'center',vertical:'middle'} });
  mergeVal(2,1,2,NCOLS,
    '(Sử dụng nguyên liệu thu mua trong nước, không có hóa đơn giá trị gia tăng)\n(Ban hành kèm theo Thông tư số 05/2018/TT-BCT ngày 03 tháng 4 năm 2018 quy định về xuất sứ hàng hóa)',
    { font:{italic:true,size:9}, alignment:{horizontal:'center',vertical:'middle',wrapText:true} });

  mergeVal(3,1,3,5, 'Tên thương nhân: ' + CONFIG.TEN_CONG_TY, { alignment:{horizontal:'left'} });
  mergeVal(3,8,3,11, 'Tiêu chí áp dụng: ' + info.tieuChi, { alignment:{horizontal:'left'} });
  mergeVal(4,1,4,5, 'Mã số thuế: ' + info.maSoThue, { alignment:{horizontal:'left'} });
  mergeVal(4,8,4,11, 'Tên hàng hóa: ' + info.tenHangHoa, { alignment:{horizontal:'left'} });
  mergeVal(5,1,5,5, 'Tờ khai hải quan xuất khẩu số: ' + info.toKhai, { alignment:{horizontal:'left'} });
  mergeVal(5,8,5,11, 'Mã HS hàng hóa: ' + CONFIG.MA_HS, { alignment:{horizontal:'left'} });
  mergeVal(6,1,6,5, 'Địa chỉ nơi tổ chức thu mua: ' + info.diaChiThuMua, { alignment:{horizontal:'left',wrapText:true} });
  mergeVal(6,8,6,11, 'Số lượng: ' + (info.soLuongKho||'') + ' Tấn khô', { alignment:{horizontal:'left'} });
  mergeVal(7,1,7,6, 'Người phụ trách thu mua: ' + info.nguoiPhuTrach + ' , số CCCD: ' + info.cccdPhuTrach, { alignment:{horizontal:'left'} });
  mergeVal(7,8,7,11, 'Trị giá (FOB): ' + (info.triGiaFOB||'') + ' USD', { alignment:{horizontal:'left'} });

  var headerFont = { bold:true, color:{argb:BRAND.headerTextARGB} };
  var headerFill = { type:'pattern', pattern:'solid', fgColor:{argb:BRAND.headerFillARGB}, bgColor:{argb:BRAND.headerFillARGB} };
  var headerAlign = { horizontal:'center', vertical:'middle', wrapText:true };

  mergeVal(8,1,9,1,'Ngày tháng năm mua hàng', { font:headerFont, alignment:headerAlign });
  mergeVal(8,2,8,4,'Người bán', { font:headerFont, alignment:headerAlign });
  mergeVal(8,5,8,10,'Nguyên liệu thu mua trong nước', { font:headerFont, alignment:headerAlign });
  mergeVal(8,11,9,11,'Ghi chú', { font:headerFont, alignment:headerAlign });

  var subHeaders = ['','Tên người bán','Địa chỉ','Số định danh cá nhân (số CCCD) và ngày cấp',
    'Tên nguyên liệu','Mã HS','Nơi khai thác/đánh bắt/nuôi trồng','Số lượng và đơn vị tính (tấn)','Đơn giá','Tổng trị giá',''];
  for (var ci=2; ci<=10; ci++){
    var cell = ws.getCell(9,ci);
    cell.value = subHeaders[ci-1];
    cell.font = headerFont; cell.fill = headerFill; cell.alignment = headerAlign; cell.border = THIN_BORDER;
  }
  [1,2,3,4,5,6,7,8,9,10,11].forEach(function(ci){
    ws.getCell(8,ci).fill = headerFill; ws.getCell(8,ci).border = THIN_BORDER;
    ws.getCell(9,ci).fill = headerFill; ws.getCell(9,ci).border = THIN_BORDER;
  });
  ws.getCell(8,1).font = headerFont; ws.getCell(8,11).font = headerFont;

  var startRow = 10;
  rows.forEach(function(r, idx){
    var rr = startRow + idx;
    var isZebra = (idx % 2 === 1);
    var vals = [ toExcelDate(r.ngay), r.tenNguoiBan, r.diaChi, r.cccdNgayCap, r.tenNguyenLieu, r.maHS, r.noiKhaiThac, r.soLuong, r.donGia, r.tongTriGia, r.ghiChu ];
    vals.forEach(function(v, i){
      var cell = ws.getCell(rr, i+1);
      cell.value = v;
      cell.border = THIN_BORDER;
      cell.alignment = { vertical:'middle', wrapText:(i===2||i===6) };
      if (isZebra) cell.fill = { type:'pattern', pattern:'solid', fgColor:{argb:BRAND.zebraFillARGB}, bgColor:{argb:BRAND.zebraFillARGB} };
      if (i===0){ cell.numFmt='dd/mm/yyyy'; cell.alignment.horizontal='center'; } // [CHUẨN HAK] ngày thật, căn giữa
      if (i===7){ cell.numFmt='#,##0.00'; cell.alignment.horizontal='right'; }
      if (i===8||i===9){ cell.numFmt='#,##0'; cell.alignment.horizontal='right'; }
      if (i===10){ cell.alignment.horizontal='center'; }
    });
  });

  var totalRow = startRow + rows.length;
  writeWOTotalRow(ws, rows, totalRow);
  applyWOOuterBorder(ws, NCOLS, totalRow);

  var r1 = totalRow+1;
  mergeVal(r1,1,r1,NCOLS, 'Kết luận: Hàng hóa đáp ứng tiêu chí “' + info.tieuChi + '”', { font:{bold:true}, alignment:{horizontal:'left'} });
  mergeVal(r1+1,1,r1+1,NCOLS, WO_CAM_KET, { alignment:{horizontal:'left'} });
  mergeVal(r1+2,6,r1+2,NCOLS, woTodayLabel(info.noiLap), { font:{italic:true}, alignment:{horizontal:'center'} });
  mergeVal(r1+3,6,r1+3,NCOLS, WO_CHUKY, { font:{bold:true}, alignment:{horizontal:'center', wrapText:true} });

  ws.getColumn(1).width = 12; ws.getColumn(2).width = 18; ws.getColumn(3).width = 26; ws.getColumn(4).width = 24;
  ws.getColumn(5).width = 16; ws.getColumn(6).width = 10; ws.getColumn(7).width = 30; ws.getColumn(8).width = 12;
  ws.getColumn(9).width = 14; ws.getColumn(10).width = 16; ws.getColumn(11).width = 8;
}
export async function exportWOExcel(){
  var info = readWOForm(); saveWOInfo(info);
  var rows = computeWORows();
  if (!rows.length){ alert('Không có dữ liệu để xuất (kiểm tra lại bộ lọc / bấm LẬP BÁO CÁO).'); return; }
  var workbook = new libs.ExcelJS.Workbook();
  buildWOWorksheet(workbook, rows, info);
  var buf = await workbook.xlsx.writeBuffer();
  var blob = new Blob([buf], { type:'application/octet-stream' });
  var d = new Date();
  downloadBlob(blob, 'BangKeWO_' + d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate()) + '.xlsx');
  closeWOModal();
}
function buildWOPdf(rows, info){
  var doc = new libs.jsPDF({ orientation: 'landscape' });
  ensurePdfFont(doc);
  var pageW = doc.internal.pageSize.getWidth();
  doc.setFont('Roboto','bold'); doc.setFontSize(12); doc.setTextColor.apply(doc, BRAND.companyRGB);
  doc.text('BẢNG KÊ KHAI HÀNG HÓA XUẤT KHẨU ĐẠT TIÊU CHÍ "' + info.tieuChi + '"', pageW/2, 10, { align:'center' });
  doc.setFont('Roboto','normal'); doc.setTextColor(20,20,20);
  doc.setFontSize(8);
  var sub = doc.splitTextToSize(
    '(Sử dụng nguyên liệu thu mua trong nước, không có hóa đơn giá trị gia tăng) ' +
    '(Ban hành kèm theo Thông tư số 05/2018/TT-BCT ngày 03 tháng 4 năm 2018 quy định về xuất sứ hàng hóa)', pageW-20);
  doc.text(sub, pageW/2, 15, { align:'center' });
  var y0 = 15 + sub.length*4 + 3;
  doc.setFontSize(9);
  var leftX = 10, rightX = pageW/2 + 10, y = y0, lh = 5;
  doc.text('Tên thương nhân: ' + CONFIG.TEN_CONG_TY, leftX, y);
  doc.text('Tiêu chí áp dụng: ' + info.tieuChi, rightX, y); y += lh;
  doc.text('Mã số thuế: ' + info.maSoThue, leftX, y);
  doc.text('Tên hàng hóa: ' + info.tenHangHoa, rightX, y); y += lh;
  doc.text('Tờ khai hải quan xuất khẩu số: ' + info.toKhai, leftX, y);
  doc.text('Mã HS hàng hóa: ' + CONFIG.MA_HS, rightX, y); y += lh;
  doc.text('Địa chỉ nơi tổ chức thu mua: ' + info.diaChiThuMua, leftX, y);
  doc.text('Số lượng: ' + (info.soLuongKho||'') + ' Tấn khô', rightX, y); y += lh;
  doc.text('Người phụ trách thu mua: ' + info.nguoiPhuTrach + ' , số CCCD: ' + info.cccdPhuTrach, leftX, y);
  doc.text('Trị giá (FOB): ' + (info.triGiaFOB||'') + ' USD', rightX, y); y += lh + 2;

  var totKL=0, totTT=0;
  rows.forEach(function(r){ totKL += r.soLuong||0; totTT += r.tongTriGia||0; });

  var head = [
    [
      { content:'Ngày tháng năm\nmua hàng', rowSpan:2 },
      { content:'Người bán', colSpan:3 },
      { content:'Nguyên liệu thu mua trong nước', colSpan:6 },
      { content:'Ghi chú', rowSpan:2 }
    ],
    [
      'Tên người bán','Địa chỉ','Số định danh cá nhân\n(số CCCD) và ngày cấp',
      'Tên nguyên liệu','Mã HS','Nơi khai thác/đánh bắt/nuôi trồng','Số lượng và\nđơn vị tính (tấn)','Đơn giá','Tổng trị giá'
    ]
  ];
  var body = rows.map(function(r){
    return [ fmtDate(r.ngay), r.tenNguoiBan, r.diaChi, r.cccdNgayCap, r.tenNguyenLieu, r.maHS, r.noiKhaiThac,
      fmtKL(r.soLuong), fmtMoney(r.donGia), fmtMoney(r.tongTriGia), String(r.ghiChu) ];
  });
  var foot = [[ '', 'TỔNG CỘNG', '', '', '', '', '', fmtKL(totKL), '', fmtMoney(totTT), '' ]];

  var columnStyles = { 0:{halign:'center'}, 7:{halign:'right'}, 8:{halign:'right'}, 9:{halign:'right'}, 10:{halign:'center'} };
  forcePdfMoneyColumnWidths(doc, body, foot, [8, 9], columnStyles, 6.5); // 8=Đơn giá, 9=Tổng trị giá

  doc.autoTable({
    head: head, body: body, foot: foot, startY: y,
    theme: 'grid',
    showFoot: 'lastPage',
    styles: { font:'Roboto', fontStyle:'normal', fontSize:6.5, halign:'left', valign:'middle', lineColor: BRAND.lineRGB, lineWidth:0.15 },
    headStyles: { font:'Roboto', fontStyle:'bold', halign:'center', fillColor: BRAND.headerRGB, textColor:255 },
    footStyles: { font:'Roboto', fontStyle:'bold', halign:'left', fillColor: BRAND.totalRGB, textColor:[20,20,20] },
    alternateRowStyles: { fillColor: BRAND.zebraRGB },
    columnStyles: columnStyles
  });

  var fy = doc.lastAutoTable.finalY + 8;
  doc.setFontSize(9);
  doc.setFont('Roboto','bold');
  doc.text('Kết luận: Hàng hóa đáp ứng tiêu chí “' + info.tieuChi + '”', leftX, fy);
  doc.setFont('Roboto','normal');
  doc.text(WO_CAM_KET, leftX, fy+6);
  doc.text(woTodayLabel(info.noiLap), pageW-10, fy+14, { align:'right' });
  doc.setFont('Roboto','bold');
  var sigLines = WO_CHUKY.split('\n');
  sigLines.forEach(function(line, i){ doc.text(line, pageW-10, fy+20+i*5, { align:'right' }); });

  return doc;
}
export function exportWOPDF(){
  var info = readWOForm(); saveWOInfo(info);
  var rows = computeWORows();
  if (!rows.length){ alert('Không có dữ liệu để xuất (kiểm tra lại bộ lọc / bấm LẬP BÁO CÁO).'); return; }
  var doc = buildWOPdf(rows, info);
  var d = new Date();
  doc.save('BangKeWO_' + d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate()) + '.pdf');
  closeWOModal();
}
