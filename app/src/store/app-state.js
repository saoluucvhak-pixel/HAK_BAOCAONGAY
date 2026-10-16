/**
 * [STORE] AppState — Hoàn tác/Làm lại (undo/redo) cho danh mục Đại lý (`STATE.dmdl`) và
 * danh mục Hỗ trợ/Trợ giá (`STATE.dmht`) — dữ liệu duy nhất trong app do người dùng TỰ NHẬP
 * TAY (khác với dữ liệu tải từ Google Sheet, vốn chỉ đọc, không có gì để "hoàn tác"). Tính
 * năng bổ sung theo yêu cầu người dùng — KHÔNG đổi kết quả tính toán/hiển thị nào khác, chỉ
 * thêm khả năng quay lại trạng thái trước khi sửa.
 *
 * Cách dùng: gọi `pushUndoSnapshot()` NGAY TRƯỚC khi thay đổi `STATE.dmdl`/`STATE.dmht` (ở mọi
 * nơi người dùng sửa/thêm/xoá 1 dòng danh mục) — snapshot lưu bản sao sâu (deep clone) của
 * TRẠNG THÁI TRƯỚC ĐÓ. Gọi `undo()`/`redo()` để khôi phục.
 * @module store/app-state
 */
import { STATE, saveDM } from './state.js';

const MAX_STACK = 50;
const undoStack = [];
const redoStack = [];

function cloneDM() {
  // Dữ liệu danh mục chỉ gồm string/number/date-string (không có hàm/Date object lồng nhau) —
  // JSON round-trip là cách deep-clone đơn giản và đủ an toàn ở đây.
  return { dmdl: JSON.parse(JSON.stringify(STATE.dmdl)), dmht: JSON.parse(JSON.stringify(STATE.dmht)) };
}

/** Gọi TRƯỚC khi thay đổi STATE.dmdl/STATE.dmht — lưu lại trạng thái hiện tại để có thể hoàn tác về sau. */
export function pushUndoSnapshot() {
  undoStack.push(cloneDM());
  if (undoStack.length > MAX_STACK) undoStack.shift();
  redoStack.length = 0; // 1 thao tác sửa mới làm mất toàn bộ lịch sử "làm lại" cũ — đúng ngữ nghĩa undo/redo chuẩn (giống Ctrl+Z trong Word/Excel)
}

export function canUndo() { return undoStack.length > 0; }
export function canRedo() { return redoStack.length > 0; }

/**
 * Hoàn tác lần sửa gần nhất. @returns {boolean} true nếu đã hoàn tác được (còn lịch sử để lùi về)
 */
export function undo() {
  if (!undoStack.length) return false;
  redoStack.push(cloneDM());
  const prev = undoStack.pop();
  STATE.dmdl = prev.dmdl;
  STATE.dmht = prev.dmht;
  saveDM();
  return true;
}

/** Làm lại thao tác vừa hoàn tác. @returns {boolean} true nếu đã làm lại được */
export function redo() {
  if (!redoStack.length) return false;
  undoStack.push(cloneDM());
  const next = redoStack.pop();
  STATE.dmdl = next.dmdl;
  STATE.dmht = next.dmht;
  saveDM();
  return true;
}
