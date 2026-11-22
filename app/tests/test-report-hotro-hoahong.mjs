// Kiểm chứng logic thuần của report-service.js: Hỗ trợ tài xế / Trợ giá, Tổng hợp hỗ trợ theo biển số,
// Hoa hồng đại lý (không cần trình duyệt). Số kỳ vọng được TÍNH TAY từ dữ liệu nhỏ trong file này
// (tiền = Hỗ trợ × KL tấn, làm tròn XUỐNG nghìn), KHÔNG lấy từ output của hàm.
// Chạy: node tests/test-report-hotro-hoahong.mjs
import { computeHoTroOrTroGia, computeTongHopHoTro, computeHoaHongDL } from '../src/services/report-service.js';
import { dateKey } from '../src/utils/date-utils.js';

let pass = 0, fail = 0;
const check = (n, ok, x) => { ok ? pass++ : fail++; console.log((ok ? 'OK   ' : 'FAIL ') + n + (ok || x === undefined ? '' : '  [' + JSON.stringify(x) + ']')); };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const near = (a, b) => Math.abs(a - b) < 1e-9;
const K = dateKey;

// ================= computeHoTroOrTroGia =================
const dmht = [
  { 'Nguồn gốc': 'D1', 'Hình thức': 'Hỗ trợ', 'Hỗ trợ': '20000', 'Ngày bắt đầu': '2026-06-01', 'Ngày kết thúc': '2026-06-15' },
  { 'Nguồn gốc': 'D1', 'Hình thức': 'Hỗ trợ', 'Hỗ trợ': '30000', 'Ngày bắt đầu': '2026-06-16', 'Ngày kết thúc': '' },
  { 'Nguồn gốc': 'D2 ', 'Hình thức': 'Hỗ trợ', 'Hỗ trợ': '10000', 'Ngày bắt đầu': '', 'Ngày kết thúc': '' }, // mã dính khoảng trắng
  { 'Nguồn gốc': 'D1', 'Hình thức': 'Trợ giá', 'Hỗ trợ': '99000', 'Ngày bắt đầu': '', 'Ngày kết thúc': '' },
  { 'Nguồn gốc': 'D4', 'Hình thức': 'Hỗ trợ', 'Hỗ trợ': 'abc', 'Ngày bắt đầu': '', 'Ngày kết thúc': '' }, // đơn giá rác
];
const mk = (ct, ng, ngay, kg, bs) => ({ So_CT: ct, NG: ng, 'Ngày cân 1': ngay, 'Giờ cân 1': '08:00:00', 'KL hàng (KG)': kg, 'Biển số 1': bs, 'ĐL': 'DLX' });
const pc = [
  mk('P2', 'D1', '6/20/2026', '2500', '51A'),      // ngày dạng M/D/YYYY, thuộc giai đoạn 30000
  mk('P1', 'D1', '2026-06-10', '5000', '51A'),
  mk('P3', 'D2', '2026-06-05', '1234', '52B'),
  mk('P4', 'D3', '2026-06-06', '9000', '52B'),      // NG không có trong danh mục
  mk('P5', 'D1', '2026-07-05', '4000', '51A'),      // ngoài kỳ
  mk('P6', 'D4', '2026-06-12', undefined, '53C'),   // thiếu KL, đơn giá rác
  mk('P7', 'D1', '2026-06-15', '1000', '51A'),      // đúng ngày kết thúc giai đoạn 1
  mk('P8', 'D1', '2026-06-16', '1000', '51A'),      // đúng ngày bắt đầu giai đoạn 2
  mk('P0', 'D1', '2026-05-20', '1000', '51A'),      // trước mọi giai đoạn của D1 (chỉ xét khi không giới hạn kỳ)
];
const snapPc = JSON.stringify(pc), snapDm = JSON.stringify(dmht);
const ht = computeHoTroOrTroGia(pc, dmht, K('2026-06-01'), K('2026-06-30'), 'Hỗ trợ', 'Tiền hỗ trợ');
const ctOf = (r) => r.rows.map((x) => x.So_CT);
check('HT: loại ngoài kỳ (P5, P0), loại NG không có trong DM (P4) → 6 dòng', ht.rows.length === 6, ctOf(ht));
check('HT: sắp theo Ngày cân 1: P3,P1,P6,P7,P8,P2', eq(ctOf(ht), ['P3', 'P1', 'P6', 'P7', 'P8', 'P2']), ctOf(ht));
check('HT: STT 1..6', eq(ht.rows.map((r) => r.STT), [1, 2, 3, 4, 5, 6]));
const by = (r, ct) => r.rows.find((x) => x.So_CT === ct);
check('HT: P1 = 5 tấn × 20000 = 100000', by(ht, 'P1')['Khối lượng_Tấn'] === 5 && by(ht, 'P1')['Hỗ trợ'] === 20000 && by(ht, 'P1')['Tiền hỗ trợ'] === 100000, by(ht, 'P1'));
check('HT: P3 (mã DM dính khoảng trắng "D2 ") vẫn khớp; 1,234 tấn × 10000 = 12340 → làm tròn xuống nghìn = 12000', by(ht, 'P3') && by(ht, 'P3')['Tiền hỗ trợ'] === 12000, by(ht, 'P3'));
check('HT: P2 ngày M/D/YYYY thuộc giai đoạn 30000: 2,5 × 30000 = 75000', by(ht, 'P2')['Hỗ trợ'] === 30000 && by(ht, 'P2')['Tiền hỗ trợ'] === 75000, by(ht, 'P2'));
check('HT: biên kết thúc 15/06 dùng giá 20000 → 1 tấn = 20000', by(ht, 'P7')['Hỗ trợ'] === 20000 && by(ht, 'P7')['Tiền hỗ trợ'] === 20000, by(ht, 'P7'));
check('HT: biên bắt đầu 16/06 dùng giá 30000 → 30000', by(ht, 'P8')['Hỗ trợ'] === 30000 && by(ht, 'P8')['Tiền hỗ trợ'] === 30000, by(ht, 'P8'));
check('HT: thiếu KL + đơn giá rác → 0 tấn, hỗ trợ 0, tiền 0 (không NaN)', by(ht, 'P6')['Khối lượng_Tấn'] === 0 && by(ht, 'P6')['Hỗ trợ'] === 0 && by(ht, 'P6')['Tiền hỗ trợ'] === 0, by(ht, 'P6'));
check('HT: tổng tiền = 12000+100000+0+20000+30000+75000 = 237000', ht.totalTien === 237000, ht.totalTien);
check('HT: tổng KL = 1,234+5+0+1+1+2,5 = 10,734 tấn', near(ht.totalKL, 10.734), ht.totalKL);
check('HT: giữ ĐL/NG/Biển số từ phiếu cân', by(ht, 'P1')['ĐL'] === 'DLX' && by(ht, 'P1').NG === 'D1' && by(ht, 'P1')['Biển số 1'] === '51A');
check('HT: không sửa mảng đầu vào (phiếu cân, danh mục)', JSON.stringify(pc) === snapPc && JSON.stringify(dmht) === snapDm);

