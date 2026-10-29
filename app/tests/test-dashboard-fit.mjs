// [2026-10-29] Thẻ số trên Dashboard không được TRÀN khỏi khung (người dùng gửi ảnh: "254.203.099.000 đ"
// bị cắt mất chữ "đ"). Tái hiện đúng thao tác: lập báo cáo khi đang ở tab khác (Dashboard bị ẩn) rồi mới
// mở Dashboard; thử nhiều bề rộng màn hình + đổi kích thước cửa sổ sau khi đã hiện.
// Chạy: npm run test:dashboard-fit   (tuỳ chọn: node tests/test-dashboard-fit.mjs <đường dẫn index.html>)
import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';
import { genPhieuCan, genDNTT, genHDNCC, genHosokeo, toCSV } from './fixtures.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(__dirname, '../dist/index.html');
const ID = { PC: 'tytjQLj', DN: 'zPk2i', HD: 'wW_a10', HK: 'esmF7s' };
// Số tiền cỡ thật (hàng trăm tỷ): nhân Thành tiền lên ×5000.
const pc = genPhieuCan(60).map((r) => Object.assign(r, { 'Thành tiền': String(Math.round(+r['Thành tiền'] * 5000)), 'KL hàng (KG)': String(+r['KL hàng (KG)'] * 300) }));
const dn = genDNTT(pc, 40).map((r) => Object.assign(r, { 'Thành tiền': String(Math.round(+r['Thành tiền'] * 5000)) }));
const CSV = { PC: toCSV(pc), DN: toCSV(dn), HD: toCSV(genHDNCC(dn)), HK: toCSV(genHosokeo(10)) };

let pass = 0, fail = 0;
const check = (n, ok, x) => { ok ? pass++ : fail++; console.log((ok ? 'OK   ' : 'FAIL ') + n + (x !== undefined ? '  [' + x + ']' : '')); };
const overflowing = (page) => page.$$eval('#dashCards .card .val', (els) => els.filter((e) => e.scrollWidth > e.clientWidth + 1 || e.getBoundingClientRect().right > e.closest('.card').getBoundingClientRect().right).map((e) => e.textContent));

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
for (const [w, h] of [[1700, 900], [1366, 768], [1100, 800], [760, 900]]) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.route('https://docs.google.com/**', (r) => { const k = Object.keys(ID).find((x) => r.request().url().includes(ID[x])); return r.fulfill({ status: 200, contentType: 'text/csv', body: CSV[k] || '' }); });
  await page.goto('file://' + DIST); await page.waitForTimeout(2500);
  const nav = (t) => page.evaluate((x) => document.querySelector('.item[data-target="' + x + '"]').click(), t); // màn hẹp: menu trái ẩn
  await nav('baocao'); // Dashboard đang ẩn lúc lập báo cáo
  await page.evaluate(() => { document.querySelector('#fFrom').value = '2024-01-01'; document.querySelector('#fTo').value = '2025-12-31'; document.querySelector('#btnLapBC').click(); });
  await page.waitForTimeout(1200);
  await nav('dashboard'); await page.waitForTimeout(400);
  const vals = await page.$$eval('#dashCards .card .val', (els) => els.map((e) => e.textContent));
  const bad = await overflowing(page);
  check(w + '×' + h + ': không thẻ nào tràn số (có số ≥ 15 ký tự: ' + vals.filter((v) => v.length >= 15).length + ')', bad.length === 0, bad.join(' | '));
  const minFont = await page.$$eval('#dashCards .card .val', (els) => Math.min(...els.map((e) => parseFloat(getComputedStyle(e).fontSize))));
  check(w + '×' + h + ': chữ số không nhỏ hơn 14px', minFont >= 14, minFont);
  await page.setViewportSize({ width: Math.round(w * 0.8), height: h }); await page.waitForTimeout(500);
  const bad2 = await overflowing(page);
  check(w + '×' + h + ' → thu hẹp cửa sổ 80%: vẫn không tràn', bad2.length === 0, bad2.join(' | '));
  await page.close();
}
await browser.close();
console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);
