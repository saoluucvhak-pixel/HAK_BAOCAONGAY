/**
 * Xuất PDF (jsPDF + autoTable, font Roboto nhúng sẵn) cho báo cáo dạng bảng.
 *
 * [Phase 4.2 — 2026-10-06] Tách NGUYÊN VĂN từ legacy-app.js (không đổi logic) để mỗi file < 800
 * dòng, dễ đọc/bảo trì. Kiểm chứng: `npm run test:export-golden` (36 file xuất khớp từng ô/chữ)
 * + toàn bộ bộ test. Import vòng với legacy-app.js (RESULTS/runReport) an toàn — chỉ dùng bên
 * trong hàm xử lý sự kiện, không dùng lúc nạp module (xem ARCHITECTURE.md).
 * @module services/export/pdf-export
 */
import { fmtCell } from '../../components/report-table.js';
import { PDF_FONT_BOLD_B64, PDF_FONT_REGULAR_B64 } from '../../config/pdf-fonts.js';
import { BRAND } from '../../constants/brand.js';
import { libs } from '../export-libs.js';
import { TABLES } from '../../store/state.js';
import { pad2 } from '../../utils/date-utils.js';
import { companyNameFor, reportDateLabel, reportTitle, unitNote } from './report-meta.js';

/* QUAN TRỌNG: addFont() đăng ký font vào ĐÚNG 1 document jsPDF instance đang truyền vào (doc),
   KHÔNG dùng chung được giữa các document khác nhau. Mỗi lần bấm xuất PDF, exportPDF()/buildWOPdf()/
   buildTNDNPdf()/buildPNKPdf() đều tạo `new libs.jsPDF()` MỚI — nên phải addFont lại trên MỌI document,
   không được dùng 1 cờ toàn cục để bỏ qua từ lần xuất PDF thứ 2 trong cùng phiên làm việc (nếu bỏ qua,
   PDF thứ 2+ sẽ rơi về font mặc định không có dấu tiếng Việt — đây từng là nguyên nhân thật của lỗi
   "mất dấu tiếng Việt" khi xuất nhiều PDF liên tiếp, không phải do cache trình duyệt cũ). */
export function ensurePdfFont(doc){
  doc.addFileToVFS('Roboto-Regular.ttf', PDF_FONT_REGULAR_B64);
  doc.addFont('Roboto-Regular.ttf', 'Roboto', 'normal');
  doc.addFileToVFS('Roboto-Bold.ttf', PDF_FONT_BOLD_B64);
  doc.addFont('Roboto-Bold.ttf', 'Roboto', 'bold');
  doc.setFont('Roboto', 'normal');
}
/* [SỬA 2026-09-23] Cùng lỗi cột tiền bị ngắt dòng ngay trước "đ" (đã sửa ở exportPDF() —
   báo cáo dùng nút "📄 PDF" chung) cũng xảy ra ở CÁC MẪU PDF RIÊNG (mỗi mẫu tự gọi
   doc.autoTable() với cấu trúc cột khác nhau: mẫu "Bảng kê WO", mẫu "02/TNDN", "Phiếu nhập
   kho") — 3 hàm buildWOPdf()/buildTNDNPdf()/buildPNKPdf() chưa được áp dụng bản sửa lúc đó vì
   chỉ sửa trong exportPDF(). Tách logic đo & ép bề rộng cột tiền thành hàm dùng chung để áp
   dụng đồng bộ cho MỌI nơi xuất PDF có cột tiền, tránh sót như lần trước.
   fontSize/fontStyle phải khớp đúng styles dùng trong bảng đó thì đo mới đúng. */
