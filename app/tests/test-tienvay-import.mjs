// [2026-10-29] BUG-TV01 — Tải file sổ phụ ngân hàng (tab Cập nhật khoản vay) có 1 dòng trống hoặc dòng "Tổng cộng" làm
// app đứng mãi ở "Đang đọc file..." (Worker đọc file thoát giữa chừng, không trả kết quả).
// Kiểm chứng trên đúng bản build (Worker thật trong Chromium), bấm chọn file như người dùng.
// Chạy: npm run test:tienvay-import   (tuỳ chọn: node tests/test-tienvay-import.mjs <đường dẫn index.html>)
import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';
import XLSX from 'xlsx';
import { genPhieuCan, genDNTT, genHDNCC, genHosokeo, toCSV } from './fixtures.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(__dirname, '../dist/index.html');
const ID = { PC: 'tytjQLj', DN: 'zPk2i', HD: 'wW_a10', HK: 'esmF7s' };
const pc = genPhieuCan(40), dn = genDNTT(pc, 15);
const CSV = { PC: toCSV(pc), DN: toCSV(dn), HD: toCSV(genHDNCC(dn)), HK: toCSV(genHosokeo(10)) };
const READ_WAIT_MS = 5000; // file thử chỉ vài dòng — đọc xong < 1 s; quá 5 s coi như treo

let pass = 0, fail = 0;
const check = (n, ok, x) => { ok ? pass++ : fail++; console.log((ok ? 'OK   ' : 'FAIL ') + n + (x ? '  [' + x + ']' : '')); };

