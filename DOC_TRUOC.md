# HAK — Quản lý xuất hàng · Mã nguồn v2.7.7 (11/10/2026)

App chạy **offline trong trình duyệt** (Chrome / Edge), không cần máy chủ. Mở `app/index.html` là chạy.
Dữ liệu (tài khoản, cài đặt, Lưu trữ, đợt Excel…) nằm trong trình duyệt của từng máy, KHÔNG nằm trong thư mục mã nguồn.

## Cấu trúc
- `app/` — đúng 50 file đang cài trên máy (thư mục cài: `%LOCALAPPDATA%\HAK\QuanLyXuatHang`).
  - `index.html` — giao diện, nạp các file JS theo thứ tự.
  - `css/` — `style.css` (giao diện), `fonts.css` (font Be Vietnam Pro nhúng).
  - `js/` — mỗi file 1 phần việc:
    - `main.js` khởi động, điều hướng, Nhập liệu (đợt Excel, danh sách xe theo đợt)
    - `pages.js` 7 trang biên bản (tab, form, tạo biên bản / BKLS)
    - `generator.js` tính toán, `excel.js` đọc Excel cân, `vehicles.js` danh sách xe
    - `word.js` sinh Word từ mẫu, `exporter.js` PDF / Excel, `templates-data.js` mẫu Word nhúng
    - `bkls.js` + `bkls-assets.js` Bảng kê lâm sản (mẫu BKLS, font PDF)
    - `chungtu.js` chứng từ (PXKKVCNB, BKLS) + nhật ký, `records.js` lưu đợt Excel
    - `archive.js` Lưu trữ hồ sơ, `backup.js` sao lưu / khôi phục / tự sao lưu / gói cấu hình / sức khỏe dữ liệu
    - `auth.js` đăng nhập, phân quyền, mật khẩu chủ, `config.js` công ty / kho / bộ nhớ
    - `catalog.js` danh mục HĐ & khách hàng, `report.js` báo cáo tổng hợp, `dashboard.js` Tổng quan
    - `gsync.js` đồng bộ Google Sheet, `search.js` tìm kiếm, `settings.js` cài đặt, `help.js` hướng dẫn
    - `ui.js`, `icons.js`, `db.js` (IndexedDB), `sample-xlsx.js` (file Excel mẫu nhúng)
  - `libs/` — thư viện bên thứ ba (Bootstrap, SheetJS, ExcelJS, docxtemplater, PizZip, JSZip, jsPDF, FileSaver, docx-preview).
  - `templates/` — mẫu Word gốc (.docx) của các biên bản.
  - `HUONG_DAN.md` — hướng dẫn sử dụng.
- `tools/` — script Python dựng / nhúng mẫu Word và file Excel mẫu vào JS (chỉ cần khi sửa mẫu).
- `installer/` — `setup.nsi` (NSIS) + biểu tượng. Dựng bộ cài: chép `app/` vào cạnh `setup.nsi`, thêm `installer/icon/app.ico` vào `app/`, chạy `makensis setup.nsi`.
- `NHAT_KY_PHIEN_BAN.md` — nhật ký các phiên bản và quyết định.

## Lưu ý bảo mật
Gói này KHÔNG có: dữ liệu nghiệp vụ, tài khoản / mật khẩu, gói cấu hình, file khóa khôi phục (.key), mã khôi phục, mã bí mật Google Sheet.
Không đưa công cụ mở khóa 1 lần (MoKhoa_1Lan.html) vào bộ cài.
