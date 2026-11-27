import assert from 'node:assert/strict';
import { createPublicKey, randomBytes, verify } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { launchChromium } from './browser-launcher.mjs';
import { newRequest, openCompany } from '../../desktop-app/tests/ed25519-fixtures.mjs';

const browser = await launchChromium();
const location = new URL('../../desktop-app/licensing/HAK-CapPhep.html', import.meta.url).href;
const password = randomBytes(16).toString('hex');
const url = 'https://docs.google.com/spreadsheets/d/e/HAK_TEST/pub?output=csv';
async function download(page, name, expected) {
  const [file] = await Promise.all([
    page.waitForEvent('download'), page.getByRole('button', { name, exact: true }).click()
  ]);
  assert.equal(file.suggestedFilename(), expected);
  return readFile(await file.path());
}
async function issue(page, request, publicKey) {
  await page.locator('#requestCode').fill(request.wire);
  const file = await download(page, 'Tạo mã và file HAK', 'HAK-CaiDat.haksetup');
  const code = await page.locator('#replyCode').inputValue();
  assert.match(code, /^HAKA4\.[A-Za-z0-9_-]{86}$/);
  assert(verify(null, Buffer.from('hak-unlock-v4\n' + request.wire), publicKey, Buffer.from(code.slice(6), 'base64url')));
  return file;
}

try {
  const context = await browser.newContext({ offline: true, acceptDownloads: true });
  const page = await context.newPage();
  await page.goto(location);
  const guide = page.locator('#issuerGuide');
  await guide.getByText('Hướng dẫn cấp phép nhiều app', { exact: true }).click();
  assert(await guide.getByText('Chuẩn bị một lần tại HAK', { exact: false }).isVisible());
  assert(await guide.getByText('Dùng cùng file', { exact: false }).isVisible());
  assert(await guide.getByText('Chuyển máy quản trị hoặc khôi phục sau sự cố', { exact: false }).isVisible());
  await page.getByText('Tạo hoặc khôi phục khóa', { exact: true }).click();
  await page.locator('#newIssuerPassword').fill(password);
  await page.locator('#repeatIssuerPassword').fill(password);
  const backup = await download(page, 'Tạo khóa chung', 'HAK-KhoaChung.hakkey');
  const jwk = JSON.parse(await download(page, 'Tải khóa công khai để đóng bộ cài', 'HAK-PublicKey.jwk'));
  assert.equal(jwk.crv, 'Ed25519');
  assert(!Object.hasOwn(jwk, 'd'));
  assert(!backup.includes(Buffer.from(password)));
  const publicKey = createPublicKey({ key: jwk, format: 'jwk' });
  const recipient = newRequest();

  await page.getByRole('button', { name: 'Thêm công ty' }).click();
  await page.locator('#TenCty').fill('Công ty Thử nghiệm');
  await page.locator('#DiaChi').fill('Đắk Lắk');
  await page.locator('#PhieuCan').fill(url);
  await page.locator('#DNTT').fill(url);
  await page.getByRole('button', { name: 'Lưu công ty' }).click();
  await page.getByRole('button', { name: 'Thêm công ty' }).click();
  await page.locator('#TenCty').fill('Công ty thứ hai');
  await page.locator('#PhieuCan').fill(url.replace('HAK_TEST', 'HAK_SECOND'));
  await page.locator('#DNTT').fill(url);
  await page.getByRole('button', { name: 'Lưu công ty' }).click();
  await page.locator('#savedCompany').selectOption({ label: 'Công ty Thử nghiệm' });

  const file = await issue(page, recipient, publicKey);
  const company = openCompany(file, publicKey, recipient);
  assert.equal(company.TenCty, 'Công ty Thử nghiệm');
  assert.equal(company.DiaChi, 'Đắk Lắk');
  assert.equal(company.PhieuCan, url);
  assert(!file.includes(Buffer.from(url)));
  assert.throws(() => openCompany(file, publicKey, newRequest()), /Wrong recipient/);
  const envelope = JSON.parse(file);
  const altered = { ...envelope, body: (envelope.body[0] === 'A' ? 'B' : 'A') + envelope.body.slice(1) };
  assert.throws(() => openCompany(JSON.stringify(altered), publicKey, recipient), /Invalid signature/);
  await page.getByText('Sao lưu danh sách công ty', { exact: true }).click();
  const profiles = await download(page, 'Tải danh sách', 'HAK-DanhSachCongTy.json');

  // Restore the single HAK key and the company list in a fresh offline browser.
  const recovered = await (await browser.newContext({ offline: true, acceptDownloads: true })).newPage();
  await recovered.goto(location);
  await recovered.getByText('Tạo hoặc khôi phục khóa', { exact: true }).click();
  await recovered.locator('#restoreIssuer').setInputFiles({
    name: 'HAK-KhoaChung.hakkey', mimeType: 'application/json', buffer: backup
  });
  await recovered.locator('#restoreIssuerPassword').fill('wrong-password');
  await recovered.getByRole('button', { name: 'Khôi phục khóa' }).click();
  await recovered.waitForFunction(() => document.querySelector('#issuerStatus').textContent.includes('Sai mật khẩu'));
  await recovered.locator('#restoreIssuerPassword').fill(password);
  await recovered.getByRole('button', { name: 'Khôi phục khóa' }).click();
  await recovered.waitForFunction(() => document.querySelector('#issuerStatus').textContent.includes('đã mở'));
  await recovered.getByText('Sao lưu danh sách công ty', { exact: true }).click();
  await recovered.locator('#importCompanies').setInputFiles({
    name: 'HAK-DanhSachCongTy.json', mimeType: 'application/json', buffer: profiles
  });
  await recovered.locator('#savedCompany').selectOption({ label: 'Công ty thứ hai' });
  const anotherReport = newRequest();
  const restoredProfile = await issue(recovered, anotherReport, publicKey);
  assert.equal(openCompany(restoredProfile, publicKey, anotherReport).TenCty, 'Công ty thứ hai');
  const anotherApp = newRequest('com.hakgroup.quan-ly-kho');
  const newFile = await issue(recovered, anotherApp, publicKey);
  assert.deepEqual(openCompany(newFile, publicKey, anotherApp), {});
  assert.throws(() => openCompany(newFile, publicKey, recipient), /Wrong recipient/);
  console.log('PASS: one offline issuer, encrypted key recovery, multiple apps and device-specific encrypted profiles.');
} finally {
  await browser.close();
}