// [2026-10-29] Tab nhận 2 dạng file: nguyên SỔ PHỤ NGÂN HÀNG (bảng VAY — app tự lấy dòng tiền vay) và bảng
// TH_VAY 3 cột. 3 dòng giải ngân; Ngày chứng từ ghi chữ "PC…" (file cũ hay ghi vậy) vẫn phải nhận.
const H = ['Tài khoản ngân hàng', 'Ngày hạch toán', 'Ngày chứng từ', 'Số chứng từ', 'Diễn giải', 'TK đối ứng', 'Thu', 'Chi', 'Tồn', 'Tên đối tượng'];
const VAY_TEXT = 'Chuyển tiền nội bộ vay USD sang vay keo VNĐ HAK';
const row = (d, thu) => ['8619299999 - BIDV', d, 'PC' + d.replace(/\//g, ''), 'CT' + d, VAY_TEXT, '1122', thu, 0, thu, ''];
// Mỗi trường hợp nhân hệ số k riêng ⇒ tổng tiền vay khác nhau (100.000.000 × k): số còn lại của lần
// tải trước sẽ KHÔNG bị nhận nhầm là đúng.
const rowsK = (k) => [row('9/1/2026', 50000000 * k), row('9/2/2026', 30000000 * k), row('9/3/2026', 20000000 * k)];
const vnd = (n) => n.toLocaleString('de-DE');
const xlsxBuf = (aoa) => {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'So chi tiet');
  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
};

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage();
page.on('pageerror', () => {});
await page.route('https://docs.google.com/**', (r) => {
  const k = Object.keys(ID).find((x) => r.request().url().includes(ID[x]));
  return r.fulfill({ status: 200, contentType: 'text/csv', body: CSV[k] || '' });
});
await page.goto('file://' + DIST, { waitUntil: 'load' });
await page.waitForTimeout(3500);
await page.evaluate(() => { document.querySelector('#fFrom').value = '2026-09-01'; document.querySelector('#fTo').value = '2026-09-30'; document.querySelector('#btnLapBC').click(); });
await page.waitForTimeout(800);

// [2026-10-29] File nhập ở tab "Cập nhật khoản vay": đọc xong → hộp xác nhận (thay toàn bộ, bấm 2 lần)
// → ghi vào kho → Sổ chi tiết cập nhật. "Đọc xong" = hộp xác nhận hiện ra hoặc có thông báo lỗi.
const status = () => page.$eval('#loanStatus', (e) => e.textContent);
async function upload(name, aoa) {
  await page.setInputFiles('#tienVayFileInput', { name, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: xlsxBuf(aoa) });
  const t0 = Date.now();
  let s = '', opened = false;
  while (Date.now() - t0 < READ_WAIT_MS) {
    opened = await page.$eval('#loanImportOverlay', (e) => e.classList.contains('active'));
    s = await status();
    if (opened || /Lỗi đọc file/.test(s)) break;
    await page.waitForTimeout(100);
  }
  if (!opened) return { s: s || 'Đang đọc file... (không có kết quả)', table: { html: '' } };
  const summary = await page.$eval('#loanImportSummary', (e) => e.textContent);
  await page.click('#btnLoanImportReplace'); await page.click('#btnLoanImportReplace');
  await page.waitForFunction(() => /Đã thay toàn bộ/.test(document.querySelector('#loanStatus').textContent), null, { timeout: READ_WAIT_MS });
  await page.waitForTimeout(300); // runReport() sau khi ghi
  return { s: summary, table: { html: await page.$eval('#loanSummary', (e) => e.textContent) } };
}

const CASES = [
  ['File liền mạch 3 dòng (trường hợp vốn đã chạy)', 1, ([a, b, c]) => [H, a, b, c]],
  ['Có 1 dòng trống ở giữa', 2, ([a, b, c]) => [H, a, [], b, c]],
  ['Có dòng "Tổng cộng" ở cuối', 3, ([a, b, c]) => [H, a, b, c, ['Tổng cộng', '', '', '', '', '', 300000000, 0, '', '']]],
  ['Dòng trống + "Total" + tiêu đề nằm ở dòng 3', 4, ([a, b, c]) => [['SỔ PHỤ TÀI KHOẢN'], [], H, a, [], b, c, [], ['Total', '', '', '', '', '', 400000000]]],
];
for (const [name, k, build] of CASES) {
  const aoa = build(rowsK(k));
  const { s, table } = await upload(name.replace(/\W+/g, '_') + '.xlsx', aoa);
  check(name + ': đọc xong, không treo', !/Đang đọc file/.test(s), s.slice(0, 80));
  check(name + ': đúng 3 dòng dữ liệu (bỏ dòng trống/tổng)', /đọc 3 dòng, lấy 3 dòng tiền vay/.test(s), s.slice(0, 120));
  // Tiền vay giải ngân = k × (50 + 30 + 20) triệu
  const want = vnd(100000000 * k);
  check(name + ': lưu đủ, tiền vay giải ngân ' + want, table.html.includes('3 khoản vay, tổng ' + want), table.html);
}
// Cùng các trường hợp với file 3 cột (bảng TH_VAY)
const H3 = ['Ngày hạch toán', 'Ngày chứng từ', 'Tổng tiền vay'];
const r3 = (k) => rowsK(k).map((r) => [r[1], r[2], r[6]]);
const CASES3 = [
  ['3 cột: có 1 dòng trống ở giữa', 5, ([a, b, c]) => [H3, a, [], b, c]],
  ['3 cột: dòng trống + "Tổng cộng" + tiêu đề ở dòng 3', 6, ([a, b, c]) => [['TỔNG HỢP TIỀN VAY'], [], H3, a, [], b, c, [], ['Tổng cộng', '', 600000000]]],
];
for (const [name, k, build] of CASES3) {
  const { s, table } = await upload(name.replace(/\W+/g, '_') + '.xlsx', build(r3(k)));
  check(name + ': đọc xong, không treo', !/Đang đọc file/.test(s), s.slice(0, 80));
  check(name + ': đúng 3 khoản (bỏ dòng trống/tổng)', /đọc 3 dòng, hợp lệ 3 khoản vay/.test(s), s.slice(0, 120));
  const want = vnd(100000000 * k);
  check(name + ': lưu đủ, tổng ' + want, table.html.includes('3 khoản vay, tổng ' + want), table.html);
}
// Đối chứng: file sai cấu trúc vẫn phải báo lỗi rõ ràng (hành vi cũ giữ nguyên)
{
  const { s } = await upload('sai_cau_truc.xlsx', [['Cột A', 'Cột B'], [1, 2]]);
  check('File thiếu cột: báo lỗi rõ ràng (nêu cả 2 dạng file nhận được)', /Lỗi đọc file: .*Ngày hạch toán.*Tổng tiền vay.*hoặc.*Diễn giải/.test(s), s);
}

await browser.close();
console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);
