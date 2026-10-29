// [2026-10-29] Kiểm thử hàm thuần (Node, không cần trình duyệt) cho:
//  - chuẩn định dạng HAK (utils/hak-format.js → @hak/accounting-report-standard, @hak/smart-filter)
//  - mô hình "Cập nhật khoản vay" = bảng TH_VAY 3 cột (services/loan-model.js); tải nguyên sổ phụ thì tự lọc
//  - Sổ chi tiết tiền vay = TH_VAY + THTT_NH đúng luồng Power Query, so với 1 bản cài đặt ĐỘC LẬP của
//    chính các bước Power Query (viết lại trong test) trên dữ liệu ngẫu nhiên; lũy kế từ đầu sổ
// Chạy: npm run test:khoanvay-model
import { formatMoney, formatQuantity, formatIsoDate, parseUserDate, alignOf, MONEY_DIGITS, QUANTITY_DIGITS } from '../src/utils/hak-format.js';
import { fmtMoney, fmtKL } from '../src/utils/number-utils.js';
import { LOAN_FIELDS, validateOpening, validateLoan, loanFingerprint, parseImportRows, sophuToLoanInput, isTienVay, sortLoans, summarizeLoans } from '../src/services/loan-model.js';
import { CONFIG } from '../src/config/config.js';
import { computeSoTienVay, computeTongHopThanhToan } from '../src/services/report-service.js';

let pass = 0, fail = 0;
const check = (n, ok, x) => { ok ? pass++ : fail++; console.log((ok ? 'OK   ' : 'FAIL ') + n + (x !== undefined ? '  [' + x + ']' : '')); };

// ---- Chuẩn định dạng ----
check('Chuẩn: tiền 0 số lẻ, khối lượng 2 số lẻ (lấy từ thư viện chuẩn)', MONEY_DIGITS === 0 && QUANTITY_DIGITS === 2);
check('Tiền: nhóm nghìn dấu chấm, không kèm "đ"', fmtMoney(1234567.4) === '1.234.567', fmtMoney(1234567.4));
check('Tiền âm làm tròn đúng như bản cũ (-1500,5 → -1.500); "-0" hiện "0"', fmtMoney(-1500.5) === '-1.500' && fmtMoney(-0.4) === '0', fmtMoney(-1500.5) + ' / ' + fmtMoney(-0.4));
check('Số rất lớn (≥ 2^53) không làm dừng báo cáo', fmtMoney(1e21) === '1.000.000.000.000.000.000.000' && fmtKL(1e21).endsWith(',00'), fmtMoney(1e21));
check('Tiền: rỗng/không phải số → chuỗi rỗng (trống ≠ 0)', fmtMoney(null) === '' && fmtMoney(NaN) === '' && formatMoney(undefined) === '');
check('Khối lượng: luôn đủ 2 số lẻ', fmtKL(12.5) === '12,50' && fmtKL(1234) === '1.234,00' && formatQuantity(0.004) === '0,00', fmtKL(12.5) + ' ' + fmtKL(1234));
check('Khối lượng: giá trị dạng chuỗi giữ nguyên như bản cũ', fmtKL('12.5') === '12.5' && fmtKL('abc') === '');
check('Ngày ISO → dd/MM/yyyy; ngày không có thật → rỗng', formatIsoDate('2026-10-29') === '29/10/2026' && formatIsoDate('2026-02-30') === '');
check('Đọc ngày gõ tay dd/MM/yyyy (kể cả 1 chữ số)', parseUserDate('29/10/2026') === '2026-10-29' && parseUserDate('1/2/2026') === '2026-02-01');
check('Ngày gõ sai (31/02) → null; trống → ""', parseUserDate('31/02/2026') === null && parseUserDate('') === '');
check('Căn lề: số phải, ngày giữa, chữ trái', alignOf('money') === 'right' && alignOf('kl') === 'right' && alignOf('date') === 'center' && alignOf('text') === 'left');

