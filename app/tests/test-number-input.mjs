// [2026-10-05] Ô nhập số kiểu VN trong Danh mục (yêu cầu: "ô nhập tiền có ngăn cách đơn vị, nhập
// khối lượng có ngăn cách đơn vị và thập phân 2 số"). Kiểm tra: hàm thuần + GÕ PHÍM THẬT trên trình
// duyệt (định dạng khi gõ, phím "." thành dấu thập phân, chặn chữ số lẻ thứ 3, giá trị lưu đúng, báo
// cáo dùng đúng giá trị). Chạy: npm run test:number-input
import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';
import { formatVNNumber as F, parseVNNumber as P, reformatTyping as R } from '../src/components/number-input.js';
import { genPhieuCan, genDNTT, genHDNCC, genHosokeo, toCSV } from './fixtures.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(__dirname, '../dist/index.html');
let pass = 0, fail = 0;
const check = (n, ok, x) => { ok ? pass++ : fail++; console.log((ok ? 'OK   ' : 'FAIL ') + n + (x != null ? '  [' + x + ']' : '')); };

// ---- 1) Hàm thuần
const unit = [
  [F(10000, 0), '10.000'], [F(1250000, 0), '1.250.000'], [F(100000, 2), '100.000'], [F(1234.56, 2), '1.234,56'], [F(1234.5, 2), '1.234,5'], [F(NaN, 0), ''], [F(-5000, 0), '-5.000'],
  [P('10.000'), 10000], [P('1.234,56'), 1234.56], [P('1.234,'), 1234], [P('-5.000'), -5000],
  [JSON.stringify(R('1234567', 7, 0)), '{"value":"1.234.567","caret":9}'], [JSON.stringify(R('1234,567', 8, 2)), '{"value":"1.234,56","caret":8}'],
  [JSON.stringify(R('1.2345', 3, 0)), '{"value":"12.345","caret":2}'], [JSON.stringify(R('12,5', 4, 0)), '{"value":"125","caret":3}'],
];
check('Hàm định dạng/đọc số: ' + unit.length + ' ca', unit.every(([g, e]) => g === e), unit.filter(([g, e]) => g !== e).map(([g, e]) => g + '≠' + e).join(' ; ') || null);
check('Rỗng → NaN (giống ô số cũ để trống, không đổi cách tính)', isNaN(P('')) && isNaN(P('  ')));
let rt = 0; for (let i = 0; i < 20000; i++) { const x = Math.round(Math.random() * 1e9) / 100; if (P(F(x, 2)) !== x) rt++; const y = Math.round(Math.random() * 1e10); if (P(F(y, 0)) !== y) rt++; }
check('Hiển thị → đọc lại giữ nguyên giá trị (40.000 số ngẫu nhiên)', rt === 0, rt ? rt + ' lệch' : null);

// ---- 2) Gõ phím thật
const pc = genPhieuCan(60), dn = genDNTT(pc, 30);
const CSV = { tytjQLj: toCSV(pc), zPk2i: toCSV(dn), wW_a10: toCSV(genHDNCC(dn)), esmF7s: toCSV(genHosokeo(5)) };
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1366, height: 800 } });
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
await page.route('https://docs.google.com/**', (r) => { const k = Object.keys(CSV).find((x) => r.request().url().includes(x)); return r.fulfill({ status: 200, contentType: 'text/csv', body: k ? CSV[k] : '' }); });
await page.goto('file://' + DIST);
await page.waitForFunction(() => /phiếu cân/.test(document.querySelector('#statusText').textContent));
await page.evaluate(() => { document.querySelector('#fFrom').value = '2024-01-01'; document.querySelector('#fTo').value = '2025-12-31'; document.querySelector('#btnLapBC').click(); });
await page.click('[data-target="danhmuc"]');

const HH = '#dmDLTable tbody tr:first-child td:nth-child(5) input';   // Hoa hồng/tấn (tiền)
const SLMAX = '#dmDLTable tbody tr:first-child td:nth-child(4) input'; // SL Max (khối lượng)
const HT = '#dmHTTable tbody tr:first-child td:nth-child(2) input';   // Hỗ trợ/tấn (tiền)
const val = (sel) => page.$eval(sel, (e) => e.value);

