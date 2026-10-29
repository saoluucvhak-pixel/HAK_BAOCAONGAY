/**
 * [CONFIG] Cấu hình toàn cục của ứng dụng — link Google Sheet (đã Publish to web dạng CSV),
 * mã số/thông tin công ty dùng để in ấn. Đây là NƠI DUY NHẤT khai báo các giá trị này —
 * mọi module khác phải import từ đây, không hardcode lại ở nơi khác (BƯỚC 13).
 *
 * Toàn bộ ứng dụng chỉ phục vụ DUY NHẤT 1 công ty: Công ty TNHH SXTMDV Đại Hiệp
 * (không có công ty nào khác liên quan, kể cả 3 báo cáo ngân hàng — xem services/report-service.js).
 * @module config
 */
export const CONFIG = Object.freeze({
  PHIEUCAN: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTj7PHtJtv1iBaF9tCKJ9zgnTyc4j6Hbt9CEYX36sVIDXwJDQUvMGd-O_bc8E-N6iEh5JqH9tytjQLj/pub?output=csv',
  DNTT_CT: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSqRW3Yk2MBgXp1qi29tQZQyn1R-opTUjE5PqBFIH7knAOcr1YvthP_AuXa_10knbaprgtM4i_zPk2i/pub?gid=1612289204&single=true&output=csv',
  HD_NCC: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRmYRMAG3XDhHz74P7L1-NrKyPD8Zozp5lPU9rR-_dirOq5UHfSMNdZ4pq4PF5DpI6nosDBlAwW_a10/pub?gid=1578334272&single=true&output=csv',
  HOSOKEO: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vT0mcMT2TsD7lOLSNrTqZPVjJJ395kI54SxSri5-n_VxrfAcC74IKkgCnesT30d1bhx59gJC4esmF7s/pub?gid=0&single=true&output=csv',
  MA_HS: '4401220090',
  NHA_MAY: 'CNHAK',
  TEN_CONG_TY: 'CÔNG TY TNHH SXTMDV ĐẠI HIỆP',

  // Thông tin công ty dùng làm GIÁ TRỊ MẶC ĐỊNH ban đầu cho modal "Thông tin xuất báo cáo ngân
  // hàng" (Mẫu 02/TNDN, Phiếu nhập kho) và modal "Khai báo mẫu WO" — 2 nơi này VẪN cho sửa/lưu
  // lại mỗi lần xuất như trước (StorageService nhớ lần nhập gần nhất), giá trị dưới đây CHỈ dùng
  // để điền sẵn lần mở modal ĐẦU TIÊN (chưa từng lưu gì) — xem loadBankInfo()/loadWOInfo() trong
  // legacy-app.js. Để trống ('') nghĩa là vẫn yêu cầu nhập tay như hành vi gốc (không đổi gì so
  // với trước khi có tính năng này). Công cụ `config.html` điền các giá trị này.
  DEFAULT_BANK_INFO: Object.freeze({ maSoThue: '', diaChi: '', soDienThoai: '', diaChiThuMua: '' }),
  DEFAULT_WO_INFO: Object.freeze({ maSoThue: '', diaChiThuMua: '' }),

  // [2026-10-29] Sổ chi tiết tiền vay — dòng sổ phụ ngân hàng (tab "Cập nhật khoản vay") được tính là
  // TIỀN VAY GIẢI NGÂN khi cột "Diễn giải" đúng 1 trong các câu dưới. Lấy NGUYÊN VĂN từ bước
  // "Filtered Rows" của query TH_VAY trong file ChungTuNganHang.xlsx (Power Query của người dùng).
  DIEN_GIAI_TIEN_VAY: Object.freeze([
    'Chuyển tiền nội bộ gửi VNĐ sang tk keo VNĐ ( do giải ngân đổ nhầm tài khoản)',
    'Chuyển tiền nội bộ gửi VNĐ sang vay keo VNĐ HAK',
    'Chuyển tiền nội bộ vay USD sang vay keo VNĐ HAK'
  ]),

  // Khoá localStorage — tập trung 1 chỗ để StorageService dùng (BƯỚC 9), tránh chuỗi
  // "baocaongay_xxx" rải rác nhiều nơi trong code (magic string).
  STORAGE_KEYS: {
    DM_DL: 'baocaongay_dmdl',
    DM_HT: 'baocaongay_dmht',
    BANK_INFO: 'baocaongay_bank_info',
    WO_INFO: 'baocaongay_wo_info',
    TAU_ASSIGN: 'baocaongay_tau_assign',
    APP_STATE_BACKUP: 'baocaongay_app_state_backup'
  },
  APP_VERSION: '2.0.0'
});
