/**
 * [UTILS] Tìm kiếm "gần đúng" — bỏ dấu tiếng Việt khi so khớp, để gõ không dấu ("nguyen van a")
 * vẫn tìm ra dữ liệu có dấu ("Nguyễn Văn A"). Tính năng bổ sung theo yêu cầu người dùng.
 *
 * Phạm vi: CHỈ chuẩn hoá dấu (accent-insensitive), không làm "fuzzy" kiểu sửa lỗi chính tả/gõ
 * thiếu ký tự (fuzzy distance) — vì with dữ liệu tiếng Việt có dấu, vấn đề thực tế phổ biến
 * nhất là gõ không dấu khi tìm, không phải gõ sai chính tả. Vẫn dùng khớp chuỗi con (substring)
 * như bản gốc, chỉ chuẩn hoá cả 2 vế (dữ liệu + từ khoá) trước khi so sánh.
 * @module utils/fuzzy-search
 */

const ACCENT_MAP = [
  [/[àáạảãâầấậẩẫăằắặẳẵ]/g, 'a'], [/[ÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴ]/g, 'A'],
  [/[èéẹẻẽêềếệểễ]/g, 'e'], [/[ÈÉẸẺẼÊỀẾỆỂỄ]/g, 'E'],
  [/[ìíịỉĩ]/g, 'i'], [/[ÌÍỊỈĨ]/g, 'I'],
  [/[òóọỏõôồốộổỗơờớợởỡ]/g, 'o'], [/[ÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠ]/g, 'O'],
  [/[ùúụủũưừứựửữ]/g, 'u'], [/[ÙÚỤỦŨƯỪỨỰỬỮ]/g, 'U'],
  [/[ỳýỵỷỹ]/g, 'y'], [/[ỲÝỴỶỸ]/g, 'Y'],
  [/đ/g, 'd'], [/Đ/g, 'D'],
];

/**
 * [PERF-05] Cache kết quả chuẩn hoá theo chuỗi gốc. Mỗi lần gõ 1 ký tự vào ô "Tìm trong bảng",
 * MỌI ô của MỌI dòng bị chuẩn hoá lại (14 lần thay thế regex/ô) — 10.000 dòng × 17 cột ≈ 170.000
 * lần/phím, đo được ~130 ms/phím (gõ bị khựng rõ rệt). Giá trị trong bảng lặp lại rất nhiều (tên
 * người, ngày, biển số...) và không đổi giữa các lần gõ, nên chỉ cần chuẩn hoá 1 lần/giá trị.
 * Kết quả là chuỗi (bất biến) → cache an toàn tuyệt đối, ngữ nghĩa tìm kiếm không đổi.
 * @type {Map<string, string>}
 */
const _normCache = new Map();

function _normalizeUncached(str) {
  let out = str;
  for (const [re, plain] of ACCENT_MAP) out = out.replace(re, plain);
  return out.toLowerCase();
}

/** Bỏ dấu tiếng Việt + hạ chữ thường, để so khớp không phân biệt dấu/hoa-thường. @param {*} s */
export function normalizeSearch(s) {
  const str = String(s == null ? '' : s);
  let v = _normCache.get(str);
  if (v === undefined) {
    v = _normalizeUncached(str);
    if (_normCache.size > 300000) _normCache.clear(); // chặn phình bộ nhớ khi phiên làm việc rất dài
    _normCache.set(str, v);
  }
  return v;
}

/** true nếu `haystack` chứa `needle` (đã chuẩn hoá bỏ dấu cả 2 vế). @param {*} haystack @param {string} needle (nên chuẩn hoá 1 lần bên ngoài vòng lặp nếu gọi nhiều lần) */
export function fuzzyIncludes(haystack, needle) {
  if (!needle) return true;
  return normalizeSearch(haystack).indexOf(needle) >= 0;
}
