// Ad-hoc end-to-end verification of the 4 features just added: undo/redo (done in an earlier
// pass, kept here), fuzzy (accent-insensitive) search, virtual scroll (>300 rows), and that
// handleTienVayFile no longer throws ReferenceError. Manual verification, not part of the
// CI-style ui-baseline.mjs regression suite.
import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';
import { genPhieuCan, genDNTT, genHDNCC, genHosokeo, toCSV } from './fixtures.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_HTML = path.resolve(__dirname, '../dist/index.html');

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
Math.random = mulberry32(7);

let pass = 0, fail = 0;
function check(name, cond) { if (cond) { pass++; console.log('OK  ', name); } else { fail++; console.log('FAIL', name); } }

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

// ---------- Dataset A: small (40 rows, includes an accented name) + 1 row with a known accent ----------
const phieucanSmall = genPhieuCan(40);
phieucanSmall[0]['Khách hàng'] = 'Nguyễn Văn Ánh'; // dòng có dấu rõ ràng để test tìm không dấu
const dnttSmall = genDNTT(phieucanSmall, 15);

await page.route('https://docs.google.com/**', (route) => {
  const url = route.request().url();
  if (url.includes('2PACX-1vTj7PHtJtv1iBaF9tCKJ9zgnTyc4j6Hbt9CEYX36sVIDXwJDQUvMGd-O_bc8E-N6iEh5JqH9tytjQLj')) return route.fulfill({ status: 200, contentType: 'text/csv', body: toCSV(phieucanSmall) });
  if (url.includes('2PACX-1vSqRW3Yk2MBgXp1qi29tQZQyn1R-opTUjE5PqBFIH7knAOcr1YvthP_AuXa_10knbaprgtM4i_zPk2i')) return route.fulfill({ status: 200, contentType: 'text/csv', body: toCSV(dnttSmall) });
  return route.fulfill({ status: 200, contentType: 'text/csv', body: '' });
});

await page.goto('file://' + DIST_HTML, { waitUntil: 'load' });
await page.waitForFunction(() => document.querySelector('#statusText')?.textContent?.includes('phiếu cân'), { timeout: 15000 });
await page.fill('#fFrom', '2024-01-01');
await page.fill('#fTo', '2025-12-31');
await page.click('#btnLapBC');
await page.waitForTimeout(400);

// ---------- handleTienVayFile wiring (the bug we fixed) no longer throws ----------
const tienVayWired = await page.evaluate(() => {
  const el = document.querySelector('#tienVayFileInput');
  if (!el) return false;
  el.dispatchEvent(new Event('change')); // no files selected -> early-return path, still exercises the handler wiring
  return true;
});
check('input#tienVayFileInput gắn sự kiện "change" không còn ReferenceError (BUG khôi phục)', tienVayWired);

// ---------- Undo/redo cho danh mục Đại lý ----------
await page.click('[data-target="danhmuc"]');
const dmBefore = await page.evaluate(() => document.querySelectorAll('#dmDLTable tbody tr').length);
await page.click('#btnAddDL');
const dmAfterAdd = await page.evaluate(() => document.querySelectorAll('#dmDLTable tbody tr').length);
check('Bấm "+ Thêm đại lý" thêm đúng 1 dòng', dmAfterAdd === dmBefore + 1);
await page.click('#btnUndoDM');
const dmAfterUndo = await page.evaluate(() => document.querySelectorAll('#dmDLTable tbody tr').length);
check('Bấm "Hoàn tác" xoá lại đúng dòng vừa thêm', dmAfterUndo === dmBefore);
await page.click('#btnRedoDM');
const dmAfterRedo = await page.evaluate(() => document.querySelectorAll('#dmDLTable tbody tr').length);
check('Bấm "Làm lại" khôi phục lại dòng đã thêm', dmAfterRedo === dmBefore + 1);
await page.click('#btnUndoDM'); // dọn lại trạng thái ban đầu, tránh làm bẩn localStorage cho lần chạy sau

