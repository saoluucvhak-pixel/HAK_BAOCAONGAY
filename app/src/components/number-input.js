/**
 * [2026-10-05] Ô nhập số kiểu Việt Nam cho Danh mục — theo yêu cầu người dùng: "ô nhập tiền có ngăn
 * cách đơn vị, nhập khối lượng có ngăn cách đơn vị và thập phân 2 số".
 *  - Tiền:      10.000 · 1.250.000            (dấu chấm ngăn hàng nghìn, không có phần lẻ)
 *  - Khối lượng: 100.000 · 1.234,56            (dấu phẩy thập phân, tối đa 2 chữ số lẻ)
 * Định dạng NGAY KHI GÕ (giữ đúng vị trí con trỏ). Trên ô khối lượng, gõ phím "." (kể cả "." ở bàn
 * phím số) được hiểu là dấu thập phân "," — vì dấu chấm ngăn hàng nghìn do app tự thêm.
 *
 * Vì sao dùng <input type="text"> thay vì type="number": ô type="number" của trình duyệt KHÔNG cho
 * hiển thị dấu ngăn cách hàng nghìn. Giá trị lưu vào Danh mục vẫn là SỐ (parseVNNumber) như trước —
 * không đổi cấu trúc dữ liệu đã lưu, không đổi cách tính báo cáo.
 * @module components/number-input
 */

/** Nhóm hàng nghìn bằng dấu chấm cho 1 chuỗi chỉ gồm chữ số. @param {string} digits */
function groupThousands(digits) {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/**
 * Hiển thị 1 số đã lưu theo kiểu VN. Rỗng/không phải số → ''.
 * @param {number|string|null} n @param {number} decimals 0 = tiền, 2 = khối lượng
 */
export function formatVNNumber(n, decimals) {
  if (n == null || n === '' || typeof n === 'boolean') return '';
  const x = typeof n === 'number' ? n : Number(n);
  if (!isFinite(x)) return '';
  const neg = x < 0;
  const fixed = Math.abs(x).toFixed(decimals);
  let [intPart, decPart] = fixed.split('.');
  if (decPart) decPart = decPart.replace(/0+$/, ''); // 1234,50 → 1234,5 ; 100,00 → 100
  return (neg ? '-' : '') + groupThousands(intPart) + (decPart ? ',' + decPart : '');
}

/**
 * Đọc chuỗi đang hiển thị trong ô ("1.234,56") thành số. Rỗng → NaN (giống ô type="number" cũ
 * để trống — không đổi hành vi tính toán khi để trống).
 * @param {string} s @returns {number}
 */
export function parseVNNumber(s) {
  const t = String(s == null ? '' : s).trim();
  if (!t) return NaN;
  const neg = t.charAt(0) === '-';
  const body = t.replace(/\./g, '').replace(',', '.').replace(/[^\d.]/g, '');
  if (!body || body === '.') return NaN;
  const v = parseFloat(body);
  return isNaN(v) ? NaN : (neg ? -v : v);
}

/**
 * Định dạng lại chuỗi đang gõ + tính vị trí con trỏ mới (hàm thuần, để kiểm thử được).
 * @param {string} raw @param {number} caret @param {number} decimals
 * @returns {{value: string, caret: number}}
 */
export function reformatTyping(raw, caret, decimals) {
  const isSig = (ch) => (ch >= '0' && ch <= '9') || (decimals > 0 && ch === ',');
  let sigBefore = 0;
  for (let i = 0; i < Math.min(caret, raw.length); i++) if (isSig(raw[i])) sigBefore++;

  const neg = raw.trim().charAt(0) === '-';
  let intDigits = '', decDigits = '', seenComma = false;
  for (const ch of raw) {
    if (ch >= '0' && ch <= '9') { if (seenComma) { if (decDigits.length < decimals) decDigits += ch; } else intDigits += ch; }
    else if (ch === ',' && decimals > 0 && !seenComma) seenComma = true;
  }
  const stripped = intDigits.replace(/^0+(?=\d)/, '');
  sigBefore = Math.max(0, sigBefore - (intDigits.length - stripped.length));
  const value = (neg ? '-' : '') + groupThousands(stripped) + (seenComma ? ',' + decDigits : '');

  let pos = neg ? 1 : 0, count = 0;
  while (pos < value.length && count < sigBefore) { if (isSig(value[pos])) count++; pos++; }
  return { value, caret: pos };
}

/**
 * Biến 1 <input> thành ô nhập số kiểu VN.
 * @param {HTMLInputElement} inp @param {number|null} initial giá trị đang lưu @param {number} decimals
 */
export function makeVNNumberInput(inp, initial, decimals) {
  inp.type = 'text';
  inp.inputMode = decimals > 0 ? 'decimal' : 'numeric';
  inp.autocomplete = 'off';
  inp.classList.add('numInput');
  inp.value = formatVNNumber(initial, decimals);
  if (decimals > 0) {
    inp.addEventListener('keydown', function (e) {
      if (e.key === '.' || e.key === 'Decimal' || e.code === 'NumpadDecimal') {
        e.preventDefault();
        if (inp.value.indexOf(',') >= 0) return;
        const s = inp.selectionStart, en = inp.selectionEnd;
        inp.value = inp.value.slice(0, s) + ',' + inp.value.slice(en);
        inp.setSelectionRange(s + 1, s + 1);
        inp.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
  }
  inp.addEventListener('input', function () {
    const r = reformatTyping(inp.value, inp.selectionStart == null ? inp.value.length : inp.selectionStart, decimals);
    if (r.value !== inp.value) { inp.value = r.value; try { inp.setSelectionRange(r.caret, r.caret); } catch (e) { /* ô không còn focus */ } }
  });
  // Rời ô: chuẩn hoá hiển thị (vd "1.234," → "1.234", "0,50" → "0,5").
  inp.addEventListener('blur', function () { inp.value = formatVNNumber(parseVNNumber(inp.value), decimals); });
}
