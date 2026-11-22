// Kiểm chứng logic thuần (không trình duyệt) của computeTongHopNgay, computeBankTNDN, computePhieuNhapKho
// trong services/report-service.js. Mọi số kỳ vọng được TÍNH TAY từ dữ liệu nhỏ trong file này.
// Chạy: node tests/test-report-tonghop-bank.mjs
import { computeTongHopNgay, computeBankTNDN, computePhieuNhapKho } from '../src/services/report-service.js';
import { dateKey } from '../src/utils/date-utils.js';

let pass = 0, fail = 0;
const check = (n, ok, x) => { ok ? pass++ : fail++; console.log((ok ? 'OK   ' : 'FAIL ') + n + (ok || x === undefined ? '' : '  [' + JSON.stringify(x) + ']')); };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const near = (a, b) => typeof a === 'number' && Math.abs(a - b) < 1e-9;
const K = dateKey;
const clone = (o) => JSON.parse(JSON.stringify(o));

// =====================================================================================
// computeTongHopNgay
// =====================================================================================
const pcs = [
  { So_CT: 'P1', 'Ngày cân 1': '2026-06-10', 'KL hàng (KG)': '2000', 'Thành tiền': '4000000', 'ĐL': 'DT', 'NG': 'D1' },
  { So_CT: 'P2', 'Ngày cân 1': '2026-06-10', 'KL hàng (KG)': '1000', 'Thành tiền': '2000000', 'ĐL': 'QT', 'NG': 'D1' },
  { So_CT: 'P3', 'Ngày cân 1': '2026-06-09', 'KL hàng (KG)': '500', 'Thành tiền': '1000000', 'ĐL': 'DT', 'NG': 'D3' },
  { So_CT: 'P4', 'Ngày cân 1': '2026-07-01', 'KL hàng (KG)': '800', 'Thành tiền': '1600000', 'ĐL': 'KL', 'NG': 'D9' }, // ngoài kỳ
  { So_CT: 'P5', 'Ngày cân 1': '2026-06-10', 'KL hàng (KG)': null, 'Thành tiền': '', 'ĐL': 'DT', 'NG': '' },       // thiếu số
];
const bySoCT = {};
pcs.forEach((p) => { bySoCT[p.So_CT] = p; });
bySoCT.Z = { So_CT: 'Z', 'Ngày cân 1': '2026-05-28', 'ĐL': 'QT', 'NG': 'D3' }; // cân tháng trước, thanh toán trong kỳ
const dn = [
  { 'Số CT': 'P1', 'Ngày thanh toán': '2026-06-12', 'Khối lượng': '2', 'Thành tiền': '4000000' },
  { 'Số CT': 'Z', 'Ngày thanh toán': '2026-06-12', 'Khối lượng': '1.5', 'Thành tiền': '3000000' },
  { 'Số CT': 'P3', 'Ngày thanh toán': '2026-06-11', 'Khối lượng': '0.5', 'Thành tiền': '1000000' },
  { 'Số CT': 'P4', 'Ngày thanh toán': '2026-08-01', 'Khối lượng': '0.8', 'Thành tiền': '1600000' }, // ngoài kỳ
  { 'Số CT': 'X', 'Ngày thanh toán': '2026-06-11', 'Khối lượng': '1', 'Thành tiền': '2000000' },   // không có phiếu cân
  { 'Số CT': 'P2', 'Ngày thanh toán': '', 'Khối lượng': '1', 'Thành tiền': '2000000' },            // chưa có ngày TT
];
const pcsSnap = clone(pcs), dnSnap = clone(dn), mapSnap = clone(bySoCT);
const th = computeTongHopNgay(pcs, dn, bySoCT, K('2026-06-01'), K('2026-06-30'));
const R = (d) => th.rows.find((r) => r['Ngày'] === d);

