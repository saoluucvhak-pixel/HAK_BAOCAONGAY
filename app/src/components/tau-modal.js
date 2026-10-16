/**
 * Modal gán / gỡ gán Tàu cho các dòng Bảng kê lâm sản.
 *
 * [Phase 4.2 — 2026-10-06] Tách NGUYÊN VĂN từ legacy-app.js (không đổi logic) để mỗi file < 800
 * dòng, dễ đọc/bảo trì. Kiểm chứng: `npm run test:export-golden` (36 file xuất khớp từng ô/chữ)
 * + toàn bộ bộ test. Import vòng với legacy-app.js (RESULTS/runReport) an toàn — chỉ dùng bên
 * trong hàm xử lý sự kiện, không dùng lúc nạp module (xem ARCHITECTURE.md).
 * @module components/tau-modal
 */
import { assignTau, listKnownTau, loadTauAssignments, unassignTau } from '../services/tau-assignment.js';
import { TABLES } from '../store/state.js';
import { fmtDate } from '../utils/date-utils.js';
import { $, $$, esc } from '../utils/dom-utils.js';
import { fmtKL } from '../utils/number-utils.js';
import { RESULTS, runReport } from '../legacy-app.js';

/* ============================================================
   [MỚI 2026-09-22] Modal chọn BKLS để gán/xuất theo Tàu — xem services/tau-assignment.js cho
   quy tắc khoá. Danh sách dòng lấy đúng TABLES['bklsct'].view (đang hiển thị ở bảng "BKLS xuất
   khẩu - Chi tiết" — tôn trọng khoảng ngày/bộ lọc/tìm kiếm người dùng đang đặt), KHÔNG tính lại
   từ đầu — nếu người dùng muốn thu hẹp danh sách trước khi mở modal, chỉ cần gõ vào ô tìm kiếm
   của bảng đó trước (vd gõ tên khách hàng), modal sẽ tự chỉ hiện đúng các dòng đó.
   ============================================================ */
