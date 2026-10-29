// [2026-10-29] Sổ chi tiết tiền vay: ô "Cập nhật số dư đầu kỳ" + thẻ số liệu tổng — kiểm thử như người dùng
// trên đúng bản build (Chromium, giờ Việt Nam):
//  - Chưa nhập số dư: thẻ tổng khớp bảng (đầu kỳ 0, vay, chi, cuối kỳ = lũy kế dòng cuối), sổ như cũ.
//  - Nhập sai bị báo, chưa lưu. Nhập đúng ⇒ sổ bắt đầu từ ngày nhập, dòng "Số dư đầu kỳ", thẻ + bảng + Excel
//    cùng số; còn sau tải lại; có trong file sao lưu; khôi phục; xoá (bấm 2 lần) ⇒ về như cũ.
// Chạy: npm run test:tienvay-opening   (tuỳ chọn: node tests/test-tienvay-opening.mjs <đường dẫn index.html>)
import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';
import XLSX from 'xlsx';
import { genPhieuCan, genHDNCC, genHosokeo, toCSV } from './fixtures.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(__dirname, '../dist/index.html');
const ID = { PC: 'tytjQLj', DN: 'zPk2i', HD: 'wW_a10', HK: 'esmF7s' };
const WAIT = 10000;
// Chi (DNTT_CT): 31/08 300tr; 01/09 2 dòng 8.063.000 (5,34 tấn mỗi dòng); 05/09 1.000.000 (1 tấn)
const DNTT = [
  { 'Ngày thanh toán': '8/31/2026', 'Số hợp đồng': 'HD1', 'Họ tên Chủ rừng': 'A', 'Số CT': 'C1', 'Khối lượng': '10.5', 'Đơn giá thanh toán': '', 'Thành tiền': '300000000' },
  { 'Ngày thanh toán': '9/1/2026', 'Số hợp đồng': 'HD2', 'Họ tên Chủ rừng': 'B', 'Số CT': 'C2', 'Khối lượng': '5.34', 'Đơn giá thanh toán': '', 'Thành tiền': '8063000' },
  { 'Ngày thanh toán': '9/1/2026', 'Số hợp đồng': 'HD2', 'Họ tên Chủ rừng': 'B', 'Số CT': 'C3', 'Khối lượng': '5.34', 'Đơn giá thanh toán': '', 'Thành tiền': '8063000' },
  { 'Ngày thanh toán': '9/5/2026', 'Số hợp đồng': 'HD3', 'Họ tên Chủ rừng': 'C', 'Số CT': 'C4', 'Khối lượng': '1', 'Đơn giá thanh toán': '', 'Thành tiền': '1000000' },
];
const CSV = { PC: toCSV(genPhieuCan(20)), DN: toCSV(DNTT), HD: toCSV(genHDNCC(DNTT)), HK: toCSV(genHosokeo(5)) };
// Vay: 30/08 1 tỷ; 02/09 500tr
const D = (y, m, d) => new Date(Date.UTC(y, m - 1, d));
function thvayFile() {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Ngày hạch toán', 'Ngày chứng từ', 'Tổng tiền vay'], [D(2026, 8, 30), D(2026, 8, 30), 1000000000], [D(2026, 9, 2), D(2026, 9, 2), 500000000]]), 'TH_VAY');
  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
}

let pass = 0, fail = 0;
const check = (n, ok, x) => { ok ? pass++ : fail++; console.log((ok ? 'OK   ' : 'FAIL ') + n + (x !== undefined ? '  [' + String(x).slice(0, 200) + ']' : '')); };

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await browser.newContext({ timezoneId: 'Asia/Ho_Chi_Minh', locale: 'vi-VN', viewport: { width: 1366, height: 800 }, acceptDownloads: true });
const page = await ctx.newPage();
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
await page.route('https://docs.google.com/**', (r) => { const k = Object.keys(ID).find((x) => r.request().url().includes(ID[x])); return r.fulfill({ status: 200, contentType: 'text/csv', body: CSV[k] || '' }); });

