/**
 * [WEB WORKER] Đọc + parse file Excel (sổ phụ ngân hàng — tab "Cập nhật khoản vay") trong 1 luồng nền (Web Worker),
 * KHÔNG làm treo/giật giao diện chính khi file lớn — theo yêu cầu bổ sung của người dùng.
 *
 * QUAN TRỌNG — sửa lỗi phát hiện trong lúc làm tính năng này: hàm gốc `handleTienVayFile()`
 * (dùng để đọc file này) đã bị BỎ SÓT hoàn toàn khi tách file ở Phase 1 (chỉ có input#tienVayFileInput
 * trong HTML và STATE.tienVayRaw, nhưng KHÔNG có hàm xử lý — bấm chọn file sẽ báo lỗi
 * `ReferenceError: handleTienVayFile is not defined`). Đã khôi phục đúng logic gốc (xem
 * `BaoCaoNgay.html` dòng 837-883) và chuyển phần đọc/parse (không đụng DOM) vào Worker này —
 * xem `components/loan-editor.js` (tab "Cập nhật khoản vay", chạy ở luồng chính) để biết phần còn lại.
 *
 * Vì đây là Worker riêng (không chạy trong context của trang), không `import` được thư viện
 * SheetJS/XLSX qua npm/ES module trực tiếp trong Worker — nhưng CÓ THỂ nạp sẵn mã nguồn thư
 * viện (dạng text) ở NGOÀI Worker (nơi `import ... ?raw` hoạt động bình thường) rồi nối vào đầu
 * `WORKER_SRC` bên dưới. [SỬA — Phase 3.4] Trước đây dùng `importScripts('https://cdnjs...')`
 * để tải XLSX ngay TRONG Worker — nếu mạng/máy chặn CDN thì Worker lỗi ngay khi khởi động
 * (đúng như dòng thông báo lỗi cũ từng cảnh báo trước: "có thể do mạng chặn tải thư viện XLSX
 * từ CDN trong Worker" — đây là lỗi THẬT một người dùng gặp phải, xem BUG_FIXED.md). Đã sửa:
 * nhúng thẳng nội dung `node_modules/xlsx/dist/xlsx.full.min.js` vào `WORKER_SRC` bằng Vite
 * `?raw` import — file này tự gán biến toàn cục `XLSX` ở đúng scope của Worker khi được ghép
 * vào đầu chuỗi nguồn (file KHÔNG bọc trong IIFE, `var XLSX=...` ở top-level), hành vi giống hệt
 * `importScripts()` cũ, chỉ khác nguồn nạp — không phụ thuộc mạng nữa.
 *
 * Kỹ thuật: dùng `vite-plugin-singlefile` nên KHÔNG có file `.js` rời để trỏ `new Worker(url)`
 * tới — tạo Worker từ 1 chuỗi mã nguồn qua `Blob` + `URL.createObjectURL()` (kỹ thuật tiêu
 * chuẩn để nhúng Worker vào bundle 1-file-duy-nhất).
 * @module services/excel-import-worker
 */
import xlsxLibSrc from 'xlsx/dist/xlsx.full.min.js?raw';