// ---- Khoản vay (TH_VAY 3 cột): nhập tay ----
const VAY_TEXT = CONFIG.DIEN_GIAI_TIEN_VAY[2];
check('Khoản vay đúng 3 cột của bảng TH_VAY', LOAN_FIELDS.map((f) => f[1]).join('|') === 'Ngày hạch toán|Ngày chứng từ|Tổng tiền vay');
{
  const ok = validateLoan({ ngayHachToan: '09/06/2026', ngayChungTu: '09/06/2026', tongTienVay: 999999929 }, { userDates: true });
  check('Nhập tay hợp lệ: ngày dd/MM/yyyy lưu ISO, tiền là số', ok.ok && ok.value.ngayHachToan === '2026-06-09' && ok.value.tongTienVay === 999999929, ok.errors.join(' | '));
  check('Ngày chứng từ được để trống', validateLoan({ ngayHachToan: '1/1/2026', tongTienVay: 5 }, { userDates: true }).ok);
  const bad = validateLoan({ ngayHachToan: '31/02/2026', tongTienVay: -5 }, { userDates: true });
  check('Ngày không có thật + tiền âm đều bị báo', !bad.ok && bad.errors.length === 2, bad.errors.join(' | '));
  check('Tổng tiền vay trống hoặc 0 bị báo', !validateLoan({ ngayHachToan: '1/1/2026' }, { userDates: true }).ok && !validateLoan({ ngayHachToan: '1/1/2026', tongTienVay: 0 }, { userDates: true }).ok);
  check('Thiếu Ngày hạch toán bị báo', !validateLoan({ tongTienVay: 1 }, { userDates: true }).ok);
}
// ---- Khoản vay: đọc từ file (bảng 3 cột hoặc nguyên sổ phụ VAY) ----
{
  const r = parseImportRows([
    { 'Ngày hạch toán': '2026-06-09', 'Ngày chứng từ': 'abc', 'Tổng tiền vay': '999.999.929' },
    { 'Ngày hạch toán': '2026-06-10', 'Ngày chứng từ': '2026-06-10', 'Tổng tiền vay': 0 },
    { 'Ngày hạch toán': null, 'Ngày chứng từ': '2026-06-12', 'Tổng tiền vay': null },
    { 'Ngày hạch toán': '2026-06-11', 'Ngày chứng từ': null, 'Tổng tiền vay': 'x' }
  ], 'thvay');
  check('File 3 cột: đọc số "999.999.929", dòng không có tiền vay bỏ qua, số sai báo lỗi', r.values.length === 1 && r.values[0].tongTienVay === 999999929 && r.skipped === 2 && r.errors.length === 1, JSON.stringify([r.values.length, r.skipped, r.errors]));
  check('File 3 cột: Ngày chứng từ là chữ → giữ nguyên + cảnh báo', r.values[0].ngayChungTu === 'abc' && r.warnings.length === 1);
  const sp = parseImportRows([
    { 'Tài khoản ngân hàng': 'BIDV', 'Ngày hạch toán': '2026-06-09', 'Ngày chứng từ': '2026-06-09', 'Diễn giải': ' ' + VAY_TEXT + ' ', 'Thu': 999999929, 'Chi': 0 },
    { 'Tài khoản ngân hàng': 'BIDV', 'Ngày hạch toán': '2026-06-09', 'Ngày chứng từ': '2026-06-09', 'Diễn giải': 'Lãi tiền gửi tháng 06.2026', 'Thu': 70000, 'Chi': 0 },
    { 'Tài khoản ngân hàng': 'BIDV', 'Ngày hạch toán': '2026-06-09', 'Ngày chứng từ': '2026-06-09', 'Diễn giải': 'Thanh toán tiền mua gỗ keo', 'Thu': 0, 'Chi': 5 }
  ], 'sophu');
  check('Nguyên sổ phụ: chỉ lấy dòng Diễn giải tiền vay, Tổng tiền vay = Thu (query TH_VAY)', sp.values.length === 1 && sp.values[0].tongTienVay === 999999929 && sp.skipped === 2 && !sp.errors.length);
  check('Đối chứng: dòng có Thu nhưng Diễn giải khác KHÔNG thành khoản vay', sophuToLoanInput({ dienGiai: 'Lãi tiền gửi tháng 06.2026', thu: 70000 }) === null);
  check('Diễn giải có khoảng trắng 2 đầu vẫn nhận là tiền vay', isTienVay({ dienGiai: ' ' + VAY_TEXT + ' ' }));
  check('Đủ 3 câu Diễn giải của query TH_VAY', CONFIG.DIEN_GIAI_TIEN_VAY.length === 3 && CONFIG.DIEN_GIAI_TIEN_VAY.every((p) => isTienVay({ dienGiai: p })));
  const v = sp.values[0];
  check('Vân tay: cùng nội dung giống nhau, khác số tiền thì khác', loanFingerprint(v) === loanFingerprint(Object.assign({}, v)) && loanFingerprint(v) !== loanFingerprint(Object.assign({}, v, { tongTienVay: 1 })));
  const s = sortLoans([{ ngayHachToan: '2026-06-10', seq: 1 }, { ngayHachToan: '2026-06-09', seq: 9 }, { ngayHachToan: '2026-06-09', seq: 3 }]);
  check('Sắp xếp theo Ngày hạch toán, cùng ngày giữ thứ tự nhập', s.map((x) => x.seq).join(',') === '3,9,1');
  const t = summarizeLoans([{ tongTienVay: 100 }, { tongTienVay: 7 }]);
  check('Tổng hợp: 2 khoản, tổng 107', t.count === 2 && t.vay === 107);
}
// ---- Sổ chi tiết = Power Query (bản cài độc lập trong test) ----
/** Viết lại TRỰC TIẾP các bước M của TH_VAY / THTT_NH / BKCT_TIENVAY (không dùng code của app). */
function powerQuery(vay, dntt) {
  const TH_VAY = vay.filter((r) => CONFIG.DIEN_GIAI_TIEN_VAY.includes(r.dienGiai)).map((r) => ({ ngay: r.ngayHachToan, vay: r.thu || 0, chi: 0, tan: 0 }));
  const iso = (s) => { const [m, d, y] = s.split('/').map(Number); return y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0'); };
  const THTT_NH = dntt.map((r) => ({ ngay: iso(r['Ngày thanh toán']), vay: 0, chi: Number(r['Thành tiền']), tan: Number(r['Khối lượng']) }));
  let all = TH_VAY.concat(THTT_NH).sort((a, b) => (a.ngay < b.ngay ? -1 : a.ngay > b.ngay ? 1 : 0));
  // Mẫu người dùng (29/10): sổ bắt đầu từ ngày giải ngân đầu tiên (lũy kế dòng đầu = tiền vay đầu).
  const first = all.find((r) => r.vay > 0); if (first) all = all.filter((r) => r.ngay >= first.ngay);
  let lk = 0; return all.map((r) => { lk += r.vay - r.chi; return Object.assign({}, r, { lk }); });
}
let seed = 11; const R = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const day = (i) => '2026-06-' + String(1 + (i % 28)).padStart(2, '0');
const vay = [], dntt = [];
for (let i = 0; i < 120; i++) vay.push({ ngayHachToan: day(Math.floor(R() * 28)), dienGiai: R() < 0.3 ? CONFIG.DIEN_GIAI_TIEN_VAY[i % 3] : 'Thanh toán tiền mua gỗ keo', thu: Math.round(R() * 1e9), chi: Math.round(R() * 1e7) });
for (let i = 0; i < 400; i++) { const d = 1 + Math.floor(R() * 28); dntt.push({ 'Ngày thanh toán': '6/' + d + '/2026', 'Khối lượng': (R() * 30).toFixed(2), 'Thành tiền': String(Math.round(R() * 5e7)), 'Họ tên Chủ rừng': 'CR' + i }); }
{
  const thvay = parseImportRows(vay.map((r) => ({ 'Ngày hạch toán': r.ngayHachToan, 'Diễn giải': r.dienGiai, 'Thu': r.thu, 'Chi': r.chi })), 'sophu').values;
  const pq = powerQuery(vay, dntt), app = computeSoTienVay(thvay, dntt, null, null);
  const sum = (a, k) => a.reduce((s, r) => s + r[k], 0);
  check('Cả sổ: số dòng = Power Query', app.rows.length === pq.length, app.rows.length + ' / ' + pq.length);
  check('Cả sổ: tổng vay / tổng chi = Power Query', app.totalVay === sum(pq, 'vay') && app.totalChi === sum(pq, 'chi'), app.totalVay + ' / ' + sum(pq, 'vay'));
  check('Cả sổ: lũy kế cuối = Power Query', app.luyKeCuoi === pq[pq.length - 1].lk);
  const endOfDay = (rows, get) => { const m = {}; rows.forEach((r) => { m[get(r)] = r; }); return m; };
  const a = endOfDay(app.rows, (r) => r['Ngày chung'].indexOf('/') > 0 ? r['Ngày chung'].replace(/^(\d+)\/(\d+)\/(\d+)$/, (x, m, d, y) => y + '-' + m.padStart(2, '0') + '-' + d.padStart(2, '0')) : r['Ngày chung']);
  const b = endOfDay(pq, (r) => r.ngay);
  check('Lũy kế CUỐI MỖI NGÀY = Power Query (mọi ngày)', Object.keys(b).every((k) => a[k] && a[k]['Lũy kế tiền vay chi'] === b[k].lk), Object.keys(b).length + ' ngày');
  check('Tiền vay chỉ từ dòng có Diễn giải khớp (không lấy "Thanh toán…")', app.rows.filter((r) => r['Tổng tiền vay'] > 0).length === vay.filter((r) => isTienVay(r) && r.thu > 0).length);
  check('Dòng chi: Số tấn = Khối lượng DNTT, Ngày chung = Ngày thanh toán', app.rows.some((r) => r['Tổng tiền chi'] > 0 && r['Số tấn'] > 0 && r['Ngày thanh toán'] === r['Ngày chung']));
  // Lọc kỳ 10/06–20/06: số dư đầu kỳ = lũy kế Power Query cuối ngày 09/06
  const k = computeSoTienVay(thvay, dntt, 20260610, 20260620, null, 'dauSo'); // chế độ "Từ đầu sổ"
  const before = pq.filter((r) => r.ngay < '2026-06-10'); const opening = before[before.length - 1].lk;
  check('Từ đầu sổ + lọc kỳ: dòng đầu "Số dư đầu kỳ" = lũy kế Power Query cuối 09/06', k.rows[0]._opening && k.rows[0]['Lũy kế tiền vay chi'] === opening, k.rows[0]['Lũy kế tiền vay chi'] + ' / ' + opening);
  const in20 = pq.filter((r) => r.ngay <= '2026-06-20');
  check('Lọc kỳ: lũy kế cuối kỳ = lũy kế Power Query cuối 20/06', k.luyKeCuoi === in20[in20.length - 1].lk);
  check('Lọc kỳ: tổng vay/chi chỉ trong kỳ', k.totalVay === sum(pq.filter((r) => r.ngay >= '2026-06-10' && r.ngay <= '2026-06-20'), 'vay'));
}
{
  // Mẫu người dùng: sổ bắt đầu từ lần giải ngân đầu, lũy kế dòng đầu = tiền vay đầu
  const v = [{ ngayHachToan: '2026-06-09', ngayChungTu: '2026-06-09', tongTienVay: 999999929 }];
  const d = [{ 'Ngày thanh toán': '6/2/2026', 'Thành tiền': '25417000', 'Khối lượng': '15.22' }, { 'Ngày thanh toán': '6/9/2026', 'Thành tiền': '11463000', 'Khối lượng': '7.12' }];
  const r = computeSoTienVay(v, d, null, null);
  check('Sổ bắt đầu từ 09/06 (bỏ chi 02/06 trước lần giải ngân đầu)', r.rows.length === 2 && r.rows[0]['Lũy kế tiền vay chi'] === 999999929 && r.rows[1]['Lũy kế tiền vay chi'] === 988536929, r.rows.map((x) => x['Lũy kế tiền vay chi']).join(','));
  check('Chưa có lần giải ngân nào → giữ cả sổ', computeSoTienVay([], d, null, null).rows.length === 2);
  const t = computeTongHopThanhToan(d.concat([{ 'Ngày thanh toán': '7/1/2026', 'Thành tiền': '5', 'Khối lượng': '1' }]), 20260601, 20260630);
  check('Tổng hợp thanh toán: lọc theo Ngày thanh toán, tổng KL + tiền, Ngày chung = Ngày TT', t.rows.length === 2 && t.totalTien === 36880000 && Math.abs(t.totalKL - 22.34) < 1e-9 && t.rows[0]['Ngày chung'] === '6/2/2026');
}
{
  // Power Query gom TH_VAY theo ngày rồi bung lại ⇒ 2 lần giải ngân cùng ngày bị cộng trùng; app không.
  const two = [{ ngayHachToan: '2026-06-09', tongTienVay: 100 }, { ngayHachToan: '2026-06-09', tongTienVay: 50 }];
  check('2 lần giải ngân cùng ngày: tổng vay 150 (không cộng trùng thành 300)', computeSoTienVay(two, [], null, null).totalVay === 150);
  const nul = computeSoTienVay([], [{ 'Ngày thanh toán': '', 'Thành tiền': '10', 'Khối lượng': '1' }, { 'Ngày thanh toán': '6/5/2026', 'Thành tiền': '5', 'Khối lượng': '1' }], 20260601, 20260630, null, 'dauSo');
  check('DNTT thiếu Ngày thanh toán: nằm đầu sổ → vào Số dư đầu kỳ khi lọc kỳ', nul.rows[0]._opening && nul.soDuDauKy === -10 && nul.luyKeCuoi === -15);
}

{
  // [2026-10-29] Số dư đầu kỳ nhập tay: sổ bắt đầu từ ngày nhập, lũy kế khởi đầu = số tiền nhập
  const v = [{ ngayHachToan: '2026-06-05', tongTienVay: 300 }, { ngayHachToan: '2026-06-09', tongTienVay: 1000 }];
  const d = [{ 'Ngày thanh toán': '6/2/2026', 'Thành tiền': '50', 'Khối lượng': '1' }, { 'Ngày thanh toán': '6/7/2026', 'Thành tiền': '80', 'Khối lượng': '2.5' }, { 'Ngày thanh toán': '6/10/2026', 'Thành tiền': '20', 'Khối lượng': '1' }];
  const op = { ngay: '2026-06-06', soTien: 500 };
  const r = computeSoTienVay(v, d, null, null, op);
  check('Số dư nhập tay: dòng đầu "Số dư đầu kỳ" = 500, bỏ vay/chi trước 06/06', r.rows[0]._opening && r.rows[0]['Lũy kế tiền vay chi'] === 500 && r.rows.length === 4, r.rows.map((x) => x['Lũy kế tiền vay chi']).join(','));
  check('Số dư nhập tay: lũy kế cuối = 500 − 80 + 1000 − 20 = 1.400; tổng vay/chi chỉ từ 06/06', r.luyKeCuoi === 1400 && r.totalVay === 1000 && r.totalChi === 100 && r.batDau.loai === 'nhap');
  check('Số liệu tổng: 1 lần giải ngân, 2 dòng chi, 3,5 tấn', r.soLanVay === 1 && r.soDongChi === 2 && Math.abs(r.totalSoTan - 3.5) < 1e-9);
  const k = computeSoTienVay(v, d, 20260608, 20260630, op, 'dauSo');
  check('Số dư nhập tay + lọc kỳ từ 08/06: đầu kỳ = 500 − 80 = 420', k.soDuDauKy === 420 && k.rows[0]['Lũy kế tiền vay chi'] === 420 && k.luyKeCuoi === 1400);
  check('Số dư âm được (chi vượt vay)', computeSoTienVay(v, d, null, null, { ngay: '2026-06-06', soTien: -2000 }).luyKeCuoi === -1100);
  check('Đối chứng: không nhập số dư → như cũ (bắt đầu giải ngân đầu 05/06, không có dòng số dư)', !computeSoTienVay(v, d, null, null, null).rows[0]._opening && computeSoTienVay(v, d, null, null, null).batDau.ngay === '2026-06-05');
  const ok = validateOpening({ ngay: '06/06/2026', soTien: -5 });
  check('Kiểm tra số dư: ngày dd/MM/yyyy → ISO, số âm/0 được', ok.ok && ok.value.ngay === '2026-06-06' && validateOpening({ ngay: '1/6/2026', soTien: 0 }).ok);
  const bad = validateOpening({ ngay: '31/02/2026', soTien: null });
  check('Kiểm tra số dư: ngày sai + thiếu số tiền đều bị báo', !bad.ok && bad.errors.length === 2, bad.errors.join(' | '));
}

{
  // [2026-10-29] Số liệu thẻ tổng: tab Cập nhật khoản vay + Tổng hợp thanh toán
  const L = summarizeLoans([
    { ngayHachToan: '2026-06-10', tongTienVay: 300, seq: 1, updatedAt: '2026-10-29T01:00:00Z' },
    { ngayHachToan: '2026-06-12', tongTienVay: 100, seq: 2, updatedAt: '2026-10-29T03:00:00Z' },
    { ngayHachToan: '2026-06-12', tongTienVay: 50, seq: 3, updatedAt: '2026-10-29T02:00:00Z' },
    { ngayHachToan: '2026-06-09', tongTienVay: 150, seq: 4 }]);
  check('Khoản vay: tổng 600, 4 khoản, bình quân 150', L.vay === 600 && L.count === 4 && L.avg === 150);
  check('Khoản vay: lớn nhất 300 (10/06); gần nhất = 12/06 khoản nhập sau (50)', L.max.tongTienVay === 300 && L.latest.tongTienVay === 50 && L.latest.ngayHachToan === '2026-06-12');
  check('Khoản vay: từ 09/06 đến 12/06, 3 ngày có giải ngân, lần lưu gần nhất 03:00', L.from === '2026-06-09' && L.to === '2026-06-12' && L.soNgay === 3 && L.lastSaved === '2026-10-29T03:00:00Z');
  check('Khoản vay: danh sách rỗng không lỗi', summarizeLoans([]).count === 0 && summarizeLoans([]).max === null && summarizeLoans([]).avg === 0);
  const T = computeTongHopThanhToan([
    { 'Ngày thanh toán': '6/1/2026', 'Họ tên Chủ rừng': 'Võ Thị Yến', 'Khối lượng': '2', 'Thành tiền': '100' },
    { 'Ngày thanh toán': '6/1/2026', 'Họ tên Chủ rừng': ' VÕ THỊ  YẾN ', 'Khối lượng': '1', 'Thành tiền': '50' },
    { 'Ngày thanh toán': '6/3/2026', 'Họ tên Chủ rừng': 'Trần Chính', 'Khối lượng': '3', 'Thành tiền': '120' },
    { 'Ngày thanh toán': '7/3/2026', 'Họ tên Chủ rừng': 'Ngoài kỳ', 'Khối lượng': '9', 'Thành tiền': '999' }], 20260601, 20260630);
  check('Tổng hợp TT: 2 chủ rừng (gộp hoa/thường, khoảng trắng), 2 ngày, chỉ trong kỳ', T.soChuRung === 2 && T.soNgay === 2 && T.rows.length === 3 && T.totalTien === 270);
  check('Tổng hợp TT: chủ rừng nhiều tiền nhất = Võ Thị Yến 150', T.topChuRung.ten === 'Võ Thị Yến' && T.topChuRung.tien === 150, JSON.stringify(T.topChuRung));
}

{
  // [2026-10-29] MẶC ĐỊNH: lũy kế tính trong khoảng thời gian báo cáo (độc lập với bản cài Power Query: lọc kỳ rồi lập sổ)
  const pqKy = (from, to) => powerQuery(vay.filter((r) => r.ngayHachToan >= from && r.ngayHachToan <= to),
    dntt.filter((r) => { const [m, dd, y] = r['Ngày thanh toán'].split('/').map(Number); const k = y + '-' + String(m).padStart(2, '0') + '-' + String(dd).padStart(2, '0'); return k >= from && k <= to; }));
  const thvay = parseImportRows(vay.map((r) => ({ 'Ngày hạch toán': r.ngayHachToan, 'Diễn giải': r.dienGiai, 'Thu': r.thu, 'Chi': r.chi })), 'sophu').values;
  const ky = computeSoTienVay(thvay, dntt, 20260610, 20260620), ref = pqKy('2026-06-10', '2026-06-20');
  check('Trong kỳ (mặc định): không có dòng "Số dư đầu kỳ", số dư đầu kỳ = 0', !ky.rows.some((r) => r._opening) && ky.soDuDauKy === 0 && ky.mode === 'ky');
  check('Trong kỳ: số dòng + lũy kế cuối = Power Query chạy trên riêng dữ liệu trong kỳ', ky.rows.length === ref.length && ky.luyKeCuoi === ref[ref.length - 1].lk, ky.rows.length + '/' + ref.length);
  check('Trong kỳ: dòng đầu là lần giải ngân đầu trong kỳ, lũy kế = số vay đó', ky.rows[0]['Tổng tiền vay'] > 0 && ky.rows[0]['Lũy kế tiền vay chi'] === ky.rows[0]['Tổng tiền vay']);
  check('Trong kỳ: tổng vay/chi giống chế độ Từ đầu sổ khi kỳ bắt đầu bằng giải ngân', ky.totalVay === ref.reduce((x, r) => x + r.vay, 0));
  const v = [{ ngayHachToan: '2026-06-05', tongTienVay: 300 }, { ngayHachToan: '2026-06-09', tongTienVay: 1000 }];
  const d = [{ 'Ngày thanh toán': '6/7/2026', 'Thành tiền': '80', 'Khối lượng': '1' }, { 'Ngày thanh toán': '6/10/2026', 'Thành tiền': '20', 'Khối lượng': '1' }];
  const k8 = computeSoTienVay(v, d, 20260608, 20260630);
  check('Trong kỳ từ 08/06: sổ bắt đầu giải ngân 09/06 (1000), lũy kế cuối 980 — không mang 300 − 80 trước kỳ', k8.rows.length === 2 && k8.rows[0]['Lũy kế tiền vay chi'] === 1000 && k8.luyKeCuoi === 980);
  const inOp = computeSoTienVay(v, d, 20260606, 20260630, { ngay: '2026-06-06', soTien: 500 });
  check('Trong kỳ: số dư nhập tay có ngày TRONG kỳ ⇒ dùng (500 − 80 + 1000 − 20 = 1.400)', inOp.rows[0]._opening && inOp.luyKeCuoi === 1400 && !inOp.boQuaSoDu);
  const outOp = computeSoTienVay(v, d, 20260608, 20260630, { ngay: '2026-06-01', soTien: 500 });
  check('Trong kỳ: số dư nhập tay có ngày NGOÀI kỳ ⇒ không dùng, báo boQuaSoDu', !outOp.rows.some((r) => r._opening) && outOp.luyKeCuoi === 980 && outOp.boQuaSoDu);
  check('Không chọn kỳ: 2 chế độ ra cùng kết quả', JSON.stringify(computeSoTienVay(v, d, null, null).rows) === JSON.stringify(computeSoTienVay(v, d, null, null, null, 'dauSo').rows));
}

console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);
