/**
 * Co chữ số trên thẻ số liệu cho vừa khung (không bao giờ bị cắt) — tách từ components/dashboard.js
 * ([SỬA 2026-09-23] + [SỬA 2026-10-29], xem CHANGELOG Phase 4.6) để thẻ tổng Sổ chi tiết tiền vay dùng
 * chung mà không tạo vòng phụ thuộc (dashboard.js import legacy-app.js).
 * @module components/card-fit
 */

/** Cỡ chữ lớn nhất / nhỏ nhất của số trên thẻ (px). 24 = 1.5rem của CSS `.card .val`. */
var FIT_MAX_PX = 24, FIT_MIN_PX = 14;

/**
 * [SỬA 2026-10-29] Người dùng gửi ảnh "254.203.099.000 đ" bị cắt khỏi thẻ. Nguyên nhân: LẬP BÁO CÁO lúc
 * đang ở tab khác ⇒ Dashboard ẩn (bề rộng 0) ⇒ đo không được, giữ nguyên cỡ 24px; mở Dashboard / đổi
 * cửa sổ sau đó không đo lại. Nay: đo bằng tìm nhị phân trên bề rộng THẬT, và đo lại mỗi khi thẻ đổi
 * kích thước (ResizeObserver — bắt cả lúc thẻ từ ẩn chuyển sang hiện). Nếu ở cỡ nhỏ nhất vẫn không vừa
 * (thẻ rất hẹp) thì cho xuống dòng TRƯỚC đơn vị, số luôn hiện đủ — không bao giờ bị cắt.
 */
function fitOne(el) {
  var w = el.clientWidth;
  if (!w) return; // đang ẩn — ResizeObserver sẽ gọi lại khi hiện
  el.style.whiteSpace = 'nowrap';
  var lo = FIT_MIN_PX, hi = FIT_MAX_PX;
  el.style.fontSize = hi + 'px';
  if (el.scrollWidth > w) {
    while (hi - lo > 0.5) { var mid = (lo + hi) / 2; el.style.fontSize = mid + 'px'; if (el.scrollWidth > w) hi = mid; else lo = mid; }
    el.style.fontSize = Math.floor(lo * 2) / 2 + 'px';
  }
  if (el.scrollWidth > w) el.style.whiteSpace = 'normal';
}

var cardObserver = null;
/**
 * Co số trên mọi thẻ `.card .val` trong `root` cho vừa 1 dòng và theo dõi đổi kích thước (dùng chung cho
 * Dashboard và thẻ tổng của Sổ chi tiết tiền vay — [2026-10-29] tách khỏi dashboard.js, logic giữ nguyên).
 * @param {?Element} root khối chứa thẻ
 */
export function fitCardsIn(root) {
  if (!root) return;
  var vals = root.querySelectorAll('.card .val');
  Array.prototype.forEach.call(vals, fitOne);
  if (typeof ResizeObserver === 'undefined') return;
  if (!cardObserver) cardObserver = new ResizeObserver(function (entries) { entries.forEach(function (en) { fitOne(en.target); }); });
  Array.prototype.forEach.call(vals, function (el) { cardObserver.observe(el); });
}

