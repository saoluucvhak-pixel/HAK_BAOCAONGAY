// Kiểm chứng logic thuần của report-service.js cho nhóm "Xuất hàng / Tàu": computeXuatHang01 (BKLS chi tiết),
// computeXuatHang02 (BKLS tổng hợp), computeTauTongHop (tổng hợp theo tàu). Không cần trình duyệt.
// Mọi số kỳ vọng được tính tay từ dữ liệu nhỏ trong file này, KHÔNG lấy từ chính kết quả của hàm.
import { computeXuatHang01, computeXuatHang02, computeTauTongHop } from '../src/services/report-service.js';
import { dateKey } from '../src/utils/date-utils.js';

let pass = 0, fail = 0;
const check = (n, ok, x) => { ok ? pass++ : fail++; console.log((ok ? 'OK   ' : 'FAIL ') + n + (ok || x === undefined ? '' : '  [' + JSON.stringify(x) + ']')); };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const K = dateKey;
const hk = (bkls, ngay, hd, ten, o) => Object.assign({
  'Số BKLS': bkls, 'Ngày nhập': ngay, 'Mã hợp đồng': hd, 'Họ và tên chủ rừng': ten,
  'Mã khách hàng': 'CCCD-' + ten, 'ĐỊA CHỈ RỪNG': 'Rừng ' + ten,
  'Khối lượng (Tấn)': '1', 'Đơn giá': '1000000', 'Thanh toán': '1000000',
}, o || {});

// ---------------- Dữ liệu hồ sơ keo
const hosokeo = [
  hk('S1', '2026-06-10', 'HD1', 'An', { 'Khối lượng (Tấn)': '10', 'Thanh toán': '10000000' }),
  hk('S2', '2026-06-05', 'HD1', 'An', { 'Khối lượng (Tấn)': '5,5', 'Thanh toán': '5500000' }),   // "5,5" = 5.5 tấn
  hk('S3', '2026-06-20', 'HD2', 'Binh', { 'Khối lượng (Tấn)': '4', 'Đơn giá': '2000000', 'Thanh toán': '8000000' }),
  hk('S4', '2026-07-02', 'HD1', 'An', { 'Khối lượng (Tấn)': '3', 'Thanh toán': '3000000' }),     // ngoài kỳ tháng 6
  hk('S5', '2026-06-15', '', 'Khong', {}),                                                       // thiếu Mã hợp đồng → loại
  hk('S6', '2026-06-12', 'HD2', 'Binh', { 'Khối lượng (Tấn)': '', 'Đơn giá': '', 'Thanh toán': '' }), // số thiếu
  hk('S7', 'khong-phai-ngay', 'HD1', 'An', {}),                                                   // ngày hỏng → loại
  hk('S8', '2026-06-30', 'HD3', 'Chi', { 'Đơn giá': '3000000', 'Thanh toán': '3000000' }),       // cuối kỳ (gồm cận trên); HD3 không có ở hdmb
  hk('S9', '2026-06-25', 'HD1', 'An', { 'Khối lượng (Tấn)': '2', 'Thanh toán': '2000000' }),
];
const hdmbByKey = {
  'HD1||An': { 'Địa chỉ thường trú': 'Dia chi An' },
  'HD2||Binh': { 'Địa chỉ thường trú': 'Dia chi Binh' },
  'HD1||Binh': { 'Địa chỉ thường trú': 'SAI - khoá khác tên' },
};
const tauAs = {
  S1: { tau: 'T1', khachHang: 'KH1', ngayGan: '2026-06-25T08:00:00' },
  S2: { tau: 'T1', khachHang: 'KH1', ngayGan: '2026-06-20T08:00:00' },
  S3: { tau: 'T2', khachHang: 'KH2', ngayGan: '2026-06-22T08:00:00' },
  S4: { tau: 'T1', khachHang: 'KH1', ngayGan: '2026-06-28T10:00:00' },
  S8: { tau: 'T1', khachHang: 'KH2', ngayGan: '2026-06-30T09:00:00' },
  S9: { tau: 'T2', khachHang: 'KH2', ngayGan: '2026-07-01T00:00:00' },
  // S6 không được gán tàu
};
const snapshot = JSON.stringify([hosokeo, hdmbByKey, tauAs]);

