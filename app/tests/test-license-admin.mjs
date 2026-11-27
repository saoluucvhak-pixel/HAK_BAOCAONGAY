import assert from 'node:assert/strict';
import { createCipheriv, generateKeyPairSync, pbkdf2Sync, randomBytes, verify } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { launchChromium } from './browser-launcher.mjs';
import { newRequest, openCompany } from '../../desktop-app/tests/ed25519-fixtures.mjs';

const source = new URL('../../desktop-app/licensing/HAK-CapPhep.html', import.meta.url);
const html = await readFile(source, 'utf8');
const officialJwk = JSON.parse(await readFile(new URL('HAK-PublicKey.jwk', source), 'utf8'));
const issuerMeta = /(<meta name="hak-issuer-key" content=")([A-Za-z0-9_-]{43})(">)/;
assert.equal(html.match(issuerMeta)?.[2], officialJwk.x);
const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const jwk = publicKey.export({ format: 'jwk' });
const password = randomBytes(16).toString('hex');
const url = 'https://docs.google.com/spreadsheets/d/e/HAK_TEST/pub?output=csv';
function makeBackup() {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', pbkdf2Sync(password, salt, 600000, 32, 'sha256'), iv);
  cipher.setAAD(Buffer.from(jwk.x));
  const encrypted = Buffer.concat([cipher.update(privateKey.export({ format: 'der', type: 'pkcs8' })), cipher.final(), cipher.getAuthTag()]);
  return Buffer.from(JSON.stringify({
    format: 'hak-ed25519-issuer-v1', publicKey: jwk,
    salt: salt.toString('base64url'), iv: iv.toString('base64url'), encrypted: encrypted.toString('base64url')
  }));
}
const backup = makeBackup();

async function selectBackup(page, pass) {
  await page.locator('#restoreIssuer').setInputFiles({
    name: 'HAK-KhoaChung.hakkey', mimeType: 'application/json', buffer: backup
  });
  await page.locator('#restoreIssuerPassword').fill(pass);
  await page.getByRole('button', { name: 'Khôi phục khóa' }).click();
}

async function download(page, name, expected) {
  const [file] = await Promise.all([
    page.waitForEvent('download'), page.getByRole('button', { name, exact: true }).click()
  ]);
  assert.equal(file.suggestedFilename(), expected);
  return readFile(await file.path());
}
async function issue(page, request, publicKey) {
  await page.locator('#requestCode').fill(request.wire);
  await page.getByRole('button', { name: 'Tạo mã và file HAK' }).click();
  const file = await download(page, 'Tải file .haksetup', 'HAK-CaiDat.haksetup');
  const code = await page.locator('#replyCode').inputValue();
  assert.match(code, /^HAKA4\.[A-Za-z0-9_-]{86}$/);
  assert(verify(null, Buffer.from('hak-unlock-v4\n' + request.wire), publicKey, Buffer.from(code.slice(6), 'base64url')));
  return file;
}

