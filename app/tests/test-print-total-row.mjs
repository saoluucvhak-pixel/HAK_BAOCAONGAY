// Kiểm chứng lỗi "kẻ khung lở dở, dòng Tổng cộng lặp lại ở mọi trang" khi in báo cáo nhiều trang
// (BKLS Chi tiết, 400+ dòng). Nguyên nhân: dòng Tổng cộng nằm trong <tfoot> — trình duyệt tự lặp
// lại <tfoot> ở MỖI trang khi bảng bị ngắt trang lúc in. Đã sửa bằng cách đưa dòng Tổng cộng
// thành dòng cuối của <tbody> (xem buildPrintSheet() trong legacy-app.js) — chỉ in đúng 1 lần, ở
// cuối. Không thuộc bộ ui-baseline.mjs — chạy riêng bằng `node tests/test-print-total-row.mjs`.
import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import fs from 'fs';
import { genPhieuCan, genDNTT, genHosokeo, genHDNCC, toCSV } from './fixtures.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_HTML = path.resolve(__dirname, '../dist/index.html');

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage();
const phieucan = genPhieuCan(60);
const dntt = genDNTT(phieucan, 25);
const hosokeo = genHosokeo(400); // nhiều dòng để chắc chắn dàn ra nhiều trang khi in, giống thực tế người dùng báo
const hdncc = genHDNCC(dntt);
await page.route('https://docs.google.com/**', (route) => {
  const url = route.request().url();
  if (url.includes('2PACX-1vTj7PHtJtv1iBaF9tCKJ9zgnTyc4j6Hbt9CEYX36sVIDXwJDQUvMGd-O_bc8E-N6iEh5JqH9tytjQLj')) return route.fulfill({ status: 200, contentType: 'text/csv', body: toCSV(phieucan) });
  if (url.includes('2PACX-1vSqRW3Yk2MBgXp1qi29tQZQyn1R-opTUjE5PqBFIH7knAOcr1YvthP_AuXa_10knbaprgtM4i_zPk2i')) return route.fulfill({ status: 200, contentType: 'text/csv', body: toCSV(dntt) });
  if (url.includes('2PACX-1vT0mcMT2TsD7lOLSNrTqZPVjJJ395kI54SxSri5-n_VxrfAcC74IKkgCnesT30d1bhx59gJC4esmF7s')) return route.fulfill({ status: 200, contentType: 'text/csv', body: toCSV(hosokeo) });
  return route.fulfill({ status: 200, contentType: 'text/csv', body: toCSV(hdncc) });
});
await page.goto('file://' + DIST_HTML, { waitUntil: 'load' });
await page.waitForFunction(() => document.querySelector('#statusText')?.textContent?.includes('phiếu cân'), { timeout: 15000 });
await page.fill('#fFrom', '2024-01-01');
await page.fill('#fTo', '2025-12-31');
await page.click('#btnLapBC');
await page.waitForTimeout(500);
await page.click('[data-target="lamsan"]');
await page.click('[data-rtab="bklsct"]');
await page.waitForTimeout(200);

page.on('pageerror', () => {});
await page.evaluate(() => { window.print = function () { throw new Error('stub'); }; });
await page.click('[data-tools="bklsct"] [data-act="print"]').catch(() => {});
await page.waitForTimeout(200);

const pdfPath = path.resolve(__dirname, '../.tmp-print-total-test.pdf');
await page.pdf({ path: pdfPath, printBackground: true, format: 'A4', landscape: true });
const info = execSync(`pdfinfo "${pdfPath}"`, { encoding: 'utf8' });
console.log(info.match(/Pages:\s+\d+/)[0]);
const txt = execSync(`pdftotext -layout "${pdfPath}" -`, { encoding: 'utf8' });
const pages = txt.split('\f').slice(0, -1);
console.log('Số trang thật:', pages.length);
let tongCongCount = 0;
pages.forEach((p, i) => {
  const c = (p.match(/Tổng cộng/g) || []).length;
  if (c > 0) console.log('  trang ' + (i+1) + ': xuất hiện "Tổng cộng" ' + c + ' lần');
  tongCongCount += c;
});
console.log('TỔNG số lần "Tổng cộng" xuất hiện trong toàn bộ file:', tongCongCount);
const okCount = tongCongCount === 1;
const okLastPage = pages[pages.length - 1].includes('Tổng cộng');
console.log(okCount ? 'OK: chỉ xuất hiện đúng 1 lần (ở cuối)' : 'FAIL: xuất hiện ' + tongCongCount + ' lần (mong đợi 1)');
console.log(okLastPage ? 'OK: "Tổng cộng" nằm ở TRANG CUỐI' : 'FAIL: "Tổng cộng" không nằm ở trang cuối');
fs.rmSync(pdfPath, { force: true });
await browser.close();
process.exit(okCount && okLastPage ? 0 : 1);
