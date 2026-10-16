/**
 * [REPORT_SERVICE] Business logic — mỗi báo cáo là 1 hàm compute*() thuần (pure function):
 * chỉ nhận mảng dữ liệu đã chuẩn hoá + tham số, KHÔNG đụng DOM/State, trả về mảng kết quả.
 * Đây là lớp quan trọng nhất của ứng dụng — số liệu báo cáo phải khớp TUYỆT ĐỐI với file
 * Excel mẫu gốc (xem VALIDATION.md). Mọi thay đổi ở module này bắt buộc phải kiểm chứng lại
 * bằng script so sánh số liệu trước/sau (xem PERFORMANCE_REPORT.md, BUG_FIXED.md).
 * @module services/report-service
 */
import { dateKey, toMinutes, inDateRange, pad2 } from '../utils/date-utils.js';
import { parseNum, roundDown3 } from '../utils/number-utils.js';
import { numToWordsVN } from '../utils/number-to-words-vn.js';
import { CONFIG } from '../config/config.js';

/**
 * [PERF-04] Sắp xếp tăng dần theo khoá số, tính khoá ĐÚNG 1 LẦN/dòng thay vì 2 lần mỗi phép so
 * sánh (sort n dòng cần ~n·log2(n) phép so sánh — 10.000 dòng ≈ 130.000 lần so sánh ≈ 260.000
 * lần parse ngày+giờ trước đây). Kết quả GIỐNG HỆT `arr.slice().sort((a,b) => (keyFn(a)||0) -
 * (keyFn(b)||0))` cũ: cùng khoá, cùng phép trừ, và Array.prototype.sort của mọi trình duyệt hiện
 * đại là sort ỔN ĐỊNH (stable) → thứ tự các dòng trùng khoá giữ nguyên như cũ. Trả về mảng MỚI
 * (không sửa mảng đầu vào), đúng như `.slice().sort()` cũ.
 * @template T @param {T[]} arr @param {(r:T)=>number|null} keyFn @returns {T[]}
 */
function sortByNumKey(arr, keyFn) {
  const n = arr.length, keys = new Array(n), idx = new Array(n);
  for (let i = 0; i < n; i++) { keys[i] = keyFn(arr[i]) || 0; idx[i] = i; }
  idx.sort((a, b) => keys[a] - keys[b]);
  const out = new Array(n);
  for (let i = 0; i < n; i++) out[i] = arr[idx[i]];
  return out;
}
const nhapSortKey = (r) => toMinutes(r['Ngày cân 1'], r['Giờ cân 1']);

/** Bảng kê chi tiết nhập gỗ keo. */
export function computeNhapKeo(phieucan, fromKey, toKey) {
  let rows = phieucan.filter((r) => inDateRange(r['Ngày cân 1'], fromKey, toKey));
  rows = sortByNumKey(rows, nhapSortKey);
  const out = rows.map((r, i) => ({
    STT: i + 1, So_CT: r['So_CT'], 'Mã hàng': r['Mã hàng'], 'Khách hàng': r['Khách hàng'],
    'Ngày cân 1': r['Ngày cân 1'], 'Giờ cân 1': r['Giờ cân 1'], 'Ngày cân 2': r['Ngày cân 2'], 'Giờ cân 2': r['Giờ cân 2'],
    'Biển số 1': r['Biển số 1'], 'Biển số 2': r['Biển số 2'], 'Cân lần 1': parseNum(r['Cân lần 1']), 'Cân lần 2': parseNum(r['Cân lần 2']),
    'KL hàng (KG)': parseNum(r['KL hàng (KG)']), 'Đơn giá_TC': parseNum(r['Đơn giá_TC']), 'Thành tiền': parseNum(r['Thành tiền']),
    'ĐL': r['ĐL'], 'NG': r['NG']
  }));
  let totalKL = 0, totalTien = 0;
  out.forEach((r) => { totalKL += r['KL hàng (KG)'] || 0; totalTien += r['Thành tiền'] || 0; });
  return { rows: out, totalKL, totalTien };
}

/** Bảng kê xe nhập keo có thời gian xuống hàng trên 1 giờ. */
export function computeXeCho1h(nhapKeoRows) {
  const out = [];
  nhapKeoRows.forEach((r) => {
    const m1 = toMinutes(r['Ngày cân 1'], r['Giờ cân 1']), m2 = toMinutes(r['Ngày cân 2'], r['Giờ cân 2']);
    if (m1 == null || m2 == null) return;
    const diffH = (m2 - m1) / 60;
    if (diffH > 1) {
      const gio = Math.floor(diffH), phutF = (diffH - gio) * 60, phut = Math.floor(phutF), giay = Math.round((phutF - phut) * 60);
      out.push(Object.assign({}, r, { 'Số giờ chênh lệch': diffH, 'Thời gian chờ': gio + ' giờ ' + phut + ' phút ' + giay + ' giây' }));
    }
  });
  // Ghi chú: nhapKeoRows truyền vào LUÔN đã sort theo đúng khoá này (từ computeNhapKeo), nên
  // `out` (subset lọc từ mảng đã sort) tự nhiên vẫn giữ đúng thứ tự — NHƯNG hàm này được
  // export dùng độc lập, có thể nhận input CHƯA sort, nên vẫn PHẢI tự sort lại ở đây để giữ
  // đúng hợp đồng (contract) của hàm — không được bỏ bước này (xem CHANGELOG.md PERF-*).
  const sorted = sortByNumKey(out, nhapSortKey);
  sorted.forEach((r, i) => { r.TT = i + 1; });
  return sorted;
}

