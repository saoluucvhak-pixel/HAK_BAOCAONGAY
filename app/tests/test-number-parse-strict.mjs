// Kiểm thử không diễn giải một phần chuỗi sai thành số tiền/khối lượng hợp lệ.
import assert from 'node:assert/strict';
import { parseNum } from '../src/utils/number-utils.js';
const correct = [
  ['1.234,56', 1234.56], ['1,234.56', 1234.56],
  ['1.234.567', 1234567], ['1,234,567', 1234567],
  ['1234,56', 1234.56], ['1234.56', 1234.56],
  ['(1.234,56)', -1234.56], ['-1.234,56', -1234.56],
  ['0', 0], ['1.234.567,89', 1234567.89],
  ['1,234,567.89', 1234567.89]
];
for (const [value, expected] of correct) {
  assert.equal(parseNum(value), expected, 'Sai số hợp lệ ' + value);
}
for (const value of ['12,34,56', '12.34.56', '1,2.3', '1.2,3', '100abc', '2..000', '1,234,56', '1.234.56']) {
  assert.ok(Number.isNaN(parseNum(value)), 'Phải từ chối chuỗi hỏng ' + value);
}
console.log('PASS: parses valid VN/US money formats; rejects malformed/partial input');
