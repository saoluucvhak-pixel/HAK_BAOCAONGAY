/**
 * [PERF-06 — 2026-10-06] Nạp thư viện xuất file (ExcelJS, jsPDF, jspdf-autotable) KHI CẦN, không
 * nạp lúc mở app.
 *
 * Vì sao: đo thực tế, riêng việc trình duyệt dịch + chạy ~1,35 MB mã của 3 thư viện này chiếm ~280 ms
 * trong ~390 ms khởi động (bỏ chúng ra khỏi lúc khởi động: còn ~100 ms) — trong khi phần lớn lần mở
 * app chỉ để XEM báo cáo, không xuất file.
 *
 * Cách làm: mã thư viện vẫn nằm sẵn TRONG file HTML (app vẫn 1 file, vẫn chạy offline), nhưng dưới
 * dạng CHUỖI (`?raw`) — trình duyệt chỉ lướt qua chuỗi lúc mở app (rất nhanh), chưa dịch/chạy. Lần
 * đầu bấm xuất file, chuỗi được nạp thành <script> (qua Blob URL) đúng 1 lần, các lần sau dùng lại.
 * Đây là đúng bản dựng cho trình duyệt của chính các thư viện đang dùng (ExcelJS: `browser` =
 * dist/exceljs.min.js — y hệt file trước đây được đóng gói; jsPDF 2.5.1 bản UMD cùng phiên bản),
 * nên file xuất ra GIỐNG HỆT — kiểm chứng bằng `npm run test:export-golden` (36 file, từng ô/từng chữ).
 * Không dùng eval: chỉ nạp mã thư viện đóng gói sẵn của chính app, không nạp mã từ dữ liệu/người dùng.
 * @module services/export-libs
 */
import excelJsSrc from 'exceljs/dist/exceljs.min.js?raw';
import jsPdfSrc from 'jspdf/dist/jspdf.umd.min.js?raw';
import autoTableSrc from 'jspdf-autotable?raw'; // = dist/jspdf.plugin.autotable.js, đúng file trước đây được đóng gói

/** Thư viện sau khi nạp: `libs.ExcelJS`, `libs.jsPDF` (null cho tới khi gọi ensureExportLibs()). */
export const libs = { ExcelJS: null, jsPDF: null };

let loading = null;

function injectScript(source, label) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
    const el = document.createElement('script');
    el.src = url;
    el.onload = () => { URL.revokeObjectURL(url); resolve(); };
    el.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Không nạp được thư viện ' + label)); };
    document.head.appendChild(el);
  });
}

/**
 * Bảo đảm 3 thư viện đã sẵn sàng. Gọi nhiều lần an toàn (chỉ nạp 1 lần; lỗi thì lần sau thử lại).
 * @returns {Promise<{ExcelJS: any, jsPDF: any}>}
 */
export function ensureExportLibs() {
  if (libs.ExcelJS && libs.jsPDF) return Promise.resolve(libs);
  if (loading) return loading;
  loading = (async () => {
    if (!window.ExcelJS) await injectScript(excelJsSrc, 'ExcelJS');
    if (!(window.jspdf && window.jspdf.jsPDF)) await injectScript(jsPdfSrc, 'jsPDF');
    const JsPDF = window.jspdf && window.jspdf.jsPDF;
    if (JsPDF && !(JsPDF.API && JsPDF.API.autoTable)) await injectScript(autoTableSrc, 'jspdf-autotable');
    if (!window.ExcelJS || !JsPDF || !JsPDF.API.autoTable) throw new Error('Thư viện xuất file nạp không đầy đủ');
    libs.ExcelJS = window.ExcelJS;
    libs.jsPDF = JsPDF;
    return libs;
  })();
  loading.catch(() => { loading = null; });
  return loading;
}