async function open() {
  await page.goto('file://' + DIST, { waitUntil: 'load' });
  await page.waitForTimeout(2500);
  await page.click('.item[data-target="nganhang"]');
}
async function lap(from, to) {
  await page.evaluate(([f, t]) => { document.querySelector('#fFrom').value = f; document.querySelector('#fTo').value = t; document.querySelector('#btnLapBC').click(); }, [from, to]);
  await page.waitForTimeout(900);
  await page.click('.item[data-target="nganhang"]'); await page.click('.rtab[data-rtab="tienvay"]');
}
const ledger = async () => ({
  rows: await page.$$eval('#tbl-tienvay tbody tr', (trs) => trs.map((t) => [...t.children].map((c) => c.textContent.trim()))),
  foot: await page.$$eval('#tbl-tienvay tfoot td', (tds) => tds.map((c) => c.textContent.trim())),
  cards: await page.$$eval('#tienVayKpi .card', (cs) => cs.map((c) => ({ lbl: c.querySelector('.lbl').textContent, val: c.querySelector('.val').textContent, sub: c.querySelector('.sub').textContent }))),
  use: await page.textContent('#tienVayUse'),
});
const opStatus = () => page.textContent('#tvOpStatus');
async function saveOpening(ngay, tien) {
  await page.evaluate(() => { document.querySelector('#tvOpening').open = true; });
  await page.fill('#tvOpNgay', ngay); await page.fill('#tvOpTien', tien); await page.click('#btnTvOpSave');
  await page.waitForTimeout(700);
}