// ================= computeXuatHang01
const x1 = computeXuatHang01(hosokeo, hdmbByKey, K('2026-06-01'), K('2026-06-30'), tauAs);
const ids1 = x1.rows.map((r) => r['Số BKLS']);
// Trong kỳ 01-30/06 có mã HĐ + ngày hợp lệ: S2(5/6) S1(10/6) S6(12/6) S3(20/6) S9(25/6) S8(30/6); loại S4(tháng 7), S5(thiếu HĐ), S7(ngày hỏng)
check('XH01: lọc kỳ + bỏ dòng thiếu Mã HĐ / ngày hỏng → 6 dòng', x1.rows.length === 6, ids1);
check('XH01: sắp tăng theo Ngày nhập (S2,S1,S6,S3,S9,S8)', eq(ids1, ['S2', 'S1', 'S6', 'S3', 'S9', 'S8']), ids1);
check('XH01: STT 1..6', eq(x1.rows.map((r) => r.STT), [1, 2, 3, 4, 5, 6]));
check('XH01: ngày cận trên 30/06 được gồm (S8)', ids1.includes('S8'));
check('XH01: loại S4 (02/07) và S5, S7', !ids1.includes('S4') && !ids1.includes('S5') && !ids1.includes('S7'));
check('XH01: tổng KL = 5.5+10+0(thiếu)+4+2+1 = 22.5', x1.totalKL === 22.5, x1.totalKL);
check('XH01: tổng thanh toán = 5.5M+10M+0+8M+2M+3M = 28.5M', x1.totalTT === 28500000, x1.totalTT);
const r2 = x1.rows[0], r1 = x1.rows[1], r6 = x1.rows[2];
check('XH01: parse "5,5" → 5.5 tấn', r2['Khối lượng (Tấn)'] === 5.5, r2['Khối lượng (Tấn)']);
check('XH01: map trường cố định (tên NL, nhà máy, CCCD, địa điểm)', r1['Tên nguyên liệu'] === 'Dăm gỗ keo' && r1['Nhà máy'] === 'CNHAK' && r1['Số CCCD'] === 'CCCD-An' && r1['Địa điểm khai thác'] === 'Rừng An' && r1['Họ và tên người bán'] === 'An' && r1['Ngày BKLS'] === '2026-06-10' && r1['Mã hợp đồng'] === 'HD1', r1);
check('XH01: ghép hợp đồng bán theo khoá "Mã HĐ||Họ tên" → địa chỉ thường trú', r1['Địa chỉ thường trú'] === 'Dia chi An' && x1.rows[3]['Địa chỉ thường trú'] === 'Dia chi Binh');
check('XH01: không khớp hdmb (HD3||Chi) → địa chỉ rỗng', x1.rows[5]['Địa chỉ thường trú'] === '', x1.rows[5]['Địa chỉ thường trú']);
check('XH01: gán tàu theo Số BKLS (S1 → T1/KH1)', r1['Tàu'] === 'T1' && r1['Khách hàng xuất'] === 'KH1');
check('XH01: dòng không có tàu (S6) → Tàu/Khách hàng rỗng', r6['Tàu'] === '' && r6['Khách hàng xuất'] === '');
check('XH01: giá trị số thiếu → null (ô trống) trên dòng, không NaN và không phá tổng', r6['Khối lượng (Tấn)'] === null && r6['Thanh toán'] === null && r6['Đơn giá'] === null, [r6['Khối lượng (Tấn)'], r6['Thanh toán'], r6['Đơn giá']]);
check('XH01: tauAssignments undefined/null → mọi dòng không tàu, không lỗi', (() => {
  const a = computeXuatHang01(hosokeo, hdmbByKey, K('2026-06-01'), K('2026-06-30'));
  const b = computeXuatHang01(hosokeo, hdmbByKey, K('2026-06-01'), K('2026-06-30'), null);
  return a.rows.length === 6 && b.rows.length === 6 && a.rows.every((r) => r['Tàu'] === '') && b.rows.every((r) => r['Khách hàng xuất'] === '');
})());
check('XH01: hdmbByKey rỗng → địa chỉ rỗng hết, không lỗi', computeXuatHang01(hosokeo, {}, K('2026-06-01'), K('2026-06-30'), tauAs).rows.every((r) => r['Địa chỉ thường trú'] === ''));
const xAll = computeXuatHang01(hosokeo, hdmbByKey, null, null, tauAs);
check('XH01: kỳ (null,null) → mọi dòng có Mã HĐ và ngày hợp lệ (7: thêm S4)', xAll.rows.length === 7 && xAll.rows.map((r) => r['Số BKLS']).includes('S4') && xAll.rows[6]['Số BKLS'] === 'S4', xAll.rows.map((r) => r['Số BKLS']));
check('XH01: chỉ có cận dưới (từ 20/06) → S3,S9,S8,S4', eq(computeXuatHang01(hosokeo, hdmbByKey, K('2026-06-20'), null, tauAs).rows.map((r) => r['Số BKLS']), ['S3', 'S9', 'S8', 'S4']));
check('XH01: kỳ không có dữ liệu → rows rỗng, tổng 0', (() => { const e = computeXuatHang01(hosokeo, hdmbByKey, K('2025-01-01'), K('2025-01-31'), tauAs); return e.rows.length === 0 && e.totalKL === 0 && e.totalTT === 0; })());
check('XH01: mảng hồ sơ rỗng → rỗng', computeXuatHang01([], {}, null, null, {}).rows.length === 0);
check('XH01: ngày dạng M/D/YYYY của Sheet ("6/25/2026") vẫn lọc đúng', (() => {
  const a = computeXuatHang01([hk('Q1', '6/25/2026', 'HD1', 'An', {})], hdmbByKey, K('2026-06-01'), K('2026-06-30'), {});
  return a.rows.length === 1;
})());
check('XH01: không sửa dữ liệu đầu vào', JSON.stringify([hosokeo, hdmbByKey, tauAs]) === snapshot);