export function tauNorm(s){ return String(s||'').trim(); }
function getBklsRowsForTauModal(){ return (TABLES['bklsct'] && (TABLES['bklsct'].view || TABLES['bklsct'].rows)) || []; }
export function updateTauSelectedCount(){
  var n = $$('.tauRowChk:checked', $('#tauRowList')).length;
  $('#tauSelectedCount').textContent = n + ' dòng đã chọn';
}
function bindTauRowCheckboxes(){
  $$('.tauRowChk', $('#tauRowList')).forEach(function(chk){ chk.addEventListener('change', updateTauSelectedCount); });
}
export function renderTauRowList(){
  var rows = getBklsRowsForTauModal();
  var curTau = tauNorm($('#tauTenTau').value);
  var assignments = loadTauAssignments();
  // [BUGFIX 2026-09-23] Gõ TAY đúng tên 1 Tàu đã có (không chọn qua dropdown "Tàu đã có") thì
  // ô Khách hàng đang trống (openTauModal() luôn xoá trắng lúc mở modal) — nếu gán thêm dòng lúc
  // này mà quên gõ lại Khách hàng, dòng mới sẽ mang Khách hàng="" khác với các dòng cũ của CHÍNH
  // tàu đó, làm "Tổng hợp theo Tàu" tách nhầm thành 2 dòng cho cùng 1 tàu. Tự động điền lại đúng
  // Khách hàng đã lưu cho tàu này khi tên tàu gõ khớp CHÍNH XÁC 1 tàu đã từng gán, và ô Khách
  // hàng đang trống (không đè lên nếu người dùng đã tự gõ khách hàng khác).
  if (curTau && !$('#tauKhachHang').value.trim()) {
    var khMatch = '';
    Object.keys(assignments).some(function (k) { if (tauNorm(assignments[k].tau) === curTau) { khMatch = assignments[k].khachHang || ''; return true; } return false; });
    if (khMatch) $('#tauKhachHang').value = khMatch;
  }
  var html = rows.map(function(r){
    var soBKLS = r['Số BKLS']; if (!soBKLS) return '';
    var info = assignments[soBKLS];
    // Chưa gõ/chọn tên tàu (curTau rỗng): dòng đã gán tàu nào cũng tạm khoá (chưa biết đang làm
    // cho tàu nào để so khớp) — gõ đúng tên tàu đã gán thì dòng đó mở khoá lại (đang bổ sung
    // thêm dòng cho ĐÚNG tàu đó), gõ tên tàu khác/mới thì dòng đã gán tàu khác vẫn khoá.
    var disabled = !!info && (curTau === '' || tauNorm(info.tau) !== curTau);
    var checked = !!info && curTau !== '' && tauNorm(info.tau) === curTau;
    var tag = info ? (' <span style="color:#999;font-size:11.5px">— đã gán: ' + esc(info.tau) + (info.khachHang ? (' / ' + esc(info.khachHang)) : '') + '</span>') : '';
    return '<label style="display:flex;align-items:center;gap:8px;padding:6px 10px;border-bottom:1px dashed var(--line);' + (disabled ? 'opacity:.55' : '') + '">'
      + '<input type="checkbox" class="tauRowChk" data-sobkls="' + esc(soBKLS) + '"' + (checked ? ' checked' : '') + (disabled ? ' disabled' : '') + '>'
      + '<span style="flex:1">' + esc(soBKLS) + ' — ' + esc(r['Họ và tên người bán'] || '') + ' — ' + fmtDate(r['Ngày BKLS']) + ' — ' + fmtKL(r['Khối lượng (Tấn)']) + ' tấn' + tag + '</span>'
      + '</label>';
  }).join('');
  $('#tauRowList').innerHTML = html || '<div style="padding:14px;color:var(--muted)">Không có dòng nào (kiểm tra lại khoảng ngày/bộ lọc/tìm kiếm ở bảng "BKLS xuất khẩu - Chi tiết").</div>';
  bindTauRowCheckboxes();
  updateTauSelectedCount();
}
function fillTauExistingSelect(){
  var known = listKnownTau();
  $('#tauSelectExisting').innerHTML = '<option value="">— gõ tên tàu mới ở trên —</option>' + known.map(function(t){ return '<option value="' + esc(t) + '">' + esc(t) + '</option>'; }).join('');
}
export function openTauModal(){
  if (!TABLES['bklsct'] || !(TABLES['bklsct'].rows||[]).length){
    alert('Chưa có dữ liệu BKLS xuất khẩu. Hãy vào "Tổng hợp lâm sản", chọn khoảng ngày rồi bấm LẬP BÁO CÁO trước.');
    return;
  }
  $('#tauTenTau').value = ''; $('#tauKhachHang').value = ''; $('#tauCheckAll').checked = false;
  fillTauExistingSelect();
  renderTauRowList();
  $('#tauModalOverlay').classList.add('active');
}
export function closeTauModal(){ $('#tauModalOverlay').classList.remove('active'); }
function getCheckedSoBKLS(){ return $$('.tauRowChk:checked', $('#tauRowList')).map(function(chk){ return chk.dataset.sobkls; }); }
export function confirmTauAssignClick(){
  var tau = $('#tauTenTau').value.trim();
  var khachHang = $('#tauKhachHang').value.trim();
  if (!tau){ alert('Vui lòng nhập hoặc chọn Tên tàu.'); return; }
  var list = getCheckedSoBKLS();
  if (!list.length){ alert('Chưa chọn dòng nào.'); return; }
  var result = assignTau(list, tau, khachHang);
  if (result.skipped.length) alert('Đã gán ' + result.assigned.length + ' dòng cho tàu "' + tau + '". Bỏ qua ' + result.skipped.length + ' dòng vì đã bị khoá bởi tàu khác.');
  else alert('Đã gán ' + result.assigned.length + ' dòng cho tàu "' + tau + '".');
  closeTauModal();
  if (RESULTS) runReport();
}
export function confirmTauUnassignClick(){
  var list = getCheckedSoBKLS();
  if (!list.length){ alert('Chưa chọn dòng nào để gỡ gán.'); return; }
  if (!confirm('Gỡ gán Tàu cho ' + list.length + ' dòng đã chọn? (Có thể gán lại cho tàu khác sau khi gỡ.)')) return;
  unassignTau(list);
  closeTauModal();
  if (RESULTS) runReport();
}
