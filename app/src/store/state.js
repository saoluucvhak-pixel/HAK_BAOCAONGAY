/**
 * [STORE] Kho dữ liệu dùng chung toàn app — thay cho biến toàn cục `STATE`/`TABLES` của bản
 * gốc. Logic GIỮ NGUYÊN 100% (chỉ đổi khai báo `var` → `export const`, các hàm khác vẫn mutate
 * TRỰC TIẾP vào object này — đúng hành vi tham chiếu gốc, không copy dữ liệu).
 * @module store/state
 */
import { CONFIG } from '../config/config.js';
import { dateKey } from '../utils/date-utils.js';
import { $ } from '../utils/dom-utils.js';
import { storageService } from '../services/storage-service.js';

/** Kho dữ liệu trong bộ nhớ (đã fetch + normalize 1 lần) — mọi lọc/tính toán đọc từ đây. */
export const STATE = {
  phieucan: [], dntt: [], hdncc: [], hosokeo: [],
  phieucanBySoCT: {}, dnttBySoCT: {}, hdmbByKey: {}, hdnccBySoHopDong: {},
  dmdl: [], dmht: [],
  vayRecords: [], // Khoản vay TH_VAY 3 cột (tab "Cập nhật khoản vay", IndexedDB) — nguồn Tổng tiền vay của Sổ chi tiết tiền vay
  soDuDauSo: null, // Số dư đầu kỳ nhập tay của Sổ chi tiết tiền vay {ngay ISO, soTien} (IndexedDB, kho meta) — null = chưa nhập
  tienVayLuyKe: 'ky', // Lũy kế tiền vay chi: 'ky' = trong khoảng thời gian báo cáo (mặc định), 'dauSo' = từ đầu sổ
  lastUpdated: null,
  filtered: null // {phieucan, dntt, phieucanBySoCT, dnttBySoCT}
};

/** State riêng của mỗi bảng: {rows, cols, sortCol, sortDir, page, pageSize, search, totalsRow}. */
export const TABLES = {};

/* ---------------- Danh mục (localStorage) ---------------- */
export const DEFAULT_DM_DL = [
  { 'Đại lý': 'DT', 'Tên Đại lý': 'Duy Thức', 'Sản lượng Min': 0, 'Sản lượng max': 100000, 'Hoa hồng': 10000, 'Ngày bắt đầu': '2025-12-01', 'Ngày kết thúc': '2026-12-31' },
  { 'Đại lý': 'QT', 'Tên Đại lý': 'Quang Tèo', 'Sản lượng Min': 0, 'Sản lượng max': 100000, 'Hoa hồng': 10000, 'Ngày bắt đầu': '2025-12-01', 'Ngày kết thúc': '2026-12-31' },
  { 'Đại lý': 'KL', 'Tên Đại lý': 'Khách Lẻ', 'Sản lượng Min': 0, 'Sản lượng max': 100000, 'Hoa hồng': 0, 'Ngày bắt đầu': '2025-12-01', 'Ngày kết thúc': '2026-12-31' }
];
export const DEFAULT_DM_HT = [
  { 'Nguồn gốc': 'D1', 'Hỗ trợ': 10000, 'Hình thức': 'Cuối tháng', 'Ngày bắt đầu': '2026-01-01', 'Ngày kết thúc': '2026-12-31' },
  { 'Nguồn gốc': 'D2', 'Hỗ trợ': 10000, 'Hình thức': 'Khi thanh toán', 'Ngày bắt đầu': '2026-01-01', 'Ngày kết thúc': '2026-12-31' }
];

export function loadDM() {
  STATE.dmdl = storageService.get(CONFIG.STORAGE_KEYS.DM_DL, null) || DEFAULT_DM_DL.slice();
  STATE.dmht = storageService.get(CONFIG.STORAGE_KEYS.DM_HT, null) || DEFAULT_DM_HT.slice();
}
export function saveDM() {
  storageService.set(CONFIG.STORAGE_KEYS.DM_DL, STATE.dmdl);
  storageService.set(CONFIG.STORAGE_KEYS.DM_HT, STATE.dmht);
}

/**
 * [DATA_SERVICE] Áp dụng bộ lọc (Đại lý / Nguồn gốc / Khách hàng / Biển số) — lọc hoàn toàn
 * trong bộ nhớ (STATE), không gọi lại Google Sheet.
 */
export function applyFilters() {
  var dl = $('#fDL').value, ng = $('#fNG').value, kh = $('#fKH').value, bs = $('#fBS').value;
  function match(r) {
    if (dl && r['ĐL'] !== dl) return false;
    if (ng && r['NG'] !== ng) return false;
    if (kh && r['Khách hàng'] !== kh) return false;
    if (bs && r['Biển số 1'] !== bs) return false;
    return true;
  }
  var phieucan = STATE.phieucan.filter(match);
  var phieucanBySoCT = {}; phieucan.forEach(function (r) { if (r['So_CT']) phieucanBySoCT[r['So_CT']] = r; });
  var dntt = STATE.dntt.filter(function (r) { var pc = STATE.phieucanBySoCT[r['Số CT']]; return pc ? match(pc) : !dl && !ng && !kh && !bs; });
  var dnttBySoCT = {}; dntt.forEach(function (r) {
    var k = r['Số CT']; if (!k) return;
    var cur = dnttBySoCT[k];
    if (!cur || (dateKey(r['Ngày thanh toán']) || 0) >= (dateKey(cur['Ngày thanh toán']) || 0)) dnttBySoCT[k] = r;
  });
  return { phieucan: phieucan, dntt: dntt, phieucanBySoCT: phieucanBySoCT, dnttBySoCT: dnttBySoCT };
}
