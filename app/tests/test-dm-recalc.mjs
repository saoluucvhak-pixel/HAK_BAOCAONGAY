// [2026-10-05] Người dùng báo: "Danh mục cột tiền rất nhỏ, khó điền; thay đổi đơn giá nhưng báo cáo
// không tính lại tiền". Kiểm chứng: (1) ô số/tiền trong Danh mục đủ rộng để đọc/gõ; (2) sửa Danh mục
// (đơn giá hỗ trợ, hoa hồng, mã nguồn gốc/đại lý, xoá dòng) → báo cáo tính lại NGAY, không cần bấm
// LẬP BÁO CÁO. Chạy: npm run test:dm-recalc  (tuỳ chọn: node tests/test-dm-recalc.mjs <index.html>)
import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';
import { genPhieuCan, genDNTT, genHDNCC, genHosokeo, toCSV } from './fixtures.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(__dirname, '../dist/index.html');
function mulberry32(seed) { return function () { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
Math.random = mulberry32(5);
const pc = genPhieuCan(60), dn = genDNTT(pc, 30);
const CSV = { tytjQLj: toCSV(pc), zPk2i: toCSV(dn), wW_a10: toCSV(genHDNCC(dn)), esmF7s: toCSV(genHosokeo(5)) };

let pass = 0, fail = 0;
const check = (n, ok, x) => { ok ? pass++ : fail++; console.log((ok ? 'OK   ' : 'FAIL ') + n + (x ? '  [' + x + ']' : '')); };

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1366, height: 800 } });
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
await page.route('https://docs.google.com/**', (r) => { const k = Object.keys(CSV).find((x) => r.request().url().includes(x)); return r.fulfill({ status: 200, contentType: 'text/csv', body: k ? CSV[k] : '' }); });
await page.goto('file://' + DIST);
await page.waitForFunction(() => /phiếu cân/.test(document.querySelector('#statusText').textContent));
await page.evaluate(() => { document.querySelector('#fFrom').value = '2024-01-01'; document.querySelector('#fTo').value = '2025-12-31'; document.querySelector('#btnLapBC').click(); });

// ---- (1) Bề rộng ô nhập
await page.click('[data-target="danhmuc"]');
const widths = await page.evaluate(() => {
  const w = (sel) => Math.round(document.querySelector(sel).getBoundingClientRect().width);
  return { slMin: w('#dmDLTable tbody tr:first-child td:nth-child(3) input'), hoaHong: w('#dmDLTable tbody tr:first-child td:nth-child(5) input'), hoTro: w('#dmHTTable tbody tr:first-child td:nth-child(2) input'), ngay: w('#dmDLTable tbody tr:first-child td:nth-child(6) input') };
});
check('Màn 1366px: ô SL Min/Hoa hồng/Hỗ trợ ≥ 90px, ô ngày ≥ 130px (trước: 16/41/49/88px)', widths.slMin >= 90 && widths.hoaHong >= 90 && widths.hoTro >= 90 && widths.ngay >= 130, JSON.stringify(widths));

const total = (key, col) => page.evaluate(([k, c]) => {
  const ths = [...document.querySelectorAll('#tbl-' + k + ' thead th')].map((t) => t.textContent.replace(/[▲▼]/g, '').trim());
  const i = ths.indexOf(c); const td = document.querySelectorAll('#tbl-' + k + ' tfoot td')[i];
  return { count: document.querySelector('[data-count="' + k + '"]').textContent, total: td ? td.textContent : null };
}, [key, col]);
async function setCell(sel, value) { await page.fill(sel, value); await page.press(sel, 'Enter'); await page.locator(sel).evaluate((el) => el.dispatchEvent(new Event('change', { bubbles: true }))); await page.waitForTimeout(150); }

// ---- (2a) Danh mục Hỗ trợ: mặc định D1/D2 không khớp dữ liệu (NG01/NG02) → 0 dòng
// Dòng D1 mặc định chỉ hiệu lực năm 2026, dữ liệu thử là 2024–2025 → mở khoảng ngày trước (vẫn 0 dòng vì mã D1 chưa khớp)
await setCell('#dmHTTable tbody tr:first-child td:nth-child(4) input', '2024-01-01');
await setCell('#dmHTTable tbody tr:first-child td:nth-child(5) input', '2025-12-31');
const h0 = await total('hotro', 'Tiền hỗ trợ');
await setCell('#dmHTTable tbody tr:first-child td:nth-child(1) input', 'NG01');
const h1 = await total('hotro', 'Tiền hỗ trợ');
check('Sửa mã Nguồn gốc D1→NG01: báo cáo Hỗ trợ tự có dữ liệu, không cần bấm LẬP BÁO CÁO', h0.count === '0 dòng' && h1.count !== '0 dòng', h0.count + ' → ' + h1.count);
const h2 = h1;
await setCell('#dmHTTable tbody tr:first-child td:nth-child(2) input', '20000');
const h3 = await total('hotro', 'Tiền hỗ trợ');
const num = (s) => +String(s || '').replace(/[^\d-]/g, '');
check('Đổi đơn giá Hỗ trợ 10.000→20.000: Tiền hỗ trợ tính lại ngay (≈ gấp đôi)', num(h2.total) > 0 && Math.abs(num(h3.total) / num(h2.total) - 2) < 0.01, h2.total + ' → ' + h3.total);

// ---- (2b) Danh mục Đại lý: đổi mã DT→DL01 rồi đổi Hoa hồng
const k0 = await total('hoahong', 'Tiền hoa hồng');
await setCell('#dmDLTable tbody tr:first-child td:nth-child(1) input', 'DL01');
await setCell('#dmDLTable tbody tr:first-child td:nth-child(4) input', '100000000');
const k1 = await total('hoahong', 'Tiền hoa hồng');
await setCell('#dmDLTable tbody tr:first-child td:nth-child(5) input', '30000');
const k2 = await total('hoahong', 'Tiền hoa hồng');
check('Sửa Đại lý DT→DL01: Tiền hoa hồng tính lại ngay', num(k1.total) > num(k0.total), k0.total + ' → ' + k1.total);
check('Đổi Hoa hồng/tấn 10.000→30.000: Tiền hoa hồng tính lại ngay', num(k2.total) > num(k1.total), k1.total + ' → ' + k2.total);

// ---- (2c) Xoá dòng Danh mục Hỗ trợ → báo cáo cập nhật
await page.click('#dmHTTable tbody tr:first-child .rmBtn'); await page.waitForTimeout(150);
const h4 = await total('hotro', 'Tiền hỗ trợ');
check('Xoá dòng NG01 khỏi Danh mục: báo cáo Hỗ trợ cập nhật ngay về 0 dòng', h4.count === '0 dòng', h3.count + ' → ' + h4.count);

// ---- (2d) Hoàn tác vẫn đúng như trước
await page.click('#btnUndoDM'); await page.waitForTimeout(150);
const h5 = await total('hotro', 'Tiền hỗ trợ');
check('Hoàn tác việc xoá: báo cáo quay lại đúng số trước khi xoá', h5.total === h3.total, h5.total);
check('Không có lỗi JS', errs.length === 0, JSON.stringify(errs));

await browser.close();
console.log('\n=== RESULT: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail ? 1 : 0);
