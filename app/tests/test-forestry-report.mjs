import assert from 'node:assert/strict';
import { isForestryHistoryEntry, latestForestryClosing } from '../src/services/forestry-history.js';
import { forestryPrintPages } from '../src/services/export/forestry-layout.js';
import { FORESTRY_SOURCES, buildForestryReports, forestryPeriodRange, normalizeForestrySheet } from '../src/services/forestry-report.js';

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
  [105, '2026-02-01', 0, 81],
  [10, '2026-01-31', 0, 105],
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
    { 'Mẫu': 'MAU04', 'Tiêu hao SX': 0.05 },
    { 'Mẫu': 'MAU14', 'Tên thông thường': 'Tên hàng từ tham số mẫu 14' },
  ],
}, { ...options, selected: ['M04_14'] });
assert.equal(withCalendar.rows.length, 4);
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
// Excel keeps source precision and carries the same stock into every period.
const preciseIntake = [
  { 'Ngày nhập': options.from, 'Khối lượng (Tấn)': 1.019, 'Số BKLS': 'BK-01' },
  { 'Ngày nhập': options.to, 'Khối lượng (Tấn)': 0.501, 'Số BKLS': 'BK-02' },
  { 'Ngày nhập': options.to, 'Khối lượng (Tấn)': 0.518, 'Số BKLS': 'BK-03' },
];
const precise = buildForestryReports({
  ...data, intake: preciseIntake, dispatch: [], orders: [],
  settings: [{ 'Mẫu': 'MAU04', 'Tiêu hao SX': 0.025, 'Đơn vị tính (MT)': 'Tấn tươi', 'Diễn giải hồ sơ nhập': 'BKLS' }],
}, options);
assert.equal(precise[0].rows.length, 5);
assert.equal(precise[0].rows[2][8], 'BKLS BK-03');
assert.equal(precise[0].rows[2][5], 'Tấn tươi');
const closing = precise[0].rows.at(-1)[15];
assert.ok(Math.abs(closing - 11.98705) < 1e-10);
for (const report of precise.slice(2)) assert.equal(report.rows.at(-1)[8], closing);
assert.equal(precise[2].rows[0][8], precise[2].rows[1][4]);
assert.equal(precise[2].rows[0][7], 0); // Power Query hiển thị 0 khi cả kỳ không có phiếu xuất.
assert.equal(monthly.rows[1][6], 0); // Cả kỳ không nhập: Tổng cộng null rồi được đổi về 0.

const [, declaration] = buildForestryReports({
  ...data,
  orders: [{ ...data.orders[0], STT: 8, KL_BDMT: 1.2345, 'ĐƠN GIÁ (USD)': 2.3456, 'Khối lượng NK': 99 }],
  settings: [{ ...data.settings[0], 'Mẫu': 'MAU04' }, { 'Mẫu': 'MAU14', 'Khối lượng NK': 4, 'Trị giá NK (USD)': 10, 'Mã số hàng hóa': '0401.22', 'Đơn vị tính (BDMT)': 'Tấn khô kiệt' }],
}, { ...options, selected: ['M04_14'] });
assert.deepEqual(declaration.rows[0].slice(6), [4, 10, 'Tấn khô kiệt', 1.2345, 1.2345 * 2.3456, '0401.22']);
assert.equal(forestryPrintPages([declaration], { ...options, commodityCode: '4401.22' })[0].rows[0][1], '0401.22');
assert.equal(forestryPrintPages([m14], { ...options, commodityCode: '4401.22' })[0].rows[0][1], '4401.22');
assert.equal(declaration.rows[0][0], 8);
console.log('OK: Mẫu 04, 14, 29 tháng/6 tháng/năm và kiểm tra dữ liệu nguồn.');

const scope = { source: 'XUAT', company: 'HAK', intake: 'NHAP' };
const history = { ...scope, from: '2026-01-01', to: '2026-01-31', createdAt: '2026-02-01T00:00:00Z', opening: 0, closing: 12, selected: ['M'] };
assert.equal(isForestryHistoryEntry(history), true);
assert.equal(isForestryHistoryEntry({ ...history, createdAt: 'invalid' }), false);
assert.equal(latestForestryClosing([history], '2026-02-02', scope), undefined);
assert.equal(latestForestryClosing([history], '2026-02-01', { ...scope, intake: 'OTHER' }), undefined);
assert.equal(latestForestryClosing([history], '2026-02-01', scope), history);

assert.deepEqual(forestryPeriodRange('M', 2024, 2), { from: '2024-02-01', to: '2024-02-29' });
assert.deepEqual(forestryPeriodRange('Q', 2026, 2), { from: '2026-04-01', to: '2026-06-30' });
assert.deepEqual(forestryPeriodRange('6T', 2026, 2), { from: '2026-07-01', to: '2026-12-31' });
assert.deepEqual(forestryPeriodRange('Y', 2026), { from: '2026-01-01', to: '2026-12-31' });
assert.equal(forestryPeriodRange('Q', 2026, 5), null);
assert.equal(forestryPeriodRange('M', 0, 2), null);
const quarterRange = forestryPeriodRange('Q', 2026, 1);
const quarterly = buildForestryReports(data, { ...quarterRange, opening: 10, selected: ['Q'] });
assert.deepEqual(quarterly[0].rows.map(row => [row[4], row[8], row[9]]), [[10, 81, 'Q1/2026']]);
assert.equal(forestryPrintPages(quarterly, quarterRange)[0].period, 'Quý 1 năm 2026');
assert.equal(isForestryHistoryEntry({ ...history, ...quarterRange, selected: ['Q'] }), true);

const custom = buildForestryReports(data, { ...options, selected: ['CUSTOM'] });
assert.deepEqual(custom[0].rows.map(row => [row[4], row[8]]), [[10, 81]]);
const [customPage] = forestryPrintPages(custom, options);
assert.equal(customPage.period, 'Từ ngày 31/01/2026 đến ngày 01/02/2026');
assert.ok(customPage.name.length <= 31);
assert.equal(isForestryHistoryEntry({ ...history, selected: ['CUSTOM'] }), true);
assert.throws(() => buildForestryReports(data, { ...options, from: options.to, to: options.from, selected: ['CUSTOM'] }), /kỳ báo cáo hợp lệ/);

const legacySettings = [{ 'Mẫu': 'MAU07', 'Tiêu hao SX': 0.05 }, { 'Mẫu': 'MAU14' }];
const legacyCalendar = [options.from, options.to].map(date => ({ 'Ngày trong năm': date, 'Mẫu': 'MAU07' }));
assert.deepEqual(buildForestryReports({ ...data, calendar: legacyCalendar, settings: legacySettings }, options)[0], m04);
