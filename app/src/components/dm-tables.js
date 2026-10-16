/**
 * Bảng Danh mục Đại lý / Hỗ trợ (tab "Danh mục"): vẽ bảng, sửa ô → lưu + lập lại báo cáo.
 *
 * [Phase 4.2 — 2026-10-06] Tách NGUYÊN VĂN từ legacy-app.js (không đổi logic) để mỗi file < 800
 * dòng, dễ đọc/bảo trì. Kiểm chứng: `npm run test:export-golden` (36 file xuất khớp từng ô/chữ)
 * + toàn bộ bộ test. Import vòng với legacy-app.js (RESULTS/runReport) an toàn — chỉ dùng bên
 * trong hàm xử lý sự kiện, không dùng lúc nạp module (xem ARCHITECTURE.md).
 * @module components/dm-tables
 */
import { makeVNNumberInput, parseVNNumber } from './number-input.js';
import { pushUndoSnapshot } from '../store/app-state.js';
import { STATE, saveDM } from '../store/state.js';
import { $ } from '../utils/dom-utils.js';
import { RESULTS, runReport } from '../legacy-app.js';

/**
 * [SỬA 2026-10-05] Người dùng báo: "thay đổi đơn giá (Danh mục) nhưng báo cáo không tính lại tiền".
 * Trước đây mọi ô trong Danh mục chỉ LƯU (saveDM) mà không lập lại báo cáo — báo cáo Hỗ trợ/Trợ
 * giá/Hoa hồng vẫn giữ số theo đơn giá cũ cho tới khi tự bấm LẬP BÁO CÁO (chỉ Hoàn tác/Làm lại mới
 * tự tính lại). Nay sửa/thêm/xoá dòng Danh mục → lưu + lập lại báo cáo ngay (nếu đã lập báo cáo).
 */
export function onDMChanged(){
  saveDM();
  if (RESULTS) runReport();
}
export function renderDMTables(){
  var dlBody = $('#dmDLTable tbody'); dlBody.innerHTML = '';
  STATE.dmdl.forEach(function(row, idx){
    var tr = document.createElement('tr');
    // f[2] = số chữ số thập phân cho ô số kiểu VN: 2 = khối lượng (sản lượng), 0 = tiền (hoa hồng/tấn)
    var fields = [['Đại lý','text'],['Tên Đại lý','text'],['Sản lượng Min','number',2],['Sản lượng max','number',2],['Hoa hồng','number',0],['Ngày bắt đầu','date'],['Ngày kết thúc','date']];
    fields.forEach(function(f){
      var td = document.createElement('td');
      var inp = document.createElement('input');
      if (f[1] === 'number') makeVNNumberInput(inp, row[f[0]], f[2]);
      else { inp.type = f[1] === 'date' ? 'date' : 'text'; inp.value = row[f[0]] == null ? '' : row[f[0]]; }
      inp.addEventListener('change', function(){ pushUndoSnapshot(); row[f[0]] = f[1]==='number' ? parseVNNumber(inp.value) : inp.value; onDMChanged(); });
      td.appendChild(inp); tr.appendChild(td);
    });
    var tdRm = document.createElement('td');
    var rm = document.createElement('button'); rm.className='rmBtn'; rm.textContent='✕';
    rm.addEventListener('click', function(){ pushUndoSnapshot(); STATE.dmdl.splice(idx,1); onDMChanged(); renderDMTables(); });
    tdRm.appendChild(rm); tr.appendChild(tdRm);
    dlBody.appendChild(tr);
  });

  var htBody = $('#dmHTTable tbody'); htBody.innerHTML = '';
  STATE.dmht.forEach(function(row, idx){
    var tr = document.createElement('tr');
    var td1 = document.createElement('td');
    var i1 = document.createElement('input'); i1.value = row['Nguồn gốc']||''; i1.addEventListener('change', function(){ pushUndoSnapshot(); row['Nguồn gốc']=i1.value; onDMChanged(); });
    td1.appendChild(i1); tr.appendChild(td1);

    var td2 = document.createElement('td');
    var i2 = document.createElement('input'); makeVNNumberInput(i2, row['Hỗ trợ']||0, 0); i2.addEventListener('change', function(){ pushUndoSnapshot(); row['Hỗ trợ']=parseVNNumber(i2.value); onDMChanged(); });
    td2.appendChild(i2); tr.appendChild(td2);

    var td3 = document.createElement('td');
    var sel = document.createElement('select');
    ['Cuối tháng','Khi thanh toán'].forEach(function(opt){ var o=document.createElement('option'); o.value=opt; o.textContent=opt; if(row['Hình thức']===opt) o.selected=true; sel.appendChild(o); });
    sel.addEventListener('change', function(){ pushUndoSnapshot(); row['Hình thức']=sel.value; onDMChanged(); });
    td3.appendChild(sel); tr.appendChild(td3);

    var td4 = document.createElement('td');
    var i4 = document.createElement('input'); i4.type='date'; i4.value = row['Ngày bắt đầu']||''; i4.addEventListener('change', function(){ pushUndoSnapshot(); row['Ngày bắt đầu']=i4.value; onDMChanged(); });
    td4.appendChild(i4); tr.appendChild(td4);

    var td5 = document.createElement('td');
    var i5 = document.createElement('input'); i5.type='date'; i5.value = row['Ngày kết thúc']||''; i5.addEventListener('change', function(){ pushUndoSnapshot(); row['Ngày kết thúc']=i5.value; onDMChanged(); });
    td5.appendChild(i5); tr.appendChild(td5);

    var tdRm = document.createElement('td');
    var rm = document.createElement('button'); rm.className='rmBtn'; rm.textContent='✕';
    rm.addEventListener('click', function(){ pushUndoSnapshot(); STATE.dmht.splice(idx,1); onDMChanged(); renderDMTables(); });
    tdRm.appendChild(rm); tr.appendChild(tdRm);
    htBody.appendChild(tr);
  });

  // [CONFIG] Card "Nguồn dữ liệu (CONFIG)" trước đây hiển thị ở đây đã bỏ, thay bằng thẻ
  // "Hướng dẫn sử dụng" tĩnh trong index.html (không cần render bằng JS) — xem CHANGELOG.md.
  // Đổi tên công ty/link Google Sheet giờ dùng công cụ riêng `config.html` (xem README.md),
  // không sửa trực tiếp mã nguồn nữa.
}