/** Bảng kê chi tiết thanh toán gỗ keo. */
export function computeThanhToan(dntt, phieucanBySoCT, fromKey, toKey) {
  let rows = dntt.filter((r) => r['Ngày thanh toán'] && inDateRange(r['Ngày thanh toán'], fromKey, toKey));
  rows = sortByNumKey(rows, (r) => dateKey(r['Ngày thanh toán']));
  const out = rows.map((r, i) => {
    const pc = phieucanBySoCT[r['Số CT']] || {};
    return {
      STT: i + 1, 'Ngày thanh toán': r['Ngày thanh toán'], 'Số hợp đồng': r['Số hợp đồng'], 'Họ tên Chủ rừng': r['Họ tên Chủ rừng'],
      'Người nhận tiền': r['Người nhận tiền'], 'Số TK nhận tiền': r['Số TK nhận tiền'], 'Số CT': r['Số CT'],
      'Ngày cân 1': pc['Ngày cân 1'], 'Giờ cân 1': pc['Giờ cân 1'], 'Ngày cân 2': pc['Ngày cân 2'], 'Giờ cân 2': pc['Giờ cân 2'],
      'Biển số 1': pc['Biển số 1'], 'Cân lần 1': parseNum(pc['Cân lần 1']), 'Cân lần 2': parseNum(pc['Cân lần 2']),
      'Khối lượng': parseNum(r['Khối lượng']), 'Đơn giá thanh toán': parseNum(r['Đơn giá thanh toán']), 'Thành tiền': parseNum(r['Thành tiền']), 'ĐL': pc['ĐL']
    };
  });
  let totalKL = 0, totalTien = 0;
  out.forEach((r) => { totalKL += r['Khối lượng'] || 0; totalTien += r['Thành tiền'] || 0; });
  return { rows: out, totalKL, totalTien };
}

/** Báo cáo công nợ (phiếu chưa thanh toán hoặc thanh toán sau kỳ báo cáo). */
export function computeCongNo(phieucan, dnttBySoCT, reportKey) {
  let rows = phieucan.filter((r) => parseNum(r['Đơn giá_TC']) !== 0);
  rows = rows.filter((r) => {
    const canKey = dateKey(r['Ngày cân 1']);
    if (canKey == null || canKey > reportKey) return false;
    const dn = dnttBySoCT[r['So_CT']];
    const payKey = dn ? dateKey(dn['Ngày thanh toán']) : null;
    if (payKey == null) return true;
    if (payKey > reportKey) return true;
    return false;
  });
  rows = sortByNumKey(rows, (r) => dateKey(r['Ngày cân 1']));
  const out = rows.map((r, i) => {
    const dn = dnttBySoCT[r['So_CT']];
    return {
      STT: i + 1, So_CT: r['So_CT'], 'Khách hàng': r['Khách hàng'], 'Số hợp đồng': dn ? dn['Số hợp đồng'] : '', 'Mã hàng': r['Mã hàng'],
      'Ngày cân 1': r['Ngày cân 1'], 'Giờ cân 1': r['Giờ cân 1'], 'Ngày cân 2': r['Ngày cân 2'], 'Giờ cân 2': r['Giờ cân 2'],
      'Biển số 1': r['Biển số 1'], 'Cân lần 1': parseNum(r['Cân lần 1']), 'Cân lần 2': parseNum(r['Cân lần 2']),
      'KL hàng (KG)': parseNum(r['KL hàng (KG)']), 'Đơn giá_TC': parseNum(r['Đơn giá_TC']), 'Thành tiền': parseNum(r['Thành tiền']), 'ĐL': r['ĐL'], 'NG': r['NG']
    };
  });
  let totalKL = 0, totalTien = 0;
  out.forEach((r) => { totalKL += r['KL hàng (KG)'] || 0; totalTien += r['Thành tiền'] || 0; });
  return { rows: out, totalKL, totalTien };
}

/**
 * Báo cáo Hỗ trợ tài xế / Trợ giá — dùng chung 1 hàm, khác nhau qua tham số hinhThuc/tienField.
 * [PERF-02] Gom danh mục dmht theo Nguồn gốc (chỉ giữ đúng Hình thức) thành Map trước khi
 * duyệt, thay vì .find() quét toàn bộ danh mục cho MỖI dòng phiếu cân — xem PERFORMANCE_REPORT.md.
 */
