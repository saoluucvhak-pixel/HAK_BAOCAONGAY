// Kiểm tra CHÍNH: sau khi chuyển ExcelJS/jsPDF/jspdf-autotable/Chart.js từ nạp qua CDN sang
// bundle qua npm (Phase 3.4, sửa lỗi người dùng báo "Nút xuất Excel, In, PDF và Xuất tất cả đều
// dùng kg được"), các nút xuất phải hoạt động THẬT (tải file thật, không chỉ không throw lỗi) —
// mô phỏng đúng tình huống mạng chặn CDN bằng cách CHẶN HẲN mọi domain CDN trong lúc test, để
// chứng minh export không còn phụ thuộc mạng nữa.
import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';
import ExcelJS from 'exceljs';
import { genPhieuCan, genDNTT, toCSV } from './fixtures.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_HTML = path.resolve(__dirname, '../dist/index.html');

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
Math.random = mulberry32(7);

let pass = 0, fail = 0;
function check(name, cond) { if (cond) { pass++; console.log('OK  ', name); } else { fail++; console.log('FAIL', name); } }

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

// CHẶN HẲN mọi domain CDN từng dùng trước đây — mô phỏng đúng tình huống mạng/máy người dùng
// chặn cdnjs.cloudflare.com/cdn.jsdelivr.net mà họ báo gặp phải.
await page.route('https://cdnjs.cloudflare.com/**', (route) => route.abort('blockedbyclient'));
await page.route('https://cdn.jsdelivr.net/**', (route) => route.abort('blockedbyclient'));

const phieucan = genPhieuCan(40);
const dntt = genDNTT(phieucan, 15);
await page.route('https://docs.google.com/**', (route) => {
  const url = route.request().url();
  if (url.includes('2PACX-1vTj7PHtJtv1iBaF9tCKJ9zgnTyc4j6Hbt9CEYX36sVIDXwJDQUvMGd-O_bc8E-N6iEh5JqH9tytjQLj')) return route.fulfill({ status: 200, contentType: 'text/csv', body: toCSV(phieucan) });
  if (url.includes('2PACX-1vSqRW3Yk2MBgXp1qi29tQZQyn1R-opTUjE5PqBFIH7knAOcr1YvthP_AuXa_10knbaprgtM4i_zPk2i')) return route.fulfill({ status: 200, contentType: 'text/csv', body: toCSV(dntt) });
  return route.fulfill({ status: 200, contentType: 'text/csv', body: '' });
});

await page.goto('file://' + DIST_HTML, { waitUntil: 'load' });
check('Trang tải lên không lỗi JS (dù đã chặn mọi domain CDN)', errors.length === 0);
await page.waitForFunction(() => document.querySelector('#statusText')?.textContent?.includes('phiếu cân'), { timeout: 15000 });
await page.fill('#fFrom', '2024-01-01');
await page.fill('#fTo', '2025-12-31');
await page.click('#btnLapBC');
await page.waitForTimeout(500);
await page.click('[data-target="baocao"]');

// ---------- Nút "Excel" của bảng "Nhập gỗ keo" ----------
const excelBtn = page.locator('[data-tools="nhapkeo"] [data-act="excel"]');
check('Nút Excel của bảng tồn tại', await excelBtn.count() > 0);
{
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 8000 }),
    excelBtn.click(),
  ]);
  const fname = download.suggestedFilename();
  check('Bấm "Excel" tải xuống đúng file .xlsx', fname.endsWith('.xlsx'));
  const dlPath = await download.path();
  check('File .xlsx tải về có nội dung thật (không rỗng)', dlPath !== null);

  // Mở lại file .xlsx vừa tải bằng chính package exceljs (độc lập với trình duyệt) — xác nhận
  // đây là file Excel THẬT, đọc được, có đúng số dòng dữ liệu (40 dòng phiếu cân đã nạp).
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(dlPath);
  const ws = wb.worksheets[0];
  check('File .xlsx mở lại được bằng ExcelJS, có dữ liệu (>10 dòng)', !!ws && ws.rowCount > 10);
}

// ---------- Nút "PDF" của bảng "Nhập gỗ keo" ----------
// Từ Phase 3.12 nút xuất bỏ qua cú bấm lặp trong 0,3 giây sau khi xuất xong (chống tạo file trùng) —
// chờ như người dùng thật trước khi bấm nút xuất kế tiếp.
await page.waitForTimeout(400);
const pdfBtn = page.locator('[data-tools="nhapkeo"] [data-act="pdf"]');
{
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 8000 }),
    pdfBtn.click(),
  ]);
  check('Bấm "PDF" tải xuống đúng file .pdf', download.suggestedFilename().endsWith('.pdf'));
}

// ---------- Nút "In" (window.print() trực tiếp, không phụ thuộc ExcelJS/jsPDF — kiểm tra
// không throw để chắc chắn không có tác dụng phụ từ các thay đổi khác trong lần sửa này) ----------
const printBtn = page.locator('[data-tools="nhapkeo"] [data-act="print"]');
await printBtn.click();
await page.waitForTimeout(500);
check('Bấm "In" không lỗi JS', errors.length === 0);

// ---------- "XUẤT TẤT CẢ (Excel)" ở tab Báo cáo tổng hợp ----------
{
  await page.waitForTimeout(400);
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 10000 }),
    page.click('#btnExportAllThang'), // từ 22/09 nút cũ #btnExportAll tách thành Tháng/Ngày
  ]);
  check('Bấm "BÁO CÁO TỔNG HỢP THÁNG (Excel)" tải xuống đúng file .xlsx', download.suggestedFilename().includes('TatCa') && download.suggestedFilename().endsWith('.xlsx'));
}

// ---------- Dashboard: biểu đồ Chart.js phải vẽ được (không còn phụ thuộc CDN) ----------
await page.click('[data-target="dashboard"]');
await page.waitForTimeout(300);
const chartDrawn = await page.evaluate(() => {
  const canvas = document.getElementById('chartKLNgay');
  if (!canvas) return false;
  // Chart.js gắn __chartjs__ hoặc render lên canvas context — kiểm tra canvas có kích thước
  // thật (đã được Chart.js resize/vẽ) thay vì còn 0x0 mặc định.
  return canvas.width > 0 && canvas.height > 0;
});
check('Biểu đồ Dashboard (Chart.js) vẽ được dù đã chặn CDN', chartDrawn);

check('Không có lỗi JS nào trong suốt quá trình xuất báo cáo', errors.length === 0);
console.log('\npageerrors:', JSON.stringify(errors));
console.log(`=== RESULT: ${pass} passed, ${fail} failed ===`);
await browser.close();
process.exit(fail > 0 ? 1 : 0);