// ================= computeXuatHang02
const x2 = computeXuatHang02(x1.rows);
// Nhóm theo (người bán, địa chỉ, CCCD, tên NL, MãHS, địa điểm, Tàu, KH):
//  An/T1/KH1 = S2+S1 → gộp; An/T2/KH2 = S9 (tách riêng theo tàu); Binh/(không tàu) = S6; Binh/T2/KH2 = S3; Chi/T1/KH2 = S8
check('XH02: gộp còn 5 nhóm (An T1 gộp S1+S2; An T2 tách riêng; Binh có/không tàu tách)', x2.rows.length === 5, x2.rows.map((r) => [r['Họ và tên người bán'], r['Tàu']]));
check('XH02: sắp tăng theo Ngày nhập (ngày lớn nhất mỗi nhóm): 10/6, 12/6, 20/6, 25/6, 30/6', eq(x2.rows.map((r) => r['Ngày nhập']), ['2026-06-10', '2026-06-12', '2026-06-20', '2026-06-25', '2026-06-30']), x2.rows.map((r) => r['Ngày nhập']));
check('XH02: STT 1..5', eq(x2.rows.map((r) => r.STT), [1, 2, 3, 4, 5]));
const g1 = x2.rows[0];
check('XH02: nhóm An/T1 → KL 15.5, trị giá 15.5M, đơn giá TB (1M+1M)/2 = 1M', g1['Khối lượng_Tấn'] === 15.5 && g1['Tổng trị giá'] === 15500000 && g1['Đơn giá'] === 1000000, g1);
check('XH02: nhóm An/T1 mang Tàu T1, KH1, Mã HS cấu hình, địa chỉ', g1['Tàu'] === 'T1' && g1['Khách hàng xuất'] === 'KH1' && g1['Mã HS'] === '4401220090' && g1['Địa chỉ thường trú'] === 'Dia chi An');
const gS6 = x2.rows[1];
check('XH02: dòng không tàu (S6, số thiếu) → Tàu rỗng, KL 0, đơn giá 0 (không có dòng nào có giá → 0)', gS6['Tàu'] === '' && gS6['Khối lượng_Tấn'] === 0 && gS6['Đơn giá'] === 0 && gS6['Tổng trị giá'] === 0, gS6);
check('XH02: cùng người bán Binh nhưng khác tàu → 2 dòng riêng (S6 vs S3)', gS6['Họ và tên người bán'] === 'Binh' && x2.rows[2]['Họ và tên người bán'] === 'Binh' && x2.rows[2]['Tàu'] === 'T2');
check('XH02: nhóm Binh/T2 = S3: KL 4, đơn giá 2M, trị giá 8M', x2.rows[2]['Khối lượng_Tấn'] === 4 && x2.rows[2]['Đơn giá'] === 2000000 && x2.rows[2]['Tổng trị giá'] === 8000000);
check('XH02: An/T2 tách riêng khỏi An/T1 (S9: 2 tấn, 2M)', x2.rows[3]['Họ và tên người bán'] === 'An' && x2.rows[3]['Tàu'] === 'T2' && x2.rows[3]['Khối lượng_Tấn'] === 2 && x2.rows[3]['Tổng trị giá'] === 2000000);
check('XH02: tổng KL 22.5 và tổng trị giá 28.5M (bảo toàn so với chi tiết)', x2.totalKL === 22.5 && x2.totalTT === 28500000 && x2.totalKL === x1.totalKL && x2.totalTT === x1.totalTT, [x2.totalKL, x2.totalTT]);
// Khoá gộp phải theo cả Địa chỉ/CCCD/Địa điểm: cùng tên nhưng khác CCCD → không gộp
const t02 = computeXuatHang02([
  { 'Họ và tên người bán': 'A', 'Địa chỉ thường trú': 'x', 'Số CCCD': '1', 'Tên nguyên liệu': 'Dăm gỗ keo', 'Địa điểm khai thác': 'P', 'Ngày BKLS': '2026-06-02', 'Khối lượng (Tấn)': 1, 'Đơn giá': 10, 'Thanh toán': 10 },
  { 'Họ và tên người bán': 'A', 'Địa chỉ thường trú': 'x', 'Số CCCD': '2', 'Tên nguyên liệu': 'Dăm gỗ keo', 'Địa điểm khai thác': 'P', 'Ngày BKLS': '2026-06-03', 'Khối lượng (Tấn)': 2, 'Đơn giá': 20, 'Thanh toán': 40 },
  { 'Họ và tên người bán': 'A', 'Địa chỉ thường trú': 'x', 'Số CCCD': '1', 'Tên nguyên liệu': 'Dăm gỗ keo', 'Địa điểm khai thác': 'P', 'Ngày BKLS': '2026-06-01', 'Khối lượng (Tấn)': 3, 'Đơn giá': 30, 'Thanh toán': 90 },
  { 'Họ và tên người bán': 'A', 'Địa chỉ thường trú': 'x', 'Số CCCD': '1', 'Tên nguyên liệu': 'Dăm gỗ keo', 'Địa điểm khai thác': 'P', 'Ngày BKLS': 'hỏng', 'Khối lượng (Tấn)': null, 'Đơn giá': null, 'Thanh toán': null },
]);
check('XH02: khác CCCD → không gộp (2 nhóm)', t02.rows.length === 2, t02.rows.length);
const tA = t02.rows.find((r) => r['Số CCCD'] === '1');
check('XH02: nhóm CCCD=1 (3 dòng, 1 ngày hỏng, 1 dòng thiếu giá): KL 1+3+0=4, trị giá 100, đơn giá TB chỉ tính dòng có giá (10+30)/2 = 20', tA['Khối lượng_Tấn'] === 4 && tA['Tổng trị giá'] === 100 && tA['Đơn giá'] === 20, tA);
check('XH02: Ngày nhập của nhóm = ngày lớn nhất hợp lệ (02/06), bỏ qua ngày hỏng và thứ tự đầu vào', tA['Ngày nhập'] === '2026-06-02', tA['Ngày nhập']);
check('XH02: đầu vào rỗng → rỗng, tổng 0', (() => { const e = computeXuatHang02([]); return e.rows.length === 0 && e.totalKL === 0 && e.totalTT === 0; })());
check('XH02: không sửa rows đầu vào', JSON.stringify(x1.rows).length > 0 && x1.rows[0].STT === 1 && x1.rows[0]['Khối lượng (Tấn)'] === 5.5 && !('klSum' in x1.rows[0]));

