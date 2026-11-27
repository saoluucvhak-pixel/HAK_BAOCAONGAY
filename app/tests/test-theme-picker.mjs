// Chọn giao diện ở menu và Cấu hình. Kiểm tra trên bản build:
// đổi màu đúng, lưu lại khi tải trang (áp ngay trong <head>, không chớp màu), không đụng dữ liệu/sao lưu.
// Chạy: npm run test:theme-picker   (tuỳ chọn: node tests/test-theme-picker.mjs <đường dẫn index.html>)
import { chromium } from 'playwright';
import path from 'path';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(__dirname, '../dist/index.html');
let pass = 0, fail = 0;
const check = (n, ok, x) => { ok ? pass++ : fail++; console.log((ok ? 'OK   ' : 'FAIL ') + n + (x !== undefined ? '  [' + x + ']' : '')); };
const EXPECT = { // --accent mong đợi (sáng / tối) — khớp bảng màu trong index.html
  luxe: ['#1d3a63', '#d4b06a'], classic: ['#0e7c86', '#21b5c0'], navy: ['#1e3a8a', '#7aa2ff'], ngoc: ['#047857', '#34d399'], neutral: ['#334155', '#cbd5e1'], glass: ['#176b58', '#87ddc3'],
  frost: ['#175c9c', '#9ed3ff'], forest: ['#20653e', '#9ce3b3'], night: ['#176277', '#59dcea'],
};
const executablePath = ['/opt/pw-browsers/chromium', '/usr/bin/chromium'].find(existsSync);
const browser = await chromium.launch({ executablePath });
const ctx = await browser.newContext({ colorScheme: 'light' });
const page = await ctx.newPage();
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
await page.route('https://docs.google.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/csv', body: 'x\n' }));
const url = 'http://localhost:8793/';
await page.route(url, r => r.fulfill({ contentType: 'text/html', body: readFileSync(DIST, 'utf8') }));
await page.goto(url);
const accent = () => page.evaluate(() => {
  const probe = document.createElement('span');
  probe.style.color = 'var(--accent)';
  document.body.append(probe);
  const rgb = getComputedStyle(probe).color;
  probe.remove();
  return '#' + rgb.match(/\d+/g).slice(0, 3).map(n => Number(n).toString(16).padStart(2, '0')).join('');
});
check('Mặc định: Kính Sương, theo máy (máy đang sáng)', (await page.inputValue('#themeSkin')) === 'frost' && (await page.inputValue('#themeMode')) === 'auto' && (await accent()) === EXPECT.frost[0]);
for (const [skin, [light, dark]] of Object.entries(EXPECT)) {
  await page.selectOption('#themeSkin', skin);
  await page.selectOption('#themeMode', 'light'); const a1 = await accent();
  await page.selectOption('#themeMode', 'dark'); const a2 = await accent();
  check(skin + ': sáng ' + light + ', tối ' + dark, a1 === light && a2 === dark, a1 + ' / ' + a2);
}
// Theo máy: máy chuyển sang tối thì tự tối
await page.selectOption('#themeSkin', 'glass'); await page.selectOption('#themeMode', 'auto');
await page.emulateMedia({ colorScheme: 'dark' });
check('Theo máy: máy tối → Kính mờ tối', (await accent()) === EXPECT.glass[1], await accent());
await page.emulateMedia({ colorScheme: 'light' });
// Lưu khi tải lại trang — áp trong <head> trước khi app chạy
await page.selectOption('#themeSkin', 'glass'); await page.selectOption('#themeMode', 'dark');
await page.reload({ waitUntil: 'domcontentloaded' });
const early = await page.evaluate(() => [document.documentElement.getAttribute('data-skin'), document.documentElement.getAttribute('data-theme')]);
check('Tải lại trang: Kính mờ tối được áp ngay từ <head>', early[0] === 'glass' && early[1] === 'dark', early.join(','));
await page.waitForTimeout(1000);
check('Tải lại trang: 2 ô chọn hiện đúng lựa chọn đã lưu', (await page.inputValue('#themeSkin')) === 'glass' && (await page.inputValue('#themeMode')) === 'dark');
await page.locator('[data-target=cauhinh]').click();
await page.locator('[data-rtab=config-appearance]').click();
await page.selectOption('#settingsThemeSkin', 'night');
check('Chọn Kính Đêm trong Cấu hình mở chế độ tối và đồng bộ menu',
  (await page.inputValue('#themeSkin')) === 'night' && (await page.inputValue('#themeMode')) === 'dark');
await page.selectOption('#themeSkin', 'forest');
check('Đổi giao diện từ menu cập nhật Cấu hình', (await page.inputValue('#settingsThemeSkin')) === 'forest');

for (const skin of ['frost', 'forest', 'night']) {
  await page.selectOption('#themeSkin', skin);
  const background = await page.locator('body').evaluate(el => getComputedStyle(el).backgroundImage);
  check(skin + ': ảnh nền được nhúng trong bản ngoại tuyến', background.includes('data:image/webp;base64,'));
  for (const mode of ['light', 'dark']) {
    await page.selectOption('#themeMode', mode);
    const minimum = await page.evaluate(() => {
      const sample = document.createElement('span');
      document.body.append(sample);
      const luminance = token => {
        sample.style.color = 'var(--' + token + ')';
        const channels = getComputedStyle(sample).color.match(/\d+/g).slice(0, 3).map(n => Number(n) / 255);
        return channels.map(c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
          .reduce((sum, value, i) => sum + value * [0.2126, 0.7152, 0.0722][i], 0);
      };
      const pairs = [['side-ink', 'side'], ['side-ink', 'accent-soft'], ['muted', 'side-top'],
        ['ink', 'panel'], ['ink', 'bg'], ['ink', 'hover'], ['muted', 'head'], ['muted', 'panel'],
        ['accent-ink', 'accent'], ['accent-ink', 'accent-2'], ['warn', 'panel'], ['err', 'panel']];
      const ratios = pairs.map(([foreground, background]) => {
        const values = [luminance(foreground), luminance(background)];
        return (Math.max(...values) + 0.05) / (Math.min(...values) + 0.05);
      });
      sample.remove();
      return Math.min(...ratios);
    });
    check(skin + ' / ' + mode + ': tương phản chữ ≥ 4,5:1', minimum >= 4.5, minimum.toFixed(2));
  }
}
for (const width of [800, 360]) {
  await page.setViewportSize({ width, height: 620 });
  const menu = page.locator('#sideToggle');
  await menu.press('Enter');
  await page.locator('[data-target=kiemlam]').press('Enter');
  check('Điều hướng với bàn phím, chiều rộng ' + width + ' px',
    (await menu.getAttribute('aria-expanded')) === 'false' && await page.locator('#sec-kiemlam').isVisible());
}
// Không nằm trong file sao lưu dữ liệu
const backupKeys = await page.evaluate(() => Object.keys(window.app.storageService.exportAll().data));
check('Lựa chọn giao diện KHÔNG nằm trong file sao lưu dữ liệu', !backupKeys.some((k) => /theme/i.test(k)), backupKeys.join(','));
// Hỏng dữ liệu đã lưu → về mặc định, không lỗi
await page.evaluate(() => localStorage.setItem('baocaongay_ui_theme', '{hỏng'));
await page.reload(); await page.waitForTimeout(1000);
check('Dữ liệu chọn giao diện hỏng → về Kính Sương mặc định, không lỗi', (await page.inputValue('#themeSkin')) === 'frost' && errors.length === 0, errors.join(' | '));
await browser.close();
console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);
