// [2026-10-29] Thẻ số liệu tổng tab "Cập nhật khoản vay" + "Tổng hợp thanh toán", dòng "Tự động lưu", nút
// "Lưu ra Excel" — kiểm thử như người dùng trên đúng bản build (Chromium, giờ Việt Nam):
//  - Thẻ khoản vay = dữ liệu đã lưu (tổng, gần nhất, lớn nhất, khoảng ngày); đang lọc ⇒ thẻ theo phần lọc.
//  - Hiện "Tự động lưu trên máy" + lần lưu gần nhất; còn nguyên sau tải lại trang.
//  - "Lưu ra Excel" → file 3 cột nhập lại được, ra đúng số khoản + tổng; chưa có khoản ⇒ báo.
//  - Thẻ Tổng hợp thanh toán = dòng tổng của bảng; số chủ rừng / số ngày đếm đúng.
// Chạy: npm run test:bank-kpi   (tuỳ chọn: node tests/test-bank-kpi.mjs <đường dẫn index.html>)
import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import XLSX from 'xlsx';
import { genPhieuCan, genHDNCC, genHosokeo, toCSV } from './fixtures.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(__dirname, '../dist/index.html');
const ID = { PC: 'tytjQLj', DN: 'zPk2i', HD: 'wW_a10', HK: 'esmF7s' };
const WAIT = 10000;
const DNTT = [
  { 'Ngày thanh toán': '9/1/2026', 'Số hợp đồng': 'HD1', 'Họ tên Chủ rừng': 'TRẦN VĂN A', 'Số CT': 'C1', 'Khối lượng': '10', 'Đơn giá thanh toán': '', 'Thành tiền': '17000000' },
  { 'Ngày thanh toán': '9/1/2026', 'Số hợp đồng': 'HD2', 'Họ tên Chủ rừng': 'Trần Văn A', 'Số CT': 'C2', 'Khối lượng': '5', 'Đơn giá thanh toán': '', 'Thành tiền': '8500000' },
  { 'Ngày thanh toán': '9/3/2026', 'Số hợp đồng': 'HD3', 'Họ tên Chủ rừng': 'LÊ THỊ B', 'Số CT': 'C3', 'Khối lượng': '5', 'Đơn giá thanh toán': '', 'Thành tiền': '9000000' },
  { 'Ngày thanh toán': '10/2/2026', 'Số hợp đồng': 'HD4', 'Họ tên Chủ rừng': 'NGOÀI KỲ', 'Số CT': 'C4', 'Khối lượng': '1', 'Đơn giá thanh toán': '', 'Thành tiền': '1000' },
];
const CSV = { PC: toCSV(genPhieuCan(20)), DN: toCSV(DNTT), HD: toCSV(genHDNCC(DNTT)), HK: toCSV(genHosokeo(5)) };
const D = (y, m, d) => new Date(Date.UTC(y, m - 1, d));
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
function thvayFile() {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Ngày hạch toán', 'Ngày chứng từ', 'Tổng tiền vay'],
    [D(2026, 9, 2), D(2026, 9, 2), 500000000], [D(2026, 8, 30), D(2026, 8, 30), 1000000000], [D(2026, 9, 10), 'PC0910', 250000000]]), 'TH_VAY');
  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
}

