/**
 * [UTILS] Parse CSV thô (Google Sheet CSV export) thành mảng object. Logic GIỮ NGUYÊN
 * so với bản gốc — có xử lý dấu ngoặc kép/escape, BOM, và tự loại dòng trống.
 * @module utils/csv-utils
 */

/** @param {string} text @returns {string[][]} */
export function parseCSV(text) {
  if (!text) return [];
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  let rows = [], row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cur); cur = ''; rows.push(row); row = [];
    } else cur += c;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  rows = rows.filter((r) => r.some((x) => x.trim() !== ''));
  const w = rows.reduce((m, r) => Math.max(m, r.length), 0);
  rows.forEach((r) => { while (r.length < w) r.push(''); });
  return rows;
}

/** @param {string[][]} rows @returns {Object[]} */
export function csvToObjects(rows) {
  if (!rows || !rows.length) return [];
  const headers = rows[0].map((h) => h.trim());
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i], obj = {};
    for (let j = 0; j < headers.length; j++) obj[headers[j]] = r[j] === undefined ? '' : r[j].trim();
    out.push(obj);
  }
  return out;
}
