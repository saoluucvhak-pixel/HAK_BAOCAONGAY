/**
 * [WEB WORKER] Đọc + parse file Excel "Sổ chi tiết tiền vay" trong 1 luồng nền (Web Worker),
 * KHÔNG làm treo/giật giao diện chính khi file lớn — theo yêu cầu bổ sung của người dùng.
 *
 * QUAN TRỌNG — sửa lỗi phát hiện trong lúc làm tính năng này: hàm gốc `handleTienVayFile()`
 * (dùng để đọc file này) đã bị BỎ SÓT hoàn toàn khi tách file ở Phase 1 (chỉ có input#tienVayFileInput
 * trong HTML và STATE.tienVayRaw, nhưng KHÔNG có hàm xử lý — bấm chọn file sẽ báo lỗi
 * `ReferenceError: handleTienVayFile is not defined`). Đã khôi phục đúng logic gốc (xem
 * `BaoCaoNgay.html` dòng 837-883) và chuyển phần đọc/parse (không đụng DOM) vào Worker này —
 * xem `services/tien-vay-import.js` (hàm nối vào UI, chạy ở luồng chính) để biết phần còn lại.
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
// `handleTienVayFile()`, chỉ cắt bỏ phần đụng DOM (đưa ra ngoài, xem tien-vay-import.js).
const WORKER_SRC = xlsxLibSrc + `

function excelSerialToStr(v) {
  if (v instanceof Date) {
    function pad2(n) { return (n < 10 ? '0' : '') + n; }
    return v.getUTCFullYear() + '-' + pad2(v.getUTCMonth() + 1) + '-' + pad2(v.getUTCDate());
  }
  return v;
}

self.onmessage = function (e) {
  var buf = e.data;
  try {
    var wb = XLSX.read(buf, { type: 'array', cellDates: true });
    var wsName = wb.SheetNames[0];
    var ws = wb.Sheets[wsName];
    if (!ws) throw new Error('File không có sheet dữ liệu nào.');
    var grid = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
    var headerRowIdx = -1;
    for (var i = 0; i < Math.min(grid.length, 30); i++) {
      if (grid[i].some(function (v) { return String(v || '').trim() === 'Tổng tiền vay'; })) { headerRowIdx = i; break; }
    }
    if (headerRowIdx < 0) throw new Error('Không tìm thấy dòng tiêu đề có cột "Tổng tiền vay" trong file.');
    var headers = grid[headerRowIdx];
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
      if (!hasData) return;
      if (/total|tổng\\s*c[ộo]ng/i.test(String(obj['Ngày chung'] || ''))) return;
      rows.push(obj);
    }
    self.postMessage({ ok: true, rows: rows });
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
 * Đọc + parse file Excel "Sổ chi tiết tiền vay" trong Web Worker.
 * @param {ArrayBuffer} arrayBuffer nội dung file (đã đọc bằng `file.arrayBuffer()` ở luồng chính)
 * @returns {Promise<{rows: Object[]}>} reject nếu file lỗi định dạng/không tìm thấy cột tiêu đề
 */
export function parseTienVayInWorker(arrayBuffer) {
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
      if (e.data && e.data.ok) resolve({ rows: e.data.rows });
      else reject(new Error((e.data && e.data.error) || 'Lỗi không xác định khi đọc file trong Worker.'));
    };
    worker.onerror = (e) => {
      worker.terminate();
      reject(new Error('Lỗi Worker: ' + (e.message || 'không đọc được file.')));
    };
    // Chuyển quyền sở hữu buffer sang Worker (transferable) — nhanh hơn copy, an toàn vì
    // luồng chính không cần dùng lại arrayBuffer gốc sau khi gửi đi.
    worker.postMessage(arrayBuffer, [arrayBuffer]);
  });
}
