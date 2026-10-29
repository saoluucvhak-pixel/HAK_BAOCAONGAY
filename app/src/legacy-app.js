/**
 * [LEGACY_APP → nay là ĐIỀU PHỐI] Sau Phase 4.2 (06/10/2026) file này chỉ còn:
 *  - `runReport()` + `RESULTS`: chạy 15 hàm compute*() (services/report-service.js) theo bộ lọc rồi giao
 *    cho các component vẽ bảng/dashboard;
 *  - `initEvents()`/`boot()`: gắn sự kiện cho các nút, khởi động app, bắt lỗi toàn cục, nạp sẵn thư
 *    viện xuất file lúc rảnh.
 * Xuất Excel/PDF/In, mẫu WO/02-TNDN/Phiếu nhập kho → `services/export/*`; Danh mục → `components/
 * dm-tables.js`; modal Tàu → `components/tau-modal.js` (xem ARCHITECTURE.md §5c).
 *
 * Import vòng có chủ đích: report-table, dashboard, data-service, backup-restore, loan-editor và các
 * module export/* import ngược `RESULTS`/`runReport` từ file này — an toàn vì chỉ dùng bên trong hàm xử
 * lý sự kiện (sau khi mọi module đã nạp xong), không dùng lúc nạp module.
 */
// [PERF-06] ExcelJS/jsPDF/jspdf-autotable nạp KHI CẦN (lần đầu bấm xuất file) — xem services/export-libs.js.
// Mọi nút xuất đi qua runExport() (services/export-runner.js), nơi đã bảo đảm thư viện sẵn sàng trước khi gọi.
import { ensureExportLibs } from './services/export-libs.js';
import { CONFIG } from './config/config.js';

import { NHAPKEO_COLS, XECHO_COLS, THANHTOAN_COLS, CONGNO_COLS, HOTRO_COLS, TROGIA_COLS, TONGHOPTRO_COLS, HOAHONG_COLS, BKLSCT_COLS, BKLSTH_COLS, TAUTONGHOP_COLS, BANKVAY_COLS, BANKTHTT_COLS, BANKTNDN_COLS, BANKPNK_COLS } from './constants/columns.js';
import { pad2, toKeyFromInput, dateKeyToday } from './utils/date-utils.js';

import { computeNhapKeo, computeXeCho1h, computeThanhToan, computeCongNo, computeHoTroOrTroGia, computeTongHopHoTro, computeHoaHongDL, computeTongHopNgay, computeXuatHang01, computeXuatHang02, computeTauTongHop, computeSoTienVay, computeTongHopThanhToan, computeBankTNDN, computePhieuNhapKho, sumCols } from './services/report-service.js';
import { storageService } from './services/storage-service.js';
import { logger } from './services/logger.js';

import { $, $$ } from './utils/dom-utils.js';
import { STATE, loadDM, applyFilters } from './store/state.js';
import { setStatus, loadAllData } from './services/data-service.js';
import { renderReportTable } from './components/report-table.js';
import { renderDashboard } from './components/dashboard.js';
import { initLoanEditor, getLoanView } from './components/loan-editor.js';
import { initThemePicker } from './components/theme-picker.js';
import { initOpeningBalance, initLuyKeMode, renderTienVayKpi, renderThttKpi } from './components/tienvay-summary.js';
import { pushUndoSnapshot, undo, redo } from './store/app-state.js';
import { backupData, restoreData } from './services/backup-restore.js';
import { loadTauAssignments } from './services/tau-assignment.js';
import { runExport } from './services/export-runner.js';

import { onDMChanged, renderDMTables } from './components/dm-tables.js';
import { closeTauModal, confirmTauAssignClick, confirmTauUnassignClick, openTauModal, renderTauRowList, tauNorm, updateTauSelectedCount } from './components/tau-modal.js';
import { BANK_INFO_MODAL_MODE, closeBankInfoModal, downloadTienVayTemplate, exportKhoanVayExcel, exportPNKPdf, exportTNDNExcel, exportTNDNPDF, openBankInfoModal } from './services/export/bank-forms.js';
import { exportAllExcel, exportBankExcel, exportLamSanExcel, exportNgayExcel } from './services/export/excel-export.js';
import { showReportTab } from './services/export/print-sheet.js';
import { closeWOModal, exportWOExcel, exportWOPDF, openWOModal } from './services/export/wo-form.js';

