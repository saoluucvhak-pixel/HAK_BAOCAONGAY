// Kiểm chứng lỗi đơn vị tiền "đ" bị ngắt xuống dòng riêng — CÙNG HỌ LỖI đã sửa ở
// tests/test-pdf-money-wrap.mjs (báo cáo dùng nút "📄 PDF" chung, exportPDF()) — nhưng lần
// này ở 3 MẪU PDF RIÊNG, mỗi mẫu tự gọi doc.autoTable() với code khác nhau, KHÔNG dùng chung
// exportPDF() nên chưa được áp dụng bản sửa trước đó:
//   1) "Bảng kê WO" (nút "Xuất mẫu WO" → buildWOPdf())
//   2) Mẫu "02/TNDN" (nút "Báo cáo ngân hàng" → buildTNDNPdf())
//   3) "Phiếu nhập kho" (nút "Báo cáo ngân hàng" → buildPNKPdf())
// Người dùng báo lại đúng lỗi này ở ảnh chụp mẫu WO ("BẢNG KÊ KHAI HÀNG HÓA XUẤT KHẨU ĐẠT TIÊU
// CHÍ WO" — cột "Đơn giá"/"Tổng trị giá" có "đ" xuống dòng riêng).
// Đã sửa bằng hàm dùng chung forcePdfMoneyColumnWidths() (xem legacy-app.js, ngay sau
// ensurePdfFont()) — áp dụng cho cả 3 hàm buildWOPdf()/buildTNDNPdf()/buildPNKPdf() giống hệt
// cách đã sửa exportPDF() ở Phase 3.8.
// Không thuộc bộ ui-baseline.mjs — chạy riêng bằng `node tests/test-pdf-custom-money-wrap.mjs`.
import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import fs from 'fs';
import { genPhieuCan, genDNTT, genHDNCC, genHosokeo, toCSV } from './fixtures.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_HTML = path.resolve(__dirname, '../dist/index.html');
const DOWNLOAD_DIR = path.resolve(__dirname, '../.tmp-pdf-custom-test');
fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });

function mulberry32(seed) { return function () { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
Math.random = mulberry32(7);

const phieucan = genPhieuCan(60);
const dntt = genDNTT(phieucan, 25);
const hdncc = genHDNCC(dntt);
const hosokeo = genHosokeo(40);
// Đẩy số tiền lên rất cao (chục tỷ) để "Đơn giá"/"Tổng trị giá" ra chuỗi dài — tái hiện đúng
// tình huống người dùng gặp (ảnh chụp có "35.632.000 đ" v.v., cột hẹp vì bảng WO có 11 cột dồn
// trên 1 trang landscape).
// Đồng thời làm dài các cột chữ khác (địa chỉ, CCCD) giống đúng độ dài thật (ảnh chụp người
// dùng: "Thôn Kong Năng, xã Phước Năng, thành phố Đà Nẵng", "049302008390 24/06/2021") — bảng
// có nhiều cột dồn trên 1 trang landscape CHỈ hẹp cột tiền khi các cột chữ khác cũng chiếm
// nhiều chỗ (đúng tình huống thật); dữ liệu giả lập mặc định (fixtures.mjs) dùng chuỗi rất
// ngắn ("Rừng 0", "KH0") nên không tái hiện được lỗi dù số tiền có dài.
hosokeo.forEach((r, i) => {
  r['Đơn giá'] = String(1800000 + Math.floor(Math.random() * 90000));
  r['Thanh toán'] = String((Math.random() * 900000000 + 100000000) | 0);
  r['ĐỊA CHỈ RỪNG'] = 'Thôn Kong Năng ' + i + ', xã Phước Năng, thành phố Đà Nẵng';
  r['Mã khách hàng'] = String(49302008390 + i) + ' 24/06/2021';
});
dntt.forEach((r) => { r['Đơn giá thanh toán'] = String(1900000 + Math.floor(Math.random() * 90000)); r['Thành tiền'] = String((Math.random() * 900000000 + 100000000) | 0); });
hdncc.forEach((r, i) => {
  r['Địa chỉ thường trú'] = 'Thôn An Hòa ' + i + ', xã Hà Nha, thành phố Đà Nẵng, Việt Nam';
  // Dữ liệu giả lập mặc định (genHDNCC) không có 2 cột này (map thành '' khi tra ở TNDN) — thêm
  // vào để tái hiện đúng độ dài dữ liệu thật (mẫu 02/TNDN có cột "Số CCCD"/"Số Điện thoại").
  r['Số CCCD Chủ rừng'] = String(49100000000 + i) + ' cấp 24/06/2021';
  r['Số ĐT DĐ Chủ rừng'] = '09' + String(10000000 + i);
});

const CSV_BY_URL_SUBSTR = [
  ['2PACX-1vTj7PHtJtv1iBaF9tCKJ9zgnTyc4j6Hbt9CEYX36sVIDXwJDQUvMGd-O_bc8E-N6iEh5JqH9tytjQLj', toCSV(phieucan)],
  ['2PACX-1vSqRW3Yk2MBgXp1qi29tQZQyn1R-opTUjE5PqBFIH7knAOcr1YvthP_AuXa_10knbaprgtM4i_zPk2i', toCSV(dntt)],
  ['2PACX-1vRmYRMAG3XDhHz74P7L1-NrKyPD8Zozp5lPU9rR-_dirOq5UHfSMNdZ4pq4PF5DpI6nosDBlAwW_a10', toCSV(hdncc)],
  ['2PACX-1vT0mcMT2TsD7lOLSNrTqZPVjJJ395kI54SxSri5-n_VxrfAcC74IKkgCnesT30d1bhx59gJC4esmF7s', toCSV(hosokeo)],
];

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ acceptDownloads: true });
const errors = []; page.on('pageerror', (e) => errors.push(e.message));

