// Kiểm chứng logic thuần của services/report-service.js (không cần trình duyệt): lọc kỳ, sắp xếp,
// ghép phiếu cân ↔ DNTT, công nợ, sổ tiền vay (lũy kế) và tổng hợp thanh toán — mọi số kỳ vọng
// được tính tay từ dữ liệu nhỏ trong file này, KHÔNG lấy từ chính kết quả của hàm.
// Chạy: npm run test:report-service
import {
  computeNhapKeo, computeXeCho1h, computeThanhToan, computeCongNo, computeSoTienVay,
  computeTongHopThanhToan, sumCols, excelSerialToStr,
} from '../src/services/report-service.js';
import { dateKey } from '../src/utils/date-utils.js';

let pass = 0, fail = 0;
const check = (n, ok, x) => { ok ? pass++ : fail++; console.log((ok ? 'OK   ' : 'FAIL ') + n + (ok || x === undefined ? '' : '  [' + JSON.stringify(x) + ']')); };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const K = dateKey;

// ---- computeNhapKeo: lọc theo Ngày cân 1, sắp theo ngày+giờ cân 1, STT, tổng
const pc = [
  { So_CT: 'B', 'Ngày cân 1': '2026-06-10', 'Giờ cân 1': '09:00:00', 'Ngày cân 2': '2026-06-10', 'Giờ cân 2': '10:30:00', 'KL hàng (KG)': '2000', 'Thành tiền': '4000000', 'Đơn giá_TC': '2000' },
  { So_CT: 'A', 'Ngày cân 1': '2026-06-09', 'Giờ cân 1': '15:00:00', 'Ngày cân 2': '2026-06-09', 'Giờ cân 2': '16:00:00', 'KL hàng (KG)': '1000', 'Thành tiền': '2000000', 'Đơn giá_TC': '2000' },
  { So_CT: 'C', 'Ngày cân 1': '2026-07-01', 'Giờ cân 1': '08:00:00', 'Ngày cân 2': '2026-07-01', 'Giờ cân 2': '08:20:00', 'KL hàng (KG)': '500', 'Thành tiền': '1000000', 'Đơn giá_TC': '2000' },
  { So_CT: 'D', 'Ngày cân 1': '2026-06-10', 'Giờ cân 1': '07:00:00', 'Ngày cân 2': '', 'Giờ cân 2': '', 'KL hàng (KG)': '300', 'Thành tiền': '600000', 'Đơn giá_TC': '2000' },
];
const nk = computeNhapKeo(pc, K('2026-06-01'), K('2026-06-30'));
check('Nhập keo: loại phiếu ngoài kỳ (C) → 3 dòng', nk.rows.length === 3, nk.rows.map((r) => r.So_CT));
check('Nhập keo: sắp theo ngày+giờ cân 1 (A, D, B)', eq(nk.rows.map((r) => r.So_CT), ['A', 'D', 'B']), nk.rows.map((r) => r.So_CT));
check('Nhập keo: STT 1..3', eq(nk.rows.map((r) => r.STT), [1, 2, 3]));
check('Nhập keo: tổng KL = 3300 kg, tổng tiền = 6.600.000', nk.totalKL === 3300 && nk.totalTien === 6600000, [nk.totalKL, nk.totalTien]);
check('Nhập keo: không sửa mảng đầu vào', pc[0].So_CT === 'B' && pc.length === 4);
check('Nhập keo: không có kỳ (null, null) → cả 4 phiếu', computeNhapKeo(pc, null, null).rows.length === 4);

// ---- computeXeCho1h: chỉ xe chờ > 1 giờ; đúng 60 phút không tính; thiếu giờ cân 2 bỏ qua
const cho = computeXeCho1h(nk.rows);
check('Xe chờ >1h: chỉ phiếu B (90 phút)', cho.length === 1 && cho[0].So_CT === 'B', cho.map((r) => r.So_CT));
check('Xe chờ >1h: "1 giờ 30 phút 0 giây", TT=1', cho[0]['Thời gian chờ'] === '1 giờ 30 phút 0 giây' && cho[0].TT === 1, cho[0]['Thời gian chờ']);

