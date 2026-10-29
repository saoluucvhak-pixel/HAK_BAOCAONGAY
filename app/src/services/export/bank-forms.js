/**
 * Báo cáo ngân hàng: mẫu 02/TNDN, Phiếu nhập kho hàng loạt, file mẫu Sổ tiền vay, modal thông tin.
 *
 * [Phase 4.2 — 2026-10-06] Tách NGUYÊN VĂN từ legacy-app.js (không đổi logic) để mỗi file < 800
 * dòng, dễ đọc/bảo trì. Kiểm chứng: `npm run test:export-golden` (36 file xuất khớp từng ô/chữ)
 * + toàn bộ bộ test. Import vòng với legacy-app.js (RESULTS/runReport) an toàn — chỉ dùng bên
 * trong hàm xử lý sự kiện, không dùng lúc nạp module (xem ARCHITECTURE.md).
 * @module services/export/bank-forms
 */
import { CONFIG } from '../../config/config.js';
import { BRAND, OUTER_BORDER_STYLE, THIN_BORDER } from '../../constants/brand.js';
import { LOAN_FIELDS } from '../loan-model.js';
import { libs } from '../export-libs.js';
import { storageService } from '../storage-service.js';
import { TABLES } from '../../store/state.js';
import { dateKey, fmtDate, pad2, toExcelDate } from '../../utils/date-utils.js';
import { $, $$, downloadBlob, esc } from '../../utils/dom-utils.js';
import { fmtKL, fmtMoney } from '../../utils/number-utils.js';
import { RESULTS } from '../../legacy-app.js';
import { ensurePdfFont, forcePdfMoneyColumnWidths } from './pdf-export.js';

/* Thông tin báo cáo ngân hàng — nhập 1 lần qua modal, dùng cho mẫu 02/TNDN chính thức
   và phiếu nhập kho xuất hàng loạt (mã số thuế, địa chỉ...). Tên công ty dùng THỐNG NHẤT
   1 tên duy nhất CONFIG.TEN_CONG_TY (Đại Hiệp) cho mọi báo cáo trong toàn app, kể cả 3
   báo cáo ngân hàng — không có tên công ty riêng khác theo yêu cầu người dùng. */
function loadBankInfo(){
  // Chưa từng lưu lần nào (storageService.get trả về null) -> lấy mặc định đã cấu hình sẵn
  // trong CONFIG.DEFAULT_BANK_INFO làm gợi ý ban đầu. Đã từng lưu rồi (kể cả có ô để trống có
  // chủ đích) -> dùng ĐÚNG dữ liệu đã lưu, không trộn với mặc định (tránh field đã xoá tay lại
  // tự động hiện lại giá trị mặc định).
  var saved = storageService.get(CONFIG.STORAGE_KEYS.BANK_INFO, null);
  return saved || Object.assign({}, CONFIG.DEFAULT_BANK_INFO || {});
}
function saveBankInfo(info){ storageService.set(CONFIG.STORAGE_KEYS.BANK_INFO, info); }

/* ============================================================
   [EXPORT_SERVICE] Báo cáo ngân hàng (dùng chung CONFIG.TEN_CONG_TY — Đại Hiệp — không có
   tên công ty riêng nào khác cho 3 báo cáo này, xem companyNameFor())
   1) Mẫu 02/TNDN chính thức — "Bảng kê thu mua hàng hóa, dịch vụ không có hóa đơn"
   2) Phiếu nhập kho xuất hàng loạt (Mẫu 01-VT/QĐ 48/2006/QĐ-BTC) — mỗi ngày 1 trang PDF
   ============================================================ */
