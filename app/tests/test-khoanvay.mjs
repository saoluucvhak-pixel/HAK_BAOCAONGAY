// [2026-10-29] Tab "Cập nhật khoản vay" (bảng TH_VAY 3 cột: Ngày hạch toán, Ngày chứng từ, Tổng tiền vay)
// + Sổ chi tiết tiền vay — kiểm thử như người dùng trên đúng bản build (Chromium, giờ Việt Nam, vi-VN):
//  - Nhập nguyên sổ phụ nhiều sheet (giống ChungTuNganHang.xlsx): tự tìm sheet "VAY", chỉ lấy dòng tiền
//    vay (Diễn giải đúng câu cấu hình), ô ngày không lùi 1 ngày (BUG-TV02). Nhập file 3 cột (sheet TH_VAY).
//  - Nhập lại không nhân đôi (kể cả khác dạng file). Thêm / sửa / xoá (bấm 2 lần) / xoá nhiều; còn sau tải lại.
//  - Sổ chi tiết = tiền vay (tab này) + tiền chi (DNTT_CT từ Google Sheet).
//  - Sao lưu/khôi phục (kể cả file sao lưu bản sổ phụ cũ); dữ liệu sổ phụ cũ trên máy tự chuyển sang 3 cột,
//    không mất; file mẫu tải về nhập lại được.
// Chạy: npm run test:khoanvay   (tuỳ chọn: node tests/test-khoanvay.mjs <đường dẫn index.html>)
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
const VAY_TEXT = 'Chuyển tiền nội bộ vay USD sang vay keo VNĐ HAK';

// DNTT_CT cố định (tiền chi): 31/08 chi 300tr; 01/09 chi 2 dòng 8.063.000; 03/09 chi 0.
const DNTT = [
  { 'Ngày thanh toán': '8/31/2026', 'Số hợp đồng': 'HD1', 'Họ tên Chủ rừng': 'TRẦN VĂN A', 'Số CT': 'C1', 'Khối lượng': '10.5', 'Đơn giá thanh toán': '', 'Thành tiền': '300000000' },
  { 'Ngày thanh toán': '9/1/2026', 'Số hợp đồng': 'HD2', 'Họ tên Chủ rừng': 'NGUYỄN TẤN HÙNG', 'Số CT': 'C2', 'Khối lượng': '5.34', 'Đơn giá thanh toán': '', 'Thành tiền': '8063000' },
  { 'Ngày thanh toán': '9/1/2026', 'Số hợp đồng': 'HD2', 'Họ tên Chủ rừng': 'NGUYỄN TẤN HÙNG', 'Số CT': 'C3', 'Khối lượng': '5.34', 'Đơn giá thanh toán': '', 'Thành tiền': '8063000' },
];
const pc = genPhieuCan(30);
const CSV = { PC: toCSV(pc), DN: toCSV(DNTT), HD: toCSV(genHDNCC(DNTT)), HK: toCSV(genHosokeo(5)) };

let pass = 0, fail = 0;
const check = (n, ok, x) => { ok ? pass++ : fail++; console.log((ok ? 'OK   ' : 'FAIL ') + n + (x !== undefined ? '  [' + String(x).slice(0, 170) + ']' : '')); };