// ---- computeThanhToan: lọc theo Ngày thanh toán, ghép phiếu cân theo Số CT
const dntt = [
  { 'Số CT': 'B', 'Ngày thanh toán': '2026-06-12', 'Số hợp đồng': 'HD1', 'Họ tên Chủ rừng': 'Nguyen Van A', 'Khối lượng': '2', 'Đơn giá thanh toán': '2000000', 'Thành tiền': '4000000' },
  { 'Số CT': 'A', 'Ngày thanh toán': '2026-06-11', 'Số hợp đồng': 'HD2', 'Họ tên Chủ rừng': 'nguyen van a', 'Khối lượng': '1', 'Đơn giá thanh toán': '2000000', 'Thành tiền': '2000000' },
  { 'Số CT': 'C', 'Ngày thanh toán': '2026-08-01', 'Số hợp đồng': 'HD3', 'Họ tên Chủ rừng': 'Tran Thi B', 'Khối lượng': '0.5', 'Đơn giá thanh toán': '2000000', 'Thành tiền': '1000000' },
  { 'Số CT': 'Z', 'Ngày thanh toán': '', 'Số hợp đồng': 'HD9', 'Họ tên Chủ rừng': 'Chua TT', 'Khối lượng': '9', 'Đơn giá thanh toán': '1', 'Thành tiền': '9' },
];
const bySoCT = {}; pc.forEach((r) => { bySoCT[r.So_CT] = r; });
const tt = computeThanhToan(dntt, bySoCT, K('2026-06-01'), K('2026-06-30'));
check('Thanh toán: chỉ 2 dòng trong kỳ, sắp tăng theo ngày (A rồi B)', eq(tt.rows.map((r) => r['Số CT']), ['A', 'B']), tt.rows.map((r) => r['Số CT']));
check('Thanh toán: ghép Ngày cân 1 từ phiếu cân', tt.rows[0]['Ngày cân 1'] === '2026-06-09' && tt.rows[1]['Giờ cân 1'] === '09:00:00');
check('Thanh toán: tổng KL 3 tấn, tiền 6.000.000', tt.totalKL === 3 && tt.totalTien === 6000000, [tt.totalKL, tt.totalTien]);

// ---- computeCongNo: chưa thanh toán, hoặc thanh toán SAU ngày báo cáo; bỏ phiếu cân sau ngày báo cáo
const dnttBySoCT = {}; dntt.forEach((r) => { dnttBySoCT[r['Số CT']] = r; });
const cn = computeCongNo(pc, dnttBySoCT, K('2026-06-11'));
// A: cân 06-09, trả 06-11 (= ngày báo cáo → đã trả, loại); B: cân 06-10, trả 06-12 (sau → còn nợ); D: chưa có DNTT → còn nợ; C: cân sau ngày báo cáo → loại
check('Công nợ ngày 11/06: gồm B (trả sau) và D (chưa trả), loại A (trả đúng ngày) và C (cân sau)', eq(cn.rows.map((r) => r.So_CT), ['B', 'D']) || eq(cn.rows.map((r) => r.So_CT), ['D', 'B']), cn.rows.map((r) => r.So_CT));
check('Công nợ: sắp theo ngày cân (cùng ngày giữ nguyên thứ tự gốc B, D)', eq(cn.rows.map((r) => r.So_CT), ['B', 'D']), cn.rows.map((r) => r.So_CT));
check('Công nợ: ghi Số hợp đồng từ DNTT (B=HD1, D rỗng)', cn.rows[0]['Số hợp đồng'] === 'HD1' && cn.rows[1]['Số hợp đồng'] === '');
check('Công nợ: tổng tiền = 4.000.000 + 600.000', cn.totalTien === 4600000, cn.totalTien);