const browser = await launchChromium();
const temp = await mkdtemp(path.join(tmpdir(), 'hak-license-admin-'));
try {
  const localHtml = path.join(temp, 'HAK-CapPhep.html');
  await writeFile(localHtml, html.replace(issuerMeta, (_, start, __, end) => start + jwk.x + end));
  const location = pathToFileURL(localHtml).href;
  const context = await browser.newContext({ offline: true, acceptDownloads: true });
  const official = await context.newPage();
  await official.goto(source.href);
  assert(await official.locator('#issueButton').isDisabled());
  await official.locator('#issuerDetails > summary').click();
  await selectBackup(official, password);
  await official.waitForFunction(() => document.querySelector('#restoreStatus').textContent.includes('không khớp'));
  assert(await official.locator('#issueButton').isDisabled());
  assert(!(await official.locator('#replyPanel').isVisible()));
  await official.close();

  const page = await context.newPage();
  await page.goto(location);
  const guide = page.locator('#issuerGuide');
  await guide.locator('summary').click();
  assert(await guide.getByRole('heading', { name: 'Cấp phép cho từng lần cài' }).isVisible());
  await page.locator('#integrationGuide > summary').click();
  assert((await page.getByRole('link', { name: 'Tải HAK-PublicKey.jwk chính thức' }).getAttribute('href')).includes('installer-v2.6.0-16.1'));
  assert(await page.getByRole('link', { name: 'Xem mã giao thức v4' }).isVisible());
  await page.locator('#issuerDetails > summary').click();
  await selectBackup(page, password);
  await page.waitForFunction(() => document.querySelector('#issuerStatus').textContent.includes('đã mở'));
  const downloadedBackup = await download(page, 'Tải bản sao khóa đã mã hóa', 'HAK-KhoaChung.hakkey');
  assert.deepEqual(JSON.parse(downloadedBackup), JSON.parse(backup));
  const downloadedJwk = JSON.parse(await download(page, 'Tải khóa công khai để đóng bộ cài', 'HAK-PublicKey.jwk'));
  assert.deepEqual(downloadedJwk, jwk);
  const recipient = newRequest();

  await page.locator('#requestCode').fill(recipient.wire);
  assert.match(await page.locator('#requestSummary').textContent(), /^Báo cáo ngày · Mã app com\.hakgroup\.baocaongay/);
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
  await page.locator('#requestCode').fill(newRequest().wire);
  assert(!(await page.locator('#copyReply').isVisible()));
  assert(!(await page.locator('#downloadSetup').isVisible()));
  assert.equal(await page.locator('#replyCode').inputValue(), '');
  await page.locator('summary').filter({ hasText: /^Sao lưu danh sách công ty$/ }).click();
  const profiles = await download(page, 'Tải danh sách', 'HAK-DanhSachCongTy.json');

  // Restore the single HAK key and the company list in a fresh offline browser.
  const recovered = await (await browser.newContext({ offline: true, acceptDownloads: true })).newPage();
  await recovered.goto(location);
  await recovered.locator('#issuerDetails > summary').click();
  await selectBackup(recovered, 'wrong-password');
  await recovered.waitForFunction(() => document.querySelector('#restoreStatus').textContent.includes('Sai mật khẩu'));
  await selectBackup(recovered, password);
  await recovered.waitForFunction(() => document.querySelector('#issuerStatus').textContent.includes('đã mở'));
  await recovered.locator('summary').filter({ hasText: /^Sao lưu danh sách công ty$/ }).click();
  await recovered.locator('#importCompanies').setInputFiles({
    name: 'HAK-DanhSachCongTy.json', mimeType: 'application/json', buffer: profiles
  });
  const anotherReport = newRequest();
  await recovered.locator('#requestCode').fill(anotherReport.wire);
  await recovered.locator('#savedCompany').selectOption({ label: 'Công ty thứ hai' });
  const restoredProfile = await issue(recovered, anotherReport, publicKey);
  assert.equal(openCompany(restoredProfile, publicKey, anotherReport).TenCty, 'Công ty thứ hai');
  const anotherApp = newRequest('com.hakgroup.quan-ly-kho');
  const newFile = await issue(recovered, anotherApp, publicKey);
  assert.match(await recovered.locator('#requestSummary').textContent(), /Ứng dụng chưa có tên hiển thị · Mã app com\.hakgroup\.quan-ly-kho/);
  assert(!(await recovered.locator('#companyChooser').isVisible()));
  assert.deepEqual(openCompany(newFile, publicKey, anotherApp), {});
  assert.throws(() => openCompany(newFile, publicKey, recipient), /Wrong recipient/);
  console.log('PASS: one offline issuer, encrypted key recovery, multiple apps and device-specific encrypted profiles.');
} finally {
  await browser.close();
  await rm(temp, { recursive: true, force: true });
}
