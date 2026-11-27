import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron } from 'playwright';
import { genDNTT, genHDNCC, genHosokeo, genPhieuCan, toCSV } from './fixtures.mjs';

const [legacy, candidate] = process.argv.slice(2);
assert(process.platform === 'win32' && legacy && candidate, 'Cần hai đường dẫn bộ cài Windows.');
const legacyHash = '0a01f0fac4613f9522fc221da255b2b989be29ba8375c4bc359ef7c53d508d05';
assert.equal(createHash('sha256').update(await readFile(legacy)).digest('hex'), legacyHash);

const dir = await mkdtemp(path.join(tmpdir(), 'hak-upgrade-'));
const installDir = path.join(dir, 'installed');
const profile = path.join(dir, 'profile');
const installerScript = fileURLToPath(new URL('../../desktop-app/tests/install-for-test.ps1', import.meta.url));
const company = 'HAK Windows QA';
const csvRows = genPhieuCan(3).map((row) => ({
  ...row, 'Ngày cân 1': '15/6/2026', 'Ngày cân 2': '15/6/2026',
  'Thành tiền': '1200000', 'KL hàng (KG)': '1000'
}));
const payments = genDNTT(csvRows, 2).map((row) => ({
  ...row, 'Ngày thanh toán': '16/6/2026', 'Thành tiền': '500000'
}));
const sources = { PhieuCan: csvRows, DNTT: payments, HDNCC: genHDNCC(payments), Hosokeo: genHosokeo(2) };
const sheets = Object.fromEntries(Object.entries(sources).map(([key, rows]) => [
  `https://docs.google.com/spreadsheets/d/e/hak-windows-qa-${key}/pub?output=csv`, toCSV(rows)
]));

function install(file) {
  execFileSync('powershell.exe', ['-NoProfile', '-File', installerScript, path.resolve(file), installDir],
    { stdio: 'inherit', timeout: 180_000 });
}

async function openInstalled(offline) {
  const names = (await readdir(installDir)).filter((name) => /\.exe$/i.test(name) && !/^uninstall/i.test(name));
  assert.equal(names.length, 1, 'Ứng dụng đã cài phải có đúng một file chạy chính.');
  const electron = await _electron.launch({
    executablePath: path.join(installDir, names[0]),
    args: ['--user-data-dir=' + profile, '--host-resolver-rules=MAP docs.google.com ~NOTFOUND'],
    timeout: 60_000
  });
  try {
    const page = await electron.firstWindow();
    page.setDefaultTimeout(30_000);
    await page.context().route('https://docs.google.com/**', (route) => {
      const body = sheets[route.request().url()];
      return offline || body === undefined ? route.abort('internetdisconnected')
        : route.fulfill({ status: 200, contentType: 'text/csv; charset=utf-8', body });
    });
    const appInfo = await electron.evaluate(({ app }) => ({ version: app.getVersion(), userData: app.getPath('userData') }));
    return { electron, page, appInfo };
  } catch (error) {
    await electron.close();
    throw error;
  }
}

async function waitForReport(page, offline) {
  await page.waitForFunction((cached) => {
    const text = document.querySelector('#statusText')?.textContent || '';
    return text.includes('Đã tải 3 phiếu cân') && text.includes('DỮ LIỆU OFFLINE') === cached
      && document.querySelector('#tbl-nhapkeo tfoot');
  }, offline, { timeout: 60_000 });
}

async function seedOldVersion(page) {
  await page.locator('#fTenCty').fill(company);
  await page.locator('#fMaHS').fill('4401220088');
  await page.locator('#fNhaMay').fill('HAK-QA');
  for (const [index, key] of Object.keys(sources).entries()) {
    await page.locator('#f' + key).fill(Object.keys(sheets)[index]);
  }
  await page.locator('#btnSave').click();
  await waitForReport(page, false);
  await page.locator('[data-target="nganhang"]').click();
  await page.locator('[data-rtab="khoanvay"]').click();
  await page.locator('#btnLoanAdd').click();
  await page.locator('#loan_ngayHachToan').fill('15/06/2026');
  await page.locator('#loan_tongTienVay').fill('200000000');
  await page.locator('#btnLoanSave').click();
  await page.waitForFunction(() => document.querySelector('#loanSummary').textContent.includes('1 khoản vay'));
  await page.locator('[data-rtab="tienvay"]').click();
  await page.locator('#tvOpening summary').click();
  await page.locator('#tvOpNgay').fill('01/06/2026');
  await page.locator('#tvOpTien').fill('3000000');
  await page.locator('#btnTvOpSave').click();
  await page.waitForFunction(() => document.querySelector('#tvOpCurrent').textContent.includes('3.000.000'));
}