/* ============================================================
   [STATE] Kho dữ liệu trong bộ nhớ — nay nằm ở store/state.js (import ở trên).
   ============================================================ */

/* ============================================================
   [DATA_SERVICE] GoogleSheetService — fetch CSV (1 lần/refresh), chuẩn hoá,
   nạp vào STATE. Đây là ranh giới duy nhất chạm tới Google Sheet.
   ============================================================ */

/* ============================================================
   [DATA_SERVICE] Áp dụng bộ lọc (Đại lý / Nguồn gốc / Khách hàng / Biển số)
   — lọc hoàn toàn trong bộ nhớ (STATE), không gọi lại Google Sheet.
   ============================================================ */

/* ============================================================
   [REPORT_SERVICE] Điều phối — chạy toàn bộ các báo cáo + Dashboard theo bộ
   lọc/khoảng ngày hiện tại, gọi các hàm compute*() ở trên rồi giao cho UI_SERVICE
   render (RESULTS = model dùng chung cho bảng, dashboard, export, đối chiếu).
   ============================================================ */
export function runReport(){
  var ctx = applyFilters();
  STATE.filtered = ctx;
  var fromKey = toKeyFromInput($('#fFrom').value);
  var toKey = toKeyFromInput($('#fTo').value);
  var reportKey = toKey != null ? toKey : (fromKey != null ? fromKey : dateKeyToday());

  var nhap = computeNhapKeo(ctx.phieucan, fromKey, toKey);
  var xecho = computeXeCho1h(nhap.rows);
  var tt = computeThanhToan(ctx.dntt, ctx.phieucanBySoCT, fromKey, toKey);
  var congno = computeCongNo(ctx.phieucan, ctx.dnttBySoCT, reportKey);
  var hotro = computeHoTroOrTroGia(ctx.phieucan, STATE.dmht, fromKey, toKey, 'Cuối tháng', 'Tiền hỗ trợ');
  var trogia = computeHoTroOrTroGia(ctx.phieucan, STATE.dmht, fromKey, toKey, 'Khi thanh toán', 'Tiền trợ giá');
  var tonghoptro = computeTongHopHoTro(hotro.rows);
  var hoahong = computeHoaHongDL(ctx.dntt, ctx.phieucanBySoCT, STATE.dmdl, fromKey, toKey);
  var tonghop = computeTongHopNgay(ctx.phieucan, ctx.dntt, ctx.phieucanBySoCT, fromKey, toKey); // {rows, cols, totals} — cols/totals tự sinh động theo ĐL/NG thật có trong dữ liệu, xem report-service.js
  var tauAssignments = loadTauAssignments();
  var bklsct = computeXuatHang01(STATE.hosokeo, STATE.hdmbByKey, fromKey, toKey, tauAssignments);
  var bklsth = computeXuatHang02(bklsct.rows);
  // [MỚI] "Tổng hợp nguyên liệu xuất theo tàu" — tính trên TOÀN BỘ HOSOKEO (fromKey=toKey=null,
  // không giới hạn theo khoảng ngày đang lọc), vì 1 tàu có thể nhận hàng dồn từ nhiều kỳ báo cáo
  // khác nhau, không chỉ kỳ đang xem — xem JSDoc computeTauTongHop() trong report-service.js.
  var bklsAllRows = computeXuatHang01(STATE.hosokeo, STATE.hdmbByKey, null, null, tauAssignments).rows;
  var tautonghop = computeTauTongHop(bklsAllRows, tauAssignments);
  var tienvay = computeSoTienVay(STATE.vayRecords, STATE.dntt, fromKey, toKey, STATE.soDuDauSo, STATE.tienVayLuyKe); // vay: khoản vay TH_VAY (tab 1); chi: TOÀN BỘ DNTT_CT như Power Query
  var thtt = computeTongHopThanhToan(STATE.dntt, fromKey, toKey); // THTT_NH: toàn bộ DNTT_CT như Power Query
  var tndn = computeBankTNDN(ctx.dntt, ctx.phieucanBySoCT, STATE.hdnccBySoHopDong, fromKey, toKey);
  var pnk = computePhieuNhapKho(ctx.phieucan, fromKey, toKey);

  // tonghop.rows (không phải cả object {rows,cols,totals}) — dashboard.js (biểu đồ) đọc
  // RESULTS.tonghop như 1 mảng (`.map(...)`), phải giữ đúng shape cũ để không vỡ biểu đồ.
  RESULTS = { nhap: nhap, xecho: xecho, tt: tt, congno: congno, hotro: hotro, trogia: trogia, tonghoptro: tonghoptro, hoahong: hoahong, tonghop: tonghop.rows, bklsct: bklsct, bklsth: bklsth, tautonghop: tautonghop, tienvay: tienvay, thtt: thtt, tndn: tndn, pnk: pnk };

  renderReportTable('nhapkeo', nhap.rows, NHAPKEO_COLS, { 'KL hàng (KG)': nhap.totalKL, 'Thành tiền': nhap.totalTien });
  renderReportTable('xecho', xecho, XECHO_COLS, null);
  renderReportTable('thanhtoan', tt.rows, THANHTOAN_COLS, { 'Khối lượng': tt.totalKL, 'Thành tiền': tt.totalTien });
  renderReportTable('congno', congno.rows, CONGNO_COLS, { 'KL hàng (KG)': congno.totalKL, 'Thành tiền': congno.totalTien });
  renderReportTable('hotro', hotro.rows, HOTRO_COLS, { 'Khối lượng_Tấn': hotro.totalKL, 'Tiền hỗ trợ': hotro.totalTien });
  renderReportTable('trogia', trogia.rows, TROGIA_COLS, { 'Khối lượng_Tấn': trogia.totalKL, 'Tiền trợ giá': trogia.totalTien });
  renderReportTable('tonghoptro', tonghoptro, TONGHOPTRO_COLS, sumCols(tonghoptro, ['Khối lượng_Tấn','Tiền hỗ trợ','Khấu trừ thuế TNCN','Còn thanh toán']));
  renderReportTable('hoahong', hoahong, HOAHONG_COLS, sumCols(hoahong, ['Khối lượng thanh toán','Tiền hoa hồng']));
  renderReportTable('tonghop', tonghop.rows, tonghop.cols, tonghop.totals);
  renderReportTable('bklsct', bklsct.rows, BKLSCT_COLS, { 'Khối lượng (Tấn)': bklsct.totalKL, 'Thanh toán': bklsct.totalTT });
  renderReportTable('bklsth', bklsth.rows, BKLSTH_COLS, { 'Khối lượng_Tấn': bklsth.totalKL, 'Tổng trị giá': bklsth.totalTT });
  renderReportTable('tautonghop', tautonghop.rows, TAUTONGHOP_COLS, { 'Số dòng BKLS': tautonghop.totalDong, 'Khối lượng_Tấn': tautonghop.totalKL, 'Tổng thanh toán': tautonghop.totalTT });
  renderReportTable('tienvay', tienvay.rows, BANKVAY_COLS, { 'Tổng tiền vay': tienvay.totalVay, 'Tổng tiền chi': tienvay.totalChi });
  renderTienVayKpi(tienvay, fromKey); // thẻ số liệu tổng phía trên sổ — cùng số với bảng
  renderReportTable('thtt', thtt.rows, BANKTHTT_COLS, { 'Khối lượng': thtt.totalKL, 'Thành tiền': thtt.totalTien });
  renderThttKpi(thtt); // thẻ số liệu tổng Tổng hợp thanh toán — cùng số với bảng
  renderReportTable('tndn', tndn.rows, BANKTNDN_COLS, { 'Số lượng/trọng lượng': tndn.totalSL, 'Tổng giá thanh toán': tndn.totalTT });
  renderReportTable('pnk', pnk.rows, BANKPNK_COLS, { 'Khối lượng': pnk.totalKL, 'Thành tiền': pnk.totalTT });

  renderDashboard(ctx, reportKey);
}

