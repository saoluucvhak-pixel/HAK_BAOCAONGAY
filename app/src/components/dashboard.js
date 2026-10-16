/**
 * [COMPONENT] Dashboard — KPI tính từ cùng RESULTS với các báo cáo chi tiết (không có công
 * thức KPI riêng khác báo cáo), vẽ biểu đồ bằng Chart.js. Logic GIỮ NGUYÊN 100% so với bản gốc.
 *
 * [SỬA — Phase 3.4] Chart.js trước đây nạp qua <script src="cdn..."> — nếu mạng/máy chặn CDN
 * thì `typeof Chart === 'undefined'` và dashboard không vẽ được biểu đồ nào (âm thầm, không có
 * thông báo lỗi). Đã sửa: `import Chart from 'chart.js/auto'` — bundle thẳng vào
 * `dist/index.html`, tự đăng ký đủ mọi loại biểu đồ giống hệt bản UMD CDN cũ, không phụ thuộc
 * mạng nữa. Xem BUG_FIXED.md.
 *
 * `RESULTS` được import từ `legacy-app.js` (nơi `runReport()` gán giá trị) — cạnh phụ thuộc
 * vòng an toàn tương tự `components/report-table.js` (xem ghi chú ở đó), vì `renderDashboard()`
 * chỉ được GỌI (từ `runReport()`) sau khi `RESULTS` đã được gán, không phải lúc import module.
 * @module components/dashboard
 */
import Chart from 'chart.js/auto';
import { $, $$ } from '../utils/dom-utils.js';
import { fmtMoney, fmtKL, parseNum } from '../utils/number-utils.js';
import { fmtDate, inDateRange, toKeyFromInput } from '../utils/date-utils.js';
import { RESULTS } from '../legacy-app.js';

const CHARTS = {};

export function renderDashboard(ctx, reportKey) {
  var r = RESULTS;
  var soXe = new Set(r.nhap.rows.map(function (x) { return x['Biển số 1']; }).filter(Boolean)).size;
  var cards = [
    ['TỔNG NHẬP', fmtKL(r.nhap.totalKL / 1000) + ' tấn', 'c1'],
    ['GIÁ TRỊ NHẬP', fmtMoney(r.nhap.totalTien), 'c1'],
    ['TỔNG THANH TOÁN', fmtMoney(r.tt.totalTien), 'c2'],
    ['CÔNG NỢ', fmtMoney(r.congno.totalTien), 'c4'],
    ['SỐ XE', soXe.toLocaleString('vi-VN') + ' xe', 'c2'],
    ['XE CHỜ > 1 GIỜ', r.xecho.length.toLocaleString('vi-VN') + ' xe', 'c3'],
    ['HỖ TRỢ TÀI XẾ', fmtMoney(r.hotro.totalTien), 'c3'],
    ['TRỢ GIÁ', fmtMoney(r.trogia.totalTien), 'c3'],
    // [MỚI 2026-09-22] Theo dõi "bao nhiêu nguyên liệu phục vụ tàu nào" — r.tautonghop tính trên
    // TOÀN BỘ hồ sơ đã gán tàu (không giới hạn theo khoảng ngày đang lọc), xem runReport().
    ['SỐ TÀU ĐANG THEO DÕI', (r.tautonghop.rows.length).toLocaleString('vi-VN') + ' tàu', 'c4'],
    ['NGUYÊN LIỆU ĐÃ XUẤT THEO TÀU', fmtKL(r.tautonghop.totalKL) + ' tấn', 'c4']
  ];
  $('#dashCards').innerHTML = cards.map(function (c) {
    return '<div class="card ' + c[2] + '"><div class="lbl">' + c[0] + '</div><div class="val">' + c[1] + '</div></div>';
  }).join('');
  fitCardValues();

  var labels = r.tonghop.map(function (x) { return fmtDate(x['Ngày']); });
  var klData = r.tonghop.map(function (x) { return +x['Khối lượng nhập'].toFixed(2); });
  var gtData = r.tonghop.map(function (x) { return x['Giá trị nhập']; });

  var byDL = {}, byNG = {};
  // [PERF-05] Đọc khoảng ngày từ ô nhập 1 lần trước vòng lặp (trước đây đọc DOM 2 lần cho MỖI
  // phiếu cân — 10.000 phiếu = 20.000 lần querySelector). Giá trị không đổi trong vòng lặp nên
  // kết quả giống hệt.
  var dashFromKey = toKeyFromInput($('#fFrom').value), dashToKey = toKeyFromInput($('#fTo').value);
  ctx.phieucan.forEach(function (row) {
    if (!inDateRange(row['Ngày cân 1'], dashFromKey, dashToKey)) return;
    var kl = (parseNum(row['KL hàng (KG)']) || 0) / 1000;
    var dl = row['ĐL'] || '(khác)'; byDL[dl] = (byDL[dl] || 0) + kl;
    var ng = row['NG'] || '(khác)'; byNG[ng] = (byNG[ng] || 0) + kl;
  });

  drawChart('chartKLNgay', 'bar', labels, [{ label: 'Khối lượng (tấn)', data: klData, backgroundColor: '#1f6feb' }]);
  drawChart('chartGTNgay', 'line', labels, [{ label: 'Giá trị (đ)', data: gtData, borderColor: '#1a8a4a', backgroundColor: 'rgba(26,138,74,.15)', fill: true, tension: .25 }]);
  drawChart('chartDL', 'bar', Object.keys(byDL), [{ label: 'Tấn', data: Object.values(byDL), backgroundColor: '#b8860b' }]);
  drawChart('chartNG', 'bar', Object.keys(byNG), [{ label: 'Tấn', data: Object.values(byNG), backgroundColor: '#d13438' }]);

  // [MỚI 2026-09-22] "Dashboard có theo dõi bao nhiêu nguyên liệu phục vụ tàu nào" — mỗi cột là
  // 1 Tàu (nhãn kèm khách hàng), chiều cao = tổng khối lượng (tấn) đã gán cho tàu đó.
  var tauLabels = r.tautonghop.rows.map(function (x) { return x['Tàu'] + (x['Khách hàng xuất'] ? (' (' + x['Khách hàng xuất'] + ')') : ''); });
  var tauData = r.tautonghop.rows.map(function (x) { return +x['Khối lượng_Tấn'].toFixed(2); });
  drawChart('chartTau', 'bar', tauLabels, [{ label: 'Tấn', data: tauData, backgroundColor: '#6f42c1' }]);
}