export function forcePdfMoneyColumnWidths(doc, body, foot, moneyColIndexes, columnStyles, fontSize){
  // 5/scaleFactor(mm) — đúng bằng cellPadding mặc định của jspdf-autotable khi không tự đặt cellPadding riêng
  var PDF_CELL_PAD_DEFAULT = 5 * 25.4 / 72;
  moneyColIndexes.forEach(function(i){
    var maxW = 0;
    doc.setFont('Roboto', 'normal'); doc.setFontSize(fontSize);
    (body||[]).forEach(function(r){ maxW = Math.max(maxW, doc.getTextWidth(r[i] || '')); });
    if (foot){
      doc.setFont('Roboto', 'bold');
      foot.forEach(function(r){ maxW = Math.max(maxW, doc.getTextWidth(r[i] || '')); });
    }
    if (!columnStyles[i]) columnStyles[i] = {};
    columnStyles[i].cellWidth = maxW + PDF_CELL_PAD_DEFAULT * 2 + 0.5;
  });
}
export function exportPDF(key){
  var st = TABLES[key]; if (!st) return;
  var doc = new libs.jsPDF({ orientation: 'landscape', unit:'mm', format:'a4' });
  ensurePdfFont(doc); // nhúng font Roboto (hỗ trợ dấu tiếng Việt) — tránh lỗi font khi xuất PDF
  var pageW = doc.internal.pageSize.getWidth();
  doc.setFont('Roboto','bold'); doc.setFontSize(13); doc.setTextColor.apply(doc, BRAND.companyRGB);
  doc.text(companyNameFor(key), pageW/2, 12, { align:'center' });
  doc.setFontSize(12); doc.setTextColor(20,20,20);
  doc.text(reportTitle(key), pageW/2, 19, { align:'center' });
  doc.setFont('Roboto','normal'); doc.setFontSize(9); doc.setTextColor(90,90,90);
  doc.text(reportDateLabel() + unitNote(st.cols, reportDateLabel()), pageW/2, 24.5, { align:'center' });
  doc.setDrawColor.apply(doc, BRAND.companyRGB); doc.setLineWidth(0.4);
  doc.line(10, 27, pageW-10, 27);

  // [SỬA 2026-09-23] Cột tiền trong PDF (xuất từ autoTable) bị ngắt dòng ngay trước đơn vị "đ"
  // khi cột quá hẹp (nhiều cột dồn trên 1 trang) — cùng lỗi đã sửa ở thẻ KPI Dashboard. Sửa bằng
  // cách đo & ép bề rộng tối thiểu cho cột tiền bằng đúng font/cỡ chữ dùng trong bảng, đảm bảo
  // luôn đủ chỗ cho chuỗi dài nhất của CHÍNH cột đó — autoTable chỉ ngắt dòng khi nội dung KHÔNG
  // vừa bề rộng cột, nên cột đủ rộng thì không còn lý do để ngắt, không cần đổi ký tự khoảng
  // trắng nào cả.
  // [ĐÃ THỬ NHƯNG BỎ] Ban đầu có đổi khoảng trắng trước "đ" thành khoảng trắng không ngắt dòng
  // (NBSP, U+00A0) làm lớp bảo vệ thêm — nhưng phát hiện qua test: font Roboto nhúng trong PDF
  // render SAI "đ" thành "d" (mất gạch ngang) khi đứng ngay sau NBSP. Đã bỏ hẳn phần này, chỉ
  // giữ lại cách ép bề rộng cột (an toàn, không đụng tới ký tự hiển thị).
  var head = [st.cols.map(function(c){ return c[1]; })];
  var body = (st.view||[]).map(function(r){ return st.cols.map(function(c, i){ return (i === 0 && r._label) ? r._label : fmtCell(r[c[0]], c[2]); }); });
  var foot = st.totals ? [st.cols.map(function(c,i){
    if (i===0) return 'Tổng cộng';
    return st.totals.hasOwnProperty(c[0]) ? fmtCell(st.totals[c[0]], c[2]) : '';
  })] : undefined;
  var columnStyles = {};
  st.cols.forEach(function(c,i){
    var isNum = (c[2]==='money'||c[2]==='kl'||c[2]==='int');
    var isCenter = (c[2]==='date'||c[2]==='time'||c[2]==='datekey');
    columnStyles[i] = { halign: isNum ? 'right' : (isCenter ? 'center' : 'left') };
  });
  var PDF_CELL_PAD = 1.6; // khớp đúng styles.cellPadding của autoTable() bên dưới
  st.cols.forEach(function(c, i){
    if (c[2] !== 'money') return;
    var maxW = 0;
    doc.setFont('Roboto','bold'); doc.setFontSize(8);
    maxW = Math.max(maxW, doc.getTextWidth(head[0][i] || ''));
    doc.setFont('Roboto','normal'); doc.setFontSize(8);
    body.forEach(function(r){ maxW = Math.max(maxW, doc.getTextWidth(r[i] || '')); });
    if (foot) { doc.setFont('Roboto','bold'); maxW = Math.max(maxW, doc.getTextWidth(foot[0][i] || '')); }
    columnStyles[i].cellWidth = maxW + PDF_CELL_PAD * 2 + 0.5;
  });
  doc.autoTable({
    head: head, body: body, foot: foot, startY: 31,
    margin: { left:8, right:8, bottom:14 },
    theme: 'grid',
    showFoot: 'lastPage',
    styles: { font:'Roboto', fontStyle:'normal', fontSize:8, cellPadding:1.6, lineColor: BRAND.lineRGB, lineWidth:0.15, textColor:[30,30,30] },
    headStyles: { font:'Roboto', fontStyle:'bold', fillColor: BRAND.headerRGB, textColor:255, halign:'center', valign:'middle' },
    footStyles: { font:'Roboto', fontStyle:'bold', fillColor: BRAND.totalRGB, textColor:[20,20,20] },
    alternateRowStyles: { fillColor: BRAND.zebraRGB },
    columnStyles: columnStyles,
    didDrawPage: function(data){
      doc.setFont('Roboto','normal'); doc.setFontSize(8); doc.setTextColor(120,120,120);
      doc.text('In lúc ' + new Date().toLocaleString('vi-VN'), 10, doc.internal.pageSize.getHeight()-6);
    }
  });
  // đánh số trang "Trang X/Y" — phải làm sau khi autoTable vẽ hết mọi trang mới biết tổng số trang
  var totalPages = doc.internal.getNumberOfPages();
  for (var p=1; p<=totalPages; p++){
    doc.setPage(p);
    doc.setFont('Roboto','normal'); doc.setFontSize(8); doc.setTextColor(120,120,120);
    doc.text('Trang ' + p + '/' + totalPages, pageW-10, doc.internal.pageSize.getHeight()-6, { align:'right' });
  }
  var d = new Date();
  doc.save('BaoCaoNgay_' + d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate()) + '_' + key + '.pdf');
}
