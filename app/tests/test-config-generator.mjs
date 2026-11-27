// Kiểm tra config.html: điền form, bấm "Tạo file báo cáo", xác nhận file HTML tải về đã thay
// đúng tên công ty + 4 link Google Sheet, KHÔNG đổi gì khác (chạy được bình thường, vẫn gọi
// đúng link MỚI khi tải dữ liệu).
import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { genPhieuCan, genDNTT, genHDNCC, genHosokeo, toCSV, companyConfigWorkbook } from './fixtures.mjs';

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
Math.random = mulberry32(7);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_HTML = path.resolve(__dirname, '../config.html');
const DIST_HTML = path.resolve(__dirname, '../dist/index.html');

let pass = 0, fail = 0;
function check(name, cond) { if (cond) { pass++; console.log('OK  ', name); } else { fail++; console.log('FAIL', name); } }

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

await page.goto('file://' + CONFIG_HTML, { waitUntil: 'load' });
check('config.html tải lên không lỗi JS', errors.length === 0);

const NEW = {
  ten: 'CÔNG TY TNHH "HOÀNG ANH KHÔI" QUẢNG NAM',
  maHS: '9999999999',
  nhaMay: 'HAKQN',
  phieucan: 'https://docs.google.com/spreadsheets/d/e/TEST_PHIEUCAN_ID/pub?output=csv',
  dntt: 'https://docs.google.com/spreadsheets/d/e/TEST_DNTT_ID/pub?gid=111&single=true&output=csv',
  mst: '4000123456', sdt: '0236 3 999 888', diaChi: 'Cụm CN Trảng Nhật, xã Duy Trung, Quảng Nam',
  diaChiThuMua: 'Thôn 1, xã ABC, huyện XYZ, Quảng Nam',
};

const importedConfig = {
  TenCty: NEW.ten, MaHS: NEW.maHS, NhaMay: NEW.nhaMay,
  PhieuCan: NEW.phieucan, DNTT: NEW.dntt,
  HDNCC: 'https://docs.google.com/spreadsheets/d/e/TEST_HDMB/pub?output=csv',
  Hosokeo: 'https://docs.google.com/spreadsheets/d/e/TEST_HOSOKEO/pub?output=csv',
  XuatHang: 'https://docs.google.com/spreadsheets/d/TEST_EXPORT/edit',
  MST: NEW.mst, SDT: NEW.sdt, DiaChi: NEW.diaChi, DiaChiThuMua: NEW.diaChiThuMua,
};
const phieucanFixture = genPhieuCan(40);
const dnttFixture = genDNTT(phieucanFixture, 15);
const replies = {
  TEST_PHIEUCAN_ID: toCSV(phieucanFixture), TEST_DNTT_ID: toCSV(dnttFixture),
  TEST_HDMB: toCSV(genHDNCC(dnttFixture)), TEST_HOSOKEO: toCSV(genHosokeo(10)),
  NL_PC_XH: 'Ngày xuất,Khối lượng (Tấn),SỐ TKHQ\n',
  NL_DH_XB: 'Ngày đơn hàng,SỐ TKHQ,KL_BDMT,ĐƠN GIÁ (USD)\n',
};
await page.route('https://docs.google.com/**', route => {
  const key = Object.keys(replies).find(name => route.request().url().includes(name));
  return route.fulfill({ status: 200, contentType: 'text/csv', body: replies[key] ?? '' });
});
await page.locator('#configFile').setInputFiles(await companyConfigWorkbook(page, importedConfig));
await page.click('#btnCheck');
await page.waitForFunction(() => /Cả 5 nguồn đạt/.test(document.querySelector('#msg').textContent));
check('Kiểm tra xong chỉ hiện tên công ty và tình trạng nguồn', (await page.textContent('#companySummary')).includes(NEW.ten) &&
  !(await page.locator('body').innerText()).includes(importedConfig.XuatHang));
const downloadPromise = page.waitForEvent('download');
await page.click('#btnSave');
const download = await downloadPromise;
const outPath = path.join(__dirname, '_tmp_generated.html');
await download.saveAs(outPath);

check('Bấm "Tạo file báo cáo" tải xuống 1 file', fs.existsSync(outPath));
const msgText = await page.evaluate(() => document.getElementById('msg').textContent);
check('Thông báo hiển thị thành công', msgText.includes('Đã tạo xong'));

const generated = fs.readFileSync(outPath, 'utf8');
check('File mới chứa đúng tên công ty mới', generated.includes(JSON.stringify(NEW.ten)));
check('File mới KHÔNG còn tên công ty cũ (Đại Hiệp)', !generated.includes('CÔNG TY TNHH SXTMDV ĐẠI HIỆP'));
check('File mới chứa đúng Mã HS mới', generated.includes(NEW.maHS));
check('File mới chứa đúng Mã nhà máy mới', generated.includes(NEW.nhaMay));
check('File mới chứa đúng link Phiếu cân mới', generated.includes(NEW.phieucan));
check('File mới chứa đúng link DNTT mới', generated.includes(NEW.dntt));
check('File mới dùng đúng link HDMB đã nhập', generated.includes(importedConfig.HDNCC));
check('File mới dùng đúng link Hồ sơ keo và Xuất hàng đã nhập', generated.includes(importedConfig.Hosokeo) && generated.includes(importedConfig.XuatHang));
check('File mới chứa đúng Mã số thuế mới (mặc định biểu mẫu ngân hàng+WO)', generated.includes(NEW.mst));
check('File mới chứa đúng Địa chỉ nơi tổ chức thu mua mới', generated.includes(NEW.diaChiThuMua));

