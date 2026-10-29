// [2026-10-29] Chọn giao diện (menu trái): 5 chủ đề × Sáng / Tối / Theo máy. Kiểm tra trên bản build:
// đổi màu đúng, lưu lại khi tải trang (áp ngay trong <head>, không chớp màu), không đụng dữ liệu/sao lưu.
// Chạy: npm run test:theme-picker   (tuỳ chọn: node tests/test-theme-picker.mjs <đường dẫn index.html>)
import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(__dirname, '../dist/index.html');
let pass = 0, fail = 0;
const check = (n, ok, x) => { ok ? pass++ : fail++; console.log((ok ? 'OK   ' : 'FAIL ') + n + (x !== undefined ? '  [' + x + ']' : '')); };
const EXPECT = { // --accent mong đợi (sáng / tối) — khớp bảng màu trong index.html
  luxe: ['#1d3a63', '#d4b06a'], classic: ['#0e7c86', '#21b5c0'], navy: ['#1e3a8a', '#7aa2ff'], ngoc: ['#047857', '#34d399'], neutral: ['#334155', '#cbd5e1'],
};
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await browser.newContext({ colorScheme: 'light' });
const page = await ctx.newPage();
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
await page.route('https://docs.google.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/csv', body: 'x\n' }));
await page.goto('file://' + DIST); await page.waitForTimeout(1200);
const accent = () => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim().toLowerCase());
check('Mặc định: Luxe, theo máy (máy đang sáng)', (await page.inputValue('#themeSkin')) === 'luxe' && (await page.inputValue('#themeMode')) === 'auto' && (await accent()) === EXPECT.luxe[0]);
for (const [skin, [light, dark]] of Object.entries(EXPECT)) {
  await page.selectOption('#themeSkin', skin);
  await page.selectOption('#themeMode', 'light'); const a1 = await accent();
  await page.selectOption('#themeMode', 'dark'); const a2 = await accent();
  check(skin + ': sáng ' + light + ', tối ' + dark, a1 === light && a2 === dark, a1 + ' / ' + a2);
}
// Theo máy: máy chuyển sang tối thì tự tối
await page.selectOption('#themeSkin', 'navy'); await page.selectOption('#themeMode', 'auto');
await page.emulateMedia({ colorScheme: 'dark' });
check('Theo máy: máy tối → Navy tối', (await accent()) === EXPECT.navy[1], await accent());
await page.emulateMedia({ colorScheme: 'light' });
// Lưu khi tải lại trang — áp trong <head> trước khi app chạy
await page.selectOption('#themeSkin', 'ngoc'); await page.selectOption('#themeMode', 'dark');
await page.reload({ waitUntil: 'domcontentloaded' });
const early = await page.evaluate(() => [document.documentElement.getAttribute('data-skin'), document.documentElement.getAttribute('data-theme')]);
check('Tải lại trang: Ngọc bích tối được áp ngay từ <head>', early[0] === 'ngoc' && early[1] === 'dark', early.join(','));
await page.waitForTimeout(1000);
check('Tải lại trang: 2 ô chọn hiện đúng lựa chọn đã lưu', (await page.inputValue('#themeSkin')) === 'ngoc' && (await page.inputValue('#themeMode')) === 'dark');
// Không nằm trong file sao lưu dữ liệu
const backupKeys = await page.evaluate(() => Object.keys(window.app.storageService.exportAll().data));
check('Lựa chọn giao diện KHÔNG nằm trong file sao lưu dữ liệu', !backupKeys.some((k) => /theme/i.test(k)), backupKeys.join(','));
// Hỏng dữ liệu đã lưu → về mặc định, không lỗi
await page.evaluate(() => localStorage.setItem('baocaongay_ui_theme', '{hỏng'));
await page.reload(); await page.waitForTimeout(1000);
check('Dữ liệu chọn giao diện hỏng → về Luxe mặc định, không lỗi', (await page.inputValue('#themeSkin')) === 'luxe' && errors.length === 0, errors.join(' | '));
await browser.close();
console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);