function fillBankInfoForm(info){
  $('#bankMST').value = info.maSoThue || '';
  $('#bankDiaChi').value = info.diaChi || '';
  $('#bankSDT').value = info.soDienThoai || '';
  $('#bankDiaChiThuMua').value = info.diaChiThuMua || '';
  $('#bankNhapTaiKho').value = info.nhapTaiKho || '';
  $('#bankDiaDiemPNK').value = info.diaDiemPNK || '';
  $('#bankNo').value = info.noPNK || '';
  $('#bankCo').value = info.coPNK || '';
  $('#bankNguoiGiao').value = info.nguoiGiao || '';
  $('#bankNguoiLap').value = info.nguoiLap || '';
  $('#bankThuKho').value = info.thuKho || '';
  $('#bankGiamDoc').value = info.giamDoc || '';
}
function readBankInfoForm(){
  return {
    maSoThue: $('#bankMST').value.trim(), diaChi: $('#bankDiaChi').value.trim(), soDienThoai: $('#bankSDT').value.trim(),
    diaChiThuMua: $('#bankDiaChiThuMua').value.trim(), nhapTaiKho: $('#bankNhapTaiKho').value.trim(),
    diaDiemPNK: $('#bankDiaDiemPNK').value.trim(), noPNK: $('#bankNo').value.trim(), coPNK: $('#bankCo').value.trim(),
    nguoiGiao: $('#bankNguoiGiao').value.trim(), nguoiLap: $('#bankNguoiLap').value.trim(),
    thuKho: $('#bankThuKho').value.trim(), giamDoc: $('#bankGiamDoc').value.trim()
  };
}
export var BANK_INFO_MODAL_MODE = 'tndn'; // 'tndn' hoặc 'pnk' — quyết định modal đang mở để xuất mẫu nào
export function openBankInfoModal(mode){
  BANK_INFO_MODAL_MODE = mode;
  var st = TABLES[mode==='tndn' ? 'tndn' : 'pnk'];
  if (!st || !(st.rows||[]).length){
    alert('Chưa có dữ liệu báo cáo ' + (mode==='tndn' ? '"Bảng kê 02/TNDN"' : '"Phiếu nhập kho"') + '. Hãy vào "Báo cáo ngân hàng", chọn khoảng ngày rồi bấm LẬP BÁO CÁO trước.');
    return;
  }
  $('#bankModalTitle').textContent = mode==='tndn'
    ? 'Thông tin xuất mẫu 02/TNDN — Bảng kê thu mua hàng hóa, dịch vụ không có hóa đơn'
    : 'Thông tin xuất Phiếu nhập kho (hàng loạt) — Mẫu 01-VT';
  $$('.bankInfoPNKOnly').forEach(function(el){ el.style.display = (mode==='pnk') ? '' : 'none'; });
  $$('.bankInfoTNDNOnly').forEach(function(el){ el.style.display = (mode==='tndn') ? '' : 'none'; });
  $('#btnBankExcel').style.display = (mode==='pnk') ? 'none' : ''; // Phiếu nhập kho hàng loạt chỉ xuất PDF (mỗi ngày 1 trang), không có bản Excel
  fillBankInfoForm(loadBankInfo());
  if (mode === 'pnk') renderPnkPick(RESULTS && RESULTS.pnk ? RESULTS.pnk.rows : []);
  $('#bankModalOverlay').classList.add('active');
}

/* [2026-10-29] Chọn phiếu nhập kho để in — người dùng: "Phiếu nhập kho cho chọn phiếu in hoặc chọn tất cả".
   Mặc định chọn TẤT CẢ (như trước); bỏ chọn phiếu nào thì PDF không có trang đó. */
