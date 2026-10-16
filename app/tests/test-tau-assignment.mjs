// Kiểm chứng end-to-end tính năng "Xuất theo Tàu" (gán Tàu/Khách hàng cho BKLS, khoá theo Tàu
// khác, mở khoá lại đúng Tàu đã gán, gỡ gán không còn ReferenceError, và báo cáo "Tổng hợp theo
// Tàu" + Dashboard cập nhật đúng số liệu). Không thuộc bộ ui-baseline.mjs (đó là bộ kiểm tra
// KHÔNG đổi hành vi cũ) — đây là kiểm tra CHỨC NĂNG MỚI, chạy độc lập bằng `node tests/test-tau-assignment.mjs`.
import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';
import { genPhieuCan, genDNTT, genHosokeo, toCSV } from './fixtures.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_HTML = path.resolve(__dirname, '../dist/index.html');

let pass = 0, fail = 0;
function check(name, cond) { if (cond) { pass++; console.log('OK  ', name); } else { fail++; console.log('FAIL', name); } }

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

const phieucan = genPhieuCan(30);
const dntt = genDNTT(phieucan, 10);
const hosokeo = genHosokeo(6); // BKLS0..BKLS5, mỗi dòng 1 "Mã hợp đồng" khác nhau (HD0..HD5)

await page.route('https://docs.google.com/**', (route) => {
  const url = route.request().url();
  if (url.includes('2PACX-1vTj7PHtJtv1iBaF9tCKJ9zgnTyc4j6Hbt9CEYX36sVIDXwJDQUvMGd-O_bc8E-N6iEh5JqH9tytjQLj')) return route.fulfill({ status: 200, contentType: 'text/csv', body: toCSV(phieucan) });
  if (url.includes('2PACX-1vSqRW3Yk2MBgXp1qi29tQZQyn1R-opTUjE5PqBFIH7knAOcr1YvthP_AuXa_10knbaprgtM4i_zPk2i')) return route.fulfill({ status: 200, contentType: 'text/csv', body: toCSV(dntt) });
  if (url.includes('2PACX-1vT0mcMT2TsD7lOLSNrTqZPVjJJ395kI54SxSri5-n_VxrfAcC74IKkgCnesT30d1bhx59gJC4esmF7s')) return route.fulfill({ status: 200, contentType: 'text/csv', body: toCSV(hosokeo) });
  return route.fulfill({ status: 200, contentType: 'text/csv', body: '' });
});

await page.goto('file://' + DIST_HTML, { waitUntil: 'load' });
await page.waitForFunction(() => document.querySelector('#statusText')?.textContent?.includes('phiếu cân'), { timeout: 15000 });
await page.fill('#fFrom', '2020-01-01');
await page.fill('#fTo', '2030-12-31');
await page.click('#btnLapBC');
await page.waitForTimeout(400);

// Xoá sạch tau-assign trước đây (nếu có từ lần chạy trước, tránh test bị ảnh hưởng bởi state cũ)
await page.evaluate(() => window.app.storageService.set('baocaongay_tau_assign', {}));

// ---------- Mở modal "Xuất theo Tàu" từ tab "Tổng hợp lâm sản" ----------
await page.click('[data-target="lamsan"]');
await page.click('#btnTauModal');
await page.waitForTimeout(150);
const modalOpen = await page.evaluate(() => document.querySelector('#tauModalOverlay').classList.contains('active'));
check('Bấm "Xuất theo Tàu" mở modal', modalOpen);

const rowsInModal = await page.evaluate(() => document.querySelectorAll('#tauRowList .tauRowChk').length);
check('Modal liệt kê đủ số dòng BKLS (6 dòng từ 6 hợp đồng khác nhau)', rowsInModal === 6);