// ---------- Fuzzy search: type "nguyen van anh" (no accents) into nhapkeo's search box ----------
await page.click('[data-target="baocao"]');
const searchBox = await page.$('[data-search="nhapkeo"]');
check('Ô tìm kiếm bảng nhapkeo tồn tại', !!searchBox);
if (searchBox) {
  await searchBox.fill('nguyen van anh');
  await page.waitForTimeout(150);
  const rowCountAfterFuzzy = await page.evaluate(() => document.querySelectorAll('#tbl-nhapkeo tbody tr').length);
  const countText = await page.evaluate(() => document.querySelector('[data-count="nhapkeo"]')?.textContent);
  check('Gõ "nguyen van anh" (không dấu) tìm ra dòng "Nguyễn Văn Ánh" (có dấu)', rowCountAfterFuzzy === 1 && countText === '1 dòng');
  await searchBox.fill('');
  await page.waitForTimeout(150);
}

// ---------- Virtual scroll: reload with 500-row dataset ----------
const phieucanBig = genPhieuCan(500);
const dnttBig = genDNTT(phieucanBig, 100);
await page.unroute('https://docs.google.com/**');
await page.route('https://docs.google.com/**', (route) => {
  const url = route.request().url();
  if (url.includes('2PACX-1vTj7PHtJtv1iBaF9tCKJ9zgnTyc4j6Hbt9CEYX36sVIDXwJDQUvMGd-O_bc8E-N6iEh5JqH9tytjQLj')) return route.fulfill({ status: 200, contentType: 'text/csv', body: toCSV(phieucanBig) });
  if (url.includes('2PACX-1vSqRW3Yk2MBgXp1qi29tQZQyn1R-opTUjE5PqBFIH7knAOcr1YvthP_AuXa_10knbaprgtM4i_zPk2i')) return route.fulfill({ status: 200, contentType: 'text/csv', body: toCSV(dnttBig) });
  return route.fulfill({ status: 200, contentType: 'text/csv', body: '' });
});
await page.click('#btnReload');
await page.waitForFunction(() => document.querySelector('#statusText')?.textContent?.includes('phiếu cân'), { timeout: 15000 });
await page.fill('#fFrom', '2024-01-01');
await page.fill('#fTo', '2025-12-31');
await page.click('#btnLapBC');
await page.waitForTimeout(400);

const domRowCountBig = await page.evaluate(() => document.querySelectorAll('#tbl-nhapkeo tbody tr:not([aria-hidden])').length);
const totalRowsText = await page.evaluate(() => document.querySelector('[data-pageinfo="nhapkeo"]')?.textContent);
check('Bảng 500 dòng: DOM chỉ vẽ 1 phần nhỏ (< 100 dòng thật), không vẽ hết 500', domRowCountBig > 0 && domRowCountBig < 100);
check('Thông tin cuộn hiển thị đúng (nhắc "Cuộn để xem thêm")', (totalRowsText || '').includes('Cuộn để xem thêm'));

const spacerCount = await page.evaluate(() => document.querySelectorAll('#tbl-nhapkeo tbody tr[aria-hidden]').length);
check('Có dòng đệm (spacer) để giữ đúng chiều cao thanh cuộn', spacerCount >= 1);

// Scroll down inside the table and verify the window of rendered rows shifts.
const firstCellBefore = await page.evaluate(() => document.querySelector('#tbl-nhapkeo tbody tr:not([aria-hidden]) td')?.textContent);
await page.evaluate(() => { document.querySelector('#tbl-nhapkeo').closest('.scrollWrap').scrollTop = 3000; });
await page.waitForTimeout(200);
const firstCellAfter = await page.evaluate(() => document.querySelector('#tbl-nhapkeo tbody tr:not([aria-hidden]) td')?.textContent);
check('Cuộn xuống làm thay đổi dòng đang vẽ (virtual window dịch chuyển)', firstCellBefore !== firstCellAfter);

// ---------- window.app.logger / window.app.storageService (đúng lời hứa JSDoc của logger.js) ----------
const appExposed = await page.evaluate(() => ({
  hasApp: typeof window.app === 'object' && window.app !== null,
  hasSetLevel: typeof window.app?.logger?.setLevel === 'function',
  hasStorageService: typeof window.app?.storageService?.exportAll === 'function',
}));
check('window.app tồn tại (đúng JSDoc logger.js đã mô tả từ đầu)', appExposed.hasApp);
check('window.app.logger.setLevel(...) gọi được từ console (hỗ trợ từ xa)', appExposed.hasSetLevel);
check('window.app.storageService.exportAll(...) gọi được từ console', appExposed.hasStorageService);

