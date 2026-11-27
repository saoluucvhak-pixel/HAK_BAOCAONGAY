import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readdir, readFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron } from 'playwright';
import { genDNTT, genHDNCC, genHosokeo, genPhieuCan, toCSV } from './fixtures.mjs';

const [legacy, candidate] = process.argv.slice(2);
const { version: expectedVersion } = JSON.parse(await readFile(new URL('../../desktop-app/package.json', import.meta.url), 'utf8'));
assert(process.env.GITHUB_ACTIONS === 'true' && process.platform === 'win32' && legacy && candidate,
  'Chạy trên runner Windows tạm thời với hai đường dẫn bộ cài.');
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

function install(file, expected = 0) {
  const run = () => spawnSync('powershell.exe', ['-NoProfile', '-File', installerScript, path.resolve(file), installDir],
    { stdio: 'inherit', timeout: 180_000 });
  const result = run();
  if (file === legacy && (result.status >>> 0) === 0xc0000005) return false;
  if (result.error) throw result.error;
  assert.equal(result.status, expected, 'NSIS exit code for ' + path.basename(file));
  return true;
}

// NSIS 1.0.0 sometimes crashes on the current hosted Windows image. Its verified payload
// still provides the original app binary and data format for testing the new installer.
async function extractLegacy() {
  console.warn('Legacy NSIS crashed; using its verified application archive to seed the old profile.');
  const sevenZip = path.join(process.env.ProgramFiles, '7-Zip', '7z.exe');
  const payloadDir = path.join(dir, 'legacy-nsis');
  await mkdir(payloadDir);
  function extract(archive, output) {
    const result = spawnSync(sevenZip, ['x', '-y', '-o' + output, archive], { encoding: 'utf8', timeout: 120_000 });
    if (result.error) throw result.error;
    assert.equal(result.status, 0, result.stderr || result.stdout);
  }
  extract(legacy, payloadDir);
  const bundles = (await readdir(payloadDir, { recursive: true })).filter((file) => /app-64\.7z$/i.test(file));
  assert.equal(bundles.length, 1, 'Không tìm thấy gói ứng dụng x64 trong NSIS 1.0.0.');
  extract(path.join(payloadDir, bundles[0]), installDir);
}

async function installedExecutable() {
  const names = (await readdir(installDir)).filter((name) => /\.exe$/i.test(name) && !/^(uninstall|hak-license\.exe)/i.test(name));
  assert.equal(names.length, 1, 'Ứng dụng đã cài phải có đúng một file chạy chính.');
  return path.join(installDir, names[0]);
}

function verifyRun(executable, expected) {
  const result = spawnSync(executable, ['--hak-check-license'], {
    windowsHide: true, timeout: 60_000, encoding: 'utf8'
  });
  if (result.error) throw result.error;
  assert.equal(result.status, expected, 'Electron license verification: ' + (result.stderr || result.stdout));
}

async function openInstalled(offline, userProfile = profile) {
  const electron = await _electron.launch({
    executablePath: await installedExecutable(),
    args: ['--user-data-dir=' + userProfile, '--host-resolver-rules=MAP docs.google.com ~NOTFOUND'],
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
if (!install(legacy)) await extractLegacy();
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

const licenses = process.env.HAK_QA_LICENSE_DIR;
assert(licenses, 'Thiếu bộ fixture cấp phép.');
const besideKit = path.join(path.dirname(candidate), 'HAK-CaiDat.haksetup');
const besideCode = path.join(path.dirname(candidate), 'HAK-PhanHoi.txt');
const prepare = fileURLToPath(new URL('../../desktop-app/tests/prepare-license-fixtures.mjs', import.meta.url));
const requestFile = path.join(licenses, 'device.hakreq');
async function stageApproval() {
  const result = spawnSync(process.execPath, [prepare], { stdio: 'inherit', timeout: 60_000 });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, 'Tạo yêu cầu ngẫu nhiên cho lần cài thử.');
  await copyFile(path.join(licenses, 'approved-response.txt'), besideCode);
}

console.log('Từ chối cài khi thiếu phản hồi hoặc phản hồi lỗi.');
install(candidate, 31);
await stageApproval();
install(candidate, 31); // A correct reply without an encrypted file is insufficient.
await stageApproval();
await copyFile(path.join(licenses, 'approved.haksetup'), besideKit);
await unlink(besideCode);
install(candidate, 31); // A correct file without the reply is insufficient.
for (const kind of ['wrong-device', 'tampered', 'expired']) {
  await stageApproval();
  await copyFile(path.join(licenses, kind + '.haklic'), besideKit);
  install(candidate, 31);
}

console.log('Cài đè cùng thư mục và mở báo cáo ở chế độ offline.');
await stageApproval();
const previousRequest = JSON.parse(await readFile(requestFile, 'utf8')).device;
await copyFile(path.join(licenses, 'approved-upgrade.haksetup'), besideKit);
install(candidate);
install(candidate, 31);
await stageApproval();
assert.notEqual(JSON.parse(await readFile(requestFile, 'utf8')).device, previousRequest);
install(candidate, 31); // The previous approval fails for the new request on the same machine.
const registeredExe = await installedExecutable();
verifyRun(registeredExe, 0);
const upgraded = await openInstalled(true);
try {
  assert.equal(upgraded.appInfo.version, expectedVersion);
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

const licensePath = path.join(process.env.LOCALAPPDATA, 'HAK', 'BaoCaoNgay', 'license.haklic');
verifyRun(registeredExe, 0);
await unlink(licensePath);
verifyRun(registeredExe, 31);
await stageApproval();
await copyFile(path.join(licenses, 'tampered.haksetup'), besideKit);
install(candidate, 31);
await stageApproval();
await copyFile(path.join(licenses, 'approved.haksetup'), besideKit);
install(candidate);
verifyRun(await installedExecutable(), 0);
await stageApproval();
install(candidate, 31); // A previously accepted company file also fails for the next installation.
const configured = await openInstalled(false, path.join(dir, 'company-file-profile'));
try {
  const config = JSON.parse(await readFile(path.join(configured.appInfo.userData, 'company-config.json'), 'utf8'));
  assert.equal(config.TenCty, 'Công ty HAK QA');
  assert.equal(config.DiaChi, 'Đắk Lắk');
  assert.equal(config.PhieuCan, Object.keys(sheets)[0]);
  assert.equal(config.DNTT, Object.keys(sheets)[1]);
  assert.equal(config.HDNCC, '');
  assert(configured.page.url().endsWith('/report.html'));
  await configured.page.locator('[data-target="cauhinh"]').click();
  await configured.page.getByRole('tab', { name: 'Thông tin công ty' }).click();
  const companyTab = configured.page.getByRole('tabpanel', { name: 'Thông tin công ty' });
  assert.match(await companyTab.innerText(), /Công ty HAK QA/);
  assert.doesNotMatch(await companyTab.innerText(), /docs\.google\.com/);
  assert.equal(await companyTab.locator('input, select, textarea').count(), 0);
} finally {
  await configured.electron.close();
}
console.log('PASS: NSIS từ chối phản hồi cũ cùng máy, nạp cấu hình đã ký, nâng cấp và khôi phục dữ liệu.');
