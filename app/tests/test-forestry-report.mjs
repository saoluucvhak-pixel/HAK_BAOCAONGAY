import assert from 'node:assert/strict';
import { FORESTRY_SOURCES, buildForestryReports, normalizeForestrySheet } from '../src/services/forestry-report.js';

const data = {
  calendar: [],
  settings: [{ 'Mẫu': 'KEO', 'Tiêu hao SX': 0.05 }],
  intake: [{ 'Ngày nhập': '2026-01-31', 'Khối lượng (Tấn)': 100 }],
  dispatch: [{ 'Ngày xuất': '2026-02-01', 'SỐ TKHQ': '0001', 'Khối lượng (Tấn)': 20 }],
  orders: [
    { 'Ngày đơn hàng': '2026-02-01', 'SỐ TKHQ': '0001', 'ĐỘ KHÔ': 0.6, 'ĐỘ KHÔ NHÀ MÁY': 0.5, KL_BDMT: 12, 'ĐƠN GIÁ (USD)': 150 },
    { 'Ngày đơn hàng': '2026-02-02', 'SỐ TKHQ': '0002' },
  ],
};
const options = { from: '2026-01-31', to: '2026-02-01', opening: 10, selected: ['M04_14', 'M', '6T', 'Y'] };
const [m04, m14, monthly, halfYear, annual] = buildForestryReports(data, options);
assert.deepEqual(m04.rows.map(row => [row[0], row[1], row[14], row[15]]), [
  [10, '2026-01-31', 5, 105],
  [105, '2026-02-01', 4, 81],
]);
assert.equal(m14.rows.length, 1);
assert.equal(m14.rows[0][1], '0001');
assert.equal(m14.rows[0][10], 1800);
assert.deepEqual(monthly.rows.map(row => [row[4], row[8], row[9]]), [[10, 105, '01/2026'], [105, 81, '02/2026']]);
for (const report of [halfYear, annual]) {
  assert.equal(report.rows.length, 1);
  assert.equal(report.rows[0][8], 81);
}
const [withCalendar, withCustomExport] = buildForestryReports({
  ...data,
  settings: [
    { 'Mẫu': 'MAU07', 'Tiêu hao SX': 0.05 },
    { 'Mẫu': 'MAU14', 'Tên thông thường': 'Tên hàng từ tham số mẫu 14' },
  ],
}, { ...options, selected: ['M04_14'] });
assert.equal(withCalendar.rows.length, 2);
assert.equal(withCustomExport.rows[0][3], 'Tên hàng từ tham số mẫu 14');
assert.throws(() => buildForestryReports({ ...data, orders: [] }, options), /chưa khớp tờ khai/);
assert.throws(() => buildForestryReports(data, { ...options, to: '2026-02-30' }), /kỳ báo cáo hợp lệ/);
const headers = ['Ngày nhập', 'Khối lượng (Tấn)'];
assert.equal(normalizeForestrySheet(FORESTRY_SOURCES.intake, headers, [
  { 'Ngày nhập': '01/31/2026', 'Khối lượng (Tấn)': '12,345.20' },
])[0]['Khối lượng (Tấn)'], 12345.2);
assert.throws(() => normalizeForestrySheet(FORESTRY_SOURCES.intake, headers, [
  { 'Ngày nhập': '31/01/2026', 'Khối lượng (Tấn)': '12,345' },
]), /YYYY-MM-DD/);
console.log('OK: Mẫu 04, 14, 29 tháng/6 tháng/năm và kiểm tra dữ liệu nguồn.');
