// [2026-09-25] Người dùng báo: "nguồn gốc D3 không lên báo cáo ngày". Kiểm chứng 2 nguyên nhân đã
// tìm ra (cả 2 đều làm 1 mã Nguồn gốc biến mất KHÔNG báo lỗi):
//  1) Tổng hợp nhập/thanh toán (TH_NXT): mã chỉ có THANH TOÁN trong kỳ (cân kỳ trước) không có cột.
//  2) Hỗ trợ/Trợ giá: mã trong Danh mục gõ dính khoảng trắng ("D3 ") không khớp dữ liệu.
// Chạy: npm run test:ng-codes
import { computeTongHopNgay, computeHoTroOrTroGia } from '../src/services/report-service.js';

let pass = 0, fail = 0;
const check = (n, ok, x) => { ok ? pass++ : fail++; console.log((ok ? 'OK   ' : 'FAIL ') + n + (x ? '  [' + x + ']' : '')); };

const pc = [
  { So_CT: 'A1', 'Ngày cân 1': '9/10/2026', 'KL hàng (KG)': '10000', 'Thành tiền': '15000000', 'ĐL': 'DT', 'NG': 'D1' },
  { So_CT: 'A2', 'Ngày cân 1': '9/11/2026', 'KL hàng (KG)': '20000', 'Thành tiền': '30000000', 'ĐL': 'QT', 'NG': 'D2' },
  { So_CT: 'A3', 'Ngày cân 1': '8/28/2026', 'KL hàng (KG)': '5000', 'Thành tiền': '7500000', 'ĐL': 'KL', 'NG': 'D3' }, // cân tháng trước
  { So_CT: 'A4', 'Ngày cân 1': '9/15/2026', 'KL hàng (KG)': '8000', 'Thành tiền': '12000000', 'ĐL': 'DT', 'NG': 'D3' },
];
const by = {}; pc.forEach((r) => { by[r.So_CT] = r; });
const dn = [
  { 'Số CT': 'A1', 'Ngày thanh toán': '9/12/2026', 'Khối lượng': '10', 'Thành tiền': '15000000' },
  { 'Số CT': 'A3', 'Ngày thanh toán': '9/12/2026', 'Khối lượng': '5', 'Thành tiền': '7500000' },
];

// 1a) Kỳ 01/09–12/09: D3 chỉ có thanh toán (A3), không có nhập
{
  const r = computeTongHopNgay(pc, dn, by, 20260901, 20260912);
  const d = r.rows.find((x) => x['Ngày'] === '9/12/2026');
  const sumNG = Object.keys(d).filter((k) => k.startsWith('TT_NG.')).reduce((s, k) => s + d[k], 0);
  const sumDL = Object.keys(d).filter((k) => k.startsWith('TT_DL.')).reduce((s, k) => s + d[k], 0);
  check('TH_NXT: có cột "Thanh toán - NG D3" dù D3 không có nhập trong kỳ', r.cols.some((c) => c[0] === 'TT_NG.D3'));
  check('TH_NXT: tổng các cột TT_NG = Khối lượng thanh toán (không rơi mất D3)', sumNG === d['Khối lượng thanh toán'], sumNG + ' / ' + d['Khối lượng thanh toán']);
  check('TH_NXT: tổng các cột TT_DL = Khối lượng thanh toán (đại lý KL cũng không rơi mất)', sumDL === d['Khối lượng thanh toán'], sumDL + ' / ' + d['Khối lượng thanh toán']);
  check('TH_NXT: dòng tổng có TT_NG.D3 = 5', r.totals['TT_NG.D3'] === 5, String(r.totals['TT_NG.D3']));
}
// 1b) Kỳ có đủ nhập của mọi mã: danh sách cột giữ nguyên như trước (không đổi gì trường hợp thường gặp)
{
  const r = computeTongHopNgay(pc, [], by, 20260901, 20260930);
  check('TH_NXT: khi không có thanh toán kỳ trước, cột giữ nguyên như cũ', r.cols.map((c) => c[0]).join(',') === 'Ngày,Giá trị nhập,Khối lượng nhập,NHAP_DL.DT,NHAP_DL.QT,NHAP_NG.D1,NHAP_NG.D2,NHAP_NG.D3,Giá trị thanh toán,Khối lượng thanh toán,TT_DL.DT,TT_DL.QT,TT_NG.D1,TT_NG.D2,TT_NG.D3');
}
// 2) Danh mục Hỗ trợ gõ "D3 " (dư khoảng trắng)
{
  const dm = [
    { 'Nguồn gốc': 'D1', 'Hỗ trợ': 10000, 'Hình thức': 'Cuối tháng', 'Ngày bắt đầu': '2026-01-01', 'Ngày kết thúc': '2026-12-31' },
    { 'Nguồn gốc': 'D3 ', 'Hỗ trợ': 15000, 'Hình thức': 'Cuối tháng', 'Ngày bắt đầu': '2026-01-01', 'Ngày kết thúc': '2026-12-31' },
  ];
  const r = computeHoTroOrTroGia(pc, dm, 20260901, 20260930, 'Cuối tháng', 'Tiền hỗ trợ');
  const d3 = r.rows.filter((x) => x['NG'] === 'D3');
  check('Hỗ trợ: mã Danh mục "D3 " (dư khoảng trắng) vẫn khớp phiếu cân D3', d3.length === 1 && d3[0]['Tiền hỗ trợ'] === 120000, JSON.stringify(d3.map((x) => x['Tiền hỗ trợ'])));
  check('Hỗ trợ: D1 vẫn đúng như cũ', r.rows.filter((x) => x['NG'] === 'D1').length === 1);
  check('Hỗ trợ: D2 (không có trong Danh mục "Cuối tháng") vẫn không có — đúng quy tắc cũ', r.rows.filter((x) => x['NG'] === 'D2').length === 0);
}
console.log('\n=== RESULT: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail ? 1 : 0);