export function computeHoTroOrTroGia(phieucan, dmht, fromKey, toKey, hinhThuc, tienField) {
  const rows = phieucan.filter((r) => inDateRange(r['Ngày cân 1'], fromKey, toKey));
  const dmByNG = {};
  dmht.forEach((d) => {
    if (d['Hình thức'] !== hinhThuc) return;
    // [BUGFIX 2026-09-25] Mã Nguồn gốc gõ tay trong Danh mục có thể dính khoảng trắng thừa ("D3 ")
    // → không khớp mã "D3" trong phiếu cân (dữ liệu CSV đã được cắt khoảng trắng) → toàn bộ dòng D3
    // bị loại khỏi báo cáo Hỗ trợ/Trợ giá mà không báo gì. Cắt khoảng trắng 2 đầu trước khi so khớp.
    const k = String(d['Nguồn gốc'] == null ? '' : d['Nguồn gốc']).trim();
    if (!dmByNG[k]) dmByNG[k] = [];
    dmByNG[k].push(d);
  });
  const out = [];
  rows.forEach((r) => {
    const canKey = dateKey(r['Ngày cân 1']);
    const candidates = dmByNG[r['NG']];
    const match = candidates ? candidates.find((d) =>
      (dateKey(d['Ngày bắt đầu']) == null || canKey >= dateKey(d['Ngày bắt đầu'])) &&
      (dateKey(d['Ngày kết thúc']) == null || canKey <= dateKey(d['Ngày kết thúc']))
    ) : undefined;
    if (!match) return;
    const klTan = (parseNum(r['KL hàng (KG)']) || 0) / 1000;
    const hoTro = parseNum(match['Hỗ trợ']) || 0;
    const tien = roundDown3(hoTro * klTan);
    const o = {
      So_CT: r['So_CT'], 'Khách hàng': r['Khách hàng'], 'Mã hàng': r['Mã hàng'], 'Ngày cân 1': r['Ngày cân 1'], 'Giờ cân 1': r['Giờ cân 1'],
      'Ngày cân 2': r['Ngày cân 2'], 'Giờ cân 2': r['Giờ cân 2'], 'Biển số 1': r['Biển số 1'], 'Cân lần 1': parseNum(r['Cân lần 1']), 'Cân lần 2': parseNum(r['Cân lần 2']),
      'Khối lượng_Tấn': klTan, 'Hỗ trợ': hoTro, 'ĐL': r['ĐL'], 'NG': r['NG']
    };
    o[tienField] = tien;
    out.push(o);
  });
  const sorted = sortByNumKey(out, (r) => dateKey(r['Ngày cân 1']));
  sorted.forEach((r, i) => { r.STT = i + 1; });
  let totalKL = 0, totalTien = 0;
  sorted.forEach((r) => { totalKL += r['Khối lượng_Tấn'] || 0; totalTien += r[tienField] || 0; });
  return { rows: sorted, totalKL, totalTien };
}

/** Bảng tổng hợp thanh toán tiền hỗ trợ tài xế (gộp theo Biển số). */
export function computeTongHopHoTro(hoTroRows) {
  const map = {};
  hoTroRows.forEach((r) => {
    const k = r['Biển số 1'] || '(trống)';
    if (!map[k]) map[k] = { bienso: k, tuNgay: null, denNgay: null, soChuyen: 0, kl: 0, sumHoTro: 0, cntHoTro: 0, tien: 0 };
    const g = map[k], ck = dateKey(r['Ngày cân 1']);
    if (ck != null) { if (g.tuNgay == null || ck < g.tuNgay) g.tuNgay = ck; if (g.denNgay == null || ck > g.denNgay) g.denNgay = ck; }
    g.soChuyen++; g.kl += r['Khối lượng_Tấn'] || 0; g.sumHoTro += r['Hỗ trợ'] || 0; g.cntHoTro++; g.tien += r['Tiền hỗ trợ'] || 0;
  });
  const out = Object.keys(map).map((k) => {
    const g = map[k], donGia = g.cntHoTro ? g.sumHoTro / g.cntHoTro : 0, khauTru = g.tien > 2000000 ? Math.round(g.tien * 0.1) : 0;
    return {
      'Biển số 1': g.bienso, 'Từ ngày': g.tuNgay, 'Đến ngày': g.denNgay, 'Số chuyến': g.soChuyen, 'Khối lượng_Tấn': g.kl,
      'Đơn giá hỗ trợ': donGia, 'Tiền hỗ trợ': g.tien, 'Khấu trừ thuế TNCN': khauTru, 'Còn thanh toán': g.tien - khauTru
    };
  }).sort((a, b) => b['Tiền hỗ trợ'] - a['Tiền hỗ trợ']);
  out.forEach((r, i) => { r.STT = i + 1; });
  return out;
}

/**
 * Bảng tổng hợp hoa hồng đại lý.
 * [PERF-03] Gom danh mục đại lý thành Map (giữ đúng ngữ nghĩa "khớp đầu tiên" của .find() gốc
 * khi trùng mã đại lý) — xem PERFORMANCE_REPORT.md.
 */
export function computeHoaHongDL(dntt, phieucanBySoCT, dmdl, fromKey, toKey) {
  const rows = dntt.filter((r) => r['Ngày thanh toán'] && inDateRange(r['Ngày thanh toán'], fromKey, toKey));
  const map = {};
  rows.forEach((r) => {
    const pc = phieucanBySoCT[r['Số CT']] || {}, dl = pc['ĐL'] || '(trống)';
    if (!map[dl]) map[dl] = { dl, kl: 0, tuNgay: null, denNgay: null };
    const g = map[dl];
    g.kl += parseNum(r['Khối lượng']) || 0;
    const ck = dateKey(pc['Ngày cân 1']);
    if (ck != null) { if (g.tuNgay == null || ck < g.tuNgay) g.tuNgay = ck; if (g.denNgay == null || ck > g.denNgay) g.denNgay = ck; }
  });
  const dmdlByKey = {};
  dmdl.forEach((d) => { const k = d['Đại lý']; if (!(k in dmdlByKey)) dmdlByKey[k] = d; });
  const out = Object.keys(map).map((k) => {
    const g = map[k], dm = dmdlByKey[k];
    const ten = dm ? dm['Tên Đại lý'] : k, min = dm ? parseNum(dm['Sản lượng Min']) : null, max = dm ? parseNum(dm['Sản lượng max']) : null;
    const hoaHong = dm ? (parseNum(dm['Hoa hồng']) || 0) : 0;
    let tien = 0;
    if (dm && min != null && max != null && g.kl >= min && g.kl <= max) tien = roundDown3(hoaHong * g.kl);
    return { 'Tên Đại lý': ten, 'Từ ngày': g.tuNgay, 'Đến ngày': g.denNgay, 'Khối lượng thanh toán': g.kl, 'Hoa hồng': hoaHong, 'Tiền hoa hồng': tien };
  }).sort((a, b) => b['Tiền hoa hồng'] - a['Tiền hoa hồng']);
  out.forEach((r, i) => { r.STT = i + 1; });
  return out;
}

