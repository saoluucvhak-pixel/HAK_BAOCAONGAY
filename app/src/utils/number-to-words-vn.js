/**
 * [UTILS] Đọc số tiền (VNĐ nguyên) ra chữ tiếng Việt theo cách đọc kế toán
 * (vd 105 → "Một trăm lẻ năm", 21000 → "Hai mươi mốt nghìn"). Đã kiểm thử khớp 100%
 * với 7 giá trị "Số tiền bằng chữ" có sẵn trong file PHIEUNHAPKHO gốc (xem VALIDATION.md §6).
 * Logic GIỮ NGUYÊN so với bản gốc.
 * @module utils/number-to-words-vn
 */

const DON_VI = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];
const UNITS = ['', ' nghìn', ' triệu', ' tỷ', ' nghìn tỷ', ' triệu tỷ'];

function readGroup(g, isFirstGroup) {
  const tram = Math.floor(g / 100), chuc = Math.floor((g % 100) / 10), donvi = g % 10;
  const parts = [];
  if (tram > 0) parts.push(DON_VI[tram] + ' trăm');
  if (chuc === 0) {
    if (donvi > 0) {
      if (tram > 0 || !isFirstGroup) parts.push('lẻ ' + DON_VI[donvi]);
      else parts.push(DON_VI[donvi]);
    }
  } else if (chuc === 1) {
    parts.push('mười');
    if (donvi === 5) parts.push('lăm'); else if (donvi > 0) parts.push(DON_VI[donvi]);
  } else {
    parts.push(DON_VI[chuc] + ' mươi');
    if (donvi === 1) parts.push('mốt'); else if (donvi === 5) parts.push('lăm'); else if (donvi > 0) parts.push(DON_VI[donvi]);
  }
  return parts.join(' ');
}

/** @param {number} n @returns {string} */
export function numToWordsVN(n) {
  n = Math.round(n || 0);
  if (n === 0) return 'Không đồng';
  const neg = n < 0;
  n = Math.abs(n);
  let groups = [];
  let x = n;
  while (x > 0) { groups.push(x % 1000); x = Math.floor(x / 1000); }
  if (groups.length === 0) groups = [0];
  const wordsParts = [];
  for (let i = groups.length - 1; i >= 0; i--) {
    const g = groups[i];
    if (g === 0) continue;
    wordsParts.push(readGroup(g, i === groups.length - 1) + UNITS[i]);
  }
  let result = wordsParts.join(' ').replace(/\s+/g, ' ').trim();
  result = result.charAt(0).toUpperCase() + result.slice(1);
  return (neg ? 'Âm ' : '') + result + ' đồng';
}
