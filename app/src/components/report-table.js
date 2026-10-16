/**
 * [COMPONENT] Bảng báo cáo — render/sort/search/phân trang cho TẤT CẢ 14 bảng báo cáo (dùng
 * chung 1 bộ hàm, tham số hoá bằng `key`). Logic GIỮ NGUYÊN 100% so với bản gốc.
 *
 * Ghi chú kỹ thuật: `ensureToolbar()` gọi tới `exportExcel/exportPDF/printSection/
 * openBankInfoModal` — các hàm này vẫn nằm trong `legacy-app.js` (lớp EXPORT_SERVICE, xem
 * TODO.md Phase 2 phần còn lại). Import ở đây tạo ra 1 cạnh phụ thuộc vòng (circular) giữa
 * module này và `legacy-app.js`, nhưng AN TOÀN trong trường hợp cụ thể này vì: (1) cả 2 module
 * chỉ dùng `function` declaration (được hoist đầy đủ trong phạm vi module của chính nó), và
 * (2) các hàm export/modal chỉ thực sự được GỌI bên trong 1 event handler (khi người dùng bấm
 * nút) — tức là sau khi toàn bộ module đã chạy xong phần khởi tạo (top-level), không phải lúc
 * đang import — nên không gặp lỗi "Cannot access before initialization". Đã kiểm chứng bằng
 * `npm run build` + `npm run test:ui` không lỗi.
 * @module components/report-table
 */
import { TABLES } from '../store/state.js';
import { $, $$, esc } from '../utils/dom-utils.js';
import { dateKey, fmtDate, fmtTime } from '../utils/date-utils.js';
import { fmtMoney, fmtKL } from '../utils/number-utils.js';
import { normalizeSearch } from '../utils/fuzzy-search.js';
import { exportExcel } from '../services/export/excel-export.js';
import { exportPDF } from '../services/export/pdf-export.js';
import { printSection } from '../services/export/print-sheet.js';
import { openBankInfoModal } from '../services/export/bank-forms.js';
import { runExport } from '../services/export-runner.js';

export function fmtCell(val, type) {
  if (val == null || val === '') return '';
  switch (type) {
    case 'money': return fmtMoney(val);
    case 'kl': return fmtKL(val);
    case 'int': return Math.round(val).toLocaleString('vi-VN');
    case 'date': return fmtDate(val);
    case 'time': return fmtTime(val);
    case 'datekey': { var s = String(val); if (s.length !== 8) return ''; return s.slice(6, 8) + '/' + s.slice(4, 6) + '/' + s.slice(0, 4); }
    default: return esc(val);
  }
}

export function renderReportTable(key, rows, cols, totals) {
  TABLES[key] = TABLES[key] || { sortCol: -1, sortDir: 1, page: 0, pageSize: 50, search: '' };
  var st = TABLES[key];
  st.rows = rows; st.cols = cols; st.totals = totals;
  ensureToolbar(key);
  applySortSearch(key);
}

