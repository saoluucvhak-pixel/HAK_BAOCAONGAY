// Ngày Google Sheet phải có thật trên lịch Gregorian; vẫn giữ MM/DD/YYYY khi mập mờ.
import assert from 'node:assert/strict';
import { parseDateParts, dateKey, toExcelDate } from '../src/utils/date-utils.js';
assert.deepEqual(parseDateParts('2024-02-29'), { y: 2024, mo: 2, d: 29 });
assert.deepEqual(parseDateParts('1/10/2026'), { y: 2026, mo: 1, d: 10 });
assert.deepEqual(parseDateParts('13/01/2026'), { y: 2026, mo: 1, d: 13 });
for (const date of ['2026-02-29', '2026-02-31', '2026-04-31', '2026-13-01', '2026-00-10', '2026-12-00', '2/30/2026', '31/04/2026']) {
  assert.equal(parseDateParts(date), null, 'Ngày không tồn tại: ' + date);
  assert.equal(dateKey(date), null, 'Không được sinh khoá ngày từ ' + date);
  assert.equal(toExcelDate(date), null, 'Không được xuất Excel ngày sai ' + date);
}
console.log('PASS: validates real calendar dates and preserves Google Sheet date order');