/**
 * Bảng kê lâm sản xuất khẩu — Chi tiết.
 * [BỔ SUNG 2026-09-22] Thêm "Tàu"/"Khách hàng xuất" — gán tay ở app (không có trong Google
 * Sheet HOSOKEO, xem services/tau-assignment.js), tra theo "Số BKLS". `tauAssignments` truyền
 * vào ngoài (không tự đọc storageService ở đây) để hàm này vẫn thuần/dễ test như các hàm khác.
 * @param {Object} tauAssignments map { [soBKLS]: {tau, khachHang, ngayGan} } — truyền {} nếu chưa có.
 */
export function computeXuatHang01(hosokeo, hdmbByKey, fromKey, toKey, tauAssignments) {
  const tau = tauAssignments || {};
  let rows = hosokeo.filter((r) => r['Mã hợp đồng'] && inDateRange(r['Ngày nhập'], fromKey, toKey));
  rows = sortByNumKey(rows, (r) => dateKey(r['Ngày nhập']));
  const out = rows.map((r, i) => {
    const k = (r['Mã hợp đồng'] || '') + '||' + (r['Họ và tên chủ rừng'] || '');
    const hd = hdmbByKey[k] || {};
    const ga = tau[r['Số BKLS']] || null;
    return {
      STT: i + 1, 'Số BKLS': r['Số BKLS'], 'Ngày BKLS': r['Ngày nhập'], 'Họ và tên người bán': r['Họ và tên chủ rừng'],
      'Số CCCD': r['Mã khách hàng'], 'Tên nguyên liệu': 'Dăm gỗ keo', 'Địa điểm khai thác': r['ĐỊA CHỈ RỪNG'],
      'Khối lượng (Tấn)': parseNum(r['Khối lượng (Tấn)']), 'Mã hợp đồng': r['Mã hợp đồng'], 'Nhà máy': CONFIG.NHA_MAY,
      'Đơn giá': parseNum(r['Đơn giá']), 'Thanh toán': parseNum(r['Thanh toán']), 'Địa chỉ thường trú': hd['Địa chỉ thường trú'] || '',
      'Tàu': ga ? ga.tau : '', 'Khách hàng xuất': ga ? ga.khachHang : ''
    };
  });
  let totalKL = 0, totalTT = 0;
  out.forEach((r) => { totalKL += r['Khối lượng (Tấn)'] || 0; totalTT += r['Thanh toán'] || 0; });
  return { rows: out, totalKL, totalTT };
}

/**
 * Bảng kê lâm sản xuất khẩu — Tổng hợp (gộp từ rows của computeXuatHang01).
 * [BỔ SUNG 2026-09-22] Thêm "Tàu"/"Khách hàng xuất" vào khoá gộp — theo yêu cầu người dùng
 * "BKLS chi tiết, BKLS tổng hợp muốn nhóm theo Tàu, Khách hàng": nếu 1 người bán có nguyên liệu
 * đi 2 chuyến tàu khác nhau, tổng hợp phải tách thành 2 dòng riêng theo từng tàu (không gộp
 * chung), đúng bản chất mỗi tờ khai/mẫu WO lập riêng cho từng chuyến xuất.
 */