export let RESULTS = null;

/* ============================================================
   tổng — thuần thao tác DOM, không chứa business logic (đọc từ RESULTS/CONSTANTS).
   ============================================================ */

/* ============================================================
   [UI_SERVICE] Dashboard — KPI tính từ cùng RESULTS với các báo cáo chi tiết
   (không có công thức KPI riêng khác báo cáo), vẽ biểu đồ bằng Chart.js.
   ============================================================ */

/* ============================================================
   [UI_SERVICE] Đối chiếu Excel — nhập tay số liệu từ Excel gốc để so sánh với số
   HTML tính ra (công cụ hỗ trợ VALIDATION.md), lưu localStorage giữa các lần mở.
   ============================================================ */

/* ============================================================
   [EXPORT_SERVICE] Xuất dữ liệu: In / PDF (jsPDF + font Roboto nhúng sẵn) /
   Excel (ExcelJS, có định dạng đậm/viền/số) — luôn xuất TOÀN BỘ dữ liệu đã lọc,
   không chỉ trang đang xem.
   ============================================================ */
/* ============================================================
   [UI_SERVICE] Điều hướng / gắn sự kiện / khởi động ứng dụng (boot)
   ============================================================ */
function showSection(target){
  $$('.item', $('#navList')).forEach(function(it){ it.classList.toggle('active', it.dataset.target===target); });
  $$('.section').forEach(function(s){ s.classList.remove('active'); });
  $('#sec-'+target).classList.add('active');
  $('#side').classList.remove('open');
}
function initDefaultDates(){
  var d = new Date();
  var first = d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-01';
  var todayStr = d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate());
  $('#fFrom').value = first; $('#fTo').value = todayStr;
}
/* [FIX] Gắn sự kiện an toàn: nếu 1 id không tồn tại trong DOM (vd lỡ gõ sai id khi sửa
   HTML sau này), bản gốc sẽ ném lỗi ngay tại addEventListener() và làm initEvents() dừng
   giữa chừng — mọi nút bấm khai báo SAU dòng lỗi đó sẽ KHÔNG được gắn sự kiện, mà không có
   cảnh báo rõ ràng nào ngoài lỗi im lặng trong console. on() chỉ bỏ qua (kèm cảnh báo
   console) đúng 1 nút bị thiếu thay vì làm hỏng toàn bộ phần còn lại của initEvents().
   Với HTML hiện tại (mọi id đều tồn tại) hành vi hoàn toàn không đổi. */