const all = computeHoTroOrTroGia(pc, dmht, null, null, 'Hỗ trợ', 'Tiền hỗ trợ');
check('HT: không giới hạn kỳ → thêm P5 (07/05, giá 30000), P0 (trước mọi giai đoạn) vẫn bị loại → 7 dòng', all.rows.length === 7 && !ctOf(all).includes('P0') && ctOf(all).includes('P5'), ctOf(all));
check('HT: P5 4 tấn × 30000 = 120000 (giai đoạn 2 không có ngày kết thúc)', by(all, 'P5')['Tiền hỗ trợ'] === 120000, by(all, 'P5'));

const tg = computeHoTroOrTroGia(pc, dmht, K('2026-06-01'), K('2026-06-30'), 'Trợ giá', 'Tiền trợ giá');
check('Trợ giá: chỉ dòng D1 có Hình thức "Trợ giá" (P1,P7,P8,P2) → 4 dòng', eq(ctOf(tg), ['P1', 'P7', 'P8', 'P2']), ctOf(tg));
check('Trợ giá: dùng field "Tiền trợ giá" (không có "Tiền hỗ trợ"); P1 5 tấn × 99000 = 495000', by(tg, 'P1')['Tiền trợ giá'] === 495000 && !('Tiền hỗ trợ' in by(tg, 'P1')), by(tg, 'P1'));
check('Trợ giá: tổng tiền (làm tròn xuống nghìn TỪNG dòng) = 495000+99000+99000+247000 = 940000', tg.totalTien === 940000, tg.totalTien);
const none = computeHoTroOrTroGia([], dmht, null, null, 'Hỗ trợ', 'Tiền hỗ trợ');
check('HT: phiếu cân rỗng → rows rỗng, tổng 0', none.rows.length === 0 && none.totalKL === 0 && none.totalTien === 0);
check('HT: hình thức không tồn tại → không dòng nào', computeHoTroOrTroGia(pc, dmht, null, null, 'Khác', 'x').rows.length === 0);