check('TongHopNgay: 4 ngày 09,10,11,12 (loại ngoài kỳ, loại TT không ngày)', eq(th.rows.map((r) => r['Ngày']), ['2026-06-09', '2026-06-10', '2026-06-11', '2026-06-12']), th.rows.map((r) => r['Ngày']));
check('TongHopNgay: ngày 09 chỉ có nhập (1.000.000 / 0,5 tấn)', R('2026-06-09')['Giá trị nhập'] === 1000000 && near(R('2026-06-09')['Khối lượng nhập'], 0.5) && R('2026-06-09')['Giá trị thanh toán'] === 0);
check('TongHopNgay: ngày 10 gộp 3 phiếu (kể cả phiếu thiếu số) → 6.000.000 / 3 tấn', R('2026-06-10')['Giá trị nhập'] === 6000000 && near(R('2026-06-10')['Khối lượng nhập'], 3), R('2026-06-10'));
check('TongHopNgay: ngày 10 nhập theo ĐL: DT=2, QT=1; theo NG: D1=3, D3=0', near(R('2026-06-10')['NHAP_DL.DT'], 2) && near(R('2026-06-10')['NHAP_DL.QT'], 1) && near(R('2026-06-10')['NHAP_NG.D1'], 3) && R('2026-06-10')['NHAP_NG.D3'] === 0);
check('TongHopNgay: ngày 11 chỉ thanh toán = P3 + X = 3.000.000 / 1,5 tấn', R('2026-06-11')['Giá trị thanh toán'] === 3000000 && near(R('2026-06-11')['Khối lượng thanh toán'], 1.5) && R('2026-06-11')['Giá trị nhập'] === 0, R('2026-06-11'));
check('TongHopNgay: ngày 11 tách TT theo phiếu cân: DT=0,5 / D3=0,5; dòng X (không có phiếu cân) không vào cột tách', near(R('2026-06-11')['TT_DL.DT'], 0.5) && R('2026-06-11')['TT_DL.QT'] === 0 && near(R('2026-06-11')['TT_NG.D3'], 0.5) && R('2026-06-11')['TT_NG.D1'] === 0);
check('TongHopNgay: ngày 12 TT = 7.000.000 / 3,5 tấn; ĐL DT=2, QT=1,5; NG D1=2, D3=1,5', R('2026-06-12')['Giá trị thanh toán'] === 7000000 && near(R('2026-06-12')['Khối lượng thanh toán'], 3.5) && near(R('2026-06-12')['TT_DL.DT'], 2) && near(R('2026-06-12')['TT_DL.QT'], 1.5) && near(R('2026-06-12')['TT_NG.D1'], 2) && near(R('2026-06-12')['TT_NG.D3'], 1.5), R('2026-06-12'));
check('TongHopNgay: mã cột = hợp nhập+TT, sắp ABC, bỏ rỗng/ngoài kỳ (DT,QT / D1,D3; không KL, D9)', th.cols.map((c) => c[0]).join('|') === ['Ngày', 'Giá trị nhập', 'Khối lượng nhập', 'NHAP_DL.DT', 'NHAP_DL.QT', 'NHAP_NG.D1', 'NHAP_NG.D3', 'Giá trị thanh toán', 'Khối lượng thanh toán', 'TT_DL.DT', 'TT_DL.QT', 'TT_NG.D1', 'TT_NG.D3'].join('|'), th.cols.map((c) => c[0]));
check('TongHopNgay: cột có nhãn + kiểu (Ngày=date, Giá trị=money, KL=kl)', th.cols[0][2] === 'date' && th.cols[1][2] === 'money' && th.cols[2][2] === 'kl' && th.cols[3][1] === 'Nhập - ĐL DT (tấn)');
check('TongHopNgay: tổng nhập 7.000.000 / 3,5 tấn; tổng TT 10.000.000 / 5 tấn', th.totals['Giá trị nhập'] === 7000000 && near(th.totals['Khối lượng nhập'], 3.5) && th.totals['Giá trị thanh toán'] === 10000000 && near(th.totals['Khối lượng thanh toán'], 5), th.totals);
check('TongHopNgay: tổng cột tách ĐL/NG', near(th.totals['NHAP_DL.DT'], 2.5) && near(th.totals['NHAP_DL.QT'], 1) && near(th.totals['NHAP_NG.D1'], 3) && near(th.totals['NHAP_NG.D3'], 0.5) && near(th.totals['TT_DL.DT'], 2.5) && near(th.totals['TT_DL.QT'], 1.5) && near(th.totals['TT_NG.D1'], 2) && near(th.totals['TT_NG.D3'], 2), th.totals);
check('TongHopNgay: tổng = cộng các dòng', th.rows.reduce((s, r) => s + r['Giá trị thanh toán'], 0) === th.totals['Giá trị thanh toán']);
check('TongHopNgay: không sửa đầu vào', eq(pcs, pcsSnap) && eq(dn, dnSnap) && eq(bySoCT, mapSnap));

// Mã chỉ có ở phía thanh toán vẫn sinh cột (BUGFIX D3)
const th2 = computeTongHopNgay(pcs.filter((p) => p.So_CT === 'P4'), [dn[1]], bySoCT, K('2026-06-01'), K('2026-06-30'));
check('TongHopNgay: không có nhập trong kỳ, mã chỉ có ở TT (QT/D3) vẫn có cột TT_*', th2.rows.length === 1 && near(th2.rows[0]['TT_DL.QT'], 1.5) && near(th2.rows[0]['TT_NG.D3'], 1.5) && th2.rows[0]['Giá trị nhập'] === 0 && th2.cols.some((c) => c[0] === 'TT_NG.D3'), th2.rows);