function on(selector, event, handler){
  var el = $(selector);
  if (!el){ logger.warn('[initEvents] Không tìm thấy phần tử "'+selector+'" — bỏ qua gắn sự kiện "'+event+'".'); return; }
  el.addEventListener(event, handler);
}
function initEvents(){
  $$('.item', $('#navList')).forEach(function(it){ it.addEventListener('click', function(){ showSection(it.dataset.target); }); });
  $$('.rtab').forEach(function(b){ b.addEventListener('click', function(){ showReportTab(b.dataset.rtab); }); });
  on('#sideToggle', 'click', function(){ $('#side').classList.toggle('open'); });
  on('#btnLapBC', 'click', runReport);
  on('#btnReload', 'click', loadAllData);
  // [2026-09-22] Tách "Xuất tất cả Excel" thành 2 nút riêng (trước đó gộp 1 nút ra 2 file, nay
  // theo yêu cầu người dùng tách hẳn 2 nút bấm riêng): "BÁO CÁO TỔNG HỢP THÁNG" = đúng
  // exportAllExcel() cũ (Từ ngày→Đến ngày, không đổi gì); "BÁO CÁO TỔNG HỢP NGÀY" = exportNgayExcel().
  on('#btnExportAllThang', 'click', runExport('xuất Excel báo cáo tổng hợp tháng', exportAllExcel));
  on('#btnExportAllNgay', 'click', runExport('xuất Excel báo cáo tổng hợp ngày', exportNgayExcel));
  on('#btnExportAllLamSan', 'click', runExport('xuất Excel tổng hợp lâm sản', exportLamSanExcel));
  on('#btnTauModal', 'click', openTauModal);
  on('#btnTauCancel', 'click', closeTauModal);
  on('#tauModalOverlay', 'click', function(e){ if (e.target.id === 'tauModalOverlay') closeTauModal(); });
  on('#tauTenTau', 'input', renderTauRowList);
  on('#tauSelectExisting', 'change', function(){
    var t = $('#tauSelectExisting').value;
    if (t){
      $('#tauTenTau').value = t;
      var assignments = loadTauAssignments(), kh = '';
      Object.keys(assignments).some(function(k){ if (tauNorm(assignments[k].tau) === t){ kh = assignments[k].khachHang || ''; return true; } return false; });
      $('#tauKhachHang').value = kh;
    }
    renderTauRowList();
  });
  on('#tauCheckAll', 'change', function(){
    var checkedAll = $('#tauCheckAll').checked;
    $$('.tauRowChk:not(:disabled)', $('#tauRowList')).forEach(function(chk){ chk.checked = checkedAll; });
    updateTauSelectedCount();
  });
  on('#btnTauAssignConfirm', 'click', confirmTauAssignClick);
  on('#btnTauUnassign', 'click', confirmTauUnassignClick);
  on('#btnAddDL', 'click', function(){ pushUndoSnapshot(); STATE.dmdl.push({ 'Đại lý':'', 'Tên Đại lý':'', 'Sản lượng Min':0, 'Sản lượng max':0, 'Hoa hồng':0, 'Ngày bắt đầu':'', 'Ngày kết thúc':'' }); onDMChanged(); renderDMTables(); });
  on('#btnAddHT', 'click', function(){ pushUndoSnapshot(); STATE.dmht.push({ 'Nguồn gốc':'', 'Hỗ trợ':0, 'Hình thức':'Cuối tháng', 'Ngày bắt đầu':'', 'Ngày kết thúc':'' }); onDMChanged(); renderDMTables(); });
  on('#btnUndoDM', 'click', function(){ if (undo()) { renderDMTables(); if (RESULTS) runReport(); } });
  on('#btnRedoDM', 'click', function(){ if (redo()) { renderDMTables(); if (RESULTS) runReport(); } });
  on('#btnBackupData', 'click', backupData);
  on('#btnRestoreDataInput', 'change', function(e){
    var f = e.target.files && e.target.files[0];
    if (f) restoreData(f).then(function(){ e.target.value = ''; }); // reset input để chọn lại đúng file cũ vẫn bắn được sự kiện 'change'
  });
  // Phím tắt Ctrl+Z / Ctrl+Y (hoặc Ctrl+Shift+Z) — chỉ tác dụng khi KHÔNG đang gõ trong 1 ô
  // input/textarea/select khác (tránh chặn undo văn bản mặc định của trình duyệt trong ô nhập
  // liệu), và chỉ khi đang ở tab "Cấu hình" (nơi danh mục Đại lý/Hỗ trợ hiển thị) để tránh
  // gây bất ngờ khi người dùng đang thao tác ở tab báo cáo khác.
  document.addEventListener('keydown', function(e){
    var tag = (document.activeElement && document.activeElement.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    if (!(e.ctrlKey || e.metaKey)) return;
    if (e.key === 'z' && !e.shiftKey) { if (undo()) { e.preventDefault(); renderDMTables(); if (RESULTS) runReport(); } }
    else if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) { if (redo()) { e.preventDefault(); renderDMTables(); if (RESULTS) runReport(); } }
  });
  on('#btnWOModal', 'click', openWOModal);
  on('#btnWOCancel', 'click', closeWOModal);
  on('#btnWOPdf', 'click', runExport('tạo PDF mẫu WO', exportWOPDF));
  on('#btnWOExcel', 'click', runExport('tạo Excel mẫu WO', exportWOExcel));
  on('#woModalOverlay', 'click', function(e){ if (e.target.id === 'woModalOverlay') closeWOModal(); });

  // [Báo cáo ngân hàng]
  // Nhập file Excel khoản vay (#tienVayFileInput) do components/loan-editor.js xử lý (initLoanEditor).
  on('#btnTienVayTemplate', 'click', runExport('tải file Excel mẫu', downloadTienVayTemplate));
  on('#btnLoanExport', 'click', runExport('lưu khoản vay ra Excel', function(){ return exportKhoanVayExcel(getLoanView()); }));
  on('#btnExportAllNganHang', 'click', runExport('xuất Excel báo cáo ngân hàng', exportBankExcel));
  on('#btnTNDNModal', 'click', function(){ openBankInfoModal('tndn'); });
  on('#btnPNKModal', 'click', function(){ openBankInfoModal('pnk'); });
  on('#btnBankCancel', 'click', closeBankInfoModal);
  on('#btnBankPdf', 'click', runExport('tạo file PDF', function(){ if (BANK_INFO_MODAL_MODE==='pnk') return exportPNKPdf(); else return exportTNDNPDF(); }));
  on('#btnBankExcel', 'click', runExport('tạo Excel mẫu 02/TNDN', function(){ return exportTNDNExcel(); }));
  on('#bankModalOverlay', 'click', function(e){ if (e.target.id === 'bankModalOverlay') closeBankInfoModal(); });
}