export function ensureToolbar(key) {
  var bar = $('[data-toolbar="' + key + '"]');
  if (bar.dataset.ready) return;
  bar.dataset.ready = '1';
  bar.innerHTML = '<input type="search" placeholder="Tìm trong bảng..." data-search="' + key + '"> <span style="color:var(--muted);font-size:12.5px" data-count="' + key + '"></span>';
  bar.querySelector('[data-search]').addEventListener('input', function (e) { TABLES[key].search = e.target.value; TABLES[key].page = 0; applySortSearch(key); });

  /* QUAN TRỌNG: dùng appendChild (KHÔNG gán lại tools.innerHTML) — tab "tndn" và
     "pnk" đã có sẵn 1 nút riêng trong HTML (#btnTNDNModal / #btnPNKModal, mở đúng
     mẫu chính thức) nằm trong CHÍNH div [data-tools] này; gán lại innerHTML sẽ XÓA
     mất nút đó ngay lần lập báo cáo đầu tiên — đây chính là lỗi thật đã gây ra việc
     người dùng chỉ còn thấy nút "PDF"/"In" chung (ra bảng kê liệt kê thường) mà
     không còn thấy nút xuất đúng mẫu chính thức nữa. */
  var tools = $('[data-tools="' + key + '"]');
  var genericWrap = document.createElement('span');
  genericWrap.innerHTML =
    '<button class="btn small" data-act="print">🖨 In</button>' +
    '<button class="btn small" data-act="pdf">📄 PDF</button>' +
    '<button class="btn small" data-act="excel">📊 Excel</button>';
  tools.appendChild(genericWrap);
  /* "tndn" (Mẫu 02/TNDN) và "pnk" (Phiếu nhập kho, Mẫu 01-VT) có mẫu chính thức
     riêng — nút "In"/"PDF" chung ở đây phải ra ĐÚNG mẫu đó (giống hệt nút
     "Xuất mẫu 02/TNDN chính thức"/"Xuất phiếu nhập kho (hàng loạt)"), không phải
     bảng kê liệt kê thường (buildPrintSheet/exportPDF) — nếu không sẽ lại đúng lỗi
     "in ra bảng kê chứ không phải phiếu nhập kho/đúng mẫu 02/TNDN" người dùng báo. */
  var isOfficialForm = (key === 'tndn' || key === 'pnk');
  genericWrap.querySelectorAll('button').forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (isOfficialForm && (btn.dataset.act === 'print' || btn.dataset.act === 'pdf')) {
        openBankInfoModal(key);
        return;
      }
      if (btn.dataset.act === 'print') printSection(key);
      if (btn.dataset.act === 'pdf') runExport('tạo file PDF', exportPDF)(key);
      if (btn.dataset.act === 'excel') runExport('tạo file Excel', exportExcel)(key);
    });
  });

  var pager = $('[data-pager="' + key + '"]');
  pager.innerHTML = '<span data-pageinfo="' + key + '"></span><span><button class="btn small" data-prev="' + key + '">‹ Trước</button> <span data-pageno="' + key + '"></span> <button class="btn small" data-next="' + key + '">Sau ›</button></span>';
  pager.querySelector('[data-prev]').addEventListener('click', function () { TABLES[key].page--; renderTableRows(key); });
  pager.querySelector('[data-next]').addEventListener('click', function () { TABLES[key].page++; renderTableRows(key); });
}

/**
 * [PERF-05] 1 bộ so sánh chuỗi tiếng Việt dùng chung, tạo 1 lần. `a.localeCompare(b, 'vi')`
 * (bản cũ) theo đặc tả ECMA-402 chính là `new Intl.Collator('vi').compare(a, b)` — nhưng tạo lại
 * bộ so sánh ở MỖI phép so sánh (hàng trăm nghìn lần khi sắp xếp bảng lớn). Kết quả thứ tự GIỐNG
 * HỆT, chỉ bỏ chi phí tạo lại.
 */
var VI_COLLATOR = (typeof Intl !== 'undefined' && Intl.Collator) ? new Intl.Collator('vi') : { compare: function (a, b) { return a.localeCompare(b, 'vi'); } };

export function applySortSearch(key) {
  var st = TABLES[key], rows = st.rows || [];
  // [Tìm không dấu] Chuẩn hoá bỏ dấu tiếng Việt cả từ khoá lẫn dữ liệu trước khi so khớp —
  // gõ "nguyen van a" (không dấu) vẫn tìm ra "Nguyễn Văn A". Vẫn là khớp chuỗi con (substring)
  // như bản gốc, không đổi ngữ nghĩa tìm kiếm nào khác — chỉ thêm khả năng bỏ qua dấu.
  var q = normalizeSearch((st.search || '').trim());
  var view = q ? rows.filter(function (r) { return st.cols.some(function (c) { return normalizeSearch(r[c[0]] == null ? '' : r[c[0]]).indexOf(q) >= 0; }); }) : rows.slice();
  if (st.sortCol >= 0) {
    var col = st.cols[st.sortCol], dir = st.sortDir;
    view.sort(function (a, b) {
      var va = a[col[0]], vb = b[col[0]];
      if (col[2] === 'money' || col[2] === 'kl' || col[2] === 'int' || col[2] === 'datekey') { va = va || 0; vb = vb || 0; return (va - vb) * dir; }
      if (col[2] === 'date') { va = dateKey(va) || 0; vb = dateKey(vb) || 0; return (va - vb) * dir; }
      return VI_COLLATOR.compare(String(va || ''), String(vb || '')) * dir;
    });
  }
  st.view = view; st.page = Math.min(st.page, Math.max(0, Math.ceil(view.length / st.pageSize) - 1));
  var countEl = $('[data-count="' + key + '"]'); if (countEl) countEl.textContent = view.length.toLocaleString('vi-VN') + ' dòng';
  renderTableRows(key);
}