// ================= computeTauTongHop (dùng TOÀN BỘ rows01, mọi kỳ)
const all01 = computeXuatHang01(hosokeo, hdmbByKey, null, null, tauAs).rows; // gồm S4 (tháng 7)
const th = computeTauTongHop(all01, tauAs);
// T1/KH1: S1,S2,S4 → 3 dòng, KL 10+5.5+3=18.5, TT 10M+5.5M+3M=18.5M, ngày gán max 2026-06-28
// T2/KH2: S3,S9 → 2 dòng, KL 4+2=6, TT 8M+2M=10M, ngày gán max 2026-07-01
// T1/KH2: S8 → 1 dòng, KL 1, TT 3M, ngày gán 2026-06-30 ; S6 không tàu → loại
check('Tàu TH: gom theo (Tàu, KH) → 3 nhóm, bỏ dòng không tàu (S6)', th.rows.length === 3, th.rows.map((r) => [r['Tàu'], r['Khách hàng xuất']]));
check('Tàu TH: sắp theo Ngày gán gần nhất GIẢM dần (T2/KH2 01/07, T1/KH2 30/06, T1/KH1 28/06)', eq(th.rows.map((r) => r['Tàu'] + '/' + r['Khách hàng xuất']), ['T2/KH2', 'T1/KH2', 'T1/KH1']), th.rows.map((r) => r['Tàu'] + '/' + r['Khách hàng xuất']));
check('Tàu TH: STT 1..3', eq(th.rows.map((r) => r.STT), [1, 2, 3]));
check('Tàu TH: ngày gán gần nhất cắt còn YYYY-MM-DD', eq(th.rows.map((r) => r['Ngày gán gần nhất']), ['2026-07-01', '2026-06-30', '2026-06-28']), th.rows.map((r) => r['Ngày gán gần nhất']));
const tT1KH1 = th.rows[2];
check('Tàu TH: T1/KH1 = 3 dòng, 18.5 tấn, 18.5M (kể cả S4 ngoài kỳ tháng 6)', tT1KH1['Số dòng BKLS'] === 3 && tT1KH1['Khối lượng_Tấn'] === 18.5 && tT1KH1['Tổng thanh toán'] === 18500000, tT1KH1);
check('Tàu TH: T2/KH2 = 2 dòng, 6 tấn, 10M', th.rows[0]['Số dòng BKLS'] === 2 && th.rows[0]['Khối lượng_Tấn'] === 6 && th.rows[0]['Tổng thanh toán'] === 10000000, th.rows[0]);
check('Tàu TH: T1/KH2 = 1 dòng, 1 tấn, 3M', th.rows[1]['Số dòng BKLS'] === 1 && th.rows[1]['Khối lượng_Tấn'] === 1 && th.rows[1]['Tổng thanh toán'] === 3000000, th.rows[1]);
check('Tàu TH: tổng KL 25.5, tổng TT 31.5M, tổng số dòng 6', th.totalKL === 25.5 && th.totalTT === 31500000 && th.totalDong === 6, [th.totalKL, th.totalTT, th.totalDong]);
check('Tàu TH: cùng tàu khác khách hàng tách riêng (T1/KH1 ≠ T1/KH2)', th.rows.filter((r) => r['Tàu'] === 'T1').length === 2);