/**
 * [SỬA 2026-09-23] Người dùng báo: đơn vị tiền "đ" (và "tấn"/"xe") bị xuống dòng riêng 1 mình
 * khi số tiền dài, nhìn mất cân đối. Nguyên nhân: `.card .val` không có white-space:nowrap nên
 * trình duyệt tự ngắt dòng ở khoảng trắng trước đơn vị khi không đủ chỗ. Đã sửa bằng cách CHO
 * KHÔNG XUỐNG DÒNG (nowrap) rồi tự co nhỏ cỡ chữ (không đổi SỐ LIỆU/định dạng số, chỉ đổi cỡ chữ
 * hiển thị) cho tới khi vừa đúng 1 dòng trong bề rộng thẻ — tự thích ứng theo mọi kích thước màn
 * hình/độ dài số tiền, không cần sửa lại mỗi khi số liệu thay đổi.
 */
function fitCardValues() {
  var MIN_PX = 15; // không co nhỏ hơn mức này để vẫn đọc được rõ
  $$('.card .val', $('#dashCards')).forEach(function (el) {
    el.style.whiteSpace = 'nowrap';
    var size = 24; // khớp 1.5rem mặc định trong CSS (.card .val{font-size:1.5rem})
    el.style.fontSize = size + 'px';
    var guard = 0;
    while (el.scrollWidth > el.clientWidth && size > MIN_PX && guard < 20) {
      size -= 1;
      el.style.fontSize = size + 'px';
      guard++;
    }
  });
}

export function drawChart(canvasId, type, labels, datasets) {
  if (typeof Chart === 'undefined') return;
  var el = document.getElementById(canvasId); if (!el) return;
  if (CHARTS[canvasId]) CHARTS[canvasId].destroy();
  CHARTS[canvasId] = new Chart(el.getContext('2d'), {
    type: type, data: { labels: labels, datasets: datasets },
    options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { display: datasets.length > 1 } }, scales: { y: { beginAtZero: true } } }
  });
}