/**
 * [Virtual scroll] Số dòng (sau lọc/tìm) từ mức này trở lên mới chuyển sang chế độ cuộn ảo —
 * bảng nhỏ hơn ngưỡng này giữ NGUYÊN 100% hành vi phân trang gốc (không có gì đổi, không có
 * rủi ro). Chỉ khi dữ liệu thực sự lớn mới cần kỹ thuật này để tránh giật/đơ khi cuộn xem hết.
 */
var VIRTUAL_SCROLL_THRESHOLD = 300;
var VIRTUAL_OVERSCAN = 10; // số dòng vẽ thêm ở trên/dưới vùng nhìn thấy, tránh chớp trắng khi cuộn nhanh

function theadHTML(st) {
  return '<thead><tr>' + st.cols.map(function (c, i) {
    var numCls = (c[2] === 'money' || c[2] === 'kl' || c[2] === 'int') ? ' num' : '';
    var arrow = st.sortCol === i ? (st.sortDir > 0 ? ' ▲' : ' ▼') : '';
    return '<th class="' + numCls + '" data-ci="' + i + '">' + esc(c[1]) + arrow + '</th>';
  }).join('') + '</tr></thead>';
}
function tfootHTML(st) {
  if (!st.totals) return '';
  return '<tfoot><tr class="total">' + st.cols.map(function (c, i) {
    var numCls = (c[2] === 'money' || c[2] === 'kl' || c[2] === 'int') ? ' num' : '';
    if (i === 0) return '<td class="' + numCls + '">Tổng cộng</td>';
    if (st.totals.hasOwnProperty(c[0])) return '<td class="' + numCls + '">' + fmtCell(st.totals[c[0]], c[2]) + '</td>';
    return '<td></td>';
  }).join('') + '</tr></tfoot>';
}
function rowHTML(st, r) {
  return '<tr>' + st.cols.map(function (c) {
    var numCls = (c[2] === 'money' || c[2] === 'kl' || c[2] === 'int') ? ' num' : '';
    return '<td class="' + numCls + '">' + fmtCell(r[c[0]], c[2]) + '</td>';
  }).join('') + '</tr>';
}
function bindSortHeaders(table, st, key) {
  $$('th[data-ci]', table).forEach(function (th) {
    th.addEventListener('click', function () {
      var i = +th.dataset.ci;
      if (st.sortCol === i) st.sortDir = -st.sortDir; else { st.sortCol = i; st.sortDir = 1; }
      applySortSearch(key);
    });
  });
}

export function renderTableRows(key) {
  var st = TABLES[key], view = st.view || [];
  if (view.length > VIRTUAL_SCROLL_THRESHOLD) { renderTableRowsVirtual(key, st, view); return; }

  var start = st.page * st.pageSize, slice = view.slice(start, start + st.pageSize);
  var table = $('#tbl-' + key);
  var tbody = '<tbody>' + (slice.length ? slice.map(function (r) { return rowHTML(st, r); }).join('') : '<tr><td colspan="' + st.cols.length + '" class="empty">Không có dữ liệu phù hợp bộ lọc</td></tr>') + '</tbody>';
  table.innerHTML = theadHTML(st) + tbody + tfootHTML(st);
  bindSortHeaders(table, st, key);
  var n = view.length, pages = Math.max(1, Math.ceil(n / st.pageSize));
  var info = $('[data-pageinfo="' + key + '"]');
  if (info) info.textContent = n ? ('Hiển thị ' + (start + 1) + '–' + (start + slice.length) + ' / ' + n.toLocaleString('vi-VN') + ' dòng') : '';
  var pn = $('[data-pageno="' + key + '"]'); if (pn) pn.textContent = 'Trang ' + (st.page + 1) + '/' + pages;
  var prevBtn = $('[data-prev="' + key + '"]'); if (prevBtn) prevBtn.disabled = false;
  var nextBtn = $('[data-next="' + key + '"]'); if (nextBtn) nextBtn.disabled = false;
}