// Dữ liệu dựng tay: thiếu ngày gán, khách hàng rỗng, giá trị null, tauAssignments null
const rowsTay = [
  { 'Số BKLS': 'A', 'Tàu': 'TX', 'Khách hàng xuất': '', 'Khối lượng (Tấn)': 2, 'Thanh toán': 200 },
  { 'Số BKLS': 'B', 'Tàu': 'TX', 'Khách hàng xuất': '', 'Khối lượng (Tấn)': null, 'Thanh toán': NaN },
  { 'Số BKLS': 'C', 'Tàu': 'TY', 'Khách hàng xuất': 'K', 'Khối lượng (Tấn)': 1, 'Thanh toán': 100 },
  { 'Số BKLS': 'D', 'Tàu': '', 'Khách hàng xuất': 'K', 'Khối lượng (Tấn)': 99, 'Thanh toán': 99 },
];
const thTay = computeTauTongHop(rowsTay, { C: { tau: 'TY', khachHang: 'K', ngayGan: '2026-05-01T00:00:00' }, A: { tau: 'TX', khachHang: '' } });
check('Tàu TH (dựng tay): 2 nhóm TX/"" và TY/K; bỏ dòng Tàu rỗng', thTay.rows.length === 2 && thTay.totalDong === 3, thTay.rows);
check('Tàu TH (dựng tay): có ngày gán xếp trước, không có ngày gán (rỗng) xếp sau', eq(thTay.rows.map((r) => r['Tàu']), ['TY', 'TX']), thTay.rows.map((r) => r['Tàu']));
const tx = thTay.rows[1];
check('Tàu TH (dựng tay): TX = 2 dòng, KL 2 (null→0), TT 200 (NaN→0), ngày gán rỗng, KH rỗng', tx['Số dòng BKLS'] === 2 && tx['Khối lượng_Tấn'] === 2 && tx['Tổng thanh toán'] === 200 && tx['Ngày gán gần nhất'] === '' && tx['Khách hàng xuất'] === '', tx);
check('Tàu TH (dựng tay): tổng KL 3, TT 300', thTay.totalKL === 3 && thTay.totalTT === 300, [thTay.totalKL, thTay.totalTT]);
check('Tàu TH: tauAssignments null/undefined → không lỗi, ngày gán rỗng', (() => {
  const a = computeTauTongHop(rowsTay, null), b = computeTauTongHop(rowsTay);
  return a.rows.length === 2 && b.rows.length === 2 && a.rows.every((r) => r['Ngày gán gần nhất'] === '');
})());
check('Tàu TH: đầu vào rỗng / toàn dòng không tàu → rỗng, tổng 0', (() => {
  const a = computeTauTongHop([], {}), b = computeTauTongHop([rowsTay[3]], {});
  return a.rows.length === 0 && a.totalKL === 0 && a.totalTT === 0 && a.totalDong === 0 && b.rows.length === 0;
})());
check('Tàu TH: không sửa dữ liệu đầu vào', rowsTay.length === 4 && rowsTay[0]['Tàu'] === 'TX' && !('soDong' in rowsTay[0]) && JSON.stringify([hosokeo, hdmbByKey, tauAs]) === snapshot);

console.log('\n=== RESULT: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail ? 1 : 0);
