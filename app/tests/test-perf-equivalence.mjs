// [PERF-04/05 — 2026-09-23] Kiểm chứng các tối ưu tốc độ KHÔNG làm đổi 1 con số/1 ký tự nào.
//
// 1) Lớp tính báo cáo (services/report-service.js): chạy đúng trình tự runReport() trên dữ liệu
//    giả lập 10.000 & 30.000 phiếu cân (có cả giá trị "khó": giờ AM/PM, số kiểu "1.234,5", số âm
//    trong ngoặc, ô trống, ngày ISO...), băm (SHA-1) toàn bộ kết quả 15 báo cáo và so với mã băm
//    GỐC — mã băm gốc được tính từ code TRƯỚC KHI tối ưu (bản ngay trước Phase 3.12). Khớp mã băm
//    = kết quả giống hệt tới từng dòng, từng thứ tự, từng số lẻ.
// 2) Các hàm tiện ích đã thêm cache (parseNum, parseTimeParts, normalizeSearch, fmtMoney, fmtKL):
//    so với bản sao nguyên văn của code cũ (bên dưới) trên ~85.000 đầu vào, chạy 2 lượt (lượt 2
//    đi qua cache).
// 3) Trên chính Chromium (engine của app desktop): Intl.NumberFormat(...).format() khớp
//    toLocaleString() cũ, Intl.Collator('vi').compare khớp localeCompare(…,'vi') cũ.
//
// Chạy: npm run test:perf-equivalence
import crypto from 'crypto';
import { chromium } from 'playwright';
import { genPhieuCan, genDNTT, genHDNCC, genHosokeo, toCSV } from './fixtures.mjs';
import * as RS from '../src/services/report-service.js';
import { parseCSV, csvToObjects } from '../src/utils/csv-utils.js';
import { dateKey, parseTimeParts, toMinutes, fmtTime } from '../src/utils/date-utils.js';
import { parseNum, fmtMoney, fmtKL } from '../src/utils/number-utils.js';
import { normalizeSearch } from '../src/utils/fuzzy-search.js';

// Mã băm kết quả của code TRƯỚC tối ưu (đo ngày 23/09/2026 trên bản Phase 3.11).
const GOLDEN = { 10000: '740f57c4cc39', 30000: '7bd5b7126bc8' };

let pass = 0, fail = 0;
const check = (name, ok, extra) => { if (ok) pass++; else fail++; console.log((ok ? 'OK   ' : 'FAIL ') + name + (extra ? ' — ' + extra : '')); };