const originalSize = fs.statSync(DIST_HTML).size;
const generatedSize = Buffer.byteLength(generated, 'utf8');
check('Kích thước file mới xấp xỉ file gốc (không lệch quá 2KB — chỉ khác đúng các giá trị đã thay)', Math.abs(generatedSize - originalSize) < 2048);

// ---------- Mở thử file mới tạo, xác nhận app chạy bình thường và GỌI ĐÚNG link mới khi tải dữ liệu ----------
const page2 = await browser.newPage();
const errors2 = [];
page2.on('pageerror', (e) => errors2.push(e.message));
let calledPhieuCan = false, calledDntt = false;
await page2.route('https://docs.google.com/**', (route) => {
  const url = route.request().url();
  if (url.includes('TEST_PHIEUCAN_ID')) { calledPhieuCan = true; return route.fulfill({ status: 200, contentType: 'text/csv', body: toCSV(phieucanFixture) }); }
  if (url.includes('TEST_DNTT_ID')) { calledDntt = true; return route.fulfill({ status: 200, contentType: 'text/csv', body: toCSV(dnttFixture) }); }
  const key = Object.keys(replies).find(name => url.includes(name));
  return route.fulfill({ status: 200, contentType: 'text/csv', body: replies[key] ?? '' });
});
await page2.goto('file://' + outPath, { waitUntil: 'load' });
await page2.waitForFunction(() => document.querySelector('#statusText')?.textContent?.includes('phiếu cân'), { timeout: 15000 });
await page2.fill('#fFrom', '2024-01-01');
await page2.fill('#fTo', '2025-12-31');
await page2.click('#btnLapBC');
await page2.waitForTimeout(400);
check('File mới khi chạy gọi ĐÚNG link Phiếu cân mới (không gọi lại link cũ)', calledPhieuCan);
check('File mới khi chạy gọi ĐÚNG link DNTT mới (không gọi lại link cũ)', calledDntt);
check('File mới chạy không lỗi JS', errors2.length === 0);
const companyNameOnPage = await page2.evaluate(() => document.querySelector('.brand h1, .companyName, [class*=company]')?.textContent || document.body.textContent.includes('HOÀNG ANH KHÔI QUẢNG NAM'));
const bodyHasNewName = await page2.evaluate((name) => document.body.innerText.includes(name), NEW.ten);
check('Giao diện hiển thị đúng tên công ty mới (sidebar/hướng dẫn sử dụng)', bodyHasNewName);
// Guide text in "Hướng dẫn sử dụng" card must not reference config.html incorrectly, sanity check section exists
const hasGuideSection = await page2.evaluate(() => !!document.querySelector('#sec-danhmuc'));
check('Section "Danh mục & cấu hình" (chứa Hướng dẫn sử dụng mới) vẫn tồn tại', hasGuideSection);
const hasCfgListRemoved = await page2.evaluate(() => !document.querySelector('#cfgList'));
check('Card "Nguồn dữ liệu (CONFIG)" cũ đã được thay thế (không còn #cfgList)', hasCfgListRemoved);

// ---------- Modal "Thông tin xuất báo cáo ngân hàng" (Mẫu 02/TNDN) tự điền sẵn từ cấu hình mới ----------
await page2.click('[data-target="nganhang"]');
await page2.click('[data-rtab="tndn"]');
await page2.click('#btnTNDNModal');
await page2.waitForSelector('#bankMST', { state: 'visible' });
const bankMstVal = await page2.inputValue('#bankMST');
const bankDiaChiThuMuaVal = await page2.inputValue('#bankDiaChiThuMua');
check('Modal "02/TNDN" tự điền sẵn Mã số thuế từ config.html (chưa từng lưu localStorage)', bankMstVal === NEW.mst);
check('Modal "02/TNDN" tự điền sẵn Địa chỉ nơi tổ chức thu mua từ config.html', bankDiaChiThuMuaVal === NEW.diaChiThuMua);
await page2.click('#btnBankCancel');

// ---------- Modal "Khai báo mẫu WO" dùng chung cơ chế loadWOInfo()/CONFIG.DEFAULT_WO_INFO với
// modal ngân hàng ở trên (cùng 1 hàm merge logic trong legacy-app.js) — mở modal WO thật cần
// dựng thêm fixture cho báo cáo BKLS xuất khẩu (Hosokeo/HD_NCC), không cần thiết vì đã kiểm tra
// đủ ở mức nội dung file (dưới đây) + đã xác nhận cơ chế hoạt động đúng qua modal 02/TNDN.
check('File mới chứa đúng khối JSON mặc định biểu mẫu WO (maSoThue + diaChiThuMua mới)', generated.includes('{maSoThue:' + JSON.stringify(NEW.mst) + ',diaChiThuMua:' + JSON.stringify(NEW.diaChiThuMua) + '}'));

fs.unlinkSync(outPath);
console.log('\npageerrors (config.html):', JSON.stringify(errors));
console.log('pageerrors (generated file):', JSON.stringify(errors2));
console.log(`=== RESULT: ${pass} passed, ${fail} failed ===`);
await browser.close();
process.exit(fail > 0 ? 1 : 0);
