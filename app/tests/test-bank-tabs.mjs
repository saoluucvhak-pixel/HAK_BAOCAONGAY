// [2026-10-29] Báo cáo ngân hàng: tab "Tổng hợp thanh toán" (= query THTT_NH, từ DNTT_CT) và chọn phiếu
// nhập kho để in ("cho chọn phiếu in hoặc chọn tất cả"). Kiểm tra trên bản build, đếm trang PDF thật.
// Chạy: npm run test:bank-tabs   (tuỳ chọn: node tests/test-bank-tabs.mjs <đường dẫn index.html>)
import { chromium } from 'playwright';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { genPhieuCan, genDNTT, genHDNCC, genHosokeo, toCSV } from './fixtures.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(__dirname, '../dist/index.html');
const ID = { PC: 'tytjQLj', DN: 'zPk2i', HD: 'wW_a10', HK: 'esmF7s' };
const pc = genPhieuCan(40), dn = genDNTT(pc, 25);
const CSV = { PC: toCSV(pc), DN: toCSV(dn), HD: toCSV(genHDNCC(dn)), HK: toCSV(genHosokeo(5)) };
let pass = 0, fail = 0;
const check = (n, ok, x) => { ok ? pass++ : fail++; console.log((ok ? 'OK   ' : 'FAIL ') + n + (x !== undefined ? '  [' + x + ']' : '')); };
const pdfPages = (f) => +execFileSync('pdfinfo', [f]).toString().match(/Pages:\s+(\d+)/)[1];

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await (await browser.newContext({ acceptDownloads: true, viewport: { width: 1366, height: 900 } })).newPage();
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
const dialogs = []; page.on('dialog', (d) => { dialogs.push(d.message()); d.accept(); });
await page.route('https://docs.google.com/**', (r) => { const k = Object.keys(ID).find((x) => r.request().url().includes(ID[x])); return r.fulfill({ status: 200, contentType: 'text/csv', body: CSV[k] || '' }); });
await page.goto('file://' + DIST); await page.waitForTimeout(2500);
await page.evaluate(() => { document.querySelector('#fFrom').value = '2024-01-01'; document.querySelector('#fTo').value = '2025-12-31'; document.querySelector('#btnLapBC').click(); });
await page.waitForTimeout(1200);
await page.click('.item[data-target="nganhang"]');

// 1) Tổng hợp thanh toán
{
  await page.click('.rtab[data-rtab="thtt"]');
  const head = await page.$$eval('#tbl-thtt thead th', (t) => t.map((x) => x.textContent.trim().toLowerCase()));
  check('Tổng hợp thanh toán: đúng cột THTT_NH', head.join('|') === 'họ tên chủ rừng|ngày thanh toán|khối lượng|thành tiền|ngày chung', head.join('|'));
  const count = await page.textContent('[data-count="thtt"]');
  check('Tổng hợp thanh toán: đủ 25 dòng DNTT_CT trong kỳ', count === '25 dòng', count);
  const want = dn.reduce((s, r) => s + Number(r['Thành tiền']), 0).toLocaleString('de-DE');
  const foot = await page.$$eval('#tbl-thtt tfoot td', (t) => t.map((x) => x.textContent.trim()));
  check('Tổng hợp thanh toán: tổng Thành tiền = tổng DNTT_CT', foot[3] === want, foot[3] + ' / ' + want);
  const rows = await page.$$eval('#tbl-thtt tbody tr', (t) => t.map((tr) => [...tr.children].map((c) => c.textContent.trim())));
  check('Tổng hợp thanh toán: Ngày chung = Ngày thanh toán, xếp tăng theo ngày', rows.every((r) => r[1] === r[4]) && rows.every((r, i) => i === 0 || r[1].split('/').reverse().join('') >= rows[i - 1][1].split('/').reverse().join('')));
}
// 2) Chọn phiếu nhập kho để in
{
  await page.click('.rtab[data-rtab="pnk"]');
  const total = +((await page.textContent('[data-count="pnk"]')).match(/\d+/)[0]);
  await page.click('#btnPNKModal');
  const n = await page.$$eval('.pnkPickChk', (c) => c.length);
  check('Hộp in phiếu: liệt kê đủ ' + total + ' phiếu, mặc định chọn tất cả', n === total && (await page.$$eval('.pnkPickChk:checked', (c) => c.length)) === total && (await page.isChecked('#pnkPickAll')));
  await page.uncheck('#pnkPickAll');
  check('Bỏ "Chọn tất cả" → 0 phiếu được chọn', (await page.$$eval('.pnkPickChk:checked', (c) => c.length)) === 0 && /Đã chọn 0/.test(await page.textContent('#pnkPickCount')));
  await page.click('#btnBankPdf'); await page.waitForTimeout(500);
  check('Không chọn phiếu nào → báo, không tạo file', dialogs.some((m) => /Chưa chọn phiếu/.test(m)), dialogs.join(' | '));
  const chks = await page.$$('.pnkPickChk'); await chks[0].check(); await chks[2].check();
  check('Chọn 2 phiếu → đếm "Đã chọn 2"', /Đã chọn 2 \//.test(await page.textContent('#pnkPickCount')));
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.click('#btnBankPdf')]);
  const f2 = await dl.path();
  check('PDF chỉ có đúng 2 phiếu đã chọn (2 trang)', pdfPages(f2) === 2, pdfPages(f2));
  const text = execFileSync('pdftotext', [f2, '-']).toString();
  const r = await page.evaluate(() => [...document.querySelectorAll('#tbl-pnk tbody tr')].map((tr) => tr.children[6].textContent.trim()));
  check('PDF đúng phiếu thứ 1 và thứ 3 (theo Số CT)', text.includes(r[0]) && text.includes(r[2]) && !text.includes(r[1] + '\n'), r.slice(0, 3).join(','));
  await page.waitForTimeout(600); // chống bấm lặp 0,3 s sau mỗi lần xuất (export-runner) — người dùng thật không bấm nhanh vậy
  await page.click('#btnPNKModal'); // mở lại: mặc định lại chọn tất cả
  const [dl2] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.click('#btnBankPdf')]);
  check('Chọn tất cả → PDF đủ ' + total + ' trang', pdfPages(await dl2.path()) === total, pdfPages(await dl2.path()));
}
check('Không có lỗi JavaScript', errors.length === 0, errors.join(' | '));
await browser.close();
console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);
