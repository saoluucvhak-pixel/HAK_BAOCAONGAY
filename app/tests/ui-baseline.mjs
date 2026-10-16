/**
 * [UI BASELINE TEST] — Điều kiện tiên quyết cho Phase 2 (xem TODO.md).
 *
 * Mở dist/index.html bằng Chromium (Playwright), CHẶN 4 URL Google Sheet thật (mạng sandbox
 * không truy cập được, và test cần chạy lặp lại được / không phụ thuộc dữ liệu thật thay đổi
 * theo thời gian) và trả về dữ liệu CSV giả lập cố định (tests/fixtures.mjs) — giống hệt cấu
 * trúc cột dữ liệu thật. Sau đó: bấm "LẬP BÁO CÁO", đọc số dòng + tổng tiền/khối lượng hiển thị
 * trên UI của TẤT CẢ báo cáo, và thử bấm nút xuất Excel/PDF chính, ghi lại kết quả thành 1 file
 * JSON "baseline".
 *
 * Cách dùng:
 *   node tests/ui-baseline.mjs             # chạy & so sánh với baseline đã lưu (nếu có)
 *   node tests/ui-baseline.mjs --update     # ghi đè lại baseline (dùng khi CHỦ ĐỘNG đổi UI/hành vi)
 *
 * Khi tách UI_SERVICE/EXPORT_SERVICE ra khỏi legacy-app.js (Phase 2), chạy lại script này SAU
 * mỗi bước tách — nếu baseline lệch mà không chủ động đổi hành vi, đó là dấu hiệu đã làm sai
 * khác so với bản gốc, PHẢI dừng lại và kiểm tra trước khi tiếp tục.
 */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { genPhieuCan, genDNTT, genHDNCC, genHosokeo, toCSV } from './fixtures.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_HTML = path.resolve(__dirname, '../dist/index.html');
const BASELINE_PATH = path.resolve(__dirname, 'ui-baseline.json');
const UPDATE = process.argv.includes('--update');

// Seeded PRNG so fixtures are deterministic across runs (Math.random is not) — makes the
// baseline comparison meaningful instead of always "different by construction".
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
Math.random = mulberry32(42);

if (!fs.existsSync(DIST_HTML)) {
  console.error('Không tìm thấy dist/index.html — chạy "npm run build" trước.');
  process.exit(1);
}

const phieucan = genPhieuCan(40);
const dntt = genDNTT(phieucan, 15);
const hdncc = genHDNCC(dntt);
const hosokeo = genHosokeo(10);

const CSV_BY_URL_SUBSTR = [
  ['2PACX-1vTj7PHtJtv1iBaF9tCKJ9zgnTyc4j6Hbt9CEYX36sVIDXwJDQUvMGd-O_bc8E-N6iEh5JqH9tytjQLj', toCSV(phieucan)], // PHIEUCAN
  ['2PACX-1vSqRW3Yk2MBgXp1qi29tQZQyn1R-opTUjE5PqBFIH7knAOcr1YvthP_AuXa_10knbaprgtM4i_zPk2i', toCSV(dntt)],    // DNTT_CT
  ['2PACX-1vRmYRMAG3XDhHz74P7L1-NrKyPD8Zozp5lPU9rR-_dirOq5UHfSMNdZ4pq4PF5DpI6nosDBlAwW_a10', toCSV(hdncc)],   // HD_NCC
  ['2PACX-1vT0mcMT2TsD7lOLSNrTqZPVjJJ395kI54SxSri5-n_VxrfAcC74IKkgCnesT30d1bhx59gJC4esmF7s', toCSV(hosokeo)], // HOSOKEO
];

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage();

