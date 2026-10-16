# Hệ thống báo cáo ngày — Đại Hiệp (bản module hoá + tiện ích bổ sung)

Đây là bản tách file/module của `BaoCaoNgay.html` (xem `ARCHITECTURE.md` để hiểu lý do và cấu
trúc). File **giao cho người dùng cuối vẫn là 1 file HTML duy nhất**: `dist/index.html`.

**Dùng cho đơn vị khác trong HAK Group (tên công ty/link Google Sheet khác)?** Không cần sửa mã
nguồn — mở `config.html` đi kèm, điền tên công ty + link Google Sheet riêng, bấm 1 nút là ra
ngay 1 file báo cáo mới đã cấu hình sẵn. Xem mục "Công cụ tạo file cấu hình riêng" bên dưới.

**So với bản gốc, có thêm 5 tiện ích** (không đổi số liệu/nghiệp vụ nào):
- **Hoàn tác/Làm lại** (Ctrl+Z/Ctrl+Y, hoặc 2 nút ở tab "Danh mục & cấu hình") khi sửa danh
  mục Đại lý/Hỗ trợ.
- **Tìm không dấu** trong ô tìm kiếm mọi bảng báo cáo (gõ "nguyen van a" vẫn ra "Nguyễn Văn A").
- **Cuộn mượt** cho bảng lớn (> 300 dòng) thay vì bấm "Trước/Sau" nhiều lần.
- **Đọc file Excel "Sổ chi tiết tiền vay" không làm treo giao diện** (chạy nền qua Web Worker).
- **Sao lưu / Khôi phục dữ liệu** (2 nút ở tab "Danh mục & cấu hình") — xuất toàn bộ dữ liệu tự
  nhập (danh mục Đại lý/Hỗ trợ, đối chiếu Excel, thông tin ngân hàng/WO) ra 1 file JSON để lưu
  trữ hoặc chuyển sang máy khác, khôi phục lại khi cần (khôi phục nhầm vẫn "Hoàn tác" được).

## Dùng ngay (không cần build lại)

Mở thẳng `dist/index.html` bằng cách double-click, hoặc kéo vào trình duyệt — giống hệt cách
dùng bản gốc `BaoCaoNgay.html`. Không cần cài Node.js, không cần server.

**Nếu double-click bị lỗi "Failed to fetch" / không tải được dữ liệu Google Sheet:** một số
trình duyệt/máy chặn app gọi dữ liệu Google Sheet khi mở kiểu double-click trực tiếp (`file://`)
— đây là giới hạn bảo mật của trình duyệt/máy đó, không phải lỗi của app (code gọi dữ liệu không
đổi gì so với bản gốc). Nếu máy đã có sẵn Node.js, dùng cách sau thay vì double-click thẳng vào
`dist/index.html`:

- **Windows**: double-click file `start.bat` ở thư mục gốc.
- **Mac/Linux**: double-click (hoặc chạy `./start.sh` trong terminal) file `start.sh`.

File này tự mở trình duyệt tới `http://localhost:8791` — giao diện y hệt, không có gì khác,
chỉ khác cách mở. Cứ để cửa sổ đen (terminal) đó mở trong lúc dùng báo cáo.

## Dùng khi mất mạng (offline)

Mỗi lần tải dữ liệu Google Sheet thành công, app tự lưu 1 bản vào bộ nhớ trình duyệt (IndexedDB).
Lần sau mở app mà không có mạng (hoặc Google Sheet không phản hồi), app tự dùng bản lưu đó và lập
báo cáo bình thường, kèm cảnh báo vàng **"ĐANG XEM DỮ LIỆU OFFLINE … lưu lúc hh:mm dd/mm/yyyy"**;
dòng "Cập nhật lần cuối" ghi thêm "(dữ liệu offline)". Có mạng lại → bấm **CẬP NHẬT DỮ LIỆU** để
tải bản mới (bản lưu cũng tự cập nhật theo). Khi có mạng, app chạy y hệt trước — bản lưu chỉ được
dùng khi tải thất bại. Máy CHƯA từng tải thành công lần nào thì chưa có bản lưu → vẫn cần mạng.

Lưu ý: bản lưu nằm trong trình duyệt/app đang dùng (Chrome, Edge, app desktop… mỗi nơi 1 bản
riêng); xoá "dữ liệu duyệt web" của trình duyệt sẽ xoá luôn bản lưu (không ảnh hưởng Google Sheet).

## Công cụ tạo file cấu hình riêng (`config.html`)

Dùng khi cần bản báo cáo này cho **1 đơn vị khác** trong HAK Group (tên công ty, Mã HS, mã nhà
máy, hoặc link Google Sheet khác) — không sửa mã nguồn, không cần build lại:

