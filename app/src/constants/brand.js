/**
 * [CONSTANTS] Bảng màu thương hiệu dùng chung cho Excel + PDF, để 2 bản xuất đồng bộ phong cách.
 *
 * [CHUẨN HAK — 2026-10-29] Theo chủ đề "luxe" của HAK-Enterprise-Design-System (tokens/luxe.css):
 * tiêu đề cột navy --brand #1d3a63 chữ trắng; dòng xen kẽ nền ngà; dòng tổng --th #f1ece0;
 * đường kẻ --ctl #d5cdbb. Trước đây dùng xanh dương #1f4e78.
 * @module constants/brand
 */
export const BRAND = {
  headerFillARGB: 'FF1D3A63',
  headerTextARGB: 'FFFFFFFF',
  zebraFillARGB: 'FFFAF7F0',
  totalFillARGB: 'FFF1ECE0',
  lineARGB: 'FFD5CDBB',
  companyRGB: [29, 58, 99],
  headerRGB: [29, 58, 99],
  zebraRGB: [250, 247, 240],
  totalRGB: [241, 236, 224],
  lineRGB: [213, 205, 187]
};

export const THIN_BORDER = {
  top: { style: 'thin', color: { argb: BRAND.lineARGB } },
  left: { style: 'thin', color: { argb: BRAND.lineARGB } },
  bottom: { style: 'thin', color: { argb: BRAND.lineARGB } },
  right: { style: 'thin', color: { argb: BRAND.lineARGB } }
};

export const OUTER_BORDER_STYLE = 'medium';