await page.route('https://docs.google.com/**', (route) => {
  const url = route.request().url();
  const hit = CSV_BY_URL_SUBSTR.find(([substr]) => url.includes(substr));
  if (hit) return route.fulfill({ status: 200, contentType: 'text/csv', body: hit[1] });
  return route.fulfill({ status: 200, contentType: 'text/csv', body: '' });
});

await page.goto('file://' + DIST_HTML, { waitUntil: 'load' });
await page.waitForFunction(() => document.querySelector('#statusText')?.textContent?.includes('phiếu cân'), { timeout: 15000 });
await page.fill('#fFrom', '2024-01-01');
await page.fill('#fTo', '2025-12-31');
await page.click('#btnLapBC');
await page.waitForTimeout(500);

// Kiểm tra "đ" có bị đứng riêng dòng ngay dưới 1 số tiền hay không (dấu hiệu ngắt dòng), dùng
// pdftotext -bbox để lấy vị trí (x,y) từng "word" — giống đúng phương pháp đã dùng ở
// tests/test-pdf-money-wrap.mjs.
function countOrphanD(pdfPath) {
  const xml = execSync(`pdftotext -bbox "${pdfPath}" -`, { encoding: 'utf8' });
  const wordRe = /<word[^>]*xMin="([\d.]+)"[^>]*yMin="([\d.]+)"[^>]*xMax="([\d.]+)"[^>]*yMax="([\d.]+)"[^>]*>([^<]*)<\/word>/g;
  const words = [];
  let m;
  while ((m = wordRe.exec(xml))) words.push({ xMin: +m[1], yMin: +m[2], xMax: +m[3], yMax: +m[4], text: m[5].trim() });
  let orphanCount = 0;
  words.forEach((w) => {
    if (w.text !== 'đ') return;
    const above = words.find((o) => o !== w && Math.abs(o.xMin - w.xMin) < 3 && o.yMax <= w.yMin + 0.5 && o.yMax > w.yMin - 6 && /[\d.,]/.test(o.text));
    if (above) orphanCount++;
  });
  return orphanCount;
}

const results = {};

// 1) Mẫu WO
await page.click('[data-target="lamsan"]');
await page.click('[data-rtab="bklsct"]');
await page.waitForTimeout(200);
await page.click('#btnWOModal');
await page.waitForTimeout(100);
{
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 15000 }),
    page.click('#btnWOPdf'),
  ]);
  const p = path.join(DOWNLOAD_DIR, 'wo.pdf');
  await download.saveAs(p);
  results.wo = countOrphanD(p);
}
await page.click('#btnWOCancel').catch(() => {});

// 2) Mẫu 02/TNDN
await page.click('[data-target="nganhang"]');
await page.click('[data-rtab="tndn"]');
await page.waitForTimeout(200);
await page.click('#btnTNDNModal');
await page.waitForTimeout(100);
{
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 15000 }),
    page.click('#btnBankPdf'),
  ]);
  const p = path.join(DOWNLOAD_DIR, 'tndn.pdf');
  await download.saveAs(p);
  results.tndn = countOrphanD(p);
}
await page.click('#btnBankCancel').catch(() => {});

// 3) Phiếu nhập kho
await page.click('[data-rtab="pnk"]');
await page.waitForTimeout(200);
await page.click('#btnPNKModal');
await page.waitForTimeout(100);
{
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 15000 }),
    page.click('#btnBankPdf'),
  ]);
  const p = path.join(DOWNLOAD_DIR, 'pnk.pdf');
  await download.saveAs(p);
  results.pnk = countOrphanD(p);
}
await page.click('#btnBankCancel').catch(() => {});

console.log('Số chỗ "đ" bị ngắt dòng riêng: WO=' + results.wo + ' TNDN=' + results.tndn + ' PNK=' + results.pnk);
console.log('pageerrors:', errors);
const ok = results.wo === 0 && results.tndn === 0 && results.pnk === 0 && errors.length === 0;
console.log(ok ? 'OK: cả 3 mẫu PDF riêng đều không còn "đ" bị ngắt dòng' : 'FAIL');

fs.rmSync(DOWNLOAD_DIR, { recursive: true, force: true });
await browser.close();
process.exit(ok ? 0 : 1);