export function computeXuatHang02(rows01) {
  const map = {};
  rows01.forEach((r) => {
    const k = [r['Họ và tên người bán'], r['Địa chỉ thường trú'], r['Số CCCD'], r['Tên nguyên liệu'], CONFIG.MA_HS, r['Địa điểm khai thác'], r['Tàu'] || '', r['Khách hàng xuất'] || ''].join('||');
    if (!map[k]) map[k] = {
      'Họ và tên người bán': r['Họ và tên người bán'], 'Địa chỉ thường trú': r['Địa chỉ thường trú'],
      'Số CCCD': r['Số CCCD'], 'Tên nguyên liệu': r['Tên nguyên liệu'], 'Mã HS': CONFIG.MA_HS,
      'Địa điểm khai thác': r['Địa điểm khai thác'], 'Tàu': r['Tàu'] || '', 'Khách hàng xuất': r['Khách hàng xuất'] || '',
      ngayMaxKey: null, ngayMax: null, klSum: 0, dgSum: 0, dgCnt: 0, ttSum: 0
    };
    const g = map[k];
    const ck = dateKey(r['Ngày BKLS']);
    if (ck != null && (g.ngayMaxKey == null || ck > g.ngayMaxKey)) { g.ngayMaxKey = ck; g.ngayMax = r['Ngày BKLS']; }
    g.klSum += r['Khối lượng (Tấn)'] || 0;
    g.dgSum += r['Đơn giá'] || 0; g.dgCnt++;
    g.ttSum += r['Thanh toán'] || 0;
  });
  const out = Object.keys(map).map((k) => {
    const g = map[k];
    return {
      'Ngày nhập': g.ngayMax, 'Họ và tên người bán': g['Họ và tên người bán'], 'Địa chỉ thường trú': g['Địa chỉ thường trú'],
      'Số CCCD': g['Số CCCD'], 'Tên nguyên liệu': g['Tên nguyên liệu'], 'Mã HS': g['Mã HS'], 'Địa điểm khai thác': g['Địa điểm khai thác'],
      'Khối lượng_Tấn': g.klSum, 'Đơn giá': g.dgCnt ? g.dgSum / g.dgCnt : 0, 'Tổng trị giá': g.ttSum,
      'Tàu': g['Tàu'], 'Khách hàng xuất': g['Khách hàng xuất']
    };
  }).sort((a, b) => (dateKey(a['Ngày nhập']) || 0) - (dateKey(b['Ngày nhập']) || 0));
  out.forEach((r, i) => { r.STT = i + 1; });
  let totalKL = 0, totalTT = 0;
  out.forEach((r) => { totalKL += r['Khối lượng_Tấn'] || 0; totalTT += r['Tổng trị giá'] || 0; });
  return { rows: out, totalKL, totalTT };
}

/**
 * [MỚI 2026-09-22] "Báo cáo tổng hợp nguyên liệu xuất theo tàu" — gộp TOÀN BỘ dòng BKLS chi
 * tiết đã có Tàu (từ mọi kỳ, không chỉ trong khoảng ngày đang lọc — vì 1 tàu có thể nhận hàng
 * dồn từ nhiều kỳ báo cáo khác nhau) theo (Tàu, Khách hàng xuất): tổng khối lượng, tổng thanh
 * toán, số dòng BKLS, ngày gán gần nhất. Dòng chưa gán Tàu (Tàu rỗng) bị loại ra — báo cáo này
 * chỉ để theo dõi những gì ĐÃ xuất theo tàu.
 * @param {Object[]} allRows01 - TOÀN BỘ rows của computeXuatHang01, không lọc theo Tàu.
 * @param {Object} tauAssignments
 */
export function computeTauTongHop(allRows01, tauAssignments) {
  const tau = tauAssignments || {};
  const map = {};
  allRows01.forEach((r) => {
    if (!r['Tàu']) return;
    const k = r['Tàu'] + '||' + (r['Khách hàng xuất'] || '');
    if (!map[k]) map[k] = { 'Tàu': r['Tàu'], 'Khách hàng xuất': r['Khách hàng xuất'] || '', soDong: 0, klSum: 0, ttSum: 0, ngayGanMaxIso: null };
    const g = map[k];
    g.soDong += 1; g.klSum += r['Khối lượng (Tấn)'] || 0; g.ttSum += r['Thanh toán'] || 0;
    const info = tau[r['Số BKLS']];
    if (info && info.ngayGan && (g.ngayGanMaxIso == null || info.ngayGan > g.ngayGanMaxIso)) g.ngayGanMaxIso = info.ngayGan;
  });
  const out = Object.keys(map).map((k) => {
    const g = map[k];
    return {
      'Tàu': g['Tàu'], 'Khách hàng xuất': g['Khách hàng xuất'], 'Số dòng BKLS': g.soDong,
      'Khối lượng_Tấn': g.klSum, 'Tổng thanh toán': g.ttSum,
      'Ngày gán gần nhất': g.ngayGanMaxIso ? g.ngayGanMaxIso.slice(0, 10) : ''
    };
  }).sort((a, b) => String(b['Ngày gán gần nhất']).localeCompare(String(a['Ngày gán gần nhất'])));
  out.forEach((r, i) => { r.STT = i + 1; });
  let totalKL = 0, totalTT = 0, totalDong = 0;
  out.forEach((r) => { totalKL += r['Khối lượng_Tấn'] || 0; totalTT += r['Tổng thanh toán'] || 0; totalDong += r['Số dòng BKLS'] || 0; });
  return { rows: out, totalKL, totalTT, totalDong };
}

/**
 * Bảng tổng hợp nhập-xuất-thanh toán theo ngày, có tách thêm theo Đại lý (ĐL) và Nguồn gốc
 * (NG) cho cả 2 phần Nhập/Thanh toán — [2026-09-22] thêm phần tách này để khớp đúng "bản mẫu"
 * (file Excel Power Query đối chiếu: sheet TH_NHAPXUAT_THANHTOAN). Công thức tách đã kiểm
 * chứng khớp 100% với số liệu thật trong bản mẫu (tổng các cột tách = đúng cột tổng, ví dụ
 * ngày 01/09: NHAP_DL.DT 111.65 + NHAP_DL.QT 104.47 = 216.12 = đúng Khối lượng nhập).
 * Mã ĐL/NG lấy ĐỘNG theo đúng giá trị thật xuất hiện trong dữ liệu đang lọc (không hard-code
 * DT/QT/KL) — nếu sau này Danh mục đại lý có thêm mã mới, cột sẽ tự xuất hiện theo, không cần
 * sửa code. `cols` trả về kèm theo để UI/Export dùng luôn (không cần cột tĩnh riêng).
 */