// File giống ChungTuNganHang.xlsx: sheet đầu là bảng khác, sổ phụ ở sheet "VAY"; ô ngày là NGÀY THẬT.
const D = (y, m, d) => new Date(Date.UTC(y, m - 1, d));
const VH = ['Tài khoản ngân hàng', 'Ngày hạch toán', 'Ngày chứng từ', 'Số chứng từ', 'Diễn giải', 'TK đối ứng', 'Thu', 'Chi', 'Tồn', 'Tên đối tượng', 'Mã mục thu/chi', 'Tên mục thu/chi'];
const TK = '8619299999 - Ngân hàng TMCP Đầu tư và Phát triển Việt Nam';
const VAY = [
  [TK, D(2026, 8, 30), D(2026, 8, 30), 'CTNB1', VAY_TEXT, '1122', 1000000000, 0, 1000000000, null, null, null],
  [TK, D(2026, 8, 30), D(2026, 8, 30), 'NK1', 'Thanh toán tiền mua gỗ keo HĐ 1', '33111', 0, 5000000, 995000000, 'LÊ VĂN B', null, null],
  [TK, D(2026, 9, 2), D(2026, 9, 2), 'CTNB2', 'Chuyển tiền nội bộ gửi VNĐ sang vay keo VNĐ HAK', '1122', 500000000, 0, 1495000000, null, null, null],
  [TK, D(2026, 9, 3), D(2026, 9, 3), 'LAI', 'Lãi tiền gửi tháng 09.2026', '515', 69877, 0, 1495069877, null, null, null],
];
function thvayFile(rows) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Ngày hạch toán', 'Ngày chứng từ', 'Tổng tiền vay'], ...rows, [], ['Tổng cộng', null, 0]]), 'TH_VAY');
  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
}
function bankFile() {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['BẢNG KÊ CHI TIẾT TIỀN VAY'], ['Ngày chung', 'Tổng tiền vay']]), 'BKCT_TIENVAY');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([VH, ...VAY], { cellDates: false, dateNF: 'dd/mm/yyyy' }), 'VAY');
  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
}
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
async function newPage() {
  const ctx = await browser.newContext({ timezoneId: 'Asia/Ho_Chi_Minh', locale: 'vi-VN', viewport: { width: 1366, height: 768 }, acceptDownloads: true });
  const pg = await ctx.newPage();
  await pg.route('https://docs.google.com/**', (r) => { const k = Object.keys(ID).find((x) => r.request().url().includes(ID[x])); return r.fulfill({ status: 200, contentType: 'text/csv', body: CSV[k] || '' }); });
  return pg;
}
let page = await newPage();
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
async function open() {
  await page.goto('file://' + DIST, { waitUntil: 'load' });
  await page.waitForTimeout(2500);
  await page.click('.item[data-target="nganhang"]');
  await page.click('.rtab[data-rtab="khoanvay"]');
  await page.waitForFunction(() => /Đã lưu:/.test(document.querySelector('#loanSummary').textContent), null, { timeout: WAIT });
}
const status = () => page.textContent('#loanStatus');
const savedCount = async () => +((await page.textContent('#loanSummary')).match(/Đã lưu: ([\d.]+) khoản vay/)[1].replace(/\./g, ''));
const cells = () => page.$$eval('#tbl-khoanvay tbody tr', (trs) => trs.map((t) => [...t.children].map((c) => c.textContent.trim())));
// cột bảng: 0 chk, 1 thao tác, 2 STT, 3 Ngày hạch toán, 4 Ngày chứng từ, 5 Tổng tiền vay, 6 Nguồn
async function importFile(buffer, name, mode) {
  await page.setInputFiles('#tienVayFileInput', { name, mimeType: XLSX_MIME, buffer });
  await page.waitForSelector('#loanImportOverlay.active', { timeout: WAIT });
  const summary = await page.textContent('#loanImportSummary');
  if (mode === 'replace') { await page.click('#btnLoanImportReplace'); await page.click('#btnLoanImportReplace'); }
  else await page.click('#btnLoanImportAppend');
  await page.waitForFunction(() => /Đã (thêm|thay)/.test(document.querySelector('#loanStatus').textContent), null, { timeout: WAIT });
  return { summary, status: await status() };
}
async function soChiTiet(from, to) {
  await page.evaluate(([f, t]) => { document.querySelector('#fFrom').value = f; document.querySelector('#fTo').value = t; document.querySelector('#btnLapBC').click(); }, [from, to]);
  await page.waitForTimeout(900);
  await page.click('.item[data-target="nganhang"]'); await page.click('.rtab[data-rtab="tienvay"]');
  const rows = await page.$$eval('#tbl-tienvay tbody tr', (trs) => trs.map((t) => [...t.children].map((c) => c.textContent.trim())));
  const foot = await page.$$eval('#tbl-tienvay tfoot td', (tds) => tds.map((c) => c.textContent.trim()));
  await page.click('.rtab[data-rtab="khoanvay"]');
  return { rows, foot };
}

await open();
check('Mở tab: chưa có dữ liệu, không lỗi', (await savedCount()) === 0 && errors.length === 0, errors.join(' | '));
{
  const head = await page.$$eval('#tbl-khoanvay thead th', (ths) => ths.map((t) => t.textContent.trim()));
  check('Bảng chỉ 3 cột dữ liệu: Ngày hạch toán, Ngày chứng từ, Tổng tiền vay', head.slice(3, 6).join('|') === 'Ngày hạch toán|Ngày chứng từ|Tổng tiền vay' && head.length === 7, head.join('|'));
}