// ================= computeTongHopHoTro =================
const r = (bs, ngay, kl, ht1, tien) => ({ 'Biển số 1': bs, 'Ngày cân 1': ngay, 'Khối lượng_Tấn': kl, 'Hỗ trợ': ht1, 'Tiền hỗ trợ': tien });
const rowsTH = [
  r('X1', '2026-06-10', 50, 30000, 1500000),
  r('X1', '2026-06-02', 30, 20000, 600000),
  r('X2', '2026-06-05', 100, 20000, 2000000),   // đúng 2.000.000 → không khấu trừ (điều kiện > 2tr)
  r('X3', '2026-06-07', 10, 30000, 2000005),    // 10% = 200000,5 → làm tròn 200001
  { 'Biển số 1': '', 'Ngày cân 1': '', 'Khối lượng_Tấn': 1, 'Tiền hỗ trợ': 50000 }, // trống biển số, ngày rác, thiếu Hỗ trợ
];
const snapTH = JSON.stringify(rowsTH);
const th = computeTongHopHoTro(rowsTH);
check('TH: 4 nhóm (X1,X3,X2,(trống)) sắp theo Tiền hỗ trợ giảm dần', eq(th.map((x) => x['Biển số 1']), ['X1', 'X3', 'X2', '(trống)']), th.map((x) => x['Biển số 1']));
check('TH: STT 1..4', eq(th.map((x) => x.STT), [1, 2, 3, 4]));
const g = (b) => th.find((x) => x['Biển số 1'] === b);
check('TH: X1 số chuyến 2, KL 80, tiền 2.100.000', g('X1')['Số chuyến'] === 2 && g('X1')['Khối lượng_Tấn'] === 80 && g('X1')['Tiền hỗ trợ'] === 2100000, g('X1'));
check('TH: X1 đơn giá TB = (30000+20000)/2 = 25000', g('X1')['Đơn giá hỗ trợ'] === 25000, g('X1'));
check('TH: X1 từ 02/06 đến 10/06 (key số)', g('X1')['Từ ngày'] === 20260602 && g('X1')['Đến ngày'] === 20260610, g('X1'));
check('TH: X1 > 2tr → khấu trừ 10% = 210000, còn 1.890.000', g('X1')['Khấu trừ thuế TNCN'] === 210000 && g('X1')['Còn thanh toán'] === 1890000, g('X1'));
check('TH: X2 đúng 2.000.000 → khấu trừ 0, còn 2.000.000', g('X2')['Khấu trừ thuế TNCN'] === 0 && g('X2')['Còn thanh toán'] === 2000000, g('X2'));
check('TH: X3 khấu trừ làm tròn 200000,5 → 200001; còn 1.800.004', g('X3')['Khấu trừ thuế TNCN'] === 200001 && g('X3')['Còn thanh toán'] === 1800004, g('X3'));
check('TH: biển số trống → "(trống)", ngày rác → Từ/Đến = null, thiếu Hỗ trợ → đơn giá 0, không khấu trừ', g('(trống)') && g('(trống)')['Từ ngày'] === null && g('(trống)')['Đến ngày'] === null && g('(trống)')['Đơn giá hỗ trợ'] === 0 && g('(trống)')['Còn thanh toán'] === 50000, g('(trống)'));
check('TH: không sửa mảng đầu vào', JSON.stringify(rowsTH) === snapTH);
check('TH: đầu vào rỗng → []', eq(computeTongHopHoTro([]), []));
// tích hợp: tổng hợp từ kết quả computeHoTroOrTroGia — biển 51A: P1 100000 + P7 20000 + P8 30000 + P2 75000 = 225000, 4 chuyến
const thInt = computeTongHopHoTro(ht.rows);
const g51 = thInt.find((x) => x['Biển số 1'] === '51A');
check('TH tích hợp: 51A 4 chuyến, tiền 225000, từ 10/06 đến 20/06', g51 && g51['Số chuyến'] === 4 && g51['Tiền hỗ trợ'] === 225000 && g51['Từ ngày'] === 20260610 && g51['Đến ngày'] === 20260620, g51);

