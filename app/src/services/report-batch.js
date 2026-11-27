import { computeNhapKeo, computeXeCho1h, computeThanhToan, computeCongNo, computeHoTroOrTroGia, computeTongHopHoTro, computeHoaHongDL, computeTongHopNgay, computeXuatHang01, computeXuatHang02, computeTauTongHop, computeSoTienVay, computeTongHopThanhToan, computeBankTNDN, computePhieuNhapKho } from './report-service.js';

/** Tính toàn bộ báo cáo từ cùng một ảnh chụp dữ liệu và bộ lọc. */
export function computeReports({
  ctx, fromKey, toKey, reportKey, dmht, dmdl, hosokeo, hdmbByKey, tauAssignments,
  vayRecords, dntt, soDuDauSo, tienVayLuyKe, hdnccBySoHopDong, plantCode, hsCode
}) {
  const nhap = computeNhapKeo(ctx.phieucan, fromKey, toKey);
  const xecho = computeXeCho1h(nhap.rows);
  const tt = computeThanhToan(ctx.dntt, ctx.phieucanBySoCT, fromKey, toKey);
  const congno = computeCongNo(ctx.phieucan, ctx.dnttBySoCT, reportKey);
  const hotro = computeHoTroOrTroGia(ctx.phieucan, dmht, fromKey, toKey, 'Cuối tháng', 'Tiền hỗ trợ');
  const trogia = computeHoTroOrTroGia(ctx.phieucan, dmht, fromKey, toKey, 'Khi thanh toán', 'Tiền trợ giá');
  const tonghoptro = computeTongHopHoTro(hotro.rows);
  const hoahong = computeHoaHongDL(ctx.dntt, ctx.phieucanBySoCT, dmdl, fromKey, toKey);
  const tonghop = computeTongHopNgay(ctx.phieucan, ctx.dntt, ctx.phieucanBySoCT, fromKey, toKey); // {rows, cols, totals} — cols/totals tự sinh động theo ĐL/NG thật có trong dữ liệu, xem report-service.js
  const bklsct = computeXuatHang01(hosokeo, hdmbByKey, fromKey, toKey, tauAssignments, plantCode);
  const bklsth = computeXuatHang02(bklsct.rows, hsCode);
  // [MỚI] "Tổng hợp nguyên liệu xuất theo tàu" — tính trên TOÀN BỘ HOSOKEO (fromKey=toKey=null,
  // không giới hạn theo khoảng ngày đang lọc), vì 1 tàu có thể nhận hàng dồn từ nhiều kỳ báo cáo
  // khác nhau, không chỉ kỳ đang xem — xem JSDoc computeTauTongHop() trong report-service.js.
  const bklsAllRows = computeXuatHang01(hosokeo, hdmbByKey, null, null, tauAssignments, plantCode).rows;
  const tautonghop = computeTauTongHop(bklsAllRows, tauAssignments);
  const tienvay = computeSoTienVay(vayRecords, dntt, fromKey, toKey, soDuDauSo, tienVayLuyKe); // vay: khoản vay TH_VAY (tab 1); chi: TOÀN BỘ DNTT_CT như Power Query
  const thtt = computeTongHopThanhToan(dntt, fromKey, toKey); // THTT_NH: toàn bộ DNTT_CT như Power Query
  const tndn = computeBankTNDN(ctx.dntt, ctx.phieucanBySoCT, hdnccBySoHopDong, fromKey, toKey);
  const pnk = computePhieuNhapKho(ctx.phieucan, fromKey, toKey);

  return { nhap, xecho, tt, congno, hotro, trogia, tonghoptro, hoahong, tonghop, bklsct, bklsth, tautonghop, tienvay, thtt, tndn, pnk };
}