// ---------- Gán 3 dòng đầu cho Tàu A / Khách hàng X ----------
await page.fill('#tauTenTau', 'Tàu A');
await page.fill('#tauKhachHang', 'Khách hàng X');
await page.evaluate(() => {
  const chks = document.querySelectorAll('#tauRowList .tauRowChk');
  for (let i = 0; i < 3; i++) chks[i].checked = true;
  chks[0].dispatchEvent(new Event('change'));
});
const selCountText1 = await page.evaluate(() => document.querySelector('#tauSelectedCount').textContent);
check('Đếm đúng số dòng đã chọn trước khi gán (3 dòng)', selCountText1.includes('3'));

page.once('dialog', (d) => d.accept());
await page.click('#btnTauAssignConfirm');
await page.waitForTimeout(300);
const modalClosedAfterAssign = await page.evaluate(() => !document.querySelector('#tauModalOverlay').classList.contains('active'));
check('Gán xong tự đóng modal', modalClosedAfterAssign);

const assignMap1 = await page.evaluate(() => window.app.storageService.get('baocaongay_tau_assign', {}));
const assignedSoBKLS = Object.keys(assignMap1);
check('Đã lưu đúng 3 Số BKLS vào localStorage với Tàu A / Khách hàng X', assignedSoBKLS.length === 3 && assignedSoBKLS.every((k) => assignMap1[k].tau === 'Tàu A' && assignMap1[k].khachHang === 'Khách hàng X'));

// ---------- Mở lại modal, thử gán 1 trong 3 dòng đã gán sang Tàu B khác -> phải bị KHOÁ (disabled) ----------
await page.click('#btnTauModal');
await page.waitForTimeout(150);
await page.fill('#tauTenTau', 'Tàu B (khác)');
await page.waitForTimeout(150);
const lockedCountForOtherTau = await page.evaluate(() => document.querySelectorAll('#tauRowList .tauRowChk:disabled').length);
check('Gõ tên Tàu KHÁC: 3 dòng đã gán Tàu A bị khoá (disabled), không cho chọn lại', lockedCountForOtherTau === 3);

// ---------- Gõ lại ĐÚNG "Tàu A": 3 dòng đã gán phải MỞ KHOÁ lại (và tự tick sẵn) ----------
await page.fill('#tauTenTau', 'Tàu A');
await page.waitForTimeout(150);
const stateForSameTau = await page.evaluate(() => {
  const chks = Array.from(document.querySelectorAll('#tauRowList .tauRowChk'));
  return { disabledCount: chks.filter((c) => c.disabled).length, checkedCount: chks.filter((c) => c.checked).length };
});
check('Gõ lại ĐÚNG "Tàu A": không còn dòng nào bị khoá', stateForSameTau.disabledCount === 0);
check('Gõ lại ĐÚNG "Tàu A": 3 dòng đã gán tự động được tick sẵn (đang bổ sung cho đúng tàu đó)', stateForSameTau.checkedCount === 3);

// ---------- Chọn thêm 1 dòng mới (dòng thứ 4, chưa gán) rồi xác nhận gán thêm cho Tàu A (được phép) ----------
await page.evaluate(() => {
  const chks = document.querySelectorAll('#tauRowList .tauRowChk');
  chks[3].checked = true;
  chks[3].dispatchEvent(new Event('change'));
});
page.once('dialog', (d) => d.accept());
await page.click('#btnTauAssignConfirm');
await page.waitForTimeout(300);
const assignMap2 = await page.evaluate(() => window.app.storageService.get('baocaongay_tau_assign', {}));
check('Bổ sung thêm dòng thứ 4 vào ĐÚNG Tàu A thành công (không bị chặn, tổng 4 dòng)', Object.keys(assignMap2).length === 4);

// ---------- Kiểm tra "defense in depth" ở service: assignTau() tự chặn nếu cố gán chồng sang Tàu khác ----------
const guardResult = await page.evaluate(() => {
  const soBKLS = Object.keys(window.app.storageService.get('baocaongay_tau_assign', {}))[0];
  return window.app.__tauAssignTest ? null : 'no-hook'; // chỉ để ghi chú, không phải lỗi nếu app không expose hook riêng
});
// (Không có hook riêng cho assignTau ở window.app — bỏ qua kiểm tra trực tiếp hàm, đã kiểm tra gián tiếp qua UI ở trên)

