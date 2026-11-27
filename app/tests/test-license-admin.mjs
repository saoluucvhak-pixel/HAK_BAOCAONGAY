import assert from 'node:assert/strict';
import { createDecipheriv, createHmac, randomBytes } from 'node:crypto';
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
function decryptSetup(key, contents) {
  const envelope = JSON.parse(contents);
  assert.equal(envelope.format, 'haksetup-aes256-v1');
  const iv = Buffer.from(envelope.iv, 'base64');
  const ciphertext = Buffer.from(envelope.body, 'base64');
  assert.equal(envelope.signature, mac(key, 'setup-tag-v1', Buffer.concat([iv, ciphertext])).toString('base64'));
  const decipher = createDecipheriv('aes-256-cbc', mac(key, 'setup-encryption-v1', ''), iv);
  return JSON.parse(Buffer.concat([decipher.update(ciphertext), decipher.final()]));
}
async function openDecoder(name, key) {
  const file = path.join(dir, name + '.html');
  await writeFile(file, template.replace('__HAK_BUILD_SEED__', key.toString('base64')));
  const page = await context.newPage();
  await page.goto(pathToFileURL(file).href);
  return page;
}
async function downloadSetup(page, requestCode) {
  await page.locator('#requestCode').fill(requestCode);
  const [file] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Tạo mã và file HAK' }).click()
  ]);
  assert.equal(file.suggestedFilename(), 'HAK-CaiDat.haksetup');
  return readFile(await file.path());
}

try {
  const page = await openDecoder('first', seed);
  const issue = page.getByRole('button', { name: 'Tạo mã và file HAK' });
  await page.locator('#requestCode').fill('123');
  await issue.click();
  await page.waitForFunction(() => document.querySelector('#issueStatus').classList.contains('error'));
  assert.equal(await page.locator('#replyCode').isVisible(), false);

  await page.getByRole('button', { name: 'Thêm công ty' }).click();
  const url = 'https://docs.google.com/spreadsheets/d/e/HAK_TEST/pub?output=csv';
  await page.locator('#TenCty').fill('Công ty Thử nghiệm');
  await page.locator('#DiaChi').fill('Đắk Lắk');
  await page.locator('#PhieuCan').fill(url);
  await page.locator('#DNTT').fill(url);
  const file = await downloadSetup(page, request);
  assert.equal(await page.locator('#replyCode').inputValue(), response(seed, request));
  const kit = decryptSetup(seed, file);
  assert.equal(kit.device, request);
  assert.equal(kit.company.TenCty, 'Công ty Thử nghiệm');
  assert.equal(kit.company.DiaChi, 'Đắk Lắk');
  assert.equal(kit.company.PhieuCan, url);
  assert(kit.expiresAt > kit.issuedAt);
  assert(!file.includes(Buffer.from(url)));
  assert(!file.includes(Buffer.from('Công ty Thử nghiệm')));
  const repeated = await downloadSetup(page, request);
  assert.notEqual(JSON.parse(repeated).iv, JSON.parse(file).iv);

  await page.getByText('Dùng lại cấu hình khi cài lại', { exact: true }).click();
  await page.locator('#DiaChi').fill('');
  const envelope = JSON.parse(file);
  const altered = Buffer.from(envelope.body, 'base64');
  altered[0] ^= 1;
  await page.locator('#previousSetup').setInputFiles({
    name: 'HAK-CaiDat.haksetup', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ ...envelope, body: altered.toString('base64') }))
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
  const second = decryptSetup(seed, await downloadSetup(page, '12345678'));
  assert.equal(second.company.TenCty, 'Công ty thứ hai');
  assert.equal(second.company.DNTT, url.replace('HAK_TEST', 'HAK_SECOND_DNTT'));

  await page.getByText('Sao lưu danh sách công ty', { exact: true }).click();
  const [backup] = await Promise.all([
    page.waitForEvent('download'), page.getByRole('button', { name: 'Tải danh sách' }).click()
  ]);
  assert.equal(backup.suggestedFilename(), 'HAK-DanhSachCongTy.json');
  const nextSeed = randomBytes(32);
  const other = await openDecoder('upgrade', nextSeed);
  await other.getByText('Sao lưu danh sách công ty', { exact: true }).click();
  await other.locator('#importCompanies').setInputFiles(await backup.path());
  await other.locator('#savedCompany').selectOption({ label: 'Công ty thứ hai' });
  assert.equal(await other.locator('#DNTT').inputValue(), url.replace('HAK_TEST', 'HAK_SECOND_DNTT'));
  const upgraded = await downloadSetup(other, request);
  assert.equal(await other.locator('#replyCode').inputValue(), response(nextSeed, request));
  assert.notEqual(response(nextSeed, request), response(seed, request));
  assert.throws(() => decryptSetup(seed, upgraded));
  console.log('PASS: paired offline code and encrypted profile, tamper detection, multiple companies and backup transfer.');
} finally {
  await browser.close();
  await rm(dir, { recursive: true, force: true });
}
