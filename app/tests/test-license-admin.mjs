import assert from 'node:assert/strict';
import { createPublicKey, randomBytes, verify } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { launchChromium } from './browser-launcher.mjs';

const tool = new URL('../../desktop-app/licensing/HAK-CapPhep.html', import.meta.url);
const browser = await launchChromium();
const context = await browser.newContext({ offline: true, acceptDownloads: true });
try {
  const page = await context.newPage();
  await page.goto(tool.href);
  const password = randomBytes(24).toString('hex');
  await page.locator('#newPassword').fill(password);
  await page.locator('#repeatPassword').fill(password);
  await page.getByRole('button', { name: 'Tạo khóa' }).click();
  async function readDownload(button) {
    const [file] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: button }).click()]);
    return { filename: file.suggestedFilename(), buffer: await readFile(await file.path()) };
  }
  const publicKey = await readDownload('Tải public.jwk');
  const privateKey = await readDownload('Tải khóa riêng đã mã hóa');
  const jwk = JSON.parse(publicKey.buffer.toString());
  const stored = JSON.parse(privateKey.buffer.toString());
  assert.equal(publicKey.filename, 'public.jwk');
  assert(!Object.hasOwn(jwk, 'd'));
  assert.equal(stored.format, 'hak-issuer-key-v1');
  assert(!privateKey.buffer.includes(password));

  const request = {
    product: 'com.hakgroup.baocaongay',
    provider: 'Microsoft Platform Crypto Provider',
    device: randomBytes(32).toString('base64')
  };
  await page.getByText('Cấp bằng file cho bộ cài cũ', { exact: true }).click();
  await page.locator('#requestFile').setInputFiles({
    name: 'HAK-YeuCau.hakreq', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(request))
  });
  await page.locator('#privateFile').setInputFiles({
    name: privateKey.filename, mimeType: 'application/json', buffer: privateKey.buffer
  });
  await page.locator('#asset').fill('HAK-KT-023');
  await page.locator('#expiry').fill(new Date(Date.now() + 86400000).toISOString().slice(0, 10));
  await page.locator('#issuePassword').fill('deliberately-wrong-password');
  await page.getByRole('button', { name: 'Tạo mã trả lời' }).click();
  await page.waitForFunction(() => document.querySelector('#issueStatus').textContent.includes('Sai mật khẩu'));

  await page.locator('#issuePassword').fill(password);
  const downloaded = await readDownload('Tạo mã trả lời');
  assert.equal(downloaded.filename, 'HAK-GiayPhep.haklic');
  const envelope = JSON.parse(downloaded.buffer.toString());
  const payload = Buffer.from(envelope.body, 'base64');
  assert.equal(JSON.parse(payload.toString()).device, request.device);
  assert(verify('sha256', payload, createPublicKey({ key: jwk, format: 'jwk' }), Buffer.from(envelope.signature, 'base64')));
  const codeInput = page.locator('#requestCode');
  const reply = page.locator('#replyCode');
  const device = randomBytes(32);
  const requestCode = 'HAK-R1.' + device.toString('base64url');

  await codeInput.fill('HAK-R1.too-short');
  await page.getByRole('button', { name: 'Tạo mã trả lời' }).click();
  await page.waitForFunction(() => document.querySelector('#issueStatus').classList.contains('error'));
  assert(!(await reply.isVisible()));

  await codeInput.fill(requestCode.slice(0, 20) + ' ' + requestCode.slice(20));
  await page.getByRole('button', { name: 'Tạo mã trả lời' }).click();
  await reply.waitFor({ state: 'visible' });
  const [prefix, encoded, proof] = (await reply.inputValue()).split('.');
  assert.equal(prefix, 'HAK-A1');
  const parsed = Buffer.from(encoded, 'base64url');
  assert.equal(parsed.length, 48);
  assert.equal(parsed.subarray(16).toString('hex'), device.toString('hex'));
  assert(parsed.readBigInt64LE(8) > parsed.readBigInt64LE(0));
  const issuer = createPublicKey({ key: jwk, format: 'jwk' });
  const check = (token) => verify('sha256', Buffer.from(request.product + '\nHAK-A1.' + token), issuer, Buffer.from(proof, 'base64url'));
  assert(check(encoded));
  parsed[16] ^= 1;
  assert(!check(parsed.toString('base64url')));

  await page.getByText('Thông tin công ty và nguồn Google Sheets', { exact: true }).click();
  const sheet = 'https://docs.google.com/spreadsheets/d/e/HAK_TEST/pub?gid=0&output=csv';
  await page.locator('#TenCty').fill('Công ty Cổ phần Thử nghiệm');
  await page.locator('#DiaChi').fill('Đắk Lắk');
  await page.locator('#PhieuCan').fill('https://docs.google.com/spreadsheets/d/HAK_TEST/edit');
  await page.locator('#DNTT').fill(sheet);
  await page.getByRole('button', { name: 'Tạo file cài đặt HAK' }).click();
  await page.waitForFunction(() => document.querySelector('#issueStatus').textContent.includes('đã xuất CSV'));

  await page.locator('#PhieuCan').fill(sheet);
  const kitFile = await readDownload('Tạo file cài đặt HAK');
  assert.equal(kitFile.filename, 'HAK-CaiDat.haksetup');
  const kit = JSON.parse(kitFile.buffer.toString());
  const body = Buffer.from(kit.body, 'base64');
  const signature = Buffer.from(kit.signature, 'base64');
  const parsedKit = JSON.parse(body.toString());
  assert.equal(parsedKit.product, request.product);
  assert.equal(parsedKit.device, device.toString('base64'));
  assert(parsedKit.expiresAt > parsedKit.issuedAt);
  assert.equal(parsedKit.company.TenCty, 'Công ty Cổ phần Thử nghiệm');
  assert.equal(parsedKit.company.DiaChi, 'Đắk Lắk');
  assert.equal(parsedKit.company.PhieuCan, sheet);
  assert.equal(parsedKit.company.DNTT, sheet);
  assert.equal(parsedKit.company.HDNCC, '');
  assert(verify('sha256', body, issuer, signature));
  const malformed = { ...parsedKit, company: { ...parsedKit.company, PhieuCan: sheet.replace('HAK_TEST', 'TAMPERED') } };
  const changedBody = Buffer.from(JSON.stringify(malformed));
  assert(!verify('sha256', changedBody, issuer, signature));
  assert(!kitFile.buffer.includes(password));

  // Reissue in a fresh offline session after the old license has expired.
  const nextDate = (parsedKit.expiresAt + 3600) * 1000;
  await page.clock.setFixedTime(new Date(nextDate));
  await page.reload();
  await page.getByText('Cấp lại sau khi cài Windows', { exact: true }).click();
  await page.locator('#privateFile').setInputFiles({
    name: privateKey.filename, mimeType: 'application/json', buffer: privateKey.buffer
  });
  await page.locator('#issuePassword').fill(password);
  const previous = page.locator('#previousSetup');
  const restore = page.getByRole('button', { name: 'Nạp cấu hình từ file cũ' });
  await previous.setInputFiles({
    name: kitFile.filename, mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ ...kit, body: changedBody.toString('base64') }))
  });
  await restore.click();
  await page.waitForFunction(() => document.querySelector('#issueStatus').textContent.includes('Chữ ký file cũ không khớp'));
  assert.equal(await page.locator('#PhieuCan').inputValue(), '');

  await previous.setInputFiles({ name: kitFile.filename, mimeType: 'application/json', buffer: kitFile.buffer });
  await restore.click();
  await page.waitForFunction(() => document.querySelector('#issueStatus').textContent.includes('Đã nạp cấu hình cũ'));
  assert(await page.locator('#TenCty').isVisible());
  assert.equal(await page.locator('#TenCty').inputValue(), parsedKit.company.TenCty);
  assert.equal(await page.locator('#PhieuCan').inputValue(), sheet);
  assert.equal(await reply.isVisible(), false);

  await page.getByRole('button', { name: 'Tạo file cài đặt HAK' }).click();
  await page.waitForFunction(() => document.querySelector('#issueStatus').textContent.includes('Dán mã yêu cầu'));
  const replacementDevice = randomBytes(32);
  await codeInput.fill('HAK-R1.' + replacementDevice.toString('base64url'));
  const replacementFile = await readDownload('Tạo file cài đặt HAK');
  const replacement = JSON.parse(replacementFile.buffer);
  const replacementBody = Buffer.from(replacement.body, 'base64');
  const data = JSON.parse(replacementBody);
  assert.equal(data.device, replacementDevice.toString('base64'));
  assert.notEqual(data.device, parsedKit.device);
  assert.deepEqual(data.company, parsedKit.company);
  assert(data.issuedAt > parsedKit.expiresAt);
  assert(data.expiresAt > data.issuedAt);
  assert(verify('sha256', replacementBody, issuer, Buffer.from(replacement.signature, 'base64')));

  console.log('PASS: offline issuance, legacy activation, tamper detection and reissue after reinstall from an expired setup file.');
} finally {
  await browser.close();
}