// ---------- Modal đã tự đóng sau khi gán (confirmTauAssignClick), kiểm tra tab "Tổng hợp theo Tàu" ----------
await page.click('[data-rtab="tautonghop"]');
await page.waitForTimeout(200);
const tauTongHopRows = await page.evaluate(() => document.querySelectorAll('#tbl-tautonghop tbody tr').length);
check('Báo cáo "Tổng hợp theo Tàu" có đúng 1 dòng (chỉ 1 Tàu A / Khách hàng X đã gán)', tauTongHopRows === 1);

const tauTongHopSoDong = await page.evaluate(() => {
  const cells = document.querySelectorAll('#tbl-tautonghop tbody tr')[0]?.querySelectorAll('td');
  return cells ? Array.from(cells).map((c) => c.textContent.trim()) : [];
});
check('Dòng "Tổng hợp theo Tàu" có tên Tàu/Khách hàng đúng', tauTongHopSoDong.some((t) => t.includes('Tàu A')) && tauTongHopSoDong.some((t) => t.includes('Khách hàng X')));

// ---------- Kiểm tra BKLS Chi tiết/Tổng hợp có cột Tàu/Khách hàng xuất đúng ----------
await page.click('[data-rtab="bklsct"]');
await page.waitForTimeout(150);
const bklsctTauCol = await page.evaluate(() => {
  const rows = Array.from(document.querySelectorAll('#tbl-bklsct tbody tr'));
  return rows.filter((r) => r.textContent.includes('Tàu A')).length;
});
check('Bảng "BKLS xuất khẩu - Chi tiết" hiển thị đúng số dòng gắn Tàu A (4 dòng)', bklsctTauCol === 4);

// ---------- Dashboard: KPI + chart theo Tàu ----------
await page.click('[data-target="dashboard"]');
await page.waitForTimeout(200);
const dashCardsText = await page.evaluate(() => document.querySelector('#dashCards').textContent);
check('Dashboard hiển thị KPI "SỐ TÀU ĐANG THEO DÕI" = 1 tàu', /1\s*tàu/.test(dashCardsText) && dashCardsText.includes('SỐ TÀU ĐANG THEO DÕI'));
const chartTauExists = await page.evaluate(() => !!document.querySelector('#chartTau'));
check('Dashboard có canvas #chartTau', chartTauExists);

// ---------- Gỡ gán (test bug cũ: thiếu import unassignTau -> ReferenceError) ----------
await page.click('[data-target="lamsan"]');
await page.click('[data-rtab="bklsct"]');
await page.click('#btnTauModal');
await page.waitForTimeout(150);
await page.fill('#tauTenTau', 'Tàu A');
await page.waitForTimeout(150);
await page.evaluate(() => {
  const chks = document.querySelectorAll('#tauRowList .tauRowChk');
  chks.forEach((c) => { if (c.checked) return; }); // giữ nguyên các dòng đã tick sẵn (4 dòng của Tàu A)
});
page.once('dialog', (d) => d.accept()); // confirm() gỡ gán
await page.click('#btnTauUnassign');
await page.waitForTimeout(300);
check('Bấm "Gỡ gán" KHÔNG còn lỗi ReferenceError (bug import unassignTau đã sửa)', errors.filter((e) => e.includes('unassignTau')).length === 0);
const assignMapAfterUnassign = await page.evaluate(() => window.app.storageService.get('baocaongay_tau_assign', {}));
check('Gỡ gán xoá đúng toàn bộ 4 dòng khỏi localStorage', Object.keys(assignMapAfterUnassign).length === 0);

check('Không có lỗi JS (pageerror) nào phát sinh trong toàn bộ luồng test', errors.length === 0);
if (errors.length) console.log('pageerrors:', errors);

console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
await browser.close();
process.exit(fail > 0 ? 1 : 0);
