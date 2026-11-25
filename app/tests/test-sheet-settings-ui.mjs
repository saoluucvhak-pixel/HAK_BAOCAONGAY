// Playwright: cấu hình nguồn Google Sheets trong màn hình desktop setup (không gửi dữ liệu thật).
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const setup = path.resolve(__dirname, '../../desktop-app/app/setup.html');
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => {
    window.__saved = [];
    window.__scenario = 'invalid';
    const PC = 'https://docs.google.com/spreadsheets/d/e/TEST_PC/pub?output=csv';
    const DN = 'https://docs.google.com/spreadsheets/d/e/TEST_DN/pub?output=csv';
    window.api = {
      getConfig: async () => ({
        TenCty: 'CÔNG TY TEST', PhieuCan: PC, DNTT: DN, HDNCC: '', Hosokeo: ''
      }),
      saveConfig: async data => { window.__saved.push(data); return { ok: true }; }
    };
    window.fetch = async (url) => {
      const pcHeader = 'So_CT,Khách hàng,Ngày cân 1,Giờ cân 1,Ngày cân 2,Giờ cân 2,Biển số 1,KL hàng (KG),Đơn giá_TC,Thành tiền,ĐL,NG';
      const dnHeader = 'Ngày thanh toán,Số hợp đồng,Họ tên Chủ rừng,Số CT,Khối lượng,Đơn giá thanh toán,Thành tiền';
      const header = String(url).includes('TEST_PC') ? pcHeader : window.__scenario === 'invalid' ? 'Số hợp đồng,Số CT' : dnHeader;
      return new Response(header + '\n1,ABC', { status: 200, headers: { 'Content-Type': 'text/csv' } });
    };
  });
  await page.goto('file://' + setup);
  await page.waitForSelector('#fPhieuCan');
  await page.click('#btnSave');
  await page.waitForFunction(() => /Không thể lưu khi có nguồn lỗi/.test(document.querySelector('#msg').textContent));
  assert.equal(await page.evaluate(() => window.__saved.length), 0, 'lỗi thiếu cột không được gọi lưu cấu hình');
  assert.match(await page.textContent('#statusDNTT'), /Thiếu cột/);
  await page.evaluate(() => { window.__scenario = 'valid'; });
  await page.click('#btnCheck');
  await page.waitForFunction(() => /Cả 4 nguồn đã được kiểm tra/.test(document.querySelector('#msg').textContent));
  await page.click('#btnSave');
  await page.waitForFunction(() => window.__saved.length === 1);
  assert.equal(await page.evaluate(() => window.__saved[0].TenCty), 'CÔNG TY TEST');
  assert.deepEqual(errors, [], 'setup.html không phát sinh lỗi JavaScript');
  console.log('PASS: setup blocks invalid Sheets and saves validated sources only');
} finally {
  await browser.close();
}
