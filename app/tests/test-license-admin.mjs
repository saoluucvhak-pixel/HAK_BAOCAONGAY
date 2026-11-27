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
  await page.locator('#requestFile').setInputFiles({
    name: 'HAK-YeuCau.hakreq', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(request))
  });
  await page.locator('#privateFile').setInputFiles({
    name: privateKey.filename, mimeType: 'application/json', buffer: privateKey.buffer
  });
  await page.locator('#asset').fill('HAK-KT-023');
  await page.locator('#expiry').fill(new Date(Date.now() + 86400000).toISOString().slice(0, 10));
  await page.locator('#issuePassword').fill('deliberately-wrong-password');
  await page.getByRole('button', { name: 'Ký và tải giấy phép' }).click();
  await page.waitForFunction(() => document.querySelector('#issueStatus').textContent.includes('Sai mật khẩu'));

  await page.locator('#issuePassword').fill(password);
  const downloaded = await readDownload('Ký và tải giấy phép');
  assert.equal(downloaded.filename, 'HAK-GiayPhep.haklic');
  const envelope = JSON.parse(downloaded.buffer.toString());
  const payload = Buffer.from(envelope.body, 'base64');
  assert.equal(JSON.parse(payload.toString()).device, request.device);
  assert(verify('sha256', payload, createPublicKey({ key: jwk, format: 'jwk' }), Buffer.from(envelope.signature, 'base64')));
  console.log('PASS: offline enrollment admin, encrypted private key and verifiable machine license.');
} finally {
  await browser.close();
}