// ================= computeHoaHongDL =================
const dmdl = [
  { 'Đại lý': 'DL1', 'Tên Đại lý': 'Dai ly Mot', 'Sản lượng Min': '10', 'Sản lượng max': '100', 'Hoa hồng': '5000' },
  { 'Đại lý': 'DL1', 'Tên Đại lý': 'TRUNG - bi bo qua', 'Sản lượng Min': '0', 'Sản lượng max': '1', 'Hoa hồng': '1' }, // trùng mã: lấy dòng đầu
  { 'Đại lý': 'DL2', 'Tên Đại lý': 'Dai ly Hai', 'Sản lượng Min': '50', 'Sản lượng max': '100', 'Hoa hồng': '4000' },
  { 'Đại lý': 'DL4', 'Tên Đại lý': 'Dai ly Bon', 'Sản lượng Min': '10', 'Sản lượng max': '50', 'Hoa hồng': '1000' },
  { 'Đại lý': 'DL5', 'Tên Đại lý': 'Dai ly Nam', 'Sản lượng Min': '', 'Sản lượng max': '', 'Hoa hồng': '1000' },
];
const pcMap = {
  CT1: { 'ĐL': 'DL1', 'Ngày cân 1': '2026-06-05' },
  CT2: { 'ĐL': 'DL1', 'Ngày cân 1': '2026-06-01' },
  CT3: { 'ĐL': 'DL2', 'Ngày cân 1': '2026-06-18' },
  CT4: { 'ĐL': 'DL4', 'Ngày cân 1': '2026-06-19' },
  CT7: { 'ĐL': 'DL5', 'Ngày cân 1': '2026-06-20' },
  CT8: { 'ĐL': 'DL3', 'Ngày cân 1': '2026-07-01' },
};
const dntt = [
  { 'Số CT': 'CT1', 'Ngày thanh toán': '2026-06-10', 'Khối lượng': '4' },
  { 'Số CT': 'CT2', 'Ngày thanh toán': '2026-06-12', 'Khối lượng': '6.5' },
  { 'Số CT': 'CT3', 'Ngày thanh toán': '2026-06-20', 'Khối lượng': '20' },
  { 'Số CT': 'CT4', 'Ngày thanh toán': '2026-06-21', 'Khối lượng': '50' },
  { 'Số CT': 'CT5', 'Ngày thanh toán': '2026-06-22', 'Khối lượng': '3' },   // không có phiếu cân → "(trống)"
  { 'Số CT': 'CT7', 'Ngày thanh toán': '2026-06-22', 'Khối lượng': '7' },
  { 'Số CT': 'CT8', 'Ngày thanh toán': '2026-07-01', 'Khối lượng': '9' },   // ngoài kỳ
  { 'Số CT': 'CT9', 'Ngày thanh toán': '', 'Khối lượng': '9' },             // chưa thanh toán
  { 'Số CT': 'CT1', 'Ngày thanh toán': '2026-06-25', 'Khối lượng': '' },    // thiếu KL → cộng 0
];
const snapD = JSON.stringify(dntt), snapP = JSON.stringify(pcMap), snapM = JSON.stringify(dmdl);
const hh = computeHoaHongDL(dntt, pcMap, dmdl, K('2026-06-01'), K('2026-06-30'));
const hn = (n) => hh.find((x) => x['Tên Đại lý'] === n);
check('HH: 5 nhóm (DL1, DL4, DL2, (trống), DL5) sắp theo tiền giảm dần, hoà giữ thứ tự xuất hiện', eq(hh.map((x) => x['Tên Đại lý']), ['Dai ly Mot', 'Dai ly Bon', 'Dai ly Hai', '(trống)', 'Dai ly Nam']), hh.map((x) => x['Tên Đại lý']));
check('HH: STT 1..5', eq(hh.map((x) => x.STT), [1, 2, 3, 4, 5]));
check('HH: DL1 dùng dòng DM đầu tiên; KL 4+6,5+0 = 10,5 ∈ [10,100] → 5000×10,5 = 52500 → xuống nghìn = 52000', hn('Dai ly Mot') && near(hn('Dai ly Mot')['Khối lượng thanh toán'], 10.5) && hn('Dai ly Mot')['Hoa hồng'] === 5000 && hn('Dai ly Mot')['Tiền hoa hồng'] === 52000, hn('Dai ly Mot'));
check('HH: DL1 từ 01/06 đến 05/06 (ngày cân 1 của phiếu)', hn('Dai ly Mot')['Từ ngày'] === 20260601 && hn('Dai ly Mot')['Đến ngày'] === 20260605, hn('Dai ly Mot'));
check('HH: DL4 KL 50 = max (biên) → 1000×50 = 50000', hn('Dai ly Bon')['Tiền hoa hồng'] === 50000, hn('Dai ly Bon'));
check('HH: DL2 KL 20 < min 50 → tiền 0 nhưng vẫn hiển thị hoa hồng 4000', hn('Dai ly Hai')['Tiền hoa hồng'] === 0 && hn('Dai ly Hai')['Hoa hồng'] === 4000 && hn('Dai ly Hai')['Khối lượng thanh toán'] === 20, hn('Dai ly Hai'));
check('HH: không có phiếu cân → nhóm "(trống)", không có DM → tên = mã, hoa hồng 0, tiền 0, ngày null', hn('(trống)') && hn('(trống)')['Khối lượng thanh toán'] === 3 && hn('(trống)')['Hoa hồng'] === 0 && hn('(trống)')['Tiền hoa hồng'] === 0 && hn('(trống)')['Từ ngày'] === null, hn('(trống)'));
check('HH: DM thiếu Min/max → tiền 0', hn('Dai ly Nam')['Khối lượng thanh toán'] === 7 && hn('Dai ly Nam')['Tiền hoa hồng'] === 0, hn('Dai ly Nam'));
check('HH: loại DNTT ngoài kỳ (CT8 → DL3 không xuất hiện) và chưa có ngày thanh toán (CT9)', !hh.some((x) => x['Tên Đại lý'] === 'DL3'));
check('HH: không sửa mảng đầu vào', JSON.stringify(dntt) === snapD && JSON.stringify(pcMap) === snapP && JSON.stringify(dmdl) === snapM);
check('HH: đầu vào rỗng → []', eq(computeHoaHongDL([], {}, dmdl, null, null), []));
const hhAll = computeHoaHongDL(dntt, pcMap, dmdl, null, null);
check('HH: không giới hạn kỳ → thêm DL3 (CT8, 9 tấn, không có trong DM → tên "DL3", tiền 0)', hhAll.some((x) => x['Tên Đại lý'] === 'DL3' && x['Khối lượng thanh toán'] === 9 && x['Tiền hoa hồng'] === 0), hhAll.map((x) => x['Tên Đại lý']));