export function computeTongHopNgay(phieucan, dntt, phieucanBySoCT, fromKey, toKey) {
  const nhapRows = phieucan.filter((r) => inDateRange(r['Ngày cân 1'], fromKey, toKey));
  const ttRows = dntt.filter((r) => r['Ngày thanh toán'] && inDateRange(r['Ngày thanh toán'], fromKey, toKey));

  // [BUGFIX 2026-09-25] Người dùng báo "nguồn gốc D3 không lên báo cáo ngày". Trước đây danh sách
  // mã ĐL/NG (để tạo cột) CHỈ lấy từ phiếu cân NHẬP trong kỳ — nếu 1 mã chỉ có THANH TOÁN trong kỳ
  // (vd D3 cân cuối tháng trước, thanh toán tháng này) thì không có cột TT_NG.D3, khối lượng thanh
  // toán của D3 bị rơi mất khỏi phần tách theo NG (tổng các cột NG < Khối lượng thanh toán). Nay lấy
  // HỢP của mã ở phần nhập VÀ mã của phiếu cân gắn với các dòng thanh toán trong kỳ. Khi mọi mã đều
  // có nhập trong kỳ (trường hợp thường gặp) thì kết quả giống hệt trước.
  const ttPcs = ttRows.map((r) => phieucanBySoCT[r['Số CT']] || {});
  const dlCodes = Array.from(new Set(nhapRows.map((r) => r['ĐL']).concat(ttPcs.map((pc) => pc['ĐL'])).filter((v) => v))).sort();
  const ngCodes = Array.from(new Set(nhapRows.map((r) => r['NG']).concat(ttPcs.map((pc) => pc['NG'])).filter((v) => v))).sort();

  const nhapByDay = {}, ttByDay = {};
  nhapRows.forEach((r) => {
    const d = r['Ngày cân 1'];
    if (!nhapByDay[d]) nhapByDay[d] = { tien: 0, kl: 0, dl: {}, ng: {} };
    const g = nhapByDay[d];
    const klTan = (parseNum(r['KL hàng (KG)']) || 0) / 1000;
    g.tien += parseNum(r['Thành tiền']) || 0; g.kl += klTan;
    const dl = r['ĐL']; if (dl) g.dl[dl] = (g.dl[dl] || 0) + klTan;
    const ng = r['NG']; if (ng) g.ng[ng] = (g.ng[ng] || 0) + klTan;
  });
  ttRows.forEach((r) => {
    const d = r['Ngày thanh toán'];
    if (!ttByDay[d]) ttByDay[d] = { tien: 0, kl: 0, dl: {}, ng: {} };
    const g = ttByDay[d];
    const kl = parseNum(r['Khối lượng']) || 0;
    g.tien += parseNum(r['Thành tiền']) || 0; g.kl += kl;
    // Bên thanh toán không có sẵn cột ĐL/NG (đó là thuộc tính của phiếu cân) — ghép qua Số CT.
    const pc = phieucanBySoCT[r['Số CT']] || {};
    const dl = pc['ĐL']; if (dl) g.dl[dl] = (g.dl[dl] || 0) + kl;
    const ng = pc['NG']; if (ng) g.ng[ng] = (g.ng[ng] || 0) + kl;
  });

  const days = {};
  Object.keys(nhapByDay).forEach((d) => { days[d] = true; });
  Object.keys(ttByDay).forEach((d) => { days[d] = true; });

  const rows = Object.keys(days).sort((a, b) => (dateKey(a) || 0) - (dateKey(b) || 0)).map((d) => {
    const n = nhapByDay[d] || { tien: 0, kl: 0, dl: {}, ng: {} }, t = ttByDay[d] || { tien: 0, kl: 0, dl: {}, ng: {} };
    const o = { 'Ngày': d, 'Giá trị nhập': n.tien, 'Khối lượng nhập': n.kl };
    dlCodes.forEach((c) => { o['NHAP_DL.' + c] = n.dl[c] || 0; });
    ngCodes.forEach((c) => { o['NHAP_NG.' + c] = n.ng[c] || 0; });
    o['Giá trị thanh toán'] = t.tien; o['Khối lượng thanh toán'] = t.kl;
    dlCodes.forEach((c) => { o['TT_DL.' + c] = t.dl[c] || 0; });
    ngCodes.forEach((c) => { o['TT_NG.' + c] = t.ng[c] || 0; });
    return o;
  });

  const cols = [['Ngày', 'Ngày', 'date'], ['Giá trị nhập', 'Giá trị nhập', 'money'], ['Khối lượng nhập', 'Khối lượng nhập (tấn)', 'kl']];
  dlCodes.forEach((c) => cols.push(['NHAP_DL.' + c, 'Nhập - ĐL ' + c + ' (tấn)', 'kl']));
  ngCodes.forEach((c) => cols.push(['NHAP_NG.' + c, 'Nhập - NG ' + c + ' (tấn)', 'kl']));
  cols.push(['Giá trị thanh toán', 'Giá trị thanh toán', 'money'], ['Khối lượng thanh toán', 'Khối lượng thanh toán (tấn)', 'kl']);
  dlCodes.forEach((c) => cols.push(['TT_DL.' + c, 'Thanh toán - ĐL ' + c + ' (tấn)', 'kl']));
  ngCodes.forEach((c) => cols.push(['TT_NG.' + c, 'Thanh toán - NG ' + c + ' (tấn)', 'kl']));

  const totalKeys = ['Giá trị nhập', 'Khối lượng nhập', 'Giá trị thanh toán', 'Khối lượng thanh toán']
    .concat(dlCodes.map((c) => 'NHAP_DL.' + c)).concat(ngCodes.map((c) => 'NHAP_NG.' + c))
    .concat(dlCodes.map((c) => 'TT_DL.' + c)).concat(ngCodes.map((c) => 'TT_NG.' + c));
  const totals = {};
  totalKeys.forEach((k) => { totals[k] = 0; });
  rows.forEach((r) => { totalKeys.forEach((k) => { totals[k] += r[k] || 0; }); });

  return { rows, cols, totals };
}