function boot(){
  // [Logger] Cho phép đổi cấp độ log ngay từ console trình duyệt lúc hỗ trợ từ xa, không cần
  // sửa code (vd gõ: app.logger.setLevel('DEBUG')) — đúng như JSDoc của services/logger.js đã
  // mô tả từ đầu (trước đây "app" chưa thực sự được gán ra window, sửa nốt cho đúng lời hứa).
  if (typeof window !== 'undefined') window.app = { logger: logger, storageService: storageService };
  // [CONFIG] Gán tên công ty ra sidebar + tiêu đề trang từ CONFIG.TEN_CONG_TY thay vì để cứng
  // trong HTML — để công cụ tạo file cấu hình riêng (config.html) chỉ cần đổi CONFIG là mọi nơi
  // hiển thị tên công ty đều tự khớp theo (sidebar, tiêu đề trang, báo cáo Excel/PDF).
  if (typeof document !== 'undefined') {
    var brandEl = $('#brandCompanyName');
    if (brandEl) brandEl.textContent = CONFIG.TEN_CONG_TY;
    document.title = 'Hệ thống báo cáo — ' + CONFIG.TEN_CONG_TY;
    var woKhoInput = $('#bankNhapTaiKho');
    if (woKhoInput) woKhoInput.placeholder = 'VD: Nhà máy dăm gỗ ' + CONFIG.TEN_CONG_TY;
  }
  installGlobalErrorHandlers();
  initThemePicker();
  initDefaultDates();
  loadDM();
  renderDMTables();
  initEvents();
  initLoanEditor(function(){ if (RESULTS) runReport(); });
  initLuyKeMode(function(){ if (RESULTS) runReport(); }); // lũy kế trong kỳ báo cáo (mặc định) / từ đầu sổ
  initOpeningBalance(function(){ if (RESULTS) runReport(); }); // số dư đầu kỳ nhập tay của Sổ chi tiết tiền vay
  loadAllData();
  preloadExportLibsWhenIdle();
}