let pass = 0, fail = 0;
const check = (n, ok, x) => { ok ? pass++ : fail++; console.log((ok ? 'OK   ' : 'FAIL ') + n + (x !== undefined ? '  [' + String(x).slice(0, 220) + ']' : '')); };

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await browser.newContext({ timezoneId: 'Asia/Ho_Chi_Minh', locale: 'vi-VN', viewport: { width: 1366, height: 800 }, acceptDownloads: true });
const page = await ctx.newPage();
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
const alerts = []; page.on('dialog', (d) => { alerts.push(d.message()); d.accept(); });
await page.route('https://docs.google.com/**', (r) => { const k = Object.keys(ID).find((x) => r.request().url().includes(ID[x])); return r.fulfill({ status: 200, contentType: 'text/csv', body: CSV[k] || '' }); });
async function open() {
  await page.goto('file://' + DIST, { waitUntil: 'load' });
  await page.waitForTimeout(2500);
  await page.click('.item[data-target="nganhang"]'); await page.click('.rtab[data-rtab="khoanvay"]');
  await page.waitForFunction(() => /Đã lưu:/.test(document.querySelector('#loanSummary').textContent), null, { timeout: WAIT });
}
const cards = (sel) => page.$$eval(sel + ' .card', (cs) => cs.map((c) => ({ lbl: c.querySelector('.lbl').textContent, val: c.querySelector('.val').textContent, sub: c.querySelector('.sub').textContent })));
async function importFile(buffer, name, mode) {
  await page.setInputFiles('#tienVayFileInput', { name, mimeType: XLSX_MIME, buffer });
  await page.waitForSelector('#loanImportOverlay.active', { timeout: WAIT });
  if (mode === 'replace') { await page.click('#btnLoanImportReplace'); await page.click('#btnLoanImportReplace'); } else await page.click('#btnLoanImportAppend');
  await page.waitForFunction(() => /Đã (thêm|thay)/.test(document.querySelector('#loanStatus').textContent), null, { timeout: WAIT });
}

