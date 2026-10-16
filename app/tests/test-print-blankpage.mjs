// Kiểm chứng lỗi "file PDF có trang trắng ở trang đầu" khi bấm nút "🖨 In" → "Lưu dưới dạng PDF"
// (browser print). Nguyên nhân: .app{min-height:100vh} vẫn giữ nguyên khi in — dù .side và
// .content bên trong đều bị ẩn, CHÍNH .app vẫn buộc cao tối thiểu 1 trang, đẩy #printSheet (nội
// dung thật) xuống trang 2, để lại trang 1 trắng. Đã sửa bằng `.app{min-height:0}` trong
// @media print (xem index.html). Không thuộc bộ ui-baseline.mjs — chạy riêng bằng
// `node tests/test-print-blankpage.mjs`.
import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import fs from 'fs';
import { genPhieuCan, genDNTT, toCSV } from './fixtures.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_HTML = path.resolve(__dirname, '../dist/index.html');

let pass = 0, fail = 0;
function check(name, cond) { if (cond) { pass++; console.log('OK  ', name); } else { fail++; console.log('FAIL', name); } }

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage();
const phieucan = genPhieuCan(60);
const dntt = genDNTT(phieucan, 25);
await page.route('https://docs.google.com/**', (route) => {
  const url = route.request().url();
  if (url.includes('2PACX-1vTj7PHtJtv1iBaF9tCKJ9zgnTyc4j6Hbt9CEYX36sVIDXwJDQUvMGd-O_bc8E-N6iEh5JqH9tytjQLj')) return route.fulfill({ status: 200, contentType: 'text/csv', body: toCSV(phieucan) });
  if (url.includes('2PACX-1vSqRW3Yk2MBgXp1qi29tQZQyn1R-opTUjE5PqBFIH7knAOcr1YvthP_AuXa_10knbaprgtM4i_zPk2i')) return route.fulfill({ status: 200, contentType: 'text/csv', body: toCSV(dntt) });
  return route.fulfill({ status: 200, contentType: 'text/csv', body: '' });
});
await page.goto('file://' + DIST_HTML, { waitUntil: 'load' });
await page.waitForFunction(() => document.querySelector('#statusText')?.textContent?.includes('phiếu cân'), { timeout: 15000 });
await page.fill('#fFrom', '2024-01-01');
await page.fill('#fTo', '2025-12-31');
await page.click('#btnLapBC');
await page.waitForTimeout(500);
await page.click('[data-target="baocao"]');
await page.click('[data-rtab="thanhtoan"]');
await page.waitForTimeout(200);

// window.print() thật không dùng được trong Playwright (không có hộp thoại OS) — thay vào đó cho
// window.print() ném lỗi để "đóng băng" đúng lúc #printSheet đang active (printSection() vốn gỡ
// active NGAY sau khi window.print() trả về), rồi dùng page.pdf() (cùng engine in ấn Chromium)
// để lấy đúng bản PDF mà người dùng sẽ thấy khi "Lưu dưới dạng PDF".
page.on('pageerror', () => {});
await page.evaluate(() => { window.print = function () { throw new Error('stub'); }; });
await page.click('[data-tools="thanhtoan"] [data-act="print"]').catch(() => {});
await page.waitForTimeout(200);
const stillActive = await page.evaluate(() => document.querySelector('#printSheet').classList.contains('active') && document.body.classList.contains('printingSheet'));
check('#printSheet ở đúng trạng thái "active" để mô phỏng lúc đang in', stillActive);

const pdfPath = path.resolve(__dirname, '../.tmp-print-test.pdf');
await page.pdf({ path: pdfPath, printBackground: true, format: 'A4', landscape: true });
const info = execSync(`pdfinfo "${pdfPath}"`, { encoding: 'utf8' });
const npages = +info.match(/Pages:\s+(\d+)/)[1];
const txt = execSync(`pdftotext -layout "${pdfPath}" -`, { encoding: 'utf8' });
const firstPageChars = txt.split('\f')[0].trim().length;
console.log('Số trang:', npages, '| số chữ trên trang 1:', firstPageChars);
check('KHÔNG có trang trắng ở đầu — trang 1 có nội dung thật (không phải trang trống bị đẩy ra)', firstPageChars > 100);
check('Chỉ 1 trang cho bảng nhỏ này (không bị dư 1 trang trắng ở đầu làm lệch số trang)', npages === 1);

fs.rmSync(pdfPath, { force: true });
console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
await browser.close();
process.exit(fail > 0 ? 1 : 0);
