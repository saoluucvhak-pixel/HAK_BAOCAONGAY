/**
 * [2026-10-29] Vẽ 1 hàng thẻ số liệu tổng (dùng chung: Sổ chi tiết tiền vay, Cập nhật khoản vay, Tổng hợp
 * thanh toán). Chỉ trình bày — số liệu do nơi gọi tính sẵn; số co chữ vừa thẻ (card-fit.js).
 * @module components/stat-cards
 */
import { esc } from '../utils/dom-utils.js';
import { fitCardsIn } from './card-fit.js';

/**
 * @param {?Element} box khối chứa (class "cards")
 * @param {{lbl: string, val: string, sub?: string, cls?: string}[]} cards
 */
export function renderStatCards(box, cards) {
  if (!box) return;
  box.innerHTML = cards.map((c) => '<div class="card ' + (c.cls || '') + '"><div class="lbl">' + esc(c.lbl) + '</div><div class="val">' + esc(c.val) +
    '</div><div class="sub">' + esc(c.sub || '') + '</div></div>').join('');
  fitCardsIn(box);
}