await open();
await page.click('.rtab[data-rtab="tienvay"]');
check('Mở app (tự lập báo cáo sau khi tải dữ liệu): đã có 4 thẻ tổng, chưa có khoản vay ⇒ vay 0', (await page.$$('#tienVayKpi .card')).length === 4 && (await page.textContent('#tienVayKpi .card.c2 .val')) === '0');
check('Ô số dư: chưa nhập, nút Xoá bị khoá', /Chưa nhập/.test(await page.textContent('#tvOpCurrent')) && await page.isDisabled('#btnTvOpClear'));
await page.click('.rtab[data-rtab="khoanvay"]');
await page.setInputFiles('#tienVayFileInput', { name: 'TH_VAY.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: thvayFile() });
await page.waitForSelector('#loanImportOverlay.active', { timeout: WAIT }); await page.click('#btnLoanImportAppend');
await page.waitForFunction(() => /Đã thêm 2/.test(document.querySelector('#loanStatus').textContent), null, { timeout: WAIT });
// Mục 1–5 kiểm số dư mang sang ⇒ dùng chế độ "Từ đầu sổ"; chế độ mặc định "Trong kỳ" kiểm ở mục 6.
await page.click('.rtab[data-rtab="tienvay"]'); await page.selectOption('#tvLuyKeMode', 'dauSo'); await page.waitForTimeout(400);

// 1) Chưa nhập số dư — kỳ 01/09–30/09 (như cũ: sổ bắt đầu 30/08)
{
  await lap('2026-09-01', '2026-09-30');
  const L = await ledger();
  const last = L.rows[L.rows.length - 1];
  check('Thẻ: đủ 4 thẻ đúng tên', L.cards.map((c) => c.lbl).join('|') === 'SỐ DƯ ĐẦU KỲ|TIỀN VAY GIẢI NGÂN|TIỀN CHI THANH TOÁN|SỐ DƯ CUỐI KỲ', L.cards.map((c) => c.lbl).join('|'));
  check('Thẻ "Số dư đầu kỳ" = dòng "Số dư đầu kỳ" của bảng (700.000.000)', L.cards[0].val === '700.000.000' && L.rows[0][0] === 'Số dư đầu kỳ' && L.rows[0][6] === '700.000.000', L.cards[0].val);
  check('Thẻ vay/chi = dòng tổng của bảng (500.000.000 / 17.126.000)', L.cards[1].val === L.foot[2] && L.cards[2].val === L.foot[5] && L.foot[2] === '500.000.000' && L.foot[5] === '17.126.000', L.foot.join('|'));
  check('Thẻ "Số dư cuối kỳ" = lũy kế dòng cuối (1.182.874.000)', L.cards[3].val === last[6] && last[6] === '1.182.874.000', L.cards[3].val);
  check('Thẻ phụ: 1 lần giải ngân; 11,68 tấn · 3 dòng chi', /^1 lần giải ngân/.test(L.cards[1].sub) && L.cards[2].sub === '11,68 tấn · 3 dòng chi', L.cards[1].sub + ' / ' + L.cards[2].sub);
  check('Thẻ đầu kỳ ghi rõ: lũy kế trước 01/09, sổ bắt đầu 30/08 (giải ngân đầu)', /Lũy kế trước 01\/09\/2026/.test(L.cards[0].sub) && /30\/08\/2026 \(giải ngân đầu\)/.test(L.cards[0].sub), L.cards[0].sub);
  check('Thanh sử dụng: đã chi 1,4% của 1.200.000.000', /Đã chi 1,4%/.test(L.use) && /17\.126\.000 \/ 1\.200\.000\.000/.test(L.use), L.use);
}
// 2) Nhập sai → báo lỗi, chưa lưu
{
  await saveOpening('31/02/2026', '');
  const st = await opStatus();
  check('Nhập sai: báo ngày không hợp lệ + thiếu số tiền, chưa lưu', /Ngày: không hợp lệ/.test(st) && /Số tiền: bắt buộc/.test(st) && /Chưa nhập/.test(await page.textContent('#tvOpCurrent')), st);
}
// 3) Nhập đúng: 01/09/2026, 2.000.000.000 → sổ bắt đầu 01/09
{
  await saveOpening('01/09/2026', '2000000000');
  check('Lưu: báo đã lưu, hiện "Đang dùng … 01/09/2026 … 2.000.000.000"', /Đã lưu/.test(await opStatus()) && /01\/09\/2026.*2\.000\.000\.000/.test(await page.textContent('#tvOpCurrent')));
  const L = await ledger();
  check('Bảng: dòng đầu "Số dư đầu kỳ" = 2.000.000.000 (vay/chi trước 01/09 không tính lại)', L.rows[0][0] === 'Số dư đầu kỳ' && L.rows[0][6] === '2.000.000.000', L.rows[0].join(' '));
  check('Bảng: lũy kế cuối = 2.000.000.000 − 17.126.000 + 500.000.000 = 2.482.874.000', L.rows[L.rows.length - 1][6] === '2.482.874.000', L.rows[L.rows.length - 1].join(' '));
  check('Thẻ = bảng (đầu kỳ 2.000.000.000, cuối kỳ 2.482.874.000), ghi "nhập tay"', L.cards[0].val === '2.000.000.000' && L.cards[3].val === '2.482.874.000' && /nhập tay ngày 01\/09\/2026/.test(L.cards[0].sub), L.cards[0].sub);
  // Không chọn kỳ: sổ bắt đầu đúng ngày nhập
  await lap('', '');
  const A = await ledger();
  check('Không chọn kỳ: sổ bắt đầu bằng dòng số dư, bỏ giải ngân 30/08 và chi 31/08', A.rows[0][0] === 'Số dư đầu kỳ' && A.rows.every((r) => r[0] !== '30/08/2026' && r[3] !== '31/08/2026') && A.rows.length === 5, A.rows.length);
  // Số dư âm → thẻ cuối kỳ báo chi vượt
  await saveOpening('01/09/2026', '-600000000');
  const N = await ledger();
  check('Số dư âm: thẻ cuối kỳ âm, ghi "Chi vượt tiền vay"', N.cards[3].val === '-117.126.000' && /Chi vượt tiền vay 117\.126\.000/.test(N.cards[3].sub), N.cards[3].val + ' ' + N.cards[3].sub);
  await saveOpening('01/09/2026', '2000000000');
  // Excel của sổ có dòng số dư
  await lap('2026-09-01', '2026-09-30');
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.click('[data-tools="tienvay"] [data-act="excel"]')]);
  const wb = XLSX.read(fs.readFileSync(await dl.path()), { type: 'buffer' });
  const aoa = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: null });
  const opRow = aoa.find((r) => r && r[0] === 'Số dư đầu kỳ');
  check('Excel: có dòng "Số dư đầu kỳ" = 2.000.000.000', opRow && opRow[opRow.length - 1] === 2000000000, JSON.stringify(opRow));
}
// 4) Còn sau khi tải lại trang
await open();
await page.click('.rtab[data-rtab="tienvay"]');
check('Tải lại trang: số dư vẫn còn (01/09/2026, 2.000.000.000)', (await page.inputValue('#tvOpNgay')) === '01/09/2026' && (await page.inputValue('#tvOpTien')) === '2.000.000.000');
// 5) Sao lưu → xoá số dư → khôi phục
{
  await page.click('.item[data-target="cauhinh"]');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btnBackupData')]);
  const file = path.join(os.tmpdir(), 'tvop-backup-' + process.pid + '.json'); await dl.saveAs(file);
  const backup = JSON.parse(fs.readFileSync(file, 'utf8'));
  check('Sao lưu: có số dư đầu kỳ', backup.khoanVay && backup.khoanVay.soDuDauSo && backup.khoanVay.soDuDauSo.ngay === '2026-09-01' && backup.khoanVay.soDuDauSo.soTien === 2000000000, JSON.stringify(backup.khoanVay && backup.khoanVay.soDuDauSo));
  await page.click('.item[data-target="nganhang"]'); await page.click('.rtab[data-rtab="tienvay"]');
  await page.evaluate(() => { document.querySelector('#tvOpening').open = true; });
  await page.click('#btnTvOpClear');
  check('Xoá: bấm lần 1 chỉ hỏi lại', /Bấm lần nữa/.test(await page.textContent('#btnTvOpClear')) && (await page.inputValue('#tvOpTien')) === '2.000.000.000');
  await page.click('#btnTvOpClear'); await page.waitForTimeout(500);
  check('Xoá: bấm lần 2 ⇒ về "Chưa nhập"', /Đã xoá/.test(await opStatus()) && /Chưa nhập/.test(await page.textContent('#tvOpCurrent')) && (await page.inputValue('#tvOpTien')) === '');
  await lap('2026-09-01', '2026-09-30');
  check('Xoá số dư: sổ trở lại như cũ (đầu kỳ 700.000.000)', (await ledger()).cards[0].val === '700.000.000');
  await page.click('.item[data-target="cauhinh"]');
  await page.setInputFiles('#btnRestoreDataInput', file);
  await page.waitForFunction(() => /Khoản vay: 2 khoản/.test(document.querySelector('#backupRestoreStatus').textContent), null, { timeout: WAIT });
  await page.click('.item[data-target="nganhang"]'); await page.click('.rtab[data-rtab="tienvay"]');
  check('Khôi phục: số dư đầu kỳ trở lại 2.000.000.000', (await page.inputValue('#tvOpTien')) === '2.000.000.000' && /2\.000\.000\.000/.test(await page.textContent('#tvOpCurrent')));
  // File sao lưu bản trước (không có soDuDauSo) ⇒ GIỮ NGUYÊN số dư đang có
  delete backup.khoanVay.soDuDauSo; fs.writeFileSync(file, JSON.stringify(backup));
  await page.click('.item[data-target="cauhinh"]');
  await page.evaluate(() => { document.querySelector('#backupRestoreStatus').textContent = ''; });
  await page.setInputFiles('#btnRestoreDataInput', file);
  await page.waitForFunction(() => /Khoản vay: 2 khoản/.test(document.querySelector('#backupRestoreStatus').textContent), null, { timeout: WAIT });
  await page.click('.item[data-target="nganhang"]'); await page.click('.rtab[data-rtab="tienvay"]');
  check('Khôi phục file sao lưu bản trước: giữ nguyên số dư đang có', (await page.inputValue('#tvOpTien')) === '2.000.000.000');
  fs.unlinkSync(file);
}
// 6) Chế độ mặc định "Trong khoảng thời gian báo cáo" (đang có số dư nhập 01/09/2026 = 2.000.000.000)
{
  await page.click('.rtab[data-rtab="tienvay"]');
  check('Tải lại trang: vẫn nhớ lựa chọn "Từ đầu sổ"', (await page.inputValue('#tvLuyKeMode')) === 'dauSo');
  await page.selectOption('#tvLuyKeMode', 'ky'); await page.waitForTimeout(400);
  await lap('2026-09-01', '2026-09-30');
  let L = await ledger();
  check('Trong kỳ 01/09–30/09: số dư nhập ngày 01/09 nằm trong kỳ ⇒ dùng, cuối kỳ 2.482.874.000', L.rows[0][0] === 'Số dư đầu kỳ' && L.cards[3].val === '2.482.874.000', L.cards.map((c) => c.val).join('|'));
  await lap('2026-09-02', '2026-09-30');
  L = await ledger();
  check('Trong kỳ 02/09–30/09: số dư nhập ngày 01/09 ngoài kỳ ⇒ không dùng; sổ bắt đầu giải ngân 02/09; cuối kỳ 499.000.000', !L.rows.some((r) => r[0] === 'Số dư đầu kỳ') && L.rows[0][0] === '02/09/2026' && L.rows[0][6] === '500.000.000' && L.cards[3].val === '499.000.000', L.rows.map((r) => r[0] + ':' + r[6]).join(' / '));
  check('Thẻ đầu kỳ = 0, ghi "Lũy kế trong kỳ" và "ngoài kỳ — không dùng"', L.cards[0].val === '0' && /Lũy kế trong kỳ/.test(L.cards[0].sub) && /01\/09\/2026 ngoài kỳ — không dùng/.test(L.cards[0].sub), L.cards[0].sub);
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.click('[data-tools="tienvay"] [data-act="excel"]')]);
  const aoa = XLSX.utils.sheet_to_json(XLSX.read(fs.readFileSync(await dl.path()), { type: 'buffer' }).Sheets[XLSX.read(fs.readFileSync(await dl.path()), { type: 'buffer' }).SheetNames[0]], { header: 1, raw: true, defval: null });
  check('Excel theo chế độ trong kỳ: không có dòng "Số dư đầu kỳ", lũy kế dòng cuối 499.000.000', !aoa.some((r) => r && r[0] === 'Số dư đầu kỳ') && aoa.some((r) => r && r[r.length - 1] === 499000000));
}
check('Không có lỗi JavaScript', errors.length === 0, errors.join(' | '));

await browser.close();
console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);
