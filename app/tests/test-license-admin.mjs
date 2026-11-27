import assert from 'node:assert/strict';
import { createHmac, randomBytes } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { launchChromium } from './browser-launcher.mjs';

const template = await readFile(new URL('../../desktop-app/licensing/HAK-CapPhep.html', import.meta.url), 'utf8');
const browser = await launchChromium();
const dir = await mkdtemp(path.join(tmpdir(), 'hak-decoder-'));
const context = await browser.newContext({ offline: true, acceptDownloads: true });
const request = '01234567';
const product = 'com.hakgroup.baocaongay';
const seed = randomBytes(32);
function mac(key, domain, bytes) {
  return createHmac('sha256', key).update(product + '\n' + domain + '\n').update(bytes).digest();
}
function response(key, code) {
  return String(mac(key, 'code-v1', code).readUIntBE(0, 6) % 1000000000000).padStart(12, '0');
}
async function openDecoder(name, key) {
  const file = path.join(dir, name + '.html');
  await writeFile(file, template.replace('__HAK_BUILD_SEED__', key.toString('base64')));
  const page = await context.newPage();
  await page.goto(pathToFileURL(file).href);
  return page;
}
async function calculate(page, requestCode) {
  await page.locator('#requestCode').fill(requestCode);
  await page.getByRole('button', { name: 'Tạo mã trả lời' }).click();
  await page.locator('#replyCode').waitFor({ state: 'visible' });
  return page.locator('#replyCode').inputValue();
}

try {
  const page = await openDecoder('first', seed);
  await page.locator('#requestCode').fill('123');
  await page.getByRole('button', { name: 'Tạo mã trả lời' }).click();
  await page.waitForFunction(() => document.querySelector('#issueStatus').classList.contains('error'));
  assert.equal(await calculate(page, request), response(seed, request));
  assert.notEqual(await calculate(page, '01234568'), response(seed, request));

  const nextSeed = randomBytes(32);
  const other = await openDecoder('upgrade', nextSeed);
  assert.equal(await calculate(other, request), response(nextSeed, request));
  assert.notEqual(response(nextSeed, request), response(seed, request));

  await page.locator('#requestCode').fill(request);
  await page.getByText('Thông tin công ty và nguồn Google Sheets', { exact: true }).click();
  const url = 'https://docs.google.com/spreadsheets/d/e/HAK_TEST/pub?output=csv';
  await page.locator('#TenCty').fill('Công ty Thử nghiệm');
  await page.locator('#DiaChi').fill('Đắk Lắk');
  await page.locator('#PhieuCan').fill(url);
  await page.locator('#DNTT').fill(url);
  const [download] = await Promise.all([
    page.waitForEvent('download'), page.getByRole('button', { name: 'Tạo file cài đặt HAK' }).click()
  ]);
  assert.equal(download.suggestedFilename(), 'HAK-CaiDat.haksetup');
  const file = await readFile(await download.path());
  const { body, signature } = JSON.parse(file);
  const payload = Buffer.from(body, 'base64');
  const kit = JSON.parse(payload);
  assert.equal(kit.device, request);
  assert.equal(kit.company.TenCty, 'Công ty Thử nghiệm');
  assert.equal(kit.company.DiaChi, 'Đắk Lắk');
  assert.equal(kit.company.PhieuCan, url);
  assert(kit.expiresAt > kit.issuedAt);
  assert.equal(signature, mac(seed, 'setup-v1', payload).toString('base64'));
  assert.notEqual(signature, mac(nextSeed, 'setup-v1', payload).toString('base64'));

  await page.getByText('Dùng lại cấu hình khi cài lại', { exact: true }).click();
  await page.locator('#DiaChi').fill('');
  await page.locator('#previousSetup').setInputFiles({
    name: 'HAK-CaiDat.haksetup', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ body, signature: mac(seed, 'setup-v1', 'changed').toString('base64') }))
  });
  await page.getByRole('button', { name: 'Nạp cấu hình từ file cũ' }).click();
  await page.waitForFunction(() => document.querySelector('#issueStatus').textContent.includes('đã bị sửa'));
  assert.equal(await page.locator('#DiaChi').inputValue(), '');
  await page.locator('#previousSetup').setInputFiles({
    name: 'HAK-CaiDat.haksetup', mimeType: 'application/json', buffer: file
  });
  await page.getByRole('button', { name: 'Nạp cấu hình từ file cũ' }).click();
  await page.waitForFunction(() => document.querySelector('#issueStatus').textContent.includes('Đã nạp cấu hình cũ'));
  assert.equal(await page.locator('#DiaChi').inputValue(), kit.company.DiaChi);
  await page.getByRole('button', { name: 'Lưu công ty' }).click();
  await page.waitForFunction(() => document.querySelector('#issueStatus').textContent.includes('Đã lưu Công ty Thử nghiệm'));
  await page.getByRole('button', { name: 'Thêm công ty' }).click();
  assert.equal(await page.locator('#PhieuCan').inputValue(), '');
  await page.locator('#TenCty').fill('Công ty thứ hai');
  await page.locator('#PhieuCan').fill(url.replace('HAK_TEST', 'HAK_SECOND_PC'));
  await page.locator('#DNTT').fill(url.replace('HAK_TEST', 'HAK_SECOND_DNTT'));
  await page.getByRole('button', { name: 'Lưu công ty' }).click();
  await page.waitForFunction(() => document.querySelector('#savedCompany').options.length === 3);
  await page.reload();
  const companies = page.locator('#savedCompany');
  await companies.selectOption({ label: 'Công ty Thử nghiệm' });
  assert.equal(await page.locator('#DiaChi').inputValue(), 'Đắk Lắk');
  assert.equal(await page.locator('#PhieuCan').inputValue(), url);
  await companies.selectOption({ label: 'Công ty thứ hai' });
  assert.equal(await page.locator('#PhieuCan').inputValue(), url.replace('HAK_TEST', 'HAK_SECOND_PC'));
  await page.locator('#requestCode').fill('12345678');
  const [secondKit] = await Promise.all([
    page.waitForEvent('download'), page.getByRole('button', { name: 'Tạo file cài đặt HAK' }).click()
  ]);
  const saved = JSON.parse(await readFile(await secondKit.path()));
  assert.equal(JSON.parse(Buffer.from(saved.body, 'base64')).company.TenCty, 'Công ty thứ hai');

  await page.getByText('Sao lưu danh sách công ty', { exact: true }).click();
  const [backup] = await Promise.all([
    page.waitForEvent('download'), page.getByRole('button', { name: 'Tải danh sách' }).click()
  ]);
  assert.equal(backup.suggestedFilename(), 'HAK-DanhSachCongTy.json');
  await other.getByText('Sao lưu danh sách công ty', { exact: true }).click();
  await other.locator('#importCompanies').setInputFiles(await backup.path());
  await other.locator('#savedCompany').selectOption({ label: 'Công ty thứ hai' });
  assert.equal(await other.locator('#DNTT').inputValue(), url.replace('HAK_TEST', 'HAK_SECOND_DNTT'));
  assert.equal(await calculate(other, request), response(nextSeed, request));
  console.log('PASS: offline two-code workflow, new build mapping, company profiles, backup transfer, configuration file and tamper detection.');
} finally {
  await browser.close();
  await rm(dir, { recursive: true, force: true });
}