// Không kỳ (null,null): lấy tất cả ngày có Ngày cân 1 / Ngày TT hợp lệ; sắp theo ngày thật dù nhập dạng M/D/YYYY
const th3 = computeTongHopNgay(
  [{ 'Ngày cân 1': '10/2/2026', 'KL hàng (KG)': '1000', 'Thành tiền': '100' }, { 'Ngày cân 1': '9/30/2026', 'KL hàng (KG)': '1000', 'Thành tiền': '200' }, { 'Ngày cân 1': '', 'KL hàng (KG)': '1000', 'Thành tiền': '999' }],
  [], {}, null, null);
check('TongHopNgay: ngày M/D/YYYY sắp theo ngày thật (9/30 trước 10/2); ngày rỗng bị loại', eq(th3.rows.map((r) => r['Ngày']), ['9/30/2026', '10/2/2026']) && th3.totals['Giá trị nhập'] === 300, th3.rows.map((r) => r['Ngày']));
const th4 = computeTongHopNgay([], [], {}, K('2026-06-01'), K('2026-06-30'));
check('TongHopNgay: dữ liệu rỗng → 0 dòng, 4 tổng = 0, 3+2... cột cơ bản', th4.rows.length === 0 && th4.cols.length === 5 && th4.totals['Giá trị nhập'] === 0, th4);

