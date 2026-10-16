/**
 * [DATA_SERVICE] Gán "Tàu" (chuyến xuất) + "Khách hàng" cho từng dòng BKLS xuất khẩu — TÍNH
 * NĂNG MỚI theo yêu cầu người dùng: "BKLS chi tiết/tổng hợp muốn nhóm theo Tàu, Khách hàng. Nếu
 * đã xuất BKLS theo tàu thì sau này không thể xuất tàu khác. Cho chọn BKLS để xuất theo tàu."
 *
 * Dữ liệu "Tàu"/"Khách hàng" KHÔNG có trong Google Sheet HOSOKEO (đã hỏi lại người dùng, xác
 * nhận: "Chưa có trong Sheet — Tàu là thông tin tự gán thời điểm xuất, nhập tay trong app") —
 * nên lưu HOÀN TOÀN ở phía app (localStorage qua storageService), khoá theo "Số BKLS" (mã hồ sơ
 * lâm sản, duy nhất cho mỗi dòng — đúng cột đã dùng làm khoá chính ở computeXuatHang01()).
 *
 * Quy tắc khoá (đã xác nhận với người dùng): 1 "Số BKLS" đã gán cho 1 Tàu thì KHÔNG được gán
 * sang Tàu khác nữa (khoá vĩnh viễn theo Tàu đã gán) — nhưng vẫn xuất lại báo cáo cho ĐÚNG Tàu
 * đó bao nhiêu lần cũng được (không phải khoá "chỉ xuất 1 lần duy nhất"). Tàu + Khách hàng nhập
 * CHUNG 1 lần cho cả lô đang chọn (khớp thực tế: 1 lô hàng thường đi 1 tàu cho 1 khách).
 * @module services/tau-assignment
 */
import { CONFIG } from '../config/config.js';
import { storageService } from './storage-service.js';

/** @returns {Object} map { [soBKLS]: { tau, khachHang, ngayGan (ISO string) } } */
export function loadTauAssignments() {
  return storageService.get(CONFIG.STORAGE_KEYS.TAU_ASSIGN, {}) || {};
}
function saveTauAssignments(map) { storageService.set(CONFIG.STORAGE_KEYS.TAU_ASSIGN, map); }

/** @param {string} soBKLS @returns {{tau:string, khachHang:string, ngayGan:string}|null} */
export function getTauInfo(soBKLS, assignments) {
  if (!soBKLS) return null;
  var map = assignments || loadTauAssignments();
  return map[soBKLS] || null;
}

/**
 * true nếu soBKLS đã được gán cho 1 Tàu KHÁC với `tau` đang muốn gán (tức là bị khoá, không cho
 * chọn lại) — nếu chưa gán cho tàu nào, hoặc đã gán ĐÚNG tàu đang xét thì false (không khoá).
 */
export function isLockedToOtherTau(soBKLS, tau, assignments) {
  var info = getTauInfo(soBKLS, assignments);
  if (!info) return false;
  return String(info.tau || '').trim() !== String(tau || '').trim();
}

/** Danh sách tên Tàu đã từng gán (để hiện gợi ý/dropdown "Tàu đã có" khi mở modal). */
export function listKnownTau(assignments) {
  var map = assignments || loadTauAssignments();
  var set = {};
  Object.keys(map).forEach(function (k) { var t = (map[k].tau || '').trim(); if (t) set[t] = true; });
  return Object.keys(set).sort();
}

/**
 * Gán 1 lô "Số BKLS" cho 1 Tàu + Khách hàng. Bỏ qua (không gán, không lỗi) các Số BKLS đã bị
 * khoá bởi Tàu khác — đây là lớp bảo vệ cuối (defense in depth), UI phải lọc trước khi gọi hàm
 * này, không dựa vào đây làm nơi kiểm tra duy nhất.
 * @param {string[]} soBKLSList
 * @param {string} tau @param {string} khachHang
 * @returns {{assigned:string[], skipped:string[]}}
 */
export function assignTau(soBKLSList, tau, khachHang) {
  var map = loadTauAssignments();
  var assigned = [], skipped = [];
  var nowIso = new Date().toISOString();
  (soBKLSList || []).forEach(function (soBKLS) {
    if (!soBKLS) return;
    if (isLockedToOtherTau(soBKLS, tau, map)) { skipped.push(soBKLS); return; }
    map[soBKLS] = { tau: tau, khachHang: khachHang, ngayGan: nowIso };
    assigned.push(soBKLS);
  });
  saveTauAssignments(map);
  return { assigned: assigned, skipped: skipped };
}

/** Gỡ gán (chỉ dùng khi người dùng chọn "Gỡ gán" để sửa nhầm) — xoá hẳn key khỏi map. */
export function unassignTau(soBKLSList) {
  var map = loadTauAssignments();
  (soBKLSList || []).forEach(function (soBKLS) { delete map[soBKLS]; });
  saveTauAssignments(map);
}
