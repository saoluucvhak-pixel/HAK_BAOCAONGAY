/**
 * Thông tin chung in trên mọi báo cáo xuất ra: tên công ty, tiêu đề báo cáo, nhãn ngày.
 *
 * [Phase 4.2 — 2026-10-06] Tách NGUYÊN VĂN từ legacy-app.js (không đổi logic) để mỗi file < 800
 * dòng, dễ đọc/bảo trì. Kiểm chứng: `npm run test:export-golden` (36 file xuất khớp từng ô/chữ)
 * + toàn bộ bộ test. Import vòng với legacy-app.js (RESULTS/runReport) an toàn — chỉ dùng bên
 * trong hàm xử lý sự kiện, không dùng lúc nạp module (xem ARCHITECTURE.md).
 * @module services/export/report-meta
 */
import { CONFIG } from '../../config/config.js';
import { REPORT_TITLES } from '../../constants/columns.js';
import { $ } from '../../utils/dom-utils.js';

export function companyNameFor(key){ return CONFIG.TEN_CONG_TY; }
/* Tiêu đề in đúng theo tên báo cáo trong file Excel mẫu (BaoCaoNgay_DH_*.xlsx) */
export function reportTitle(key){ return REPORT_TITLES[key] || ((document.querySelector('[data-rpanel="'+key+'"] h2')||{}).textContent) || key; }
export function ddmmyyyy(iso){ if (!iso) return ''; var p = iso.split('-'); return p.length===3 ? (p[2]+'/'+p[1]+'/'+p[0]) : iso; }
export function reportDateLabel(){
  var f = $('#fFrom') ? $('#fFrom').value : '', t = $('#fTo') ? $('#fTo').value : '';
  if (f && t && f === t) return 'Ngày ' + ddmmyyyy(f);
  if (f && t) return 'Từ ngày ' + ddmmyyyy(f) + ' đến ngày ' + ddmmyyyy(t);
  return ddmmyyyy(t || f);
}
