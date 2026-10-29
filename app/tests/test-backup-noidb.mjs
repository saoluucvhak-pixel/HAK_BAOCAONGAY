// [Rà soát 30/10/2026] Sao lưu dữ liệu khi máy KHÔNG đọc được kho khoản vay (IndexedDB bị chặn/lỗi):
// trước khi có khoản vay, nút "Sao lưu" luôn tải được file (Danh mục, Cấu hình…). Thêm khoản vay vào sao
// lưu KHÔNG được làm mất khả năng đó: vẫn tải file (không có trường khoanVay) và báo rõ cho người dùng.
// Chạy: npm run test:backup-noidb   (tuỳ chọn: node tests/test-backup-noidb.mjs <đường dẫn index.html>)
import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { genPhieuCan, genDNTT, genHDNCC, genHosokeo, toCSV } from './fixtures.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(__dirname, '../dist/index.html');
const ID = { PC: 'tytjQLj', DN: 'zPk2i', HD: 'wW_a10', HK: 'esmF7s' };
const pc = genPhieuCan(20), dn = genDNTT(pc, 8);
const CSV = { PC: toCSV(pc), DN: toCSV(dn), HD: toCSV(genHDNCC(dn)), HK: toCSV(genHosokeo(5)) };

let pass = 0, fail = 0;
const check = (n, ok, x) => { ok ? pass++ : fail++; console.log((ok ? 'OK   ' : 'FAIL ') + n + (x !== undefined ? '  [' + String(x).slice(0, 220) + ']' : '')); };

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await browser.newContext({ timezoneId: 'Asia/Ho_Chi_Minh', locale: 'vi-VN', acceptDownloads: true });
const page = await ctx.newPage();
// Máy chặn IndexedDB (vd chính sách bảo mật / chế độ riêng tư): indexedDB không dùng được.
await page.addInitScript(() => { Object.defineProperty(window, 'indexedDB', { configurable: true, get() { return undefined; } }); });
await page.route('https://docs.google.com/**', (r) => { const k = Object.keys(ID).find((x) => r.request().url().includes(ID[x])); return r.fulfill({ status: 200, contentType: 'text/csv', body: CSV[k] || '' }); });
await page.goto('file://' + DIST, { waitUntil: 'load' });
await page.waitForTimeout(2500);
await page.click('.item[data-target="cauhinh"]');
let dl = null;
try { [dl] = await Promise.all([page.waitForEvent('download', { timeout: 8000 }), page.click('#btnBackupData')]); } catch (e) { dl = null; }
const st = await page.textContent('#backupRestoreStatus');
check('Kho khoản vay không đọc được: VẪN tải được file sao lưu', !!dl, st);
if (dl) {
  const b = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));
  check('File sao lưu vẫn có dữ liệu Danh mục/Cấu hình (trường data)', b && typeof b.data === 'object' && b.data !== null);
  check('File KHÔNG có trường khoanVay (khôi phục sẽ giữ nguyên khoản vay đang có)', !('khoanVay' in b));
}
check('Báo rõ: file KHÔNG có khoản vay + lý do', /KHÔNG có khoản vay/.test(st) && /IndexedDB/.test(st), st);
await browser.close();
console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);