// 1) Nhập nguyên sổ phụ nhiều sheet → tự đọc sheet VAY, chỉ lấy dòng tiền vay
{
  const r = await importFile(bankFile(), 'ChungTuNganHang.xlsx', 'append');
  check('Tự tìm sheet "VAY" (không đọc nhầm sheet đầu)', /sheet VAY/.test(r.summary), r.summary);
  check('Sổ phụ 4 dòng → lấy 2 dòng tiền vay, tổng 1.500.000.000 (bỏ "Thanh toán…", "Lãi tiền gửi")', /đọc 4 dòng, lấy 2 dòng tiền vay giải ngân/.test(r.summary) && /Tổng tiền vay 1\.500\.000\.000/.test(r.summary), r.summary);
  check('Lưu 2 khoản vay', /Đã thêm 2 dòng/.test(r.status) && (await savedCount()) === 2, r.status);
  const rows = await cells();
  check('BUG-TV02: ngày 30/08/2026 trong Excel hiện đúng 30/08/2026', rows[0][3] === '30/08/2026' && rows[0][4] === '30/08/2026', rows[0].slice(3, 5).join(' '));
  check('Định dạng chuẩn HAK: "1.000.000.000" (không "đ")', rows[0][5] === '1.000.000.000');
  check('Ngày căn giữa, tiền căn phải', (await page.$eval('#tbl-khoanvay tbody tr td:nth-child(4)', (td) => getComputedStyle(td).textAlign)) === 'center' && (await page.$eval('#tbl-khoanvay tbody tr td:nth-child(6)', (td) => getComputedStyle(td).textAlign)) === 'right');
}
// 2) Nhập lại đúng file → không nhân đôi
{
  const r = await importFile(bankFile(), 'ChungTuNganHang.xlsx', 'append');
  check('Nhập lại cùng file: thêm 0, bỏ qua 2 dòng đã có', /Đã thêm 0 dòng, bỏ qua 2 dòng đã có sẵn/.test(r.status) && (await savedCount()) === 2, r.status);
}
// 3) Bảng kê chi tiết tiền vay (7 cột) — vay (tab này) + chi (DNTT_CT), kỳ 01/09–30/09
// cột: 0 Ngày hạch toán, 1 Ngày chứng từ, 2 Tổng tiền vay, 3 Ngày thanh toán, 4 Số tấn, 5 Tổng tiền chi, 6 Lũy kế
{
  // MẶC ĐỊNH (người dùng 29/10): lũy kế tính trong khoảng thời gian báo cáo — bắt đầu từ giải ngân đầu trong kỳ
  const ky = await soChiTiet('2026-09-01', '2026-09-30');
  check('Mặc định lũy kế trong kỳ: sổ bắt đầu giải ngân 02/09, lũy kế = 500.000.000, không mang số dư trước kỳ', ky.rows.length === 1 && ky.rows[0][0] === '02/09/2026' && ky.rows[0][6] === '500.000.000', ky.rows.map((r) => r.join(' ')).join(' / '));
  await page.click('.rtab[data-rtab="tienvay"]');
  check('Ô chọn lũy kế mặc định "Trong khoảng thời gian báo cáo"', (await page.inputValue('#tvLuyKeMode')) === 'ky');
  await page.selectOption('#tvLuyKeMode', 'dauSo'); await page.waitForTimeout(500);
  await page.click('.rtab[data-rtab="khoanvay"]');
}
{
  // Chế độ "Từ đầu sổ" (cách trước): dòng trước kỳ cộng vào "Số dư đầu kỳ"
  const { rows, foot } = await soChiTiet('2026-09-01', '2026-09-30');
  check('Bảng kê: dòng đầu "Số dư đầu kỳ" 700.000.000', rows[0][0] === 'Số dư đầu kỳ' && rows[0][6] === '700.000.000', rows[0].join(' '));
  check('Bảng kê: dòng chi lấy từ DNTT_CT (Ngày TT 01/09, 5,34 tấn, 8.063.000)', rows[1][3] === '01/09/2026' && rows[1][4] === '5,34' && rows[1][5] === '8.063.000' && rows[1][0] === '', rows[1].join(' '));
  check('Bảng kê: dòng vay 02/09 = 500.000.000 (Ngày hạch toán, Ngày chứng từ)', rows[3][2] === '500.000.000' && rows[3][0] === '02/09/2026' && rows[3][1] === '02/09/2026', rows[3].join(' '));
  check('Bảng kê: lũy kế cuối = 700tr − 16.126.000 + 500tr = 1.183.874.000', rows[rows.length - 1][6] === '1.183.874.000', rows[rows.length - 1].join(' '));
  check('Bảng kê: tổng vay 500.000.000, tổng chi 16.126.000 (chỉ trong kỳ)', foot[2] === '500.000.000' && foot[5] === '16.126.000', foot.join(' | '));
  check('Bảng kê: dòng "Lãi tiền gửi" KHÔNG vào sổ', rows.length === 4, rows.length);
  const head = await page.$$eval('#tbl-tienvay thead th', (ths) => ths.map((t) => t.textContent.trim().toLowerCase()));
  check('Bảng kê đúng 7 cột của mẫu', head.join('|') === 'ngày hạch toán|ngày chứng từ|tổng tiền vay|ngày thanh toán|số tấn|tổng tiền chi|lũy kế tiền vay chi', head.join('|'));
  const all = await soChiTiet('', '');
  check('Cả sổ: dòng đầu là lần giải ngân đầu 30/08, lũy kế = 1.000.000.000', all.rows[0][0] === '30/08/2026' && all.rows[0][6] === '1.000.000.000', all.rows[0].join(' '));
}
// 4) Nhập file 3 cột (sheet TH_VAY): khoản đã có (từ sổ phụ) không nhân đôi; dòng trống/"Tổng cộng" bỏ qua
{
  const r = await importFile(thvayFile([[D(2026, 8, 30), D(2026, 8, 30), 1000000000], [D(2026, 9, 2), D(2026, 9, 2), 500000000], [D(2026, 9, 10), null, 300000000]]), 'TH_VAY.xlsx', 'append');
  check('File 3 cột: đọc sheet TH_VAY, 3 khoản hợp lệ, tổng 1.800.000.000', /sheet TH_VAY/.test(r.summary) && /hợp lệ 3 khoản vay/.test(r.summary) && /Tổng tiền vay 1\.800\.000\.000/.test(r.summary), r.summary);
  check('File 3 cột: thêm 1, bỏ qua 2 khoản đã có (nhập từ sổ phụ trước đó)', /Đã thêm 1 dòng, bỏ qua 2 dòng đã có sẵn/.test(r.status) && (await savedCount()) === 3, r.status);
  const { foot } = await soChiTiet('2026-09-01', '2026-09-30');
  check('Bảng kê tự có thêm 300.000.000 (tổng vay 800.000.000)', foot[2] === '800.000.000', foot.join(' | '));
}
// 5) Thêm tay
{
  await page.click('#btnLoanAdd');
  const labels = await page.$$eval('#loanFormGrid label', (ls) => ls.map((l) => l.textContent.trim()));
  check('Ô nhập tay đúng 3 cột', labels.length === 3 && /^Ngày hạch toán/.test(labels[0]) && /^Ngày chứng từ/.test(labels[1]) && /^Tổng tiền vay/.test(labels[2]), labels.join('|'));
  await page.fill('#loan_ngayHachToan', '31/02/2026');
  await page.click('#btnLoanSave');
  const err = await page.textContent('#loanFormErrors');
  check('Thêm tay: ngày 31/02 + thiếu tiền đều bị báo, chưa lưu', /Ngày hạch toán: ngày không hợp lệ/.test(err) && /Tổng tiền vay: bắt buộc nhập/.test(err) && (await savedCount()) === 3, err);
  await page.fill('#loan_ngayHachToan', '15/09/2026'); await page.fill('#loan_tongTienVay', '200000000');
  await page.click('#btnLoanSave');
  await page.waitForFunction(() => /Đã thêm 1 khoản vay/.test(document.querySelector('#loanStatus').textContent), null, { timeout: WAIT });
  check('Thêm tay: lưu thành công (Ngày chứng từ để trống), 4 khoản', (await savedCount()) === 4);
  const { foot } = await soChiTiet('2026-09-01', '2026-09-30');
  check('Bảng kê tự có thêm 200.000.000 (tổng vay 1.000.000.000)', foot[2] === '1.000.000.000', foot.join(' | '));
}
// 6) Sửa số tiền
{
  await page.fill('#loanSearch', '15/09/2026');
  check('Tìm theo ngày dd/MM/yyyy ra đúng 1 khoản', (await cells()).length === 1);
  await page.click('#tbl-khoanvay tbody tr button[data-act="edit"]');
  check('Mở sửa: điền sẵn ngày dd/MM/yyyy và số tiền', (await page.inputValue('#loan_ngayHachToan')) === '15/09/2026' && (await page.inputValue('#loan_tongTienVay')) === '200.000.000');
  await page.fill('#loan_tongTienVay', '250000000'); await page.click('#btnLoanSave');
  await page.waitForFunction(() => /Đã lưu thay đổi/.test(document.querySelector('#loanStatus').textContent), null, { timeout: WAIT });
  check('Sửa: số tiền mới 250.000.000, vẫn 4 khoản', (await cells())[0][5] === '250.000.000' && (await savedCount()) === 4);
  await page.click('#btnLoanClearFilter');
}
// 7) Còn sau khi tải lại trang
await open();
check('Tải lại trang: vẫn 4 khoản (lưu trên máy)', (await savedCount()) === 4);
// 8) Xoá 1 dòng: bấm 2 lần
{
  await page.fill('#loanSearch', '15/09/2026');
  await page.click('#tbl-khoanvay tbody tr button[data-act="del"]');
  check('Xoá: bấm lần 1 chỉ hỏi lại', (await savedCount()) === 4);
  await page.click('#tbl-khoanvay tbody tr button[data-act="del"]');
  await page.waitForFunction(() => /Đã xoá 1 dòng/.test(document.querySelector('#loanStatus').textContent), null, { timeout: WAIT });
  check('Xoá: bấm lần 2 mới xoá → 3 khoản', (await savedCount()) === 3);
  await page.click('#btnLoanClearFilter');
}
// 9) Sao lưu → xoá hết → khôi phục; khôi phục được cả file sao lưu bản sổ phụ cũ
async function backupNow() {
  await page.click('.item[data-target="cauhinh"]');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btnBackupData')]);
  const file = path.join(os.tmpdir(), 'kv-backup-' + process.pid + '-' + Date.now() + '.json'); await dl.saveAs(file);
  return file;
}
async function restore(file, n) {
  await page.click('.item[data-target="cauhinh"]');
  await page.setInputFiles('#btnRestoreDataInput', file);
  await page.waitForFunction((x) => new RegExp('Khoản vay: ' + x + ' khoản').test(document.querySelector('#backupRestoreStatus').textContent), String(n), { timeout: WAIT });
  await page.click('.item[data-target="nganhang"]'); await page.click('.rtab[data-rtab="khoanvay"]');
}
{
  const file = await backupNow();
  const backup = JSON.parse(fs.readFileSync(file, 'utf8'));
  check('Sao lưu: có phần khoanVay (3 cột, schema 3) đủ 3 khoản', backup.khoanVay && backup.khoanVay.schema === 3 && backup.khoanVay.rows.length === 3 && backup.khoanVay.rows.every((r) => 'tongTienVay' in r));
  await page.click('.item[data-target="nganhang"]'); await page.click('.rtab[data-rtab="khoanvay"]');
  await page.check('#loanChkPage');
  await page.click('#btnLoanDeleteSel'); await page.click('#btnLoanDeleteSel');
  await page.waitForFunction(() => /Đã xoá 3 dòng/.test(document.querySelector('#loanStatus').textContent), null, { timeout: WAIT });
  check('Xoá nhiều dòng → 0', (await savedCount()) === 0);
  await restore(file, 3);
  check('Khôi phục → lại đủ 3 khoản', (await savedCount()) === 3);
  // File sao lưu của bản trước (sổ phụ 12 cột, schema 2): chỉ dòng tiền vay thành khoản vay
  backup.khoanVay = { schema: 2, rows: VAY.map((v, i) => ({ id: 'old' + i, schema: 2, rev: 1, seq: i, nguon: 'Excel: cu.xlsx', ngayHachToan: v[1].toISOString().slice(0, 10), ngayChungTu: v[2].toISOString().slice(0, 10), dienGiai: v[4], thu: v[6], chi: v[7] })) };
  fs.writeFileSync(file, JSON.stringify(backup));
  await restore(file, 2);
  const rows = await cells();
  check('Khôi phục file sao lưu bản sổ phụ cũ: 2 khoản vay 1.000.000.000 + 500.000.000', (await savedCount()) === 2 && rows[0][5] === '1.000.000.000' && rows[1][5] === '500.000.000', rows.map((x) => x[5]).join(','));
  const again = JSON.parse(fs.readFileSync(await backupNow(), 'utf8'));
  check('…và sổ phụ cũ vẫn được giữ trong sao lưu (soPhuCu đủ 4 dòng)', again.khoanVay.soPhuCu && again.khoanVay.soPhuCu.rows.length === 4);
  await page.click('.item[data-target="nganhang"]'); await page.click('.rtab[data-rtab="khoanvay"]');
  fs.unlinkSync(file);
}
// 10) File mẫu tải về nhập lại được
{
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btnTienVayTemplate')]);
  check('File mẫu tên Mau_TienVay_TH_VAY.xlsx', dl.suggestedFilename() === 'Mau_TienVay_TH_VAY.xlsx', dl.suggestedFilename());
  const r = await importFile(fs.readFileSync(await dl.path()), 'Mau_TienVay_TH_VAY.xlsx', 'replace');
  check('File mẫu: sheet TH_VAY, 2 khoản hợp lệ, tổng 1.700.000.000', /sheet TH_VAY/.test(r.summary) && /hợp lệ 2 khoản vay/.test(r.summary) && /Tổng tiền vay 1\.700\.000\.000/.test(r.summary), r.summary);
  check('Thay toàn bộ: còn đúng 2 khoản', /Đã thay toàn bộ: 2 dòng/.test(r.status) && (await savedCount()) === 2);
  check('File mẫu: ngày 01/09/2026 đúng', (await cells())[0][3] === '01/09/2026');
}
check('Không có lỗi JavaScript trong suốt quá trình', errors.length === 0, errors.join(' | '));

