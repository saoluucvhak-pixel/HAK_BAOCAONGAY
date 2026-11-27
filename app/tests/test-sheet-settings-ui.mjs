// Kiểm tra luồng nhập, xác minh và xác nhận cấu hình Desktop với dữ liệu mô phỏng.
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { companyConfigWorkbook } from './fixtures.mjs';

const setup = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../desktop-app/app/setup.html');
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
try {
  const page = await browser.newPage();
  const config = {
    TenCty: 'CÔNG TY TEST', MST: '0123456789',
    PhieuCan: 'https://docs.google.com/spreadsheets/d/e/TEST_PC/pub?output=csv',
    DNTT: 'https://docs.google.com/spreadsheets/d/e/TEST_DN/pub?output=csv',
    HDNCC: 'https://docs.google.com/spreadsheets/d/e/TEST_HD/pub?output=csv',
    Hosokeo: 'https://docs.google.com/spreadsheets/d/e/TEST_HK/pub?output=csv',
    XuatHang: 'https://docs.google.com/spreadsheets/d/TEST_EXPORT/edit',
  };
  const load = async data => page.locator('#configFile').setInputFiles(await companyConfigWorkbook(page, data));
  await page.addInitScript(() => {
    window.__saved = [];
    window.__bad = true;
    window.api = {
      getConfig: async () => ({ TenCty: 'CÔNG TY ĐANG DÙNG' }),
      saveConfig: async data => { window.__saved.push(data); return { ok: true }; },
    };
    const headers = {
      TEST_PC: 'So_CT,Khách hàng,Ngày cân 1,Giờ cân 1,Ngày cân 2,Giờ cân 2,Biển số 1,KL hàng (KG),Đơn giá_TC,Thành tiền,ĐL,NG',
      TEST_DN: 'Ngày thanh toán,Số hợp đồng,Họ tên Chủ rừng,Số CT,Khối lượng,Đơn giá thanh toán,Thành tiền',
      TEST_HD: 'Số hợp đồng,Họ tên Chủ rừng,Địa chỉ thường trú',
      TEST_HK: 'Mã hợp đồng,Ngày nhập,Số BKLS,Họ và tên chủ rừng,Khối lượng (Tấn),Đơn giá,Thanh toán',
      NL_PC_XH: 'Ngày xuất,Khối lượng (Tấn),SỐ TKHQ',
      NL_DH_XB: 'Ngày đơn hàng,SỐ TKHQ,KL_BDMT,ĐƠN GIÁ (USD)',
    };
    window.fetch = async url => {
      const hit = Object.keys(headers).find(key => String(url).includes(key));
      const header = hit === 'NL_DH_XB' && window.__bad ? 'Ngày đơn hàng,SỐ TKHQ,KL_BDMT' : headers[hit];
      return new Response(header + '\n', { status: 200 });
    };
  });
  await page.goto('file://' + setup);
  await page.getByText('CÔNG TY ĐANG DÙNG').waitFor();
  assert.equal(await page.locator('input[type=url],input[type=text]').count(), 0);
  await load({ ...config, HDNCC: '' });
  await page.getByText(/File thiếu link: HDMB/).waitFor();
  await load(config);
  await page.click('#btnCheck');
  await page.getByText(/NL_DH_XB.*Thiếu cột/).waitFor();
  assert.equal(await page.locator('#btnSave').isDisabled(), true);
  await page.evaluate(() => { window.__bad = false; });
  await load(config);
  await page.click('#btnCheck');
  await page.getByText(/Cả 5 nguồn đạt/).waitFor();
  assert.equal(await page.textContent('#companySummary'), 'CÔNG TY TEST · MST 0123456789');
  assert.equal(await page.locator('#currentCompany').isVisible(), false);
  assert.ok(!(await page.locator('body').innerText()).includes(config.XuatHang));
  await load({ ...config, TenCty: 'CÔNG TY ĐỔI' });
  assert.equal(await page.locator('#btnSave').isDisabled(), true);
  await page.click('#btnCheck');
  await page.getByText(/Cả 5 nguồn đạt/).waitFor();
  await page.click('#btnSave');
  await page.waitForFunction(() => window.__saved.length === 1);
  assert.equal(await page.evaluate(() => window.__saved[0].TenCty), 'CÔNG TY ĐỔI');
  console.log('PASS: validate 5 sources, hide addresses, require retest before confirming changed config.');
} finally {
  await browser.close();
}