function renderPnkPick(rows){
  var list = $('#pnkPickList'); if (!list) return;
  list.innerHTML = rows.map(function(r, i){
    return '<label><input type="checkbox" class="pnkPickChk" data-idx="' + i + '" checked><span>' + esc(fmtDate(r['Ngày nhập kho'])) + '</span><span>' + esc(r['Số CT'] || '') +
      '</span><span class="n">' + fmtKL(r['Khối lượng']) + ' tấn</span><span class="n">' + fmtMoney(r['Thành tiền']) + '</span></label>';
  }).join('');
  $('#pnkPickAll').checked = true;
  updatePnkPickCount();
  if (!list.dataset.bound){
    list.dataset.bound = '1';
    list.addEventListener('change', updatePnkPickCount);
    $('#pnkPickAll').addEventListener('change', function(e){ $$('.pnkPickChk', list).forEach(function(c){ c.checked = e.target.checked; }); updatePnkPickCount(); });
  }
}
function updatePnkPickCount(){
  var all = $$('.pnkPickChk', $('#pnkPickList')), n = all.filter(function(c){ return c.checked; }).length;
  $('#pnkPickCount').textContent = 'Đã chọn ' + n + ' / ' + all.length + ' phiếu';
  $('#pnkPickAll').checked = n === all.length && n > 0;
  $('#pnkPickAll').indeterminate = n > 0 && n < all.length;
}
/** Các phiếu đang được chọn trong modal (theo đúng thứ tự trong bảng). */
export function selectedPnkRows(rows){
  var chks = $$('.pnkPickChk', $('#pnkPickList'));
  if (!chks.length) return rows; // chưa dựng danh sách (gọi trực tiếp) → giữ hành vi cũ: tất cả
  return rows.filter(function(r, i){ var c = chks[i]; return c && c.checked; });
}
export function closeBankInfoModal(){ $('#bankModalOverlay').classList.remove('active'); }
function bankModalNgayLabel(noiLap){
  var d = new Date();
  return (noiLap||'Đà Nẵng') + ', ngày ' + pad2(d.getDate()) + ' tháng ' + pad2(d.getMonth()+1) + ' năm ' + d.getFullYear();
}
/* ---------- Mẫu 02/TNDN chính thức ---------- */
function buildTNDNWorksheet(workbook, rows, info, ngayMax){
  var ws = workbook.addWorksheet('BK02_TNDN', { views:[{ state:'frozen', ySplit:11 }] });
  var NCOLS = 10; // A..J
  function mergeVal(r1,c1,r2,c2,value,opts){
    ws.mergeCells(r1,c1,r2,c2);
    var cell = ws.getCell(r1,c1);
    cell.value = value; cell.font = (opts && opts.font) || {};
    cell.alignment = (opts && opts.alignment) || { vertical:'middle', wrapText:true };
    return cell;
  }
  mergeVal(1,7,1,10, 'Mẫu số: 02/TNDN\n(Ban hành kèm theo Thông tư số 20/2026/TT-BTC\ncủa Bộ trưởng Bộ Tài chính)', { font:{italic:true,size:9}, alignment:{horizontal:'right',vertical:'middle',wrapText:true} });
  mergeVal(2,1,2,10, 'BẢNG KÊ THU MUA HÀNG HÓA, DỊCH VỤ KHÔNG CÓ HÓA ĐƠN', { font:{bold:true,size:13,color:{argb:BRAND.headerFillARGB}}, alignment:{horizontal:'center',vertical:'middle'} });
  mergeVal(3,1,3,10, ngayMax ? ('(' + bankNgayLabel(ngayMax) + ')') : '', { font:{italic:true,size:10}, alignment:{horizontal:'center'} });
  mergeVal(4,1,4,10, '- Tên doanh nghiệp: ' + CONFIG.TEN_CONG_TY, { alignment:{horizontal:'left'} });
  mergeVal(5,1,5,10, '- Mã số thuế: ' + info.maSoThue, { alignment:{horizontal:'left'} });
  mergeVal(6,1,6,10, '- Địa chỉ: ' + info.diaChi, { alignment:{horizontal:'left',wrapText:true} });
  mergeVal(7,1,7,10, '- Số điện thoại: ' + info.soDienThoai, { alignment:{horizontal:'left'} });
  mergeVal(8,1,8,10, '- Địa chỉ nơi tổ chức thu mua: ' + info.diaChiThuMua, { alignment:{horizontal:'left',wrapText:true} });

  var headerFont = { bold:true, color:{argb:BRAND.headerTextARGB} };
  var headerFill = { type:'pattern', pattern:'solid', fgColor:{argb:BRAND.headerFillARGB}, bgColor:{argb:BRAND.headerFillARGB} };
  var headerAlign = { horizontal:'center', vertical:'middle', wrapText:true };
  mergeVal(10,1,11,1,'Ngày tháng năm mua hàng', { font:headerFont, alignment:headerAlign });
  mergeVal(10,2,10,4,'Người bán', { font:headerFont, alignment:headerAlign });
  mergeVal(10,6,10,9,'Hàng hóa, dịch vụ mua vào', { font:headerFont, alignment:headerAlign });
  mergeVal(10,5,11,5,'Số Điện thoại (nếu có)', { font:headerFont, alignment:headerAlign });
  mergeVal(10,10,11,10,'Ghi chú', { font:headerFont, alignment:headerAlign });
  var subHeaders = ['','Tên người bán','Địa chỉ','Số CCCD','','Tên hàng hóa, dịch vụ','Số lượng, trọng lượng','Đơn giá','Tổng giá thanh toán',''];
  for (var ci=2; ci<=9; ci++){ if (ci===5) continue; var cell = ws.getCell(11,ci); cell.value = subHeaders[ci-1]; cell.font = headerFont; cell.fill = headerFill; cell.alignment = headerAlign; cell.border = THIN_BORDER; }
  for (var ci2=1; ci2<=NCOLS; ci2++){ ws.getCell(10,ci2).fill = headerFill; ws.getCell(10,ci2).border = THIN_BORDER; ws.getCell(11,ci2).fill = headerFill; ws.getCell(11,ci2).border = THIN_BORDER; }

  var startRow = 12;
  rows.forEach(function(r, idx){
    var rr = startRow + idx, isZebra = (idx % 2 === 1);
    var vals = [ toExcelDate(r['Ngày tháng năm mua hàng']), r['Tên người bán'], r['Địa chỉ'], r['Số CCCD'], r['Số Điện thoại'], r['Tên hàng hóa/dịch vụ'], r['Số lượng/trọng lượng'], r['Đơn giá'], r['Tổng giá thanh toán'], r['Ghi chú'] ];
    vals.forEach(function(v, i){
      var cell = ws.getCell(rr, i+1);
      cell.value = v; cell.border = THIN_BORDER; cell.alignment = { vertical:'middle', wrapText:(i===2) };
      if (isZebra) cell.fill = { type:'pattern', pattern:'solid', fgColor:{argb:BRAND.zebraFillARGB}, bgColor:{argb:BRAND.zebraFillARGB} };
      if (i===0){ cell.numFmt='dd/mm/yyyy'; cell.alignment.horizontal='center'; } // [CHUẨN HAK] ngày thật, căn giữa
      if (i===6){ cell.numFmt='#,##0.00'; cell.alignment.horizontal='right'; }
      if (i===7||i===8){ cell.numFmt='#,##0'; cell.alignment.horizontal='right'; }
    });
  });
  var totalRow = startRow + rows.length, totSL=0, totTT=0;
  rows.forEach(function(r){ totSL += r['Số lượng/trọng lượng']||0; totTT += r['Tổng giá thanh toán']||0; });
  ws.mergeCells(totalRow,1,totalRow,6);
  ws.getCell(totalRow,1).value = 'TỔNG CỘNG';
  ws.getCell(totalRow,7).value = totSL; ws.getCell(totalRow,7).numFmt='#,##0.00';
  ws.getCell(totalRow,9).value = totTT; ws.getCell(totalRow,9).numFmt='#,##0';
  for (var ci3=1; ci3<=NCOLS; ci3++){
    var c3 = ws.getCell(totalRow,ci3);
    c3.font = { bold:true };
    c3.fill = { type:'pattern', pattern:'solid', fgColor:{argb:BRAND.totalFillARGB}, bgColor:{argb:BRAND.totalFillARGB} };
    c3.border = { top:{style:'double', color:{argb:BRAND.headerFillARGB}}, bottom:{style:'thin'}, left:{style:'thin'}, right:{style:'thin'} };
    if (ci3===7||ci3===9) c3.alignment = { horizontal:'right' };
  }
  for (var ciOuter=1; ciOuter<=NCOLS; ciOuter++){
    ws.getCell(10, ciOuter).border = Object.assign({}, ws.getCell(10,ciOuter).border, { top:{style:OUTER_BORDER_STYLE, color:{argb:BRAND.headerFillARGB}} });
    ws.getCell(totalRow, ciOuter).border = Object.assign({}, ws.getCell(totalRow,ciOuter).border, { bottom:{style:OUTER_BORDER_STYLE, color:{argb:BRAND.headerFillARGB}} });
  }
  for (var riOuter=10; riOuter<=totalRow; riOuter++){
    ws.getCell(riOuter,1).border = Object.assign({}, ws.getCell(riOuter,1).border, { left:{style:OUTER_BORDER_STYLE, color:{argb:BRAND.headerFillARGB}} });
    ws.getCell(riOuter,NCOLS).border = Object.assign({}, ws.getCell(riOuter,NCOLS).border, { right:{style:OUTER_BORDER_STYLE, color:{argb:BRAND.headerFillARGB}} });
  }
  var r1 = totalRow+2;
  mergeVal(r1,6,r1,10, bankModalNgayLabel('Đà Nẵng'), { font:{italic:true}, alignment:{horizontal:'center'} });
  mergeVal(r1+1,6,r1+1,10, 'Người lập bảng kê\n(Ký, họ tên)', { font:{bold:true}, alignment:{horizontal:'center',wrapText:true} });
  mergeVal(r1+1,1,r1+1,5, 'Giám đốc\n(Ký, họ tên, đóng dấu)', { font:{bold:true}, alignment:{horizontal:'center',wrapText:true} });

  ws.getColumn(1).width = 14; ws.getColumn(2).width = 22; ws.getColumn(3).width = 30; ws.getColumn(4).width = 15;
  ws.getColumn(5).width = 12; ws.getColumn(6).width = 16; ws.getColumn(7).width = 12; ws.getColumn(8).width = 12;
  ws.getColumn(9).width = 16; ws.getColumn(10).width = 14;
}
/**
 * [BỔ SUNG 2026-09-22] Tải file Excel mẫu đúng cấu trúc cột cho "Sổ chi tiết tiền vay" — theo
 * yêu cầu người dùng ("Sổ chi tiết tiền vay chưa có tải mẫu"). Đúng 8 cột mà
 * `excel-import-worker.js` đọc (dò dòng tiêu đề chứa "Tổng tiền vay" rồi đọc theo TÊN cột, xem
 * JSDoc file đó) — thứ tự khớp đúng dòng hướng dẫn hiển thị cạnh nút tải file thật.
 */
