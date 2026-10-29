/**
 * In báo cáo (nút "🖨 In"): dựng trang in theo mẫu Excel rồi gọi window.print().
 *
 * [Phase 4.2 — 2026-10-06] Tách NGUYÊN VĂN từ legacy-app.js (không đổi logic) để mỗi file < 800
 * dòng, dễ đọc/bảo trì. Kiểm chứng: `npm run test:export-golden` (36 file xuất khớp từng ô/chữ)
 * + toàn bộ bộ test. Import vòng với legacy-app.js (RESULTS/runReport) an toàn — chỉ dùng bên
 * trong hàm xử lý sự kiện, không dùng lúc nạp module (xem ARCHITECTURE.md).
 * @module services/export/print-sheet
 */
import { alignClass, cellDisplay, fmtCell } from '../../components/report-table.js';
import { REPORT_KEYS } from '../../constants/columns.js';
import { TABLES } from '../../store/state.js';
import { $, $$, esc } from '../../utils/dom-utils.js';
import { companyNameFor, reportDateLabel, reportTitle, unitNote } from './report-meta.js';

/* Xây khối HTML "trang in theo mẫu Excel": Tên công ty / Tiêu đề báo cáo / Ngày / bảng đủ dữ liệu (không phân trang) + dòng Tổng cộng */
function buildPrintSheet(key){
  var st = TABLES[key];
  if (!st) return '';
  var rows = st.view || st.rows || [];
  var cols = st.cols;
  var thead = '<tr>' + cols.map(function(c){
    var numCls = alignClass(c[2]) ? ' class="'+alignClass(c[2]).trim()+'"' : '';
    return '<th'+numCls+'>'+esc(c[1])+'</th>';
  }).join('') + '</tr>';
  var tbody = rows.map(function(r){
    return '<tr>' + cols.map(function(c, i){
      var numCls = alignClass(c[2]) ? ' class="'+alignClass(c[2]).trim()+'"' : '';
      return '<td'+numCls+'>'+cellDisplay(r, c, i)+'</td>';
    }).join('') + '</tr>';
  }).join('');
  // [BUGFIX 2026-09-23] Người dùng báo: bản in "BKLS..." nhiều trang bị "kẻ khung lở dở" và dòng
  // "Tổng cộng" xuất hiện lặp lại ở MỌI trang (không chỉ ở cuối) — nguyên nhân: dòng Tổng cộng
  // trước đây nằm trong <tfoot> của bảng HTML; khi 1 bảng dài bị ngắt trang lúc in, trình duyệt
  // tự lặp lại <thead>/<tfoot> ở MỖI trang (đúng chuẩn CSS, hữu ích cho <thead> — lặp lại tiêu đề
  // cột — nhưng SAI cho <tfoot> ở đây vì đây là 1 dòng TỔNG CỘNG DUY NHẤT của cả báo cáo, không
  // phải tổng riêng từng trang), và viền bảng bị vẽ ngắt quãng ngay tại điểm chia trang đó. Sửa
  // bằng cách đưa dòng Tổng cộng thành DÒNG CUỐI CÙNG của <tbody> (không dùng <tfoot> nữa) — chỉ
  // in ra đúng 1 lần, ngay sau dòng dữ liệu cuối, không bị lặp lại theo trang.
  var totalRow = '';
  if (st.totals){
    totalRow = '<tr class="psTotalRow">' + cols.map(function(c,i){
      var numCls = alignClass(c[2]) ? ' class="'+alignClass(c[2]).trim()+'"' : '';
      if (i===0) return '<td'+numCls+'>Tổng cộng</td>';
      if (st.totals.hasOwnProperty(c[0])) return '<td'+numCls+'>'+fmtCell(st.totals[c[0]], c[2])+'</td>';
      return '<td></td>';
    }).join('') + '</tr>';
  }
  return (
    '<div class="psHead">'+esc(companyNameFor(key))+'</div>' +
    '<div class="psTitle">'+esc(reportTitle(key))+'</div>' +
    '<div class="psDate">'+esc(reportDateLabel() + unitNote(cols, reportDateLabel()))+'</div>' +
    '<table class="psTable"><thead>'+thead+'</thead><tbody>'+(tbody||'')+totalRow+'</tbody></table>'
  );
}
export function showReportTab(key){
  var btn = document.querySelector('.rtab[data-rtab="'+key+'"]');
  var scope = btn ? btn.closest('.section') : document;
  $$('.rtab', scope).forEach(function(b){ b.classList.toggle('active', b.dataset.rtab===key); });
  $$('.reportPanel', scope).forEach(function(p){ p.classList.toggle('active', p.dataset.rpanel===key); });
}
export function printSection(key){
  if (REPORT_KEYS.indexOf(key) >= 0 && TABLES[key]){
    // In theo mẫu Excel: Tên công ty / Tiêu đề báo cáo / Ngày / toàn bộ dữ liệu (không theo trang) + Tổng cộng
    $('#printSheet').innerHTML = buildPrintSheet(key);
    document.body.classList.add('printingSheet');
    $('#printSheet').classList.add('active');
    window.print();
    $('#printSheet').classList.remove('active');
    document.body.classList.remove('printingSheet');
    return;
  }
  $$('.section').forEach(function(s){ s.classList.remove('print-active'); });
  $('#sec-'+key).classList.add('print-active');
  window.print();
}