function mulberry32(seed) { return function () { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function computeHash(N) {
  Math.random = mulberry32(99);
  const pcRaw = genPhieuCan(N); const dnRaw = genDNTT(pcRaw, Math.round(N * 0.8)); const hdRaw = genHDNCC(dnRaw); const hkRaw = genHosokeo(Math.round(N * 0.3));
  pcRaw.forEach((r, i) => {
    if (i % 7 === 0) r['Giờ cân 1'] = (1 + (i % 12)) + ':0' + (i % 6) + ' ' + (i % 2 ? 'PM' : 'AM');
    if (i % 11 === 0) r['KL hàng (KG)'] = '1.234,5';
    if (i % 13 === 0) r['Thành tiền'] = '(12.345)';
    if (i % 17 === 0) r['Giờ cân 2'] = '';
    if (i % 19 === 0) r['Ngày cân 1'] = '2025-0' + (1 + (i % 9)) + '-1' + (i % 9);
    if (i % 23 === 0) r['Giờ cân 1'] = '07:15:42';
  });
  const T = (rows) => csvToObjects(parseCSV(toCSV(rows)));
  const phieucan = T(pcRaw), dntt = T(dnRaw), hdncc = T(hdRaw), hosokeo = T(hkRaw);
  const phieucanBySoCT = {}; phieucan.forEach((r) => { if (r['So_CT']) phieucanBySoCT[r['So_CT']] = r; });
  const dnttBySoCT = {}; dntt.forEach((r) => { const k = r['Số CT']; if (!k) return; const cur = dnttBySoCT[k]; if (!cur || (dateKey(r['Ngày thanh toán']) || 0) >= (dateKey(cur['Ngày thanh toán']) || 0)) dnttBySoCT[k] = r; });
  const hdmbByKey = {}; hdncc.forEach((r) => { hdmbByKey[(r['Số hợp đồng'] || '') + '||' + (r['Họ tên Chủ rừng'] || '')] = r; });
  const hdnccBySoHopDong = {}; hdncc.forEach((r) => { const k = r['Số hợp đồng'] || ''; if (k) hdnccBySoHopDong[k] = r; });
  const dmht = [{ 'Nguồn gốc': 'NG01', 'Hỗ trợ': 10000, 'Hình thức': 'Cuối tháng', 'Ngày bắt đầu': '2024-01-01', 'Ngày kết thúc': '2025-12-31' }, { 'Nguồn gốc': 'NG02', 'Hỗ trợ': 12000, 'Hình thức': 'Khi thanh toán', 'Ngày bắt đầu': '2024-01-01', 'Ngày kết thúc': '2025-12-31' }];
  const dmdl = [{ 'Đại lý': 'DL01', 'Tên Đại lý': 'A', 'Sản lượng Min': 0, 'Sản lượng max': 1e9, 'Hoa hồng': 10000 }, { 'Đại lý': 'DL02', 'Tên Đại lý': 'B', 'Sản lượng Min': 0, 'Sản lượng max': 1e9, 'Hoa hồng': 8000 }];
  const tau = {}; hosokeo.slice(0, 50).forEach((r, i) => { tau[r['Số BKLS']] = { tau: 'TAU' + (i % 3), khachHang: 'KH' + (i % 2), ngayGan: '2025-0' + (1 + i % 9) + '-01T00:00:00Z' }; });
  const fromKey = 20240101, toKey = 20251231;
  const r = {};
  r.nhap = RS.computeNhapKeo(phieucan, fromKey, toKey);
  r.xecho = RS.computeXeCho1h(r.nhap.rows);
  r.tt = RS.computeThanhToan(dntt, phieucanBySoCT, fromKey, toKey);
  r.congno = RS.computeCongNo(phieucan, dnttBySoCT, toKey);
  r.hotro = RS.computeHoTroOrTroGia(phieucan, dmht, fromKey, toKey, 'Cuối tháng', 'Tiền hỗ trợ');
  r.trogia = RS.computeHoTroOrTroGia(phieucan, dmht, fromKey, toKey, 'Khi thanh toán', 'Tiền trợ giá');
  r.tonghoptro = RS.computeTongHopHoTro(r.hotro.rows);
  r.hoahong = RS.computeHoaHongDL(dntt, phieucanBySoCT, dmdl, fromKey, toKey);
  r.tonghop = RS.computeTongHopNgay(phieucan, dntt, phieucanBySoCT, fromKey, toKey);
  r.bklsct = RS.computeXuatHang01(hosokeo, hdmbByKey, fromKey, toKey, tau);
  r.bklsth = RS.computeXuatHang02(r.bklsct.rows);
  r.bklsAll = RS.computeXuatHang01(hosokeo, hdmbByKey, null, null, tau);
  r.tautonghop = RS.computeTauTongHop(r.bklsAll.rows, tau);
  r.tndn = RS.computeBankTNDN(dntt, phieucanBySoCT, hdnccBySoHopDong, fromKey, toKey);
  r.pnk = RS.computePhieuNhapKho(phieucan, fromKey, toKey);
  const rep = (k, v) => (typeof v === 'number' && !isFinite(v) ? 'NUM:' + String(v) : v === undefined ? '__undef__' : v);
  const hashes = {}; Object.keys(r).forEach((n) => { hashes[n] = crypto.createHash('sha1').update(JSON.stringify(r[n], rep)).digest('hex').slice(0, 10); });
  return crypto.createHash('sha1').update(JSON.stringify(hashes)).digest('hex').slice(0, 12);
}

const realRandom = Math.random;
for (const N of [10000, 30000]) {
  const h = computeHash(N);
  check('15 báo cáo khớp tuyệt đối với code trước tối ưu (N=' + N + ')', h === GOLDEN[N], 'hash ' + h + (h === GOLDEN[N] ? '' : ' ≠ ' + GOLDEN[N]));
}
Math.random = realRandom;

// ---- 2) Tiện ích: so với bản sao NGUYÊN VĂN code cũ ----
function oldParseNum(v) {
  if (v == null) return NaN;
  if (typeof v === 'number') return v;
  let s = String(v).trim();
  if (!s) return NaN;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  s = s.replace(/[\s ₫đ$€£%]|VND|VNĐ/gi, '');
  if (!/^[-+]?[\d.,]+$/.test(s)) return NaN;
  const hasDot = s.indexOf('.') >= 0, hasComma = s.indexOf(',') >= 0;
  if (hasDot && hasComma) {
    if (s.lastIndexOf('.') > s.lastIndexOf(',')) s = s.replace(/,/g, '');
    else s = s.replace(/\./g, '').replace(',', '.');
  } else if (hasComma) {
    if (/^[-+]?\d{1,3}(,\d{3})+$/.test(s)) s = s.replace(/,/g, '');
    else s = s.replace(',', '.');
  } else if (hasDot) {
    if (/^[-+]?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  }
  const n = parseFloat(s);
  if (isNaN(n)) return NaN;
  return neg ? -n : n;
}
function oldParseTimeParts(str) {
  if (str == null) return { h: 0, mi: 0, s: 0 };
  const s = String(str).trim();
  const m = s.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM|am|pm)?/);
  if (!m) return { h: 0, mi: 0, s: 0 };
  let h = +m[1];
  const mi = +m[2], sec = m[3] ? +m[3] : 0;
  const ap = m[4] ? m[4].toUpperCase() : null;
  if (ap === 'PM' && h < 12) h += 12;
  if (ap === 'AM' && h === 12) h = 0;
  return { h, mi, s: sec };
}
const ACCENT_MAP = [
  [/[àáạảãâầấậẩẫăằắặẳẵ]/g, 'a'], [/[ÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴ]/g, 'A'], [/[èéẹẻẽêềếệểễ]/g, 'e'], [/[ÈÉẸẺẼÊỀẾỆỂỄ]/g, 'E'],
  [/[ìíịỉĩ]/g, 'i'], [/[ÌÍỊỈĨ]/g, 'I'], [/[òóọỏõôồốộổỗơờớợởỡ]/g, 'o'], [/[ÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠ]/g, 'O'],
  [/[ùúụủũưừứựửữ]/g, 'u'], [/[ÙÚỤỦŨƯỪỨỰỬỮ]/g, 'U'], [/[ỳýỵỷỹ]/g, 'y'], [/[ỲÝỴỶỸ]/g, 'Y'], [/đ/g, 'd'], [/Đ/g, 'D'],
];
function oldNormalize(s) { let out = String(s == null ? '' : s); for (const [re, p] of ACCENT_MAP) out = out.replace(re, p); return out.toLowerCase(); }
function oldFmtMoney(n) { if (n == null || isNaN(n)) return ''; const neg = n < 0; n = Math.abs(Math.round(n)); return (neg ? '-' : '') + n.toLocaleString('vi-VN') + ' đ'; }
function oldFmtKL(n) { if (n == null || isNaN(n)) return ''; return n.toLocaleString('vi-VN', { maximumFractionDigits: 2 }); }
// [2026-10-29 — CHUẨN HAK, thay đổi CHỦ ĐỘNG] Kết quả mong đợi = đúng kết quả code cũ, chỉ đổi đúng 2
// điểm của chuẩn định dạng: tiền bỏ " đ" (và "-0" → "0"); khối lượng luôn đủ 2 chữ số lẻ; ±vô cực
// (dữ liệu hỏng) hiện ô trống thay vì "∞". Mọi khác
// biệt ngoài 2 điểm này (vd lệch làm tròn 1 đồng) vẫn bị phát hiện.
function expectMoney(n) { if (typeof n === 'number' && !isFinite(n)) return ''; const s = oldFmtMoney(n).replace(/ đ$/, ''); return s === '-0' ? '0' : s; }
function expectKL(n) { if (n == null || isNaN(n) || (typeof n === 'number' && !isFinite(n))) return ''; return typeof n === 'number' ? n.toLocaleString('vi-VN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : oldFmtKL(n); }

let seed = 7; const R = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const nums = [0, -0, 1, -1, 0.5, -0.5, 1.005, 2.675, 1e15, -1e15, 123456789.987, NaN, Infinity, -Infinity, null, undefined, '12', '1234.5', 'abc', '', 0.004999, 0.995, 99.995];
for (let i = 0; i < 20000; i++) nums.push((R() - 0.3) * Math.pow(10, Math.floor(R() * 13)));
const strs = ['', ' ', '1.234,5', '(12.345)', '1,234.56', '12,5', '1.234.567 đ', '₫1,000', '$ 99', '12%', '-7', '+3', 'VND 5', 'abc', '1,234', '1.234', '1.2.3', ' 42 ', '0012', '(0)'];
for (let i = 0; i < 20000; i++) strs.push(String(Math.round(R() * 1e9)), (R() * 1e4).toFixed(2), (R() * 1e6).toLocaleString('vi-VN'));
const times = ['', '7:05', '07:05:09', '12:00 AM', '12:30 PM', '1:05 pm', '23:59', 'x', '10:5', '9:07 AM', ' 08:15 ', '2025-01-01 10:20:30', null, undefined];
for (let i = 0; i < 5000; i++) times.push(Math.floor(R() * 24) + ':' + String(Math.floor(R() * 60)).padStart(2, '0') + (R() < 0.3 ? ' PM' : ''));
const texts = ['Nguyễn Văn A', 'ĐẶNG THỊ HỒNG', 'Thôn Kong Năng, xã Phước Năng', '', 12345, null, undefined, 'ỳýỵỷỹ ỲÝỴỶỸ', 'Đà Nẵng'].concat(strs.slice(0, 3000));
const same = (a, b) => Object.is(a, b) || (Number.isNaN(a) && Number.isNaN(b)) || JSON.stringify(a) === JSON.stringify(b);
const cnt = { parseNum: 0, parseTimeParts: 0, normalizeSearch: 0, fmtMoney: 0, fmtKL: 0 };
for (let lap = 0; lap < 2; lap++) {
  for (const x of strs.concat(nums)) if (!same(parseNum(x), oldParseNum(x))) cnt.parseNum++;
  for (const x of times) { if (!same(parseTimeParts(x), oldParseTimeParts(x))) cnt.parseTimeParts++; }
  for (const x of texts) if (normalizeSearch(x) !== oldNormalize(x)) cnt.normalizeSearch++;
  for (const x of nums) { if (fmtMoney(x) !== expectMoney(x)) cnt.fmtMoney++; if (fmtKL(x) !== expectKL(x)) cnt.fmtKL++; }
}
Object.keys(cnt).forEach((k) => check(k + ' khớp code cũ trên toàn bộ đầu vào (2 lượt, lượt 2 qua cache)', cnt[k] === 0, cnt[k] ? cnt[k] + ' chỗ lệch' : ''));
// toMinutes/fmtTime dùng parseTimeParts đã cache — kiểm tra thêm 1 vòng qua 2 hàm này
let tmBad = 0;
for (const t of times.slice(0, 500)) {
  const tp = oldParseTimeParts(t);
  if (fmtTime(t) !== String(tp.h).padStart(2, '0') + ':' + String(tp.mi).padStart(2, '0')) tmBad++;
  if (toMinutes('5/6/2024', t) !== Date.UTC(2024, 4, 6, tp.h, tp.mi, tp.s) / 60000) tmBad++;
}
check('toMinutes/fmtTime khớp khi đi qua cache giờ', tmBad === 0, tmBad ? tmBad + ' chỗ lệch' : '');
let frozenOk = false; try { parseTimeParts('10:20').h = 99; } catch (e) { frozenOk = true; }
check('Object giờ trong cache bị khoá (không nơi nào sửa được làm hỏng cache)', frozenOk && parseTimeParts('10:20').h === 10);

// ---- 3) Trên Chromium thật ----
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage();
const br = await page.evaluate((sample) => {
  const nf0 = new Intl.NumberFormat('vi-VN'), nf2 = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 });
  let badNum = 0;
  for (const x of sample) {
    if (nf0.format(Math.abs(Math.round(x))) !== Math.abs(Math.round(x)).toLocaleString('vi-VN')) badNum++;
    if (nf2.format(x) !== x.toLocaleString('vi-VN', { maximumFractionDigits: 2 })) badNum++;
  }
  const words = ['Nguyễn', 'Nguyen', 'nguyễn', 'Đặng', 'Dặng', 'Anh', 'Ánh', 'ảnh', 'A', 'a', 'Ă', 'Â', 'B', 'Z', '', '10', '9', 'Bùi', 'Buôn', 'Trần', 'Tran', 'ĐL01', 'DL01', 'Hồ Chí Minh', 'Huế'];
  const col = new Intl.Collator('vi'); let badCmp = 0;
  for (const a of words) for (const b of words) if (Math.sign(col.compare(a, b)) !== Math.sign(a.localeCompare(b, 'vi'))) badCmp++;
  return { badNum, badCmp, n: sample.length, pairs: words.length * words.length };
}, nums.filter((x) => typeof x === 'number' && isFinite(x)).slice(0, 5000));
await browser.close();
check('Chromium: Intl.NumberFormat khớp toLocaleString (' + br.n + ' số × 2 kiểu)', br.badNum === 0, br.badNum ? br.badNum + ' chỗ lệch' : '');
check('Chromium: Intl.Collator("vi") khớp localeCompare(…,"vi") (' + br.pairs + ' cặp)', br.badCmp === 0, br.badCmp ? br.badCmp + ' chỗ lệch' : '');

console.log('\n=== RESULT: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail ? 1 : 0);
