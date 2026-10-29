# MIGRATION.md — Phiên bản dữ liệu lưu trên máy người dùng

App lưu 2 loại dữ liệu trên máy (trong trình duyệt/app desktop). Khi đổi cấu trúc, PHẢI thêm bước
chuyển đổi (migration) — không được làm mất dữ liệu người dùng đã nhập.

## 1. localStorage — dữ liệu người dùng TỰ NHẬP (`services/storage-service.js`)

Danh mục Đại lý/Hỗ trợ, thông tin biểu mẫu ngân hàng/WO, gán Tàu, bản sao lưu trạng thái.
Khoá: `CONFIG.STORAGE_KEYS`. Mỗi giá trị bọc `{__v, data}`; giá trị cũ không có bọc vẫn đọc được.

| Phiên bản (`__v`) | Ngày | Thay đổi |
|---|---|---|
| (không bọc) | trước Phase 1 | Giá trị lưu thẳng |
| 1 | Phase 1 | Bọc `{__v:1, data}` — đọc tương thích ngược |

Có sao lưu/khôi phục ra file JSON (tab Cấu hình → "Sao lưu / Khôi phục dữ liệu").

## 2. IndexedDB `baocaongay-offline` — bản sao dữ liệu Google Sheet (`services/offline-cache.js`)

Chỉ là bản sao để dùng khi mất mạng — mất đi cũng KHÔNG mất gì (tải lại từ Google Sheet), nên
không đưa vào file sao lưu JSON.

| DB_VERSION | Ngày | Thay đổi |
|---|---|---|
| 1 | 26/09/2026 (Phase 4.1) | Tạo kho `sheets` (keyPath `url`); bản ghi `{url, name, text, savedAt, schema:1}` |

**Thêm phiên bản mới:** tăng `DB_VERSION`, thêm 1 mục `MIGRATIONS[<phiên bản mới>]` (không sửa mục
cũ). Đổi cấu trúc 1 bản ghi thì tăng `RECORD_SCHEMA` — bản ghi khác phiên bản tự bị bỏ qua (coi như
chưa có bản lưu, lần online kế tiếp ghi lại bản mới).

## 3. IndexedDB `baocaongay-khoanvay` — "Cập nhật khoản vay" (`services/loan-store.js`) — DỮ LIỆU GỐC

Khác kho offline: đây là dữ liệu người dùng tự nhập ⇒ có trong file sao lưu JSON (trường `khoanVay`
`{schema:1, rows:[…]}`); lỗi ghi phải báo cho người dùng, không được nuốt.

| DB_VERSION | Ngày | Thay đổi |
|---|---|---|
| 4 | 29/10/2026 (Phase 4.9) | Tạo kho `meta` (keyPath `key`); bản ghi `{key:"soDuDauSo", value:{ngay ISO, soTien}, updatedAt}` = số dư đầu kỳ nhập tay của Sổ chi tiết tiền vay. Không đổi kho khác. File sao lưu `khoanVay.soDuDauSo` (null = chưa nhập); file không có trường này ⇒ khôi phục GIỮ NGUYÊN số dư đang có |
| 3 | 29/10/2026 (Phase 4.8) | Tạo kho `thvay` (keyPath `id`) — khoản vay 3 cột như bảng TH_VAY `{id, schema:3, rev, seq, nguon, createdAt, updatedAt, ngayHachToan, ngayChungTu, tongTienVay}`. Bước nâng cấp CHÉP các dòng tiền vay (Diễn giải ∈ CONFIG.DIEN_GIAI_TIEN_VAY) của kho `vay` sang (`tongTienVay` = `thu`, giữ id/seq/ngày tạo, `nguon` = "Sổ phụ: …"); kho `vay` và `loans` GIỮ NGUYÊN. File sao lưu `khoanVay` = `{schema:3, rows, soPhuCu?:{schema:2, rows}}`; khôi phục file schema 2 ⇒ cất nguyên vào `vay` + chuyển dòng tiền vay sang `thvay` |
| 2 | 29/10/2026 chiều (Phase 4.5) | Tạo kho `vay` (keyPath `id`) — dòng SỔ PHỤ NGÂN HÀNG `{id, schema:2, rev, seq, nguon, createdAt, updatedAt, taiKhoan, ngayHachToan, ngayChungTu, soChungTu, dienGiai, tkDoiUng, thu, chi, ton, tenDoiTuong, maMuc, tenMuc}`. Kho `loans` (v1) GIỮ NGUYÊN, không đọc nữa. File sao lưu `khoanVay.schema` = 2; file sao lưu schema 1 khôi phục vào kho cũ (không mất) |
| 1 | 29/10/2026 (Phase 4.4) | Tạo kho `loans` (keyPath `id`); bản ghi `{id, schema:1, rev, seq, nguon, createdAt, updatedAt, ngayChung, ngayHachToan, ngayChungTu, tongTienVay, ngayThanhToan, soTan, tongTienChi, chuRung}` — ngày ISO "YYYY-MM-DD" (hoặc chữ gốc nếu file ghi chữ ở cột ngày phụ), tiền/tấn là số hoặc null |

**Chuyển từ bản cũ:** bản trước 29/10/2026 không lưu Sổ chi tiết tiền vay (mỗi lần mở app phải tải lại
file) ⇒ không có gì để chuyển; người dùng nhập file 1 lần ở tab mới là xong. File sao lưu cũ (không có
`khoanVay`) khôi phục được bình thường và KHÔNG xoá khoản vay đang có.