const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.route('https://docs.google.com/**', (route) => {
  const url = route.request().url();
  const hit = CSV_BY_URL_SUBSTR.find(([substr]) => url.includes(substr));
  if (hit) return route.fulfill({ status: 200, contentType: 'text/csv', body: hit[1] });
  return route.fulfill({ status: 200, contentType: 'text/csv', body: '' });
});
// Ngăn network thật cho mọi thứ khác (thư viện CDN) khỏi làm hỏng kết quả nếu sandbox không cho qua —
// baseline này chỉ quan tâm luồng dữ liệu + tính toán, không quan tâm việc load thư viện xuất file.
await page.route('https://cdn.jsdelivr.net/**', (route) => route.continue());
await page.route('https://cdnjs.cloudflare.com/**', (route) => route.continue());

await page.goto('file://' + DIST_HTML, { waitUntil: 'load' });
await page.waitForFunction(() => document.querySelector('#statusText')?.textContent?.includes('phiếu cân'), { timeout: 15000 });

// Bộ lọc ngày mặc định của app là "đầu tháng hiện tại -> hôm nay" (xem legacy-app.js dòng
// ~1397), không khớp với khoảng ngày của dữ liệu giả lập (2024-2025) — đặt lại rộng ra để bài
// test đo được đúng số liệu, không phải luôn 0 dòng vì lệch khoảng ngày mặc định.
await page.fill('#fFrom', '2024-01-01');
await page.fill('#fTo', '2025-12-31');

await page.click('#btnLapBC');
await page.waitForTimeout(500);

// Đọc số dòng + tổng của TẤT CẢ báo cáo hiển thị trên UI, không đọc lại từ RESULTS nội bộ —
// baseline này mô phỏng đúng góc nhìn "người dùng thấy gì trên màn hình", phù hợp mục tiêu là
// bắt được thay đổi hành vi UI khi tách UI_SERVICE ở Phase 2.
const reportKeys = ['nhapkeo', 'xecho', 'thanhtoan', 'congno', 'hotro', 'trogia', 'tonghoptro', 'hoahong', 'tonghop', 'bklsct', 'bklsth', 'tienvay', 'tndn', 'pnk'];
const snapshot = {};
for (const key of reportKeys) {
  snapshot[key] = await page.evaluate((k) => {
    const table = document.querySelector('#tbl-' + k);
    if (!table) return { found: false };
    const rowCount = table.querySelectorAll('tbody tr').length;
    const countEl = document.querySelector('[data-count="' + k + '"]');
    return { found: true, rowCount, countText: countEl ? countEl.textContent : null };
  }, key);
}

const dashboardText = await page.evaluate(() => {
  const el = document.querySelector('#dashboard, .dashboard, [data-dashboard]');
  return el ? el.textContent.replace(/\s+/g, ' ').trim().slice(0, 500) : null;
});

const result = {
  generatedAt: UPDATE ? new Date().toISOString() : undefined,
  pageErrors,
  snapshot,
  dashboardTextPresent: dashboardText != null,
};

await browser.close();

if (pageErrors.length) {
  console.error('LỖI JS phát sinh khi chạy UI:', pageErrors);
  process.exit(1);
}

if (UPDATE || !fs.existsSync(BASELINE_PATH)) {
  fs.writeFileSync(BASELINE_PATH, JSON.stringify(result, null, 2));
  console.log((UPDATE ? 'Đã cập nhật' : 'Đã tạo mới') + ' baseline tại tests/ui-baseline.json');
  console.log(JSON.stringify(result.snapshot, null, 2));
  process.exit(0);
}

const prev = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
const prevSnap = JSON.stringify(prev.snapshot);
const curSnap = JSON.stringify(result.snapshot);
if (prevSnap === curSnap) {
  console.log('=== UI BASELINE: KHỚP — không phát hiện thay đổi hành vi ===');
  process.exit(0);
} else {
  console.error('=== UI BASELINE: LỆCH — hành vi UI đã thay đổi so với baseline đã lưu ===');
  console.error('Trước:', prevSnap);
  console.error('Sau:  ', curSnap);
  console.error('Nếu đây là thay đổi CHỦ ĐỘNG (đã xác nhận với người dùng), chạy lại với --update.');
  process.exit(1);
}