/* ------------------------------------------------------------------------
   Báo cáo ngân hàng — Sổ chi tiết tiền vay / Bảng kê 02-TNDN / Phiếu nhập kho.
   Toàn bộ dùng chung CONFIG.TEN_CONG_TY (Đại Hiệp) — KHÔNG có công ty riêng nào khác.
   ------------------------------------------------------------------------ */

/** Chuyển ngày Excel serial (đối tượng Date do SheetJS trả về khi cellDates:true) thành "YYYY-MM-DD". */
export function excelSerialToStr(v) {
  if (v instanceof Date) return v.getUTCFullYear() + '-' + pad2(v.getUTCMonth() + 1) + '-' + pad2(v.getUTCDate());
  return v;
}

/**
 * Sổ chi tiết tiền vay — KHÔNG tính từ PHIEUCAN, đọc "Tổng tiền vay" trực tiếp từ file Excel
 * người dùng tải lên (theo xác nhận nghiệp vụ của người dùng — xem ARCHITECTURE.md §Nghiệp vụ).
 * Chênh lệch/Lũy kế LUÔN tự tính lại ở đây (không lấy cột có sẵn trong file).
 */
export function computeSoTienVay(rawRows, fromKey, toKey) {
  let filtered = (rawRows || []).filter((r) => inDateRange(r['Ngày chung'], fromKey, toKey));
  filtered = sortByNumKey(filtered, (r) => dateKey(r['Ngày chung']));
  let luyKe = 0, totalVay = 0, totalChi = 0;
  const out = filtered.map((r, i) => {
    const vay = parseNum(r['Tổng tiền vay']) || 0, chi = parseNum(r['Tổng tiền chi']) || 0;
    luyKe += vay - chi; totalVay += vay; totalChi += chi;
    return {
      STT: i + 1, 'Ngày chung': r['Ngày chung'],
      'Ngày hạch toán': r['Ngày hạch toán'] || r['Ngày chung'],
      'Ngày chứng từ': r['Ngày chứng từ'] || r['Ngày chung'],
      'Tổng tiền vay': vay, 'Ngày thanh toán': r['Ngày thanh toán'] || null,
      'Số tấn': parseNum(r['Số tấn']) || 0, 'Tổng tiền chi': chi,
      'Họ tên Chủ rừng': r['Họ tên Chủ rừng'] || '', 'Chênh lệch': vay - chi, 'Lũy kế tiền vay chi': luyKe
    };
  });
  return { rows: out, totalVay, totalChi, luyKeCuoi: luyKe };
}

/**
 * Bảng kê 02/TNDN — [BUGFIX 2026-09-22] VIẾT LẠI HOÀN TOÀN theo đúng công thức Power Query gốc
 * của chính query "BK02_TNDN", trích xuất trực tiếp từ file mẫu ChungTuNganHang_DH.xlsx do
 * người dùng cung cấp (customXml/item1.xml → Formulas/Section1.m):
 *
 *   shared BK02_TNDN = let
 *       Source = DNTT_CT,                                           // <-- nguồn là DNTT_CT, KHÔNG phải PHIEUCAN
 *       ...Merged Queries... PHIEUCAN theo "Số CT" = "So_CT" (chỉ lấy "Ngày cân 1"),
 *       ...Merged Queries1... HD_NCC theo DUY NHẤT "Số hợp đồng" (KHÔNG ghép thêm Họ tên),
 *       ...Expanded HD_NCC {"Địa chỉ thường trú","Số CCCD Chủ rừng","Số ĐT DĐ Chủ rừng"}...
 *   → cột cuối: Ngày tháng năm mua hàng=Ngày cân 1, Tên người bán=Họ tên Chủ rừng (từ DNTT_CT),
 *     Địa chỉ/Số CCCD/Số Điện thoại = từ HD_NCC, Số lượng=Khối lượng (DNTT_CT), Đơn giá=Đơn giá
 *     thanh toán (DNTT_CT), Tổng giá thanh toán=Thành tiền (DNTT_CT), Ghi chú=Số CT.
 *
 * Bản cũ có 2 lỗi so với công thức gốc:
 *  1) Duyệt từ PHIEUCAN (mọi phiếu cân trong kỳ) rồi mới dò ngược qua DNTT_CT — nên phiếu cân
 *     CHƯA có đề nghị thanh toán vẫn bị đưa vào báo cáo (đúng công thức gốc thì các dòng này
 *     không tồn tại trong BK02_TNDN, vì nguồn xuất phát là DNTT_CT).
 *  2) Ghép sang HD_NCC bằng khóa ghép "Số hợp đồng||Họ tên Chủ rừng" — khóa gốc CHỈ dùng "Số
 *     hợp đồng" một mình. Chỉ cần Họ tên ghi khác 1 chút (dấu, khoảng trắng, viết hoa...) giữa
 *     DNTT_CT và HD_NCC là khóa ghép cũ lệch → Số CCCD/Địa chỉ/SĐT bị trống, dù Số hợp đồng vẫn
 *     khớp đúng và công thức gốc vẫn tra ra được.
 *  Đồng thời Số lượng/Đơn giá/Tổng giá thanh toán trước đây lấy từ PHIEUCAN (KL hàng (KG)/1000,
 *  Đơn giá_TC, Thành tiền của phiếu cân) — nay đổi lại lấy từ DNTT_CT (Khối lượng, Đơn giá
 *  thanh toán, Thành tiền của đề nghị thanh toán) đúng như công thức gốc, vì đây là số đã chốt
 *  thanh toán thực tế (có thể khác số trên phiếu cân do khấu trừ...).
 *
 * @param {Array} dntt - danh sách Đề nghị thanh toán chi tiết (đã lọc theo bộ lọc ĐL/NG/KH/BS)
 * @param {Object} phieucanBySoCT - map So_CT -> phiếu cân, để lấy "Ngày cân 1"
 * @param {Object} hdnccBySoHopDong - map Số hợp đồng -> dòng HD_NCC (STATE.hdnccBySoHopDong)
 */