/**
 * [Virtual scroll] Chỉ vẽ đúng số dòng đang nằm trong vùng nhìn thấy của `.scrollWrap` (+ 1
 * khoảng đệm trên/dưới), dùng 2 dòng "đệm" (`<tr>` cao bằng đúng phần chưa vẽ) để giữ đúng
 * chiều cao thanh cuộn — người dùng cuộn thấy mượt như đang xem TOÀN BỘ dữ liệu, dù DOM tại
 * mỗi thời điểm chỉ có vài chục `<tr>` thật sự. Không phân trang trong chế độ này (cuộn xem
 * hết, không bấm Trước/Sau) — đúng bản chất virtual-scroll.
 */
function renderTableRowsVirtual(key, st, view) {
  var table = $('#tbl-' + key);
  var scrollWrap = table.closest('.scrollWrap');
  var rowH = st.rowHeightPx || 34; // ước lượng ban đầu, tự đo lại chính xác hơn sau khi vẽ dòng đầu tiên
  var viewportH = (scrollWrap && scrollWrap.clientHeight) || 480;
  var scrollTop = (scrollWrap && scrollWrap.scrollTop) || 0;

  var startIdx = Math.max(0, Math.floor(scrollTop / rowH) - VIRTUAL_OVERSCAN);
  var visibleCount = Math.ceil(viewportH / rowH) + VIRTUAL_OVERSCAN * 2;
  var endIdx = Math.min(view.length, startIdx + visibleCount);
  var slice = view.slice(startIdx, endIdx);

  var topH = startIdx * rowH, botH = (view.length - endIdx) * rowH;
  var spacerTd = '<td colspan="' + st.cols.length + '" style="padding:0;border:none"></td>';
  var tbody = '<tbody>' +
    (topH > 0 ? '<tr aria-hidden="true" style="height:' + topH + 'px">' + spacerTd + '</tr>' : '') +
    (slice.length ? slice.map(function (r) { return rowHTML(st, r); }).join('') : '<tr><td colspan="' + st.cols.length + '" class="empty">Không có dữ liệu phù hợp bộ lọc</td></tr>') +
    (botH > 0 ? '<tr aria-hidden="true" style="height:' + botH + 'px">' + spacerTd + '</tr>' : '') +
    '</tbody>';
  table.innerHTML = theadHTML(st) + tbody + tfootHTML(st);
  bindSortHeaders(table, st, key);

  // Đo chiều cao dòng THẬT (không dùng số ước lượng cố định) để lần cuộn/vẽ lại sau chính xác hơn.
  var measureRow = table.querySelector('tbody tr:not([aria-hidden])');
  if (measureRow) { var h = measureRow.getBoundingClientRect().height; if (h > 0) st.rowHeightPx = h; }

  var n = view.length;
  var info = $('[data-pageinfo="' + key + '"]');
  if (info) info.textContent = 'Cuộn để xem thêm — đang hiển thị dòng ' + (startIdx + 1) + '–' + endIdx + ' / ' + n.toLocaleString('vi-VN') + ' dòng';
  var pn = $('[data-pageno="' + key + '"]'); if (pn) pn.textContent = '';
  var prevBtn = $('[data-prev="' + key + '"]'); if (prevBtn) prevBtn.disabled = true;
  var nextBtn = $('[data-next="' + key + '"]'); if (nextBtn) nextBtn.disabled = true;

  if (scrollWrap && !scrollWrap.dataset.virtualBound) {
    scrollWrap.dataset.virtualBound = '1';
    var pending = false;
    scrollWrap.addEventListener('scroll', function () {
      if (pending) return;
      pending = true;
      requestAnimationFrame(function () {
        pending = false;
        var curSt = TABLES[key];
        if (curSt && curSt.view && curSt.view.length > VIRTUAL_SCROLL_THRESHOLD) renderTableRowsVirtual(key, curSt, curSt.view);
      });
    });
  }
}