1. Mở `config.html` (double-click, giống mọi file HTML khác trong bộ này).
2. Điền tên công ty + (tuỳ chọn) Mã HS/mã nhà máy, dán link Google Sheet "Xuất bản lên web"
   dạng CSV của đơn vị đó (xem hướng dẫn ngay trong `config.html`).
3. (Tuỳ chọn) Điền Mã số thuế / Số điện thoại / Địa chỉ (trụ sở) / Địa chỉ nơi tổ chức thu mua —
   sẽ tự điền sẵn khi mở modal "Thông tin xuất báo cáo ngân hàng"/"Khai báo mẫu WO" lần đầu
   (vẫn sửa/lưu lại được như thường, không bị khoá cứng).
4. Bấm "⬇ Tạo file báo cáo" — tải về 1 file HTML hoàn chỉnh, đặt tên theo tên công ty, dùng
   ngay được như `dist/index.html` (kể cả các tiện ích: undo/redo, tìm không dấu, sao lưu/khôi
   phục, virtual scroll...).

`config.html` tự chứa toàn bộ app bên trong (không phụ thuộc `dist/index.html` lúc chạy), nên
chỉ cần giữ lại đúng 1 file `config.html` là tạo được báo cáo cho bao nhiêu đơn vị cũng được.
**Lưu ý cho người sửa code:** sau khi `npm run build`, nếu định giao `config.html`, phải chạy
thêm `npm run build:config` để nhúng lại bản `dist/index.html` MỚI NHẤT vào trong — nếu quên,
`config.html` sẽ tạo ra file dựa trên bản build cũ (thiếu tính năng/bản sửa lỗi mới).

## Phát triển tiếp (chỉ cần ở máy lập trình viên)

```bash
npm install        # cài Vite + vite-plugin-singlefile (1 lần)
npm run dev          # chạy dev server có hot-reload, mở link hiện ra trong terminal
npm run build         # build lại dist/index.html sau khi sửa code trong src/
```

Sau khi sửa bất kỳ hàm nào trong `src/services/report-service.js` (logic tính báo cáo), **bắt
buộc** kiểm chứng lại số liệu trước/sau còn khớp — xem quy trình trong `BUG_FIXED.md` và
`ARCHITECTURE.md §6`. Sau khi sửa UI (`store/`, `services/`, `components/`), chạy:

```bash
npm run build && npm run build:config   # build + nhúng lại vào config.html (BẮT BUỘC trước khi giao)
npm run test:export-golden   # LƯỚI AN TOÀN: 36 file Excel/PDF xuất ra phải khớp mẫu chuẩn từng ô/từng chữ
npm run test:perf-equivalence # 15 báo cáo khớp mã băm với code trước tối ưu
npm run test:ui              # hành vi UI (14 bảng + dashboard) khớp baseline
npm run test:features        # undo/redo, tìm không dấu, virtual scroll, Web Worker, sao lưu/khôi phục
npm run test:tau             # gán/gỡ Tàu
npm run test:error-handling  # lỗi mạng/dữ liệu: báo rõ, không treo, không mất dữ liệu
npm run test:offline         # chạy khi mất mạng (IndexedDB)
npm run test:ng-codes        # mã Nguồn gốc/Đại lý không bị rơi
npm run test:dm-recalc       # sửa Danh mục → báo cáo tính lại
npm run test:number-input    # ô số kiểu VN (1.250.000 · 1.234,56)
npm run test:export-libs     # thư viện xuất file chạy không cần mạng
npm run test:pdf-money-wrap; npm run test:pdf-custom-money-wrap; npm run test:print-blankpage; npm run test:print-total-row
npm run test:config          # config.html tạo đúng file mới
```
Ghi mẫu chuẩn mới cho lưới an toàn (CHỈ khi CHỦ ĐỘNG đổi file xuất ra): `node tests/test-export-golden.mjs --update`.

## Tài liệu

| File | Nội dung |
|---|---|
| `ARCHITECTURE.md` | Cấu trúc thư mục, lý do kiến trúc, quyết định kỹ thuật |
| `CHANGELOG.md` | Lịch sử thay đổi của bản module hoá này |
| `BUG_FIXED.md` | Lỗi phát hiện & sửa trong quá trình tách file, kèm kiểm chứng |
| `OPTIMIZATION_REPORT.md` | Tối ưu trong phạm vi lần tách này (phân biệt với đợt tối ưu tốc độ trước) |
| `PERFORMANCE_REPORT.md` | Số đo dung lượng file, thời gian build, hiệu năng runtime |
| `TODO.md` | Việc còn lại cho Phase 2/3 (tách UI, thêm tính năng mới) |

Lịch sử các bản sửa lỗi/tối ưu **trước** khi có dự án `app/` này (trên bản 1-file gốc) nằm
trong `../package/CHANGELOG.md`.