// =====================================================================================
// computeBankTNDN
// =====================================================================================
const pcB = {
  A: { So_CT: 'A', 'Ngày cân 1': '2026-06-10' },
  B: { So_CT: 'B', 'Ngày cân 1': '2026-06-09' },
  E: { So_CT: 'E', 'Ngày cân 1': '2026-06-15' }, // phiếu cân CHƯA có DNTT
  F: { So_CT: 'F', 'Ngày cân 1': '2026-07-02' }, // ngoài kỳ
  G: { So_CT: 'G', 'Ngày cân 1': '2026-06-10' },
};
const dnB = [
  { 'Số CT': 'A', 'Số hợp đồng': 'HD1', 'Họ tên Chủ rừng': 'Nguyen Van A', 'Khối lượng': '2', 'Đơn giá thanh toán': '2000000', 'Thành tiền': '4000000' },
  { 'Số CT': 'B', 'Số hợp đồng': 'HD2', 'Họ tên Chủ rừng': 'tran thi b', 'Khối lượng': '1', 'Đơn giá thanh toán': '2100000', 'Thành tiền': '2100000' },
  { 'Số CT': 'NOPC', 'Số hợp đồng': 'HD1', 'Họ tên Chủ rừng': 'Nguyen Van A', 'Khối lượng': '9', 'Đơn giá thanh toán': '1', 'Thành tiền': '9' }, // không có phiếu cân
  { 'Số CT': 'F', 'Số hợp đồng': 'HD1', 'Họ tên Chủ rừng': 'Nguyen Van A', 'Khối lượng': '3', 'Đơn giá thanh toán': '1', 'Thành tiền': '3' },    // ngoài kỳ
  { 'Số CT': 'G', 'Số hợp đồng': 'HD_MISSING', 'Họ tên Chủ rừng': null, 'Khối lượng': null, 'Đơn giá thanh toán': '', 'Thành tiền': null },        // thiếu hợp đồng + thiếu số
];
const hd = {
  HD1: { 'Địa chỉ thường trú': 'Xa X', 'Số CCCD Chủ rừng': '0123', 'Số ĐT DĐ Chủ rừng': '0900', 'Họ tên Chủ rừng': 'NGUYEN VAN A (viết hoa, lệch)' },
  HD2: { 'Địa chỉ thường trú': 'Xa Y', 'Số CCCD Chủ rừng': '0456', 'Số ĐT DĐ Chủ rừng': '0911', 'Họ tên Chủ rừng': 'Trần Thị B' },
};
const dnBSnap = clone(dnB), pcBSnap = clone(pcB), hdSnap = clone(hd);
const bk = computeBankTNDN(dnB, pcB, hd, K('2026-06-01'), K('2026-06-30'));
check('BK02: chỉ DNTT có phiếu cân trong kỳ → 3 dòng (B, A, G); phiếu cân E chưa DNTT, NOPC, F ngoài kỳ bị loại', eq(bk.rows.map((r) => r['Ghi chú']), ['B', 'A', 'G']), bk.rows.map((r) => r['Ghi chú']));
check('BK02: phiếu cân chưa có DNTT (E) không vào bảng', !bk.rows.some((r) => r['Ghi chú'] === 'E'));
check('BK02: sắp theo Ngày cân 1 tăng dần, trùng ngày giữ thứ tự nhập (A trước G); STT 1..3', eq(bk.rows.map((r) => r['STT']), [1, 2, 3]) && bk.rows[1]['Ngày tháng năm mua hàng'] === '2026-06-10' && bk.rows[0]['Ngày tháng năm mua hàng'] === '2026-06-09');
const rA = bk.rows.find((r) => r['Ghi chú'] === 'A'), rB = bk.rows.find((r) => r['Ghi chú'] === 'B'), rG = bk.rows.find((r) => r['Ghi chú'] === 'G');
check('BK02: Số lượng/Đơn giá/Tổng giá TT lấy từ DNTT (A: 2 / 2.000.000 / 4.000.000)', rA['Số lượng/trọng lượng'] === 2 && rA['Đơn giá'] === 2000000 && rA['Tổng giá thanh toán'] === 4000000, rA);
check('BK02: dòng B: 1 / 2.100.000 / 2.100.000', rB['Số lượng/trọng lượng'] === 1 && rB['Đơn giá'] === 2100000 && rB['Tổng giá thanh toán'] === 2100000, rB);
check('BK02: Tên người bán lấy từ DNTT (không từ HD_NCC)', rA['Tên người bán'] === 'Nguyen Van A' && rB['Tên người bán'] === 'tran thi b', [rA['Tên người bán'], rB['Tên người bán']]);
check('BK02: ghép HD_NCC chỉ theo Số hợp đồng — Họ tên lệch hoa/thường vẫn lấy đủ Địa chỉ/CCCD/ĐT', rA['Địa chỉ'] === 'Xa X' && rA['Số CCCD'] === '0123' && rA['Số Điện thoại'] === '0900' && rB['Địa chỉ'] === 'Xa Y' && rB['Số CCCD'] === '0456' && rB['Số Điện thoại'] === '0911', [rA, rB]);
check('BK02: tên hàng cố định "Gỗ tròn keo"', bk.rows.every((r) => r['Tên hàng hóa/dịch vụ'] === 'Gỗ tròn keo'));
check('BK02: dòng thiếu hợp đồng/thiếu số → chuỗi rỗng & 0 (không NaN/null)', rG['Tên người bán'] === '' && rG['Địa chỉ'] === '' && rG['Số CCCD'] === '' && rG['Số Điện thoại'] === '' && rG['Số lượng/trọng lượng'] === 0 && rG['Đơn giá'] === 0 && rG['Tổng giá thanh toán'] === 0, rG);
check('BK02: tổng SL = 3, tổng tiền = 6.100.000, ngày max = 2026-06-10', bk.totalSL === 3 && bk.totalTT === 6100000 && bk.ngayMax === '2026-06-10', [bk.totalSL, bk.totalTT, bk.ngayMax]);
check('BK02: không sửa phiếu cân và HD_NCC đầu vào', eq(pcB, pcBSnap) && eq(hd, hdSnap));
// NGHI BUG: computeBankTNDN ghi thuộc tính tạm r.__ngayCan1 lên CHÍNH các dòng DNTT đầu vào (report-service.js ~dòng 560-562: `r.__ngayCan1 = ngayCan1` trong callback filter) → làm bẩn dữ liệu STATE gốc.
check('BK02: không sửa các dòng DNTT đầu vào (không thêm __ngayCan1)  // NGHI BUG', eq(dnB, dnBSnap), dnB.map((r) => Object.keys(r).filter((k) => k.startsWith('__'))));
const bkAll = computeBankTNDN(dnB.map((r) => { const c = { ...r }; delete c.__ngayCan1; return c; }), pcB, hd, null, null);
check('BK02: không kỳ (null,null) → vẫn loại DNTT không có phiếu cân (NOPC) → 4 dòng, F xếp cuối, ngày max 2026-07-02', bkAll.rows.length === 4 && bkAll.rows[3]['Ghi chú'] === 'F' && bkAll.ngayMax === '2026-07-02', bkAll.rows.map((r) => r['Ghi chú']));
const bk0 = computeBankTNDN([], {}, {}, K('2026-06-01'), K('2026-06-30'));
check('BK02: rỗng → 0 dòng, tổng 0, ngayMax null', bk0.rows.length === 0 && bk0.totalSL === 0 && bk0.totalTT === 0 && bk0.ngayMax === null);