/**
 * [2026-10-29] File mẫu tab "Cập nhật khoản vay" — bảng TH_VAY 3 cột (Ngày hạch toán, Ngày chứng từ,
 * Tổng tiền vay), sheet "TH_VAY". (Tải nguyên sổ phụ VAY vẫn nhận — app tự lọc dòng tiền vay.)
 */
export async function downloadTienVayTemplate(){
  var workbook = new libs.ExcelJS.Workbook();
  var ws = workbook.addWorksheet('TH_VAY');
  ws.addRow(LOAN_FIELDS.map(function(f){ return f[1]; }));
  var hRow = ws.getRow(1);
  hRow.font = { bold:true, color:{argb:'FFFFFFFF'} };
  hRow.eachCell(function(c){ c.fill = { type:'pattern', pattern:'solid', fgColor:{argb:BRAND.headerFillARGB} }; c.alignment = { horizontal:'center', vertical:'middle', wrapText:true }; c.border = THIN_BORDER; });
  var d1 = new Date(Date.UTC(2026, 8, 1)), d2 = new Date(Date.UTC(2026, 8, 3));
  var samples = [ ws.addRow([d1, d1, 500000000]), ws.addRow([d2, d2, 1200000000]) ];
  samples.forEach(function(row){
    row.eachCell({ includeEmpty: true }, function(c, col){
      c.border = THIN_BORDER;
      var type = LOAN_FIELDS[col - 1] && LOAN_FIELDS[col - 1][2];
      if (type === 'date'){ c.numFmt = 'dd/mm/yyyy'; c.alignment = { horizontal:'center' }; }
      if (type === 'money') c.numFmt = '#,##0';
    });
  });
  [16, 16, 20].forEach(function(w, i){ ws.getColumn(i + 1).width = w; });
  var buf = await workbook.xlsx.writeBuffer();
  var blob = new Blob([buf], { type:'application/octet-stream' });
  downloadBlob(blob, 'Mau_TienVay_TH_VAY.xlsx');
}
/**
 * [2026-10-29] "Lưu ra Excel" ở tab Cập nhật khoản vay: các khoản đang hiện (đã lọc) → file 3 cột TH_VAY
 * (ô ngày là NGÀY THẬT, tiền là số), dòng "Tổng cộng" cuối. Đúng định dạng nhập ⇒ nhập lại được ngay
 * (dòng "Tổng cộng" tự bỏ qua khi nhập).
 * @param {Object[]} rows khoản vay (loan-model schema 3)
 */
