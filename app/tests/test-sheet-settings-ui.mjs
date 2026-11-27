import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { launchChromium } from './browser-launcher.mjs';

const dir = await mkdtemp(path.join(tmpdir(), 'hak-company-settings-'));
const browser = await launchChromium();
try {
  const company = {
    _hakCompanyProfile: true, TenCty: 'CÔNG TY TEST', DiaChi: 'Đắk Lắk', MST: '1234567890',
    PhieuCan: 'https://docs.google.com/spreadsheets/d/e/PRIVATE_PC/pub?output=csv',
    DNTT: 'https://docs.google.com/spreadsheets/d/e/PRIVATE_DN/pub?output=csv'
  };
  const file = path.join(dir, 'report.html');
  const template = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');
  await writeFile(file, template.replace(
    '<script id="hak-company-config" type="application/json">{}</script>',
    () => '<script id="hak-company-config" type="application/json">' + JSON.stringify(company) + '</script>'
  ));
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    window.__opened = 0;
    window.api = { openConfig: async () => { window.__opened++; return { ok: true, canceled: true }; } };
    window.fetch = async (url) => { throw new Error('Failed to fetch ' + url); };
    window.__bcFetchTimeoutMs = 200;
  });
  await page.goto(pathToFileURL(file).href);
  await page.locator('[data-target="cauhinh"]').click();
  await page.getByRole('tab', { name: 'Thông tin công ty' }).click();
  const panel = page.getByRole('tabpanel', { name: 'Thông tin công ty' });
  assert.match(await panel.innerText(), /CÔNG TY TEST/);
  assert.match(await panel.innerText(), /Đắk Lắk/);
  assert.equal(await panel.locator('input, textarea, select, [contenteditable], a').count(), 0);
  await page.getByRole('button', { name: 'Đổi cấu hình công ty…' }).click();
  await page.waitForFunction(() => window.__opened === 1);
  await page.waitForFunction(() => document.querySelector('#statusText').textContent.includes('Lỗi tải dữ liệu'));
  assert.doesNotMatch(await page.locator('body').innerText(), /PRIVATE_PC|PRIVATE_DN|docs\.google\.com/);
  assert.doesNotMatch(await page.locator('#statusText').getAttribute('title'), /docs\.google\.com/);
  assert.deepEqual(errors, []);
  console.log('PASS: read-only company tab, hidden Sheets addresses, approved import action.');
} finally {
  await browser.close();
  await rm(dir, { recursive: true, force: true });
}
