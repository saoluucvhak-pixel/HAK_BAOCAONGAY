import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import fs from 'fs';
import { genPhieuCan, genDNTT, toCSV } from './fixtures.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_HTML = path.resolve(__dirname, '../dist/index.html');
const DOWNLOAD_DIR = path.resolve(__dirname, '../.tmp-pdf-test');
fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ acceptDownloads: true });
const errors = []; page.on('pageerror', (e) => errors.push(e.message));

// Sinh dữ liệu với số tiền LỚN (chục tỷ) để đảm bảo tái hiện đúng tình huống người dùng báo (số
// tiền dài, nhiều cột dồn trên 1 trang PDF landscape A4 dễ bị hẹp cột).
function mulberry32(seed) { return function () { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
Math.random = mulberry32(42);
const phieucan = genPhieuCan(80);
const dntt = genDNTT(phieucan, 30);
// Đẩy Khối lượng/Đơn giá thanh toán lên rất cao để "Thành tiền" ra số tiền dài (chục tỷ đồng) —
// tái hiện đúng kiểu số liệu người dùng gặp phải (ảnh chụp có "17.838.017.000 đ" v.v.).
dntt.forEach((r) => {
  r['Khối lượng'] = String(9000 + Math.floor(Math.random() * 500));
  r['Đơn giá thanh toán'] = String(1900000 + Math.floor(Math.random() * 50000));
  r['Thành tiền'] = String((9000 + Math.random() * 500) * (1900000 + Math.random() * 50000) | 0);
});

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

// In vài giá trị "Thành tiền" hiện trên bảng để log tham khảo
const sampleVals = await page.evaluate(() => Array.from(document.querySelectorAll('#tbl-thanhtoan tbody tr')).slice(0, 3).map((tr) => tr.querySelector('td:last-child')?.textContent));
console.log('Mẫu vài dòng "Thành tiền" trên bảng:', sampleVals);

const [download] = await Promise.all([
  page.waitForEvent('download', { timeout: 15000 }),
  page.click('[data-tools="thanhtoan"] [data-act="pdf"]'),
]);
const pdfPath = path.join(DOWNLOAD_DIR, 'test.pdf');
await download.saveAs(pdfPath);
console.log('Đã lưu PDF:', pdfPath, fs.statSync(pdfPath).size, 'bytes');

// Dùng pdftotext -bbox để lấy vị trí (x,y,width,height) từng từ — kiểm tra có từ "đ" nào đứng
// riêng 1 mình mà dòng NGAY TRÊN nó (cùng cột x, khác y) là 1 số tiền hay không (dấu hiệu bị ngắt
// dòng ngay trước đơn vị tiền, đúng lỗi người dùng báo).
const xml = execSync(`pdftotext -bbox "${pdfPath}" -`, { encoding: 'utf8' });
const wordRe = /<word[^>]*xMin="([\d.]+)"[^>]*yMin="([\d.]+)"[^>]*xMax="([\d.]+)"[^>]*yMax="([\d.]+)"[^>]*>([^<]*)<\/word>/g;
const words = [];
let m;
while ((m = wordRe.exec(xml))) {
  words.push({ xMin: +m[1], yMin: +m[2], xMax: +m[3], yMax: +m[4], text: m[5].trim() });
}
console.log('Tổng số "word" trong PDF:', words.length);

let orphanDCount = 0;
const orphanExamples = [];
words.forEach((w, i) => {
  if (w.text !== 'đ') return;
  // Tìm từ ngay phía trên (yMax của nó nhỏ hơn yMin của "đ" 1 dòng, x gần trùng) có phải là số không.
  const above = words.find((o) => o !== w && Math.abs(o.xMin - w.xMin) < 3 && o.yMax <= w.yMin + 0.5 && o.yMax > w.yMin - 6 && /[\d.,]/.test(o.text));
  if (above) { orphanDCount++; orphanExamples.push({ above: above.text, d: w.text, dPos: [w.xMin, w.yMin], abovePos: [above.xMin, above.yMin] }); }
});
console.log('Số chỗ "đ" đứng riêng dòng dưới 1 số tiền (lỗi ngắt dòng):', orphanDCount);
if (orphanExamples.length) console.log('Ví dụ:', JSON.stringify(orphanExamples.slice(0, 5), null, 2));

const ok = orphanDCount === 0 && errors.length === 0;
console.log(ok ? 'OK: không còn hiện tượng "đ" bị ngắt xuống dòng riêng trong PDF' : 'FAIL: vẫn còn "đ" bị ngắt dòng, hoặc có lỗi JS');
console.log('pageerrors:', errors);

fs.rmSync(DOWNLOAD_DIR, { recursive: true, force: true });
await browser.close();
process.exit(ok ? 0 : 1);