// ---- computeSoTienVay: sổ lũy kế
const vay = [{ ngayHachToan: '2026-06-09', ngayChungTu: '2026-06-09', tongTienVay: 1000 }];
const chi = [
  { 'Ngày thanh toán': '2026-06-05', 'Khối lượng': '1', 'Thành tiền': '200', 'Họ tên Chủ rừng': 'A' },   // trước lần giải ngân đầu
  { 'Ngày thanh toán': '2026-06-10', 'Khối lượng': '2', 'Thành tiền': '300', 'Họ tên Chủ rừng': 'B' },
  { 'Ngày thanh toán': '2026-06-20', 'Khối lượng': '3', 'Thành tiền': '100', 'Họ tên Chủ rừng': 'C' },
];
let sv = computeSoTienVay(vay, chi, null, null, null);
check('Sổ vay: bắt đầu từ ngày giải ngân đầu (bỏ chi 05/06) → 3 dòng', sv.rows.length === 3 && sv.batDau.loai === 'giaiNgan', [sv.rows.length, sv.batDau]);
check('Sổ vay: lũy kế 1000 → 700 → 600', eq(sv.rows.map((r) => r['Lũy kế tiền vay chi']), [1000, 700, 600]), sv.rows.map((r) => r['Lũy kế tiền vay chi']));
check('Sổ vay: tổng vay 1000, tổng chi 400, lũy kế cuối 600, 1 lần vay, 2 dòng chi, 5 tấn', sv.totalVay === 1000 && sv.totalChi === 400 && sv.luyKeCuoi === 600 && sv.soLanVay === 1 && sv.soDongChi === 2 && sv.totalSoTan === 5, sv);
sv = computeSoTienVay(vay, chi, null, null, { ngay: '2026-06-01', soTien: 500 });
check('Sổ vay có số dư nhập tay 500 từ 01/06: dòng "Số dư đầu kỳ" 500, rồi 500−200=300, +1000=1300, −300=1000, −100=900', sv.rows[0]._opening === true && eq(sv.rows.map((r) => r['Lũy kế tiền vay chi']), [500, 300, 1300, 1000, 900]) && sv.batDau.loai === 'nhap', sv.rows.map((r) => r['Lũy kế tiền vay chi']));
sv = computeSoTienVay(vay, chi, K('2026-06-10'), K('2026-06-30'), null, 'dauSo');
check('Sổ vay chế độ "dauSo" từ 10/06: dòng "Số dư đầu kỳ" = 1000 rồi 700, 600', sv.rows[0]._opening === true && eq(sv.rows.map((r) => r['Lũy kế tiền vay chi']), [1000, 700, 600]) && sv.soDuDauKy === 1000, sv.rows.map((r) => r['Lũy kế tiền vay chi']));
sv = computeSoTienVay(vay, chi, K('2026-06-10'), K('2026-06-30'), null, 'ky');
check('Sổ vay chế độ "ky" từ 10/06: không mang số dư trước kỳ → lũy kế −300, −400', eq(sv.rows.map((r) => r['Lũy kế tiền vay chi']), [-300, -400]) && sv.mode === 'ky', sv.rows.map((r) => r['Lũy kế tiền vay chi']));
sv = computeSoTienVay([{ ngayHachToan: '2026-06-09', tongTienVay: 0 }, null], [], null, null, null);
check('Sổ vay: khoản vay 0 đồng/null bị bỏ, không lỗi', sv.rows.length === 0 && sv.totalVay === 0);

// ---- computeTongHopThanhToan: gộp chủ rừng không phân biệt hoa/thường/khoảng trắng
const th = computeTongHopThanhToan([
  { 'Họ tên Chủ rừng': 'Nguyen  Van A', 'Ngày thanh toán': '2026-06-10', 'Khối lượng': '1', 'Thành tiền': '100' },
  { 'Họ tên Chủ rừng': 'nguyen van a', 'Ngày thanh toán': '2026-06-10', 'Khối lượng': '2', 'Thành tiền': '250' },
  { 'Họ tên Chủ rừng': 'Tran B', 'Ngày thanh toán': '2026-06-11', 'Khối lượng': '1', 'Thành tiền': '300' },
  { 'Họ tên Chủ rừng': 'Ngoai ky', 'Ngày thanh toán': '2026-09-01', 'Khối lượng': '9', 'Thành tiền': '9999' },
], K('2026-06-01'), K('2026-06-30'));
check('Tổng hợp TT: 3 dòng trong kỳ, 2 chủ rừng, 2 ngày', th.rows.length === 3 && th.soChuRung === 2 && th.soNgay === 2, [th.rows.length, th.soChuRung, th.soNgay]);
check('Tổng hợp TT: top chủ rừng = Nguyen Van A (350 > 300)', th.topChuRung && th.topChuRung.tien === 350, th.topChuRung);
check('Tổng hợp TT: tổng KL 4, tổng tiền 650', th.totalKL === 4 && th.totalTien === 650, [th.totalKL, th.totalTien]);

// ---- tiện ích
check('sumCols cộng đúng, bỏ qua ô thiếu', eq(sumCols([{ a: 1, b: 2 }, { a: 3 }], ['a', 'b']), { a: 4, b: 2 }));
check('excelSerialToStr: Date → YYYY-MM-DD (UTC); chuỗi giữ nguyên', excelSerialToStr(new Date(Date.UTC(2026, 5, 9))) === '2026-06-09' && excelSerialToStr('x') === 'x');

console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);
