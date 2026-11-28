/**
 * Kiểm tra khóa trùng mà không thay đổi dữ liệu đầu vào hoặc âm thầm gộp dòng.
 * count là số khóa khác nhau bị trùng, extraRows là số dòng lặp ngoài dòng đầu.
 */
export function summarizeDuplicateKeys(rows, field, sampleLimit = 5) {
  const seen = new Set();
  const duplicates = new Set();
  let extraRows = 0;
  for (const row of rows || []) {
    const key = String(row?.[field] ?? '').trim();
    if (!key) continue;
    if (seen.has(key)) {
      duplicates.add(key);
      extraRows++;
    } else {
      seen.add(key);
    }
  }
  return {
    count: duplicates.size,
    extraRows,
    samples: Array.from(duplicates).slice(0, sampleLimit)
  };
}
