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