// Chuỗi mã nguồn chạy BÊN TRONG Worker — biệt lập hoàn toàn với module này (Worker không có
// quyền truy cập biến/hàm của luồng chính). Logic parse GIỮ NGUYÊN 100% so với bản gốc
// `handleTienVayFile()`, chỉ cắt bỏ phần đụng DOM (đưa ra ngoài, xem components/loan-editor.js).
const WORKER_SRC = xlsxLibSrc + `

function excelSerialToStr(v) {
  if (v instanceof Date) {
    function pad2(n) { return (n < 10 ? '0' : '') + n; }
    return v.getUTCFullYear() + '-' + pad2(v.getUTCMonth() + 1) + '-' + pad2(v.getUTCDate());
  }
  return v;
}

// [2026-10-29] Đọc 1 bảng có tiêu đề trong file Excel: e.data = { buf, headerSets:[{kind, keys:[tên cột
// bắt buộc]}], preferSheets:['tên sheet ưu tiên', …] }. Duyệt các sheet ưu tiên (theo thứ tự) rồi các sheet
// khác; trong mỗi sheet thử lần lượt từng bộ cột; bảng = chỗ đầu tiên (trong 30 dòng đầu) có 1 dòng chứa
// ĐỦ các cột của 1 bộ — trả kèm "kind" của bộ đó. File ngân hàng thường có nhiều sheet (BKCT_TIENVAY,
// BK02_TNDN, …, VAY) nên không thể chỉ đọc sheet đầu.
function toIsoDateCells(ws) {
  // [BUG-TV02 — 2026-10-29] KHÔNG dùng cellDates:true: SheetJS đổi ô ngày thành Date theo giờ máy
  // (có lệch vài chục giây theo giờ lịch sử), máy đặt giờ Việt Nam ra 16:59:30Z ngày HÔM TRƯỚC ⇒ đọc
  // getUTC* bị lùi 1 ngày (23/12 thành 22/12). Đọc số ngày Excel gốc + mã định dạng ô, rồi tự đổi
  // bằng XLSX.SSF.parse_date_code (tính trên lịch, không qua múi giờ) ⇒ đúng ngày trên mọi máy.
  Object.keys(ws).forEach(function (addr) {
    var c = ws[addr];
    if (addr.charAt(0) === '!' || !c || c.t !== 'n' || !c.z || !XLSX.SSF.is_date(c.z)) return;
    var p = XLSX.SSF.parse_date_code(c.v);
    if (!p) return;
    c.t = 's'; c.v = p.y + '-' + (p.m < 10 ? '0' : '') + p.m + '-' + (p.d < 10 ? '0' : '') + p.d;
  });
}
function findHeader(grid, keys) {
  for (var i = 0; i < Math.min(grid.length, 30); i++) {
    var cells = (grid[i] || []).map(function (v) { return String(v == null ? '' : v).trim(); });
    if (keys.every(function (k) { return cells.indexOf(k) >= 0; })) return i;
  }
  return -1;
}
self.onmessage = function (e) {
  var msg = e.data, sets = msg.headerSets, prefer = msg.preferSheets || [];
  try {
    var wb = XLSX.read(msg.buf, { type: 'array', cellNF: true });
    if (!wb.SheetNames.length) throw new Error('File không có sheet dữ liệu nào.');
    var order = prefer.filter(function (n) { return wb.SheetNames.indexOf(n) >= 0; })
      .concat(wb.SheetNames.filter(function (n) { return prefer.indexOf(n) < 0; }));
    var ws = null, grid = null, headerRowIdx = -1, sheetName = '', kind = '';
    for (var si = 0; si < order.length && headerRowIdx < 0; si++) {
      var g = XLSX.utils.sheet_to_json(wb.Sheets[order[si]], { header: 1, raw: true, defval: null });
      for (var ki = 0; ki < sets.length && headerRowIdx < 0; ki++) {
        var h = findHeader(g, sets[ki].keys);
        if (h >= 0) { ws = wb.Sheets[order[si]]; headerRowIdx = h; sheetName = order[si]; kind = sets[ki].kind; }
      }
    }
    if (headerRowIdx < 0) throw new Error('Không tìm thấy dòng tiêu đề có đủ các cột ' + sets.map(function (k) { return '"' + k.keys.join('", "') + '"'; }).join(' hoặc ') + ' trong file.');
    toIsoDateCells(ws);
    grid = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
    var headers = grid[headerRowIdx], firstKey = String(headers.find(function (x) { return x; }) || '').trim();
    var rows = [];
    for (var r = headerRowIdx + 1; r < grid.length; r++) {
      var raw = grid[r];
      var obj = {}, hasData = false;
      headers.forEach(function (name, colIdx) {
        if (!name) return;
        var v = raw[colIdx];
        v = excelSerialToStr(v);
        obj[String(name).trim()] = v;
        if (v != null && v !== '') hasData = true;
      });
      // [BUG-TV01] Phải là "continue" (bỏ qua dòng này, đọc tiếp) như bản gốc — "return" ở đây
      // thoát hẳn self.onmessage, KHÔNG gửi kết quả về ⇒ app treo "Đang đọc file..." mỗi khi file
      // có 1 dòng trống hoặc dòng "Tổng cộng" (tests/test-tienvay-import.mjs).
      if (!hasData) continue;
      if (/^(total|tổng\\s*c[ộo]ng|cộng)$/i.test(String(obj[firstKey] || '').trim())) continue;
      rows.push(obj);
    }
    self.postMessage({ ok: true, rows: rows, sheetName: sheetName, kind: kind });
  } catch (err) {
    self.postMessage({ ok: false, error: err.message });
  }
};
`;

let workerUrl = null;
function getWorkerUrl() {
  if (!workerUrl) {
    const blob = new Blob([WORKER_SRC], { type: 'application/javascript' });
    workerUrl = URL.createObjectURL(blob);
  }
  return workerUrl;
}

/**
 * Đọc 1 bảng có tiêu đề trong file Excel, chạy trong Web Worker (không treo giao diện với file lớn).
 * @param {ArrayBuffer} arrayBuffer nội dung file (đã đọc bằng `file.arrayBuffer()` ở luồng chính)
 * @param {{headerSets: {kind: string, keys: string[]}[], preferSheets?: string[]}} spec các bộ cột bắt buộc có ở
 *   dòng tiêu đề (thử theo thứ tự); các sheet ưu tiên
 * @returns {Promise<{rows: Object[], sheetName: string, kind: string}>} reject nếu file lỗi/không tìm thấy dòng tiêu đề
 */
export function parseExcelTableInWorker(arrayBuffer, spec) {
  return new Promise((resolve, reject) => {
    let worker;
    try {
      worker = new Worker(getWorkerUrl());
    } catch (e) {
      // Một số trình duyệt/chính sách bảo mật (CSP nghiêm ngặt) có thể chặn Worker tạo từ
      // Blob URL — báo lỗi rõ ràng thay vì treo im lặng, để người dùng biết cần báo lại.
      reject(new Error('Không khởi tạo được Web Worker để đọc file: ' + e.message));
      return;
    }
    worker.onmessage = (e) => {
      worker.terminate();
      if (e.data && e.data.ok) resolve({ rows: e.data.rows, sheetName: e.data.sheetName, kind: e.data.kind });
      else reject(new Error((e.data && e.data.error) || 'Lỗi không xác định khi đọc file trong Worker.'));
    };
    worker.onerror = (e) => {
      worker.terminate();
      reject(new Error('Lỗi Worker: ' + (e.message || 'không đọc được file.')));
    };
    // Chuyển quyền sở hữu buffer sang Worker (transferable) — nhanh hơn copy, an toàn vì
    // luồng chính không cần dùng lại arrayBuffer gốc sau khi gửi đi.
    worker.postMessage({ buf: arrayBuffer, headerSets: spec.headerSets, preferSheets: spec.preferSheets || [] }, [arrayBuffer]);
  });
}