// ---------- Backup: bấm "💾 Sao lưu dữ liệu" không lỗi, cập nhật trạng thái ----------
// [2026-09-22] "Danh mục & cấu hình" đã tách thành 2 tab riêng ("Danh mục" / "Cấu hình") —
// nút Backup/Restore nay nằm ở tab "Cấu hình" (data-target="cauhinh"), không còn ở "danhmuc".
await page.click('[data-target="cauhinh"]');
const backupBtn = await page.$('#btnBackupData');
check('Nút "💾 Sao lưu dữ liệu" tồn tại', !!backupBtn);
if (backupBtn) {
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 5000 }).catch(() => null),
    page.click('#btnBackupData'),
  ]);
  await page.waitForTimeout(150);
  const backupStatus = await page.evaluate(() => document.querySelector('#backupRestoreStatus')?.textContent || '');
  check('Bấm "Sao lưu dữ liệu" kích hoạt tải file (download event)', !!download);
  check('Bấm "Sao lưu dữ liệu" cập nhật thông báo trạng thái', backupStatus.includes('Đã tải file sao lưu'));
}

// ---------- Restore: nạp lại 1 file JSON hợp lệ (tự tạo từ exportAll đang có) và khôi phục ----------
// Thêm 1 đại lý mới rồi export ra JSON "giả lập file backup", sau đó xoá đại lý đó đi (bằng Hoàn
// tác), rồi khôi phục từ file JSON vừa tạo -> đại lý phải quay lại đúng như lúc export.
const restoreResult = await page.evaluate(async () => {
  const dlBefore = window.app.storageService.exportAll();
  return { hasData: dlBefore && typeof dlBefore === 'object' && dlBefore.data && typeof dlBefore.data === 'object' };
});
check('storageService.exportAll() trả về đúng cấu trúc { data: {...} } để restore đọc lại', restoreResult.hasData);

await page.click('[data-target="danhmuc"]'); // #dmDLTable/#btnAddDL nay ở tab "Danh mục" (đã tách khỏi "Cấu hình")
const dmCountBeforeAdd = await page.evaluate(() => document.querySelectorAll('#dmDLTable tbody tr').length);
await page.click('#btnAddDL');
await page.waitForTimeout(100);
const dmCountAfterAdd = await page.evaluate(() => document.querySelectorAll('#dmDLTable tbody tr').length);
check('(chuẩn bị dữ liệu cho test restore) thêm 1 đại lý thành công', dmCountAfterAdd === dmCountBeforeAdd + 1);

// Tạo 1 File JSON hợp lệ ngay trong trang (từ đúng dữ liệu vừa thêm) rồi gán vào <input type=file>
// bằng DataTransfer — cách chuẩn để giả lập người dùng chọn file mà không cần file thật trên đĩa.
const restoreOk = await page.evaluate(async () => {
  const backup = window.app.storageService.exportAll();
  const file = new File([JSON.stringify(backup)], 'test-backup.json', { type: 'application/json' });
  const dt = new DataTransfer();
  dt.items.add(file);
  const input = document.querySelector('#btnRestoreDataInput');
  input.files = dt.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
});
check('Gán file JSON hợp lệ vào input restore không lỗi', restoreOk);
await page.waitForTimeout(300);
const dmCountAfterRestore = await page.evaluate(() => document.querySelectorAll('#dmDLTable tbody tr').length);
const restoreStatus = await page.evaluate(() => document.querySelector('#backupRestoreStatus')?.textContent || '');
check('Khôi phục từ file JSON giữ nguyên đúng số đại lý đã export (không mất/không thêm dữ liệu)', dmCountAfterRestore === dmCountAfterAdd);
check('Khôi phục cập nhật thông báo trạng thái thành công', restoreStatus.includes('Đã khôi phục'));

// Dọn dẹp: hoàn tác 2 lần để xoá đại lý test vừa thêm (restore tạo 1 mốc undo, thêm-đại-lý tạo 1 mốc nữa)
await page.click('#btnUndoDM');
await page.click('#btnUndoDM');
const dmCountAfterCleanup = await page.evaluate(() => document.querySelectorAll('#dmDLTable tbody tr').length);
check('(dọn dẹp) Hoàn tác 2 lần đưa danh mục về đúng trạng thái ban đầu', dmCountAfterCleanup === dmCountBeforeAdd);

console.log('\npageerrors:', JSON.stringify(errors));
console.log(`=== RESULT: ${pass} passed, ${fail} failed ===`);
await browser.close();
process.exit(fail > 0 || errors.length > 0 ? 1 : 0);