export async function exportKhoanVayExcel(rows){
  if (!rows || !rows.length){ alert('Chưa có khoản vay nào để lưu ra Excel.'); return; }
  var workbook = new libs.ExcelJS.Workbook();
  var ws = workbook.addWorksheet('TH_VAY');
  ws.addRow(LOAN_FIELDS.map(function(f){ return f[1]; }));
  var hRow = ws.getRow(1);
  hRow.font = { bold:true, color:{argb:'FFFFFFFF'} };
  hRow.eachCell(function(c){ c.fill = { type:'pattern', pattern:'solid', fgColor:{argb:BRAND.headerFillARGB} }; c.alignment = { horizontal:'center', vertical:'middle', wrapText:true }; c.border = THIN_BORDER; });
  var total = 0;
  rows.forEach(function(r){
    total += r.tongTienVay || 0;
    // Ngày chứng từ giữ nguyên chữ nếu file gốc ghi chữ (không đổi dữ liệu người dùng).
    var row = ws.addRow([toExcelDate(r.ngayHachToan), toExcelDate(r.ngayChungTu) || (r.ngayChungTu || null), r.tongTienVay]);
    row.eachCell({ includeEmpty: true }, function(c, col){
      c.border = THIN_BORDER;
      if (col <= 2){ c.numFmt = 'dd/mm/yyyy'; c.alignment = { horizontal:'center' }; } else c.numFmt = '#,##0';
    });
  });
  var tRow = ws.addRow(['Tổng cộng', null, total]);
  tRow.font = { bold:true };
  tRow.eachCell({ includeEmpty: true }, function(c, col){ c.border = THIN_BORDER; c.fill = { type:'pattern', pattern:'solid', fgColor:{argb:BRAND.totalFillARGB} }; if (col === 3) c.numFmt = '#,##0'; });
  [16, 16, 20].forEach(function(w, i){ ws.getColumn(i + 1).width = w; });
  var buf = await workbook.xlsx.writeBuffer();
  var d = new Date();
  downloadBlob(new Blob([buf], { type:'application/octet-stream' }), 'KhoanVay_TH_VAY_' + d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) + '.xlsx');
}
function bankNgayLabel(ngayVal){
  var k = dateKey(ngayVal); if (k==null) return '';
  var y = Math.floor(k/10000), m = Math.floor((k%10000)/100), d = k%100;
  return 'Ngày ' + d + ' Tháng ' + m + ' Năm ' + y;
}
export async function exportTNDNExcel(){
  var info = readBankInfoForm(); saveBankInfo(info);
  var res = RESULTS && RESULTS.tndn; var rows = res ? res.rows : [];
  if (!rows.length){ alert('Không có dữ liệu để xuất (kiểm tra lại khoảng ngày / bấm LẬP BÁO CÁO).'); return; }
  var workbook = new libs.ExcelJS.Workbook();
  buildTNDNWorksheet(workbook, rows, info, res.ngayMax);
  var buf = await workbook.xlsx.writeBuffer();
  var blob = new Blob([buf], { type:'application/octet-stream' });
  var d = new Date();
  downloadBlob(blob, 'BangKe02TNDN_' + d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate()) + '.xlsx');
  closeBankInfoModal();
}
function buildTNDNPdf(rows, info, ngayMax){
  var doc = new libs.jsPDF({ orientation:'landscape' });
  ensurePdfFont(doc);
  var pageW = doc.internal.pageSize.getWidth();
  doc.setFont('Roboto','normal'); doc.setFontSize(7.5); doc.setTextColor(60,60,60);
  doc.text(doc.splitTextToSize('Mẫu số: 02/TNDN\n(Ban hành kèm theo Thông tư số 20/2026/TT-BTC của Bộ trưởng Bộ Tài chính)', 70), pageW-10, 10, { align:'right' });
  doc.setFont('Roboto','bold'); doc.setFontSize(13); doc.setTextColor.apply(doc, BRAND.companyRGB);
  doc.text('BẢNG KÊ THU MUA HÀNG HÓA, DỊCH VỤ KHÔNG CÓ HÓA ĐƠN', pageW/2, 20, { align:'center' });
  doc.setFont('Roboto','normal'); doc.setFontSize(9); doc.setTextColor(20,20,20);
  doc.text(ngayMax ? ('(' + bankNgayLabel(ngayMax) + ')') : '', pageW/2, 26, { align:'center' });
  var y = 33, leftX = 10;
  [ '- Tên doanh nghiệp: ' + CONFIG.TEN_CONG_TY, '- Mã số thuế: ' + info.maSoThue, '- Địa chỉ: ' + info.diaChi,
    '- Số điện thoại: ' + info.soDienThoai, '- Địa chỉ nơi tổ chức thu mua: ' + info.diaChiThuMua
  ].forEach(function(line){ doc.text(line, leftX, y); y += 5; });
  y += 2;
  var totSL=0, totTT=0; rows.forEach(function(r){ totSL += r['Số lượng/trọng lượng']||0; totTT += r['Tổng giá thanh toán']||0; });
  var head = [
    [ {content:'Ngày tháng năm\nmua hàng', rowSpan:2}, {content:'Người bán', colSpan:3}, {content:'Số Điện thoại\n(nếu có)', rowSpan:2}, {content:'Hàng hóa, dịch vụ mua vào', colSpan:4}, {content:'Ghi chú', rowSpan:2} ],
    [ 'Tên người bán','Địa chỉ','Số CCCD','Tên hàng hóa, dịch vụ','Số lượng,\ntrọng lượng','Đơn giá','Tổng giá thanh toán' ]
  ];
  var body = rows.map(function(r){ return [ fmtDate(r['Ngày tháng năm mua hàng']), r['Tên người bán'], r['Địa chỉ'], r['Số CCCD'], r['Số Điện thoại'], r['Tên hàng hóa/dịch vụ'], fmtKL(r['Số lượng/trọng lượng']), fmtMoney(r['Đơn giá']), fmtMoney(r['Tổng giá thanh toán']), r['Ghi chú'] ]; });
  var foot = [[ '', 'TỔNG CỘNG', '', '', '', '', fmtKL(totSL), '', fmtMoney(totTT), '' ]];
  var columnStyles = { 0:{halign:'center'}, 6:{halign:'right'}, 7:{halign:'right'}, 8:{halign:'right'} };
  forcePdfMoneyColumnWidths(doc, body, foot, [7, 8], columnStyles, 6.5); // 7=Đơn giá, 8=Tổng giá thanh toán
  doc.autoTable({
    head: head, body: body, foot: foot, startY: y, theme:'grid', showFoot:'lastPage',
    styles: { font:'Roboto', fontStyle:'normal', fontSize:6.5, halign:'left', valign:'middle', lineColor: BRAND.lineRGB, lineWidth:0.15 },
    headStyles: { font:'Roboto', fontStyle:'bold', halign:'center', fillColor: BRAND.headerRGB, textColor:255 },
    footStyles: { font:'Roboto', fontStyle:'bold', halign:'left', fillColor: BRAND.totalRGB, textColor:[20,20,20] },
    alternateRowStyles: { fillColor: BRAND.zebraRGB },
    columnStyles: columnStyles
  });
  var fy = doc.lastAutoTable.finalY + 10;
  doc.setFont('Roboto','normal'); doc.setFontSize(9);
  doc.text(bankModalNgayLabel('Đà Nẵng'), pageW-10, fy, { align:'right' });
  doc.setFont('Roboto','bold');
  doc.text('Giám đốc\n(Ký, họ tên, đóng dấu)'.split('\n'), 30, fy+6, { align:'center' });
  doc.text('Người lập bảng kê\n(Ký, họ tên)'.split('\n'), pageW-30, fy+6, { align:'center' });
  return doc;
}
export function exportTNDNPDF(){
  var info = readBankInfoForm(); saveBankInfo(info);
  var res = RESULTS && RESULTS.tndn; var rows = res ? res.rows : [];
  if (!rows.length){ alert('Không có dữ liệu để xuất (kiểm tra lại khoảng ngày / bấm LẬP BÁO CÁO).'); return; }
  var doc = buildTNDNPdf(rows, info, res.ngayMax);
  var d = new Date();
  doc.save('BangKe02TNDN_' + d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate()) + '.pdf');
  closeBankInfoModal();
}
/* ---------- Phiếu nhập kho xuất hàng loạt (Mẫu 01-VT/QĐ 48/2006/QĐ-BTC) — mỗi dòng (1 ngày) 1 trang PDF ---------- */
/* Đọc số tiền (VNĐ nguyên, không có hào/xu) ra chữ tiếng Việt theo đúng cách đọc kế toán
   (vd 105 → "Một trăm lẻ năm", 21000 → "Hai mươi mốt nghìn"). Đã kiểm thử khớp 100% với
   7 giá trị "Số tiền bằng chữ" có sẵn trong file PHIEUNHAPKHO gốc — xem VALIDATION.md §6. */