export function computeBankTNDN(dntt, phieucanBySoCT, hdnccBySoHopDong, fromKey, toKey) {
  let filtered = dntt.filter((r) => {
    const pc = phieucanBySoCT[r['Số CT']];
    const ngayCan1 = pc ? pc['Ngày cân 1'] : null;
    r.__ngayCan1 = ngayCan1; // dùng lại bên dưới, tránh tra map 2 lần
    return inDateRange(ngayCan1, fromKey, toKey);
  });
  filtered = sortByNumKey(filtered, (r) => dateKey(r.__ngayCan1));
  let maxKey = null, maxDate = null, totalSL = 0, totalTT = 0;
  const out = filtered.map((r, i) => {
    const ck = dateKey(r.__ngayCan1);
    if (ck != null && (maxKey == null || ck > maxKey)) { maxKey = ck; maxDate = r.__ngayCan1; }
    const hd = hdnccBySoHopDong[r['Số hợp đồng']] || {};
    const sl = parseNum(r['Khối lượng']) || 0, dg = parseNum(r['Đơn giá thanh toán']) || 0, tt = parseNum(r['Thành tiền']) || 0;
    totalSL += sl; totalTT += tt;
    return {
      STT: i + 1, 'Ngày tháng năm mua hàng': r.__ngayCan1, 'Tên người bán': r['Họ tên Chủ rừng'] || '',
      'Địa chỉ': hd['Địa chỉ thường trú'] || '', 'Số CCCD': hd['Số CCCD Chủ rừng'] || '',
      'Số Điện thoại': hd['Số ĐT DĐ Chủ rừng'] || '', 'Tên hàng hóa/dịch vụ': 'Gỗ tròn keo',
      'Số lượng/trọng lượng': sl, 'Đơn giá': dg, 'Tổng giá thanh toán': tt, 'Ghi chú': r['Số CT']
    };
  });
  return { rows: out, totalSL, totalTT, ngayMax: maxDate };
}

/** Phiếu nhập kho — tổng hợp PHIEUCAN theo ngày, Số CT tự sinh dạng YYYYMM_D. */
export function computePhieuNhapKho(phieucan, fromKey, toKey) {
  const byDay = {};
  phieucan.forEach((r) => {
    if (!inDateRange(r['Ngày cân 1'], fromKey, toKey)) return;
    const d = r['Ngày cân 1'];
    if (!byDay[d]) byDay[d] = { kl: 0, tt: 0 };
    byDay[d].kl += (parseNum(r['KL hàng (KG)']) || 0) / 1000;
    byDay[d].tt += parseNum(r['Thành tiền']) || 0;
  });
  const days = Object.keys(byDay).sort((a, b) => (dateKey(a) || 0) - (dateKey(b) || 0));
  let totalKL = 0, totalTT = 0;
  const out = days.map((d, i) => {
    const g = byDay[d], kl = g.kl, tt = g.tt, dg = kl ? tt / kl : 0;
    totalKL += kl; totalTT += tt;
    const k = dateKey(d), y = Math.floor(k / 10000), m = Math.floor((k % 10000) / 100), day = k % 100;
    const soCT = y + (m < 10 ? '0' : '') + m + '_' + day;
    return { STT: i + 1, 'Ngày nhập kho': d, 'Khối lượng': kl, 'Đơn giá thanh toán': dg, 'Thành tiền': tt, 'Số tiền bằng chữ': numToWordsVN(tt), 'Số CT': soCT };
  });
  return { rows: out, totalKL, totalTT };
}

/** @param {Object[]} rows @param {string[]} cols @returns {Object} tổng theo từng cột số */
export function sumCols(rows, cols) {
  const o = {};
  cols.forEach((c) => { o[c] = rows.reduce((s, r) => s + (r[c] || 0), 0); });
  return o;
}