check('Hiển thị sẵn có ngăn cách: Hoa hồng "10.000", SL Max "100.000", Hỗ trợ "10.000"', (await val(HH)) === '10.000' && (await val(SLMAX)) === '100.000' && (await val(HT)) === '10.000', [await val(HH), await val(SLMAX), await val(HT)].join(' | '));

await page.click(HH, { clickCount: 3 }); await page.keyboard.type('1250000');
check('Gõ tiền "1250000" → hiện "1.250.000" ngay khi gõ', (await val(HH)) === '1.250.000', await val(HH));
await page.keyboard.type('abc,5');
check('Ô tiền: chữ cái và dấu phẩy bị bỏ qua', (await val(HH)) === '12.500.005', await val(HH));
await page.keyboard.press('Backspace');
await page.keyboard.press('Tab');
const stored1 = await page.evaluate(() => JSON.parse(localStorage.getItem('baocaongay_dmdl')).data[0]['Hoa hồng']);
check('Rời ô: lưu đúng SỐ 1250000 vào Danh mục (không lưu chuỗi có dấu chấm)', stored1 === 1250000, JSON.stringify(stored1));

// Sửa ở giữa chuỗi: con trỏ giữ đúng chỗ
await page.click(HH); await page.$eval(HH, (e) => e.setSelectionRange(1, 1)); await page.keyboard.type('9');
check('Chèn số ở giữa: "1.250.000" + gõ "9" sau số 1 → "19.250.000", con trỏ đứng sau số 9', (await val(HH)) === '19.250.000' && (await page.$eval(HH, (e) => e.selectionStart)) === 2, (await val(HH)) + ' @' + (await page.$eval(HH, (e) => e.selectionStart)));
await page.keyboard.press('Escape'); await page.keyboard.press('Tab');

await page.click(SLMAX, { clickCount: 3 }); await page.keyboard.type('1234.567');
check('Khối lượng: gõ "1234.567" (dấu chấm) → "1.234,56" (chấm thành phẩy, tối đa 2 số lẻ)', (await val(SLMAX)) === '1.234,56', await val(SLMAX));
await page.keyboard.press('Enter');
const stored2 = await page.evaluate(() => JSON.parse(localStorage.getItem('baocaongay_dmdl')).data[0]['Sản lượng max']);
check('Khối lượng: lưu đúng SỐ 1234.56', stored2 === 1234.56, JSON.stringify(stored2));
await page.click(SLMAX, { clickCount: 3 }); await page.keyboard.type('100000,5'); await page.keyboard.press('Tab');
check('Khối lượng: gõ "100000,5" (dấu phẩy) → "100.000,5"', (await val(SLMAX)) === '100.000,5', await val(SLMAX));

// Báo cáo dùng đúng giá trị: Hỗ trợ — dùng dữ liệu NG01 + khoảng ngày 2024–2025
const setDate = async (sel, v) => { await page.fill(sel, v); await page.$eval(sel, (e) => e.dispatchEvent(new Event('change', { bubbles: true }))); };
await setDate('#dmHTTable tbody tr:first-child td:nth-child(4) input', '2024-01-01');
await setDate('#dmHTTable tbody tr:first-child td:nth-child(5) input', '2025-12-31');
await page.click('#dmHTTable tbody tr:first-child td:nth-child(1) input', { clickCount: 3 }); await page.keyboard.type('NG01'); await page.keyboard.press('Tab');
const tot = () => page.evaluate(() => { const ths = [...document.querySelectorAll('#tbl-hotro thead th')].map((t) => t.textContent.replace(/[▲▼]/g, '').trim()); return document.querySelectorAll('#tbl-hotro tfoot td')[ths.indexOf('Tiền hỗ trợ')].textContent; });
const t1 = await tot();
await page.click(HT, { clickCount: 3 }); await page.keyboard.type('30000'); await page.keyboard.press('Tab');
const t3 = await tot();
const n = (s) => +s.replace(/[^\d]/g, '');
check('Hỗ trợ gõ "30000" → hiện "30.000", báo cáo tính lại ≈ 3 lần mức 10.000 (lệch nhỏ do làm tròn xuống hàng nghìn từng dòng)', (await val(HT)) === '30.000' && Math.abs(n(t3) / n(t1) - 3) < 0.05, t1 + ' → ' + t3);
check('Không có lỗi JS', errs.length === 0, JSON.stringify(errs));
await browser.close();
console.log('\n=== RESULT: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail ? 1 : 0);