// =====================================================================================
// computePhieuNhapKho
// =====================================================================================
const pcN = [
  { 'Ngày cân 1': '2026-06-10', 'KL hàng (KG)': '2000', 'Thành tiền': '4000000' },
  { 'Ngày cân 1': '2026-06-10', 'KL hàng (KG)': '1000', 'Thành tiền': '2000000' },
  { 'Ngày cân 1': '2026-06-09', 'KL hàng (KG)': '500', 'Thành tiền': '1000000' },
  { 'Ngày cân 1': '2026-07-01', 'KL hàng (KG)': '800', 'Thành tiền': '1600000' }, // ngoài kỳ
  { 'Ngày cân 1': '2026-06-10', 'KL hàng (KG)': null, 'Thành tiền': '' },          // thiếu số
  { 'Ngày cân 1': '', 'KL hàng (KG)': '100', 'Thành tiền': '999' },                 // không ngày
];
const pcNSnap = clone(pcN);
const nk = computePhieuNhapKho(pcN, K('2026-06-01'), K('2026-06-30'));
check('NhapKho: gộp theo ngày → 2 dòng (09, 10) sắp tăng dần, STT 1,2', eq(nk.rows.map((r) => r['Ngày nhập kho']), ['2026-06-09', '2026-06-10']) && eq(nk.rows.map((r) => r.STT), [1, 2]), nk.rows.map((r) => r['Ngày nhập kho']));
check('NhapKho: ngày 09 = 0,5 tấn, 1.000.000, ĐG 2.000.000', near(nk.rows[0]['Khối lượng'], 0.5) && nk.rows[0]['Thành tiền'] === 1000000 && nk.rows[0]['Đơn giá thanh toán'] === 2000000, nk.rows[0]);
check('NhapKho: ngày 10 = 3 tấn, 6.000.000, ĐG 2.000.000 (phiếu thiếu số không phá tổng)', near(nk.rows[1]['Khối lượng'], 3) && nk.rows[1]['Thành tiền'] === 6000000 && nk.rows[1]['Đơn giá thanh toán'] === 2000000, nk.rows[1]);
check('NhapKho: Số CT dạng YYYYMM_D (không đệm số 0 cho ngày)', nk.rows[0]['Số CT'] === '202606_9' && nk.rows[1]['Số CT'] === '202606_10', nk.rows.map((r) => r['Số CT']));
check('NhapKho: số tiền bằng chữ', nk.rows[0]['Số tiền bằng chữ'] === 'Một triệu đồng' && nk.rows[1]['Số tiền bằng chữ'] === 'Sáu triệu đồng', nk.rows.map((r) => r['Số tiền bằng chữ']));
check('NhapKho: tổng 3,5 tấn / 7.000.000', near(nk.totalKL, 3.5) && nk.totalTT === 7000000, [nk.totalKL, nk.totalTT]);
check('NhapKho: không sửa đầu vào', eq(pcN, pcNSnap));
const nk2 = computePhieuNhapKho([
  { 'Ngày cân 1': '2026-11-05', 'KL hàng (KG)': '1000', 'Thành tiền': '2000000' },
  { 'Ngày cân 1': '2026-01-31', 'KL hàng (KG)': '1000', 'Thành tiền': '2000000' },
  { 'Ngày cân 1': '2026-03-02', 'KL hàng (KG)': '0', 'Thành tiền': '0' },
], null, null);
check('NhapKho: Số CT tháng ≥10 không đệm 0, tháng <10 đệm 0 (202611_5, 202601_31, 202603_2); sắp 01-31, 03-02, 11-05', eq(nk2.rows.map((r) => r['Số CT']), ['202601_31', '202603_2', '202611_5']), nk2.rows.map((r) => r['Số CT']));
check('NhapKho: KL=0 → đơn giá 0 (không chia 0), bằng chữ "Không đồng"', nk2.rows[1]['Đơn giá thanh toán'] === 0 && nk2.rows[1]['Số tiền bằng chữ'] === 'Không đồng', nk2.rows[1]);
const nk3 = computePhieuNhapKho([], K('2026-06-01'), K('2026-06-30'));
check('NhapKho: rỗng → 0 dòng, tổng 0', nk3.rows.length === 0 && nk3.totalKL === 0 && nk3.totalTT === 0);
const nk4 = computePhieuNhapKho([{ 'Ngày cân 1': '2026-06-10', 'KL hàng (KG)': '1000', 'Thành tiền': '2105000' }], null, null);
check('NhapKho: đọc tiền lẻ "Hai triệu một trăm lẻ năm nghìn đồng"', nk4.rows[0]['Số tiền bằng chữ'] === 'Hai triệu một trăm lẻ năm nghìn đồng', nk4.rows[0]['Số tiền bằng chữ']);

console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);