// ---- Khoảng trắng thừa ở mã NG (phiếu cân) và mã Đại lý (phiếu cân + danh mục) vẫn khớp
{
  const pcSp = [{ So_CT: 'S1', 'Ngày cân 1': '2026-06-10', 'NG': ' D2', 'KL hàng (KG)': '1000', 'ĐL': ' DL9 ' }];
  const dmSp = [{ 'Nguồn gốc': 'D2', 'Hình thức': 'Hỗ trợ', 'Hỗ trợ': '10000', 'Ngày bắt đầu': '', 'Ngày kết thúc': '' }];
  const htSp = computeHoTroOrTroGia(pcSp, dmSp, null, null, 'Hỗ trợ', 'Hỗ trợ');
  check('HT: mã NG của phiếu cân dính khoảng trắng " D2" vẫn khớp danh mục "D2"', htSp.rows ? htSp.rows.length === 1 : htSp.length === 1, htSp);
  const hhSp = computeHoaHongDL(
    [{ 'Số CT': 'S1', 'Ngày thanh toán': '2026-06-12', 'Khối lượng': '2' }],
    { S1: pcSp[0] },
    [{ 'Đại lý': ' DL9', 'Tên Đại lý': 'Dai Ly 9', 'Sản lượng Min': '0', 'Sản lượng max': '10', 'Hoa hồng': '1000' }],
    null, null);
  check('HH: mã ĐL dính khoảng trắng ở cả phiếu cân (" DL9 ") và danh mục (" DL9") vẫn khớp → tên đại lý, tiền 2000', hhSp.length === 1 && hhSp[0]['Tên Đại lý'] === 'Dai Ly 9' && hhSp[0]['Tiền hoa hồng'] === 2000, hhSp);
}

console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);