async function snapshot(page) {
  await page.locator('#fFrom').fill('2026-06-01');
  await page.locator('#fTo').fill('2026-06-30');
  await page.locator('#btnLapBC').click();
  return page.evaluate(() => Object.fromEntries(['nhapkeo', 'congno', 'tienvay'].map((key) => [
    key, [...document.querySelectorAll(`#tbl-${key} tfoot td`)].map((cell) => cell.textContent.trim())
  ])));
}

async function saveBackup(electron, page, filename) {
  await page.locator('[data-target="cauhinh"]').click();
  await electron.evaluate(({ BrowserWindow }, destination) => {
    globalThis.hakBackupComplete = new Promise((resolve) => {
      BrowserWindow.getAllWindows()[0].webContents.session.prependOnceListener('will-download', (_event, item) => {
        item.setSavePath(destination);
        item.once('done', (_event, status) => resolve(status));
      });
    });
  }, filename);
  await page.locator('#btnBackupData').click();
  assert.equal(await electron.evaluate(() => Promise.race([
    globalThis.hakBackupComplete,
    new Promise((resolve) => {
      const timer = setTimeout(() => resolve('timeout'), 30_000);
      timer.unref();
    })
  ])), 'completed');
  return JSON.parse(await readFile(filename, 'utf8')).khoanVay;
}

console.log('Cài bộ cài 1.0.0 và tạo dữ liệu qua giao diện.');
install(legacy);
const old = await openInstalled(false);
const oldBackup = path.join(dir, 'old-backup.json');
let original;
try {
  assert.equal(old.appInfo.version, '1.0.0');
  await seedOldVersion(old.page);
  original = { totals: await snapshot(old.page), loans: await saveBackup(old.electron, old.page, oldBackup) };
  assert(original.totals.nhapkeo.includes('3.600.000'));
  assert(original.totals.tienvay.includes('200.000.000'));
  assert.equal(original.loans.rows.length, 1);
  assert.deepEqual(original.loans.soDuDauSo, { ngay: '2026-06-01', soTien: 3000000 });
} finally {
  await old.electron.close();
}

console.log('Cài đè cùng thư mục và mở 2.1.0 ở chế độ offline.');
install(candidate);
const upgraded = await openInstalled(true);
try {
  assert.equal(upgraded.appInfo.version, '2.1.0');
  assert.equal(upgraded.appInfo.userData, old.appInfo.userData);
  await upgraded.page.reload();
  await waitForReport(upgraded.page, true);
  assert.equal(await upgraded.page.locator('#btnPrecisionSettings').count(), 1, 'Phải dùng mẫu báo cáo mới.');
  const config = JSON.parse(await readFile(path.join(upgraded.appInfo.userData, 'company-config.json'), 'utf8'));
  assert.equal(config.TenCty, company);
  assert.equal(config.PhieuCan, Object.keys(sheets)[0]);
  assert.equal(config.MaHS, '4401220088');
  assert.equal(config.NhaMay, 'HAK-QA');
  assert.deepEqual(await snapshot(upgraded.page), original.totals);
  assert.deepEqual(await saveBackup(upgraded.electron, upgraded.page, path.join(dir, 'after-upgrade.json')), original.loans);
  // Xóa kho thử nghiệm tại renderer rồi khôi phục qua chính ô nhập bản sao cũ.
  await upgraded.electron.evaluate(async ({ BrowserWindow }) => {
    await BrowserWindow.getAllWindows()[0].webContents.session.clearStorageData({ storages: ['indexdb'] });
  });
} finally {
  await upgraded.electron.close();
}

console.log('Khôi phục bản sao 1.0.0 trên kho khoản vay trống.');
const restored = await openInstalled(false);
try {
  await restored.page.reload();
  await waitForReport(restored.page, false);
  await restored.page.locator('[data-target="nganhang"]').click();
  await restored.page.locator('[data-rtab="khoanvay"]').click();
  await restored.page.waitForFunction(() => document.querySelector('#loanSummary').textContent.includes('0 khoản vay'));
  await restored.page.locator('[data-target="cauhinh"]').click();
  await restored.page.locator('#btnRestoreDataInput').setInputFiles(oldBackup);
  await restored.page.waitForFunction(() => document.querySelector('#backupRestoreStatus').textContent.includes('Đã khôi phục'));
  const loanData = await saveBackup(restored.electron, restored.page, path.join(dir, 'after-restore.json'));
  assert.deepEqual(loanData.soDuDauSo, original.loans.soDuDauSo);
  const loanValues = (rows) => rows.map(({ ngayHachToan, ngayChungTu, tongTienVay }) => ({ ngayHachToan, ngayChungTu, tongTienVay }));
  assert.deepEqual(loanValues(loanData.rows), loanValues(original.loans.rows));
  assert.deepEqual(await snapshot(restored.page), original.totals);
} finally {
  await restored.electron.close();
}

console.log('PASS: NSIS 1.0.0 → 2.1.0, cấu hình, offline, TH_VAY, số dư, tổng báo cáo và khôi phục.');