// 11) Máy đang có dữ liệu bản trước (kho sổ phụ v2): mở bản mới tự chuyển dòng tiền vay sang 3 cột, không mất gì
{
  page = await newPage();
  const errs2 = []; page.on('pageerror', (e) => errs2.push(e.message));
  const old = VAY.map((v, i) => ({ id: 'v2-' + i, schema: 2, rev: 1, seq: i, nguon: 'Excel: cu.xlsx', createdAt: '2026-10-29T01:00:00.000Z', updatedAt: '2026-10-29T01:00:00.000Z',
    taiKhoan: v[0], ngayHachToan: v[1].toISOString().slice(0, 10), ngayChungTu: v[2].toISOString().slice(0, 10), soChungTu: v[3], dienGiai: v[4], tkDoiUng: v[5], thu: v[6], chi: v[7], ton: v[8], tenDoiTuong: v[9] || '', maMuc: '', tenMuc: '' }));
  await page.addInitScript((rows) => {
    if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1');
    const req = indexedDB.open('baocaongay-khoanvay', 2);
    req.onupgradeneeded = () => { req.result.createObjectStore('loans', { keyPath: 'id' }); req.result.createObjectStore('vay', { keyPath: 'id' }); };
    req.onsuccess = () => { const db = req.result, t = db.transaction('vay', 'readwrite'); rows.forEach((r) => t.objectStore('vay').put(r)); t.oncomplete = () => db.close(); };
  }, old);
  await open();
  const rows = await cells();
  check('Dữ liệu bản trước: 2 dòng tiền vay tự chuyển sang 3 cột (tổng 1.500.000.000)', (await savedCount()) === 2 && /1\.500\.000\.000/.test(await page.textContent('#loanSummary')), await page.textContent('#loanSummary'));
  check('…giữ nguồn gốc ("Sổ phụ: Excel: cu.xlsx") và đúng ngày', rows[0][6] === 'Sổ phụ: Excel: cu.xlsx' && rows[0][3] === '30/08/2026', rows[0].join(' '));
  const b = JSON.parse(fs.readFileSync(await backupNow(), 'utf8'));
  check('…sổ phụ cũ 4 dòng vẫn còn nguyên (có trong file sao lưu)', b.khoanVay.soPhuCu && b.khoanVay.soPhuCu.rows.length === 4 && b.khoanVay.soPhuCu.rows.some((r) => r.dienGiai === 'Lãi tiền gửi tháng 09.2026'));
  check('…không lỗi JavaScript', errs2.length === 0, errs2.join(' | '));
}

await browser.close();
console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);