function buildPNKPdf(rows, info){
  var doc = new libs.jsPDF({ orientation:'portrait' });
  ensurePdfFont(doc);
  var pageW = doc.internal.pageSize.getWidth(), pageH = doc.internal.pageSize.getHeight();
  rows.forEach(function(r, idx){
    if (idx>0) doc.addPage();
    var y = 15;
    doc.setFont('Roboto','bold'); doc.setFontSize(10); doc.setTextColor(20,20,20);
    doc.text(CONFIG.TEN_CONG_TY, 12, y);
    doc.setFont('Roboto','normal'); doc.setFontSize(8);
    doc.text(doc.splitTextToSize(info.diaChi||'', 90), 12, y+5);
    doc.setFontSize(8);
    doc.text('Mẫu số: 01 – VT', pageW-12, y, { align:'right' });
    doc.text('(Ban hành theo QĐ số: 48/2006/QĐ-BTC', pageW-12, y+4, { align:'right' });
    doc.text('Ngày 14/9/2006 của Bộ trưởng BTC)', pageW-12, y+8, { align:'right' });
    y += 18;
    doc.setFont('Roboto','bold'); doc.setFontSize(13);
    doc.text('PHIẾU NHẬP KHO', pageW/2, y, { align:'center' });
    doc.setFont('Roboto','normal'); doc.setFontSize(9);
    doc.text('Nợ: ' + (info.noPNK||'') + '...........................', pageW-12, y, { align:'right' });
    y += 6;
    doc.text('Ngày ' + fmtDate(r['Ngày nhập kho']), pageW/2, y, { align:'center' });
    doc.text('Có: ' + (info.coPNK||'') + '...........................', pageW-12, y, { align:'right' });
    y += 6;
    doc.text('Số: ' + (r['Số CT']||''), pageW/2, y, { align:'center' });
    y += 9;
    doc.setFontSize(9);
    doc.text('Họ và tên người giao : ' + (info.nguoiGiao||''), 12, y); y += 6;
    doc.text('Nhập tại kho : ' + (info.nhapTaiKho||''), 12, y); y += 6;
    doc.text(doc.splitTextToSize('Địa điểm : ' + (info.diaDiemPNK||''), pageW-24), 12, y); y += 10;

    var head = [[
      {content:'STT',rowSpan:2}, {content:'Hàng hóa',rowSpan:2}, {content:'Mã số',rowSpan:2}, {content:'Đơn vị tính',rowSpan:2},
      {content:'Số lượng',colSpan:2}, {content:'Đơn giá\n(đồng)',rowSpan:2}, {content:'Thành tiền\n(đồng)',rowSpan:2}
    ], [ 'Theo chứng từ','Thực nhập' ]];
    var body = [
      [ '01', 'Gỗ tròn keo', '', 'Tấn', fmtKL(r['Khối lượng']), fmtKL(r['Khối lượng']), fmtMoney(r['Đơn giá thanh toán']), fmtMoney(r['Thành tiền']) ],
      [ '', 'Cộng', '', '', '', '', '', fmtMoney(r['Thành tiền']) ]
    ];
    var columnStyles = { 6:{halign:'right'}, 7:{halign:'right'} };
    forcePdfMoneyColumnWidths(doc, body, null, [6, 7], columnStyles, 8.5); // 6=Đơn giá, 7=Thành tiền (dòng "Cộng" đã nằm trong body)
    doc.autoTable({
      head: head, body: body, startY: y, theme:'grid', margin:{left:12,right:12},
      styles: { font:'Roboto', fontStyle:'normal', fontSize:8.5, halign:'center', valign:'middle', lineColor:[120,120,120], lineWidth:0.2 },
      headStyles: { font:'Roboto', fontStyle:'bold', halign:'center', fillColor:[235,238,242], textColor:[20,20,20] },
      columnStyles: columnStyles
    });
    y = doc.lastAutoTable.finalY + 8;
    doc.setFont('Roboto','normal'); doc.setFontSize(9);
    doc.text(doc.splitTextToSize('Tổng số tiền (viết bằng chữ): ' + (r['Số tiền bằng chữ']||''), pageW-24), 12, y);
    y += 16;
    var cols4 = [22, 22+42, 22+84, 22+126];
    doc.setFont('Roboto','bold'); doc.setFontSize(9);
    ['Người lập phiếu','Người giao hàng','Thủ Kho','Giám đốc'].forEach(function(t,i){ doc.text(t, cols4[i], y, { align:'center' }); });
    doc.setFont('Roboto','normal'); doc.setFontSize(8);
    ['(Ký, họ tên)','(Ký, họ tên)','(Ký, họ tên)','(Ký, họ tên, đóng dấu)'].forEach(function(t,i){ doc.text(t, cols4[i], y+5, { align:'center' }); });
    doc.setFont('Roboto','normal'); doc.setFontSize(9);
    [info.nguoiLap, info.nguoiGiao, info.thuKho, info.giamDoc].forEach(function(t,i){ doc.text(t||'', cols4[i], y+22, { align:'center' }); });
    doc.setFont('Roboto','normal'); doc.setFontSize(7); doc.setTextColor(140,140,140);
    doc.text('Trang ' + (idx+1) + '/' + rows.length, pageW-12, pageH-8, { align:'right' });
  });
  return doc;
}
export function exportPNKPdf(){
  var info = readBankInfoForm(); saveBankInfo(info);
  var res = RESULTS && RESULTS.pnk; var allRows = res ? res.rows : [];
  if (!allRows.length){ alert('Không có dữ liệu để xuất (kiểm tra lại khoảng ngày / bấm LẬP BÁO CÁO).'); return; }
  var rows = selectedPnkRows(allRows);
  if (!rows.length){ alert('Chưa chọn phiếu nhập kho nào để in.'); return; }
  if (rows.length > 400 && !confirm('Sẽ xuất ' + rows.length + ' trang phiếu trong 1 file PDF, có thể mất vài giây. Tiếp tục?')) return;
  var doc = buildPNKPdf(rows, info);
  var d = new Date();
  doc.save('PhieuNhapKho_' + d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate()) + '.pdf');
  closeBankInfoModal();
}