/**
 * [PERF-06] Nạp sẵn thư viện xuất file khi trình duyệt RẢNH, ~3 giây sau khi mở app — mở app vẫn
 * nhanh (không nạp lúc khởi động), còn lần bấm xuất file đầu tiên thường đã có sẵn thư viện, không
 * phải chờ thêm ~0,3 giây. Lỗi nạp ở đây bị bỏ qua: khi bấm xuất, runExport() sẽ nạp lại và báo lỗi rõ.
 */
function preloadExportLibsWhenIdle(){
  if (typeof window === 'undefined') return;
  setTimeout(function(){
    var run = function(){ ensureExportLibs().catch(function(e){ logger.warn('[Xuất file] Nạp sẵn thư viện chưa được:', e.message); }); };
    if (window.requestIdleCallback) window.requestIdleCallback(run, { timeout: 15000 }); else run();
  }, 3000);
}

/**
 * [SỬA 2026-09-23 — xử lý lỗi] Trước đây mọi lỗi phát sinh khi bấm nút (xuất Excel/PDF, lập báo
 * cáo với dữ liệu bất thường...) chỉ nằm trong console của trình duyệt — người dùng bấm nút rồi
 * KHÔNG thấy gì xảy ra, không biết là lỗi hay đang chạy (đã tái hiện: lỗi khi ghi file Excel →
 * không file, không thông báo). Nay mọi lỗi chưa được xử lý đều hiện lên thanh trạng thái (chấm
 * đỏ) kèm nội dung lỗi, để người dùng biết thao tác vừa rồi CHƯA hoàn tất và báo lại khi cần.
 * Không chặn/không đổi luồng xử lý nào — chỉ hiển thị.
 */
function installGlobalErrorHandlers(){
  if (typeof window === 'undefined' || window.__bcErrHandlers) return;
  window.__bcErrHandlers = true;
  function show(msg){
    msg = String(msg || 'Lỗi không xác định').replace(/^Uncaught\s+/, '');
    logger.error('[Lỗi chưa xử lý] ' + msg);
    try { setStatus('Có lỗi — thao tác vừa rồi chưa hoàn tất: ' + msg, 'err'); } catch (e) { /* thanh trạng thái chưa sẵn sàng */ }
  }
  // Bỏ qua 2 "lỗi" vô hại mà trình duyệt vẫn bắn ra window.onerror: cảnh báo vòng lặp
  // ResizeObserver (Chart.js tự co giãn biểu đồ) và "Script error." (lỗi từ nguồn ngoài, không có
  // nội dung) — không phải lỗi của thao tác người dùng, hiện lên sẽ gây báo động giả.
  window.addEventListener('error', function(e){ if (e && e.message && !/ResizeObserver loop|^Script error\.?$/i.test(e.message)) show(e.message); });
  window.addEventListener('unhandledrejection', function(e){ var r = e && e.reason; show(r && r.message ? r.message : r); });
}
if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', boot);