await open();
// 1) Chưa có khoản vay
{
  const c = await cards('#loanKpi');
  check('Khoản vay — chưa có dữ liệu: 4 thẻ, tổng 0, không lỗi', c.length === 4 && c[0].val === '0' && c[1].val === '—' && errors.length === 0, JSON.stringify(c.map((x) => x.val)));
  check('Hiện "Tự động lưu trên máy"', /Tự động lưu trên máy/.test(await page.textContent('#loanSummary')));
  await page.click('#btnLoanExport'); await page.waitForTimeout(700);
  check('Lưu ra Excel khi chưa có khoản ⇒ báo, không tạo file', alerts.some((m) => /Chưa có khoản vay nào/.test(m)), alerts.join(' | '));
}
// 2) Nhập 3 khoản → thẻ
{
  await importFile(thvayFile(), 'TH_VAY.xlsx', 'append');
  const c = await cards('#loanKpi');
  check('Thẻ tổng tiền vay 1.750.000.000 · 3 khoản', c[0].lbl === 'TỔNG TIỀN VAY' && c[0].val === '1.750.000.000' && /^3 khoản vay$/.test(c[0].sub), JSON.stringify(c[0]));
  check('Thẻ giải ngân gần nhất = 250.000.000 ngày 10/09/2026', c[1].val === '250.000.000' && c[1].sub === 'Ngày 10/09/2026', JSON.stringify(c[1]));
  check('Thẻ khoản lớn nhất = 1.000.000.000 ngày 30/08/2026, bình quân 583.333.333', c[2].val === '1.000.000.000' && /30\/08\/2026/.test(c[2].sub) && /bình quân 583\.333\.333/.test(c[2].sub), JSON.stringify(c[2]));
  check('Thẻ thời gian 30/08/2026 – 10/09/2026 · 3 ngày', c[3].val === '30/08/2026 – 10/09/2026' && /^3 ngày/.test(c[3].sub), JSON.stringify(c[3]));
  check('Dòng trạng thái: lần lưu gần nhất có giờ + ngày', /Lần lưu gần nhất: \d{1,2}:\d{2}:\d{2} \d{1,2}\/\d{1,2}\/2026/.test(await page.textContent('#loanSummary')), await page.textContent('#loanSummary'));
  // Lọc theo ngày ⇒ thẻ theo phần lọc
  await page.fill('#loanFrom', '01/09/2026');
  const f = await cards('#loanKpi');
  check('Đang lọc từ 01/09: thẻ "(ĐANG LỌC)" 750.000.000 · 2 khoản · tổng đã lưu 1.750.000.000', /ĐANG LỌC/.test(f[0].lbl) && f[0].val === '750.000.000' && /2 khoản vay · tổng đã lưu 1\.750\.000\.000/.test(f[0].sub), JSON.stringify(f[0]));
  // Lưu ra Excel phần đang lọc
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btnLoanExport')]);
  const buf = fs.readFileSync(await dl.path());
  const aoa = XLSX.utils.sheet_to_json(XLSX.read(buf, { type: 'buffer' }).Sheets.TH_VAY, { header: 1, raw: true, defval: null });
  check('Lưu ra Excel: tên KhoanVay_TH_VAY_yyyymmdd.xlsx, 3 cột, 2 khoản đang lọc + dòng Tổng cộng 750.000.000', /^KhoanVay_TH_VAY_\d{8}\.xlsx$/.test(dl.suggestedFilename()) && aoa[0].join('|') === 'Ngày hạch toán|Ngày chứng từ|Tổng tiền vay' && aoa.length === 4 && aoa[3][0] === 'Tổng cộng' && aoa[3][2] === 750000000, JSON.stringify(aoa));
  check('Lưu ra Excel: Ngày chứng từ dạng chữ giữ nguyên ("PC0910")', aoa.some((r) => r[1] === 'PC0910'));
  await page.click('#btnLoanClearFilter');
  // Nhập lại đúng file vừa lưu, thay toàn bộ ⇒ đúng 2 khoản, tổng 750.000.000 (vòng tròn lưu → nhập)
  await page.waitForTimeout(400);
  await importFile(buf, dl.suggestedFilename(), 'replace');
  const r = await cards('#loanKpi');
  check('Nhập lại file vừa lưu: 2 khoản, 750.000.000 (dòng Tổng cộng bỏ qua)', r[0].val === '750.000.000' && /^2 khoản vay$/.test(r[0].sub), JSON.stringify(r[0]));
  await importFile(thvayFile(), 'TH_VAY.xlsx', 'replace');
}
// 3) Tải lại trang: thẻ vẫn đúng (dữ liệu đã tự lưu)
await open();
check('Tải lại trang: thẻ vẫn 1.750.000.000', (await cards('#loanKpi'))[0].val === '1.750.000.000');
// 4) Tổng hợp thanh toán
{
  await page.evaluate(() => { document.querySelector('#fFrom').value = '2026-09-01'; document.querySelector('#fTo').value = '2026-09-30'; document.querySelector('#btnLapBC').click(); });
  await page.waitForTimeout(900);
  await page.click('.item[data-target="nganhang"]'); await page.click('.rtab[data-rtab="thtt"]');
  const c = await cards('#thttKpi');
  const foot = await page.$$eval('#tbl-thtt tfoot td', (tds) => tds.map((x) => x.textContent.trim()));
  check('THTT: 4 thẻ đúng tên', c.map((x) => x.lbl).join('|') === 'TỔNG THÀNH TIỀN|TỔNG KHỐI LƯỢNG|SỐ CHỦ RỪNG|SỐ NGÀY THANH TOÁN', c.map((x) => x.lbl).join('|'));
  check('THTT: thẻ thành tiền / khối lượng = dòng tổng bảng (34.500.000 / 20,00)', c[0].val === foot[3] && c[1].val === foot[2] && c[0].val === '34.500.000' && c[1].val === '20,00', foot.join('|'));
  check('THTT: 3 dòng; đơn giá bình quân 1.725.000/tấn', c[0].sub === '3 dòng thanh toán' && /1\.725\.000\/tấn/.test(c[1].sub), c[1].sub);
  check('THTT: 2 chủ rừng (gộp "TRẦN VĂN A"/"Trần Văn A"), nhiều nhất TRẦN VĂN A 25.500.000', c[2].val === '2' && /TRẦN VĂN A \(25\.500\.000\)/.test(c[2].sub), c[2].sub);
  check('THTT: 2 ngày thanh toán, bình quân 17.250.000/ngày', c[3].val === '2' && /17\.250\.000\/ngày/.test(c[3].sub), c[3].sub);
}
check('Không có lỗi JavaScript', errors.length === 0, errors.join(' | '));

await browser.close();
console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);
