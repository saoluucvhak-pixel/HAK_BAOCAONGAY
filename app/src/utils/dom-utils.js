/**
 * [UTILS] Helper thao tác DOM dùng chung khắp app (bản gốc dùng biến toàn cục
 * `$`/`$$`/`esc`). Logic GIỮ NGUYÊN 100% so với bản gốc.
 * @module utils/dom-utils
 */

/** @param {string} s selector @param {ParentNode} [root] */
export function $(s, root) { return (root || document).querySelector(s); }

/** @param {string} s selector @param {ParentNode} [root] */
export function $$(s, root) { return Array.prototype.slice.call((root || document).querySelectorAll(s)); }

/** Escape HTML đặc biệt khi chèn chuỗi vào innerHTML. @param {*} s */
export function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
  });
}

/** Tải 1 Blob xuống máy người dùng dưới tên file chỉ định (dùng cho xuất Excel/PDF/JSON backup). */
export function downloadBlob(blob, filename) {
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a'); a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
}
