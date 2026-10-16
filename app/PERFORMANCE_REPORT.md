# PERFORMANCE_REPORT.md — Hiệu năng sau khi modular hoá (Phase 1)

## Phạm vi báo cáo này

Báo cáo này đo tác động của việc **tách file + build bằng Vite** (Phase 1, phiên làm việc này)
lên dung lượng file và cấu trúc mã nguồn. Phần tối ưu **thuật toán tính báo cáo** (cache ngày,
gom Map thay vì quét mảng lặp lại...) đã được thực hiện và đo chi tiết ở phiên làm việc **trước
đó**, kết quả nằm trong `package/CHANGELOG.md` (mục PERF-01/02/03) — không lặp lại ở đây. Vì
lớp `services/report-service.js` được tách **nguyên vẹn logic** từ bản đã tối ưu đó (chỉ đổi
cách khai báo hàm sang `export function`, không đổi 1 dòng logic bên trong), nên toàn bộ mức
cải thiện tốc độ/bộ nhớ đã đo trước đây **vẫn giữ nguyên** ở bản module hoá này — đã xác nhận lại
bằng phép so sánh số liệu 100% khớp trong `BUG_FIXED.md`.

## 1. Dung lượng file giao cho người dùng cuối

| | Bản gốc (1 file, chưa build) | Bản mới (`dist/index.html`, đã build) | Chênh lệch |
|---|---|---|---|
| Kích thước chưa nén | 620.998 bytes (~620,9 KB) | 571.282 bytes (~571,3 KB) | **giảm ~8,0%** |
| Kích thước gzip (khi tải qua mạng, nếu host lên server có nén) | 261.082 bytes | 251.397 bytes | giảm ~3,7% |

Dung lượng giảm dù đã **thêm mới** `StorageService` (77 dòng) + `Logger` (49 dòng) + JSDoc mô tả
chi tiết hơn ở mọi module — vì Vite build ở chế độ production tự động:
- Minify JS (rút gọn tên biến cục bộ, bỏ khoảng trắng/comment không cần thiết trong code logic —
  KHÔNG đụng vào chuỗi dữ liệu như base64 font hay text tiếng Việt hiển thị cho người dùng).
- Loại bỏ code không dùng tới (tree-shaking) nếu có.

**Lưu ý:** vì dùng `vite-plugin-singlefile`, kết quả build vẫn là **đúng 1 file HTML** — không
có cải thiện về số lượng request mạng khi mở app (bản gốc và bản mới đều chỉ có 1 file HTML +
5 thư viện CDN giống hệt nhau), khác với 1 ứng dụng Vite thông thường có nhiều file JS/CSS tách
rời được cache riêng.

## 2. Cấu trúc mã nguồn (đo được bằng dòng lệnh, không phải ước tính)

| Chỉ số | Giá trị |
|---|---|
| Tổng số dòng code trong `src/` (18 file) | 2.450 dòng |
| Số module đã tách thành file riêng, có thể `import`/kiểm thử độc lập bằng Node.js hoặc Playwright | 17 file (`config/`, `constants/`, `utils/`, `services/`, `store/`, `components/`) |
| Phần còn lại chưa tách (`legacy-app.js` — chủ yếu EXPORT_SERVICE, phụ thuộc thư viện CDN) | 1.137 dòng (~46% tổng số dòng, giảm từ ~62% ở Phase 1) |

*(Cập nhật sau đợt tách Phase 2: `store/state.js`, `services/data-service.js`,
`components/report-table.js`, `components/dashboard.js`, `components/compare.js` — xem
`CHANGELOG.md`. `legacy-app.js` giảm từ 1.447 → 1.137 dòng.)*

File lớn nhất trong lớp đã tách là `services/report-service.js` (350 dòng, gồm toàn bộ 13 hàm
`compute*()`) — đây là lớp quan trọng nhất về mặt nghiệp vụ (tính ra số liệu báo cáo), nay có
thể đọc/sửa/kiểm thử **độc lập hoàn toàn** với phần giao diện, không cần mở trình duyệt.

## 3. Thời gian build (chi phí phát sinh — chỉ ở máy người phát triển, KHÔNG ảnh hưởng người dùng cuối)

```
npx vite build
✓ 15 modules transformed.
✓ built in 599ms
```

Dưới 1 giây — không đáng kể, và **chỉ chạy 1 lần khi phát hành bản mới**, người dùng cuối vẫn
chỉ mở file `dist/index.html` bằng cách double-click như trước, không cần cài Node.js hay chạy
lệnh build gì cả.

## 4. Hiệu năng runtime (tính báo cáo) — không đổi, đã xác nhận lại

Kế thừa nguyên vẹn kết quả đo ở phiên tối ưu trước (bộ dữ liệu 9.600 dòng phiếu cân):

| Chỉ số | Before (bản gốc chưa tối ưu) | After (đã tối ưu — dùng cho cả bản 1-file lẫn bản module hoá) |
|---|---|---|
| Thời gian tính 1 lần "LẬP BÁO CÁO" | 251,99 ms | **121,78 ms (nhanh gấp 2,07 lần)** |
| Rác bộ nhớ tạm / 20 lần bấm liên tiếp | 73,93 MB | **14,24 MB (giảm ~80,7%)** |

(Chi tiết phương pháp đo và toàn bộ chứng cứ nằm trong `package/CHANGELOG.md`.) Việc tách file
ở Phase 1 này **không thêm và không bớt** chi phí runtime nào ở lớp tính toán — chỉ có chi phí
build 1 lần (mục 3) và độ trễ nạp module ES6 lúc khởi động trang, đo ở mục 5.

## 5. Thời gian khởi động trang (đo bằng Playwright, headless Chromium)

Mở `dist/index.html` cục bộ (`file://`), đo từ lúc điều hướng đến khi sự kiện `load` bắn xong:

- Trang tải và chạy xong toàn bộ script khởi tạo (`renderDMTables`, `initEvents`,
  `loadAllData`) **không phát sinh lỗi JS** nào (`pageerror` = 0) — xem chi tiết trong
  `BUG_FIXED.md`.
- Vì `vite-plugin-singlefile` đã inline toàn bộ JS module vào 1 `<script type="module">` duy
  nhất trong `dist/index.html` (không còn `import` rời từng file lúc chạy), **không có thêm
  request mạng nào** so với bản gốc để tải các module đã tách — chi phí "chia nhỏ module" chỉ
  tồn tại ở bước build, không tồn tại lúc người dùng mở trang.

## 6. Đợt tối ưu Phase 3.12 (23/09/2026) — đo trước/sau trên Chromium

Phương pháp: Playwright + Chromium, dữ liệu giả lập tên người Việt có dấu, khoảng ngày 2 năm;
mỗi số là trung vị của 5 lần (LẬP BÁO CÁO), 10 phím (tìm kiếm), 3 lần (sắp xếp). "Trước" = đúng
`dist/index.html` đã giao ở Phase 3.11. Bộ nhớ đo sau khi ép dọn rác (GC).

| Thao tác | 2.000 phiếu | 10.000 phiếu | 30.000 phiếu |
|---|---|---|---|
| LẬP BÁO CÁO | 118,5 → 99,1 ms | 299,9 → 177,4 ms (−41%) | 729,4 → 373,2 ms (−49%) |
| Tìm kiếm / 1 phím | 27,1 → 5,5 ms | 134,1 → 28,2 ms (−79%) | 388,2 → 76,1 ms (−80%) |
| Sắp xếp cột chữ | 12,6 → 13,6 ms (nhiễu) | 29,3 → 22,3 ms | 73,6 → 58,9 ms |
| Bộ nhớ JS | 20,7 → 22,0 MB | 31,6 → 35,6 MB | 61,0 → 64,8 MB |

Riêng lớp tính toán (Node, 15 báo cáo, 10.000 phiếu): 273 → 104 ms (lần 2 trở đi), 394 → 251 ms
(lần đầu). Phần còn lại của LẬP BÁO CÁO chủ yếu là vẽ 5 biểu đồ Chart.js (~60 ms, tỉ lệ theo SỐ
NGÀY chứ không theo số phiếu — khoảng 1 tháng thì nhẹ hơn nhiều) — giữ nguyên để không đổi hiệu
ứng hiển thị. Xuất PDF 10.000 dòng ~7,3 s, trong đó ~93% nằm trong thư viện jsPDF/autoTable (đo
bằng CPU profiler) — không tối ưu được nếu không đổi thư viện/hình thức file; thay vào đó thêm
thông báo "Đang tạo file…" + chặn bấm lặp (xem CHANGELOG Phase 3.12).

Tính đúng: `npm run test:perf-equivalence` — kết quả 15 báo cáo khớp mã băm SHA-1 với code
trước tối ưu.

## 7. Phase 4.2 (06/10/2026) — thời gian mở app

Đo với quy mô dữ liệu thật (10.275 phiếu cân / 10.186 DNTT). Lập báo cáo 1 ngày/1 tháng ~55–60 ms (đã
nhanh). Chỗ chậm là MỞ APP (~380 ms): thí nghiệm bỏ 3 thư viện xuất file khỏi lúc khởi động còn ~100 ms.
Sau khi chuyển sang nạp-khi-cần (`services/export-libs.js`): mở app 389 → 148 ms (lần đầu), 379 → 144
ms (các lần sau); file 3,41 → 3,10 MB; lần xuất đầu tiên nếu bấm NGAY khi vừa mở app chậm thêm ~0,27 s
(nạp thư viện 1 lần), còn bình thường app tự nạp sẵn lúc rảnh ~3 giây sau khi mở nên không phải chờ.
Tính đúng: 36 file xuất khớp mẫu chuẩn (`npm run test:export-golden`).

## Kết luận

Việc tách file (Phase 1) là thay đổi về **cấu trúc mã nguồn phục vụ bảo trì lâu dài**, không
phải một đợt tối ưu tốc độ mới — nhưng nhờ build production của Vite, sản phẩm cuối vẫn **nhẹ
hơn ~8%** so với bản gốc trong khi vẫn giữ đúng mô hình phân phối 1-file, và toàn bộ mức cải
thiện hiệu năng đã đạt được ở đợt tối ưu trước **không bị mất đi** — đã kiểm chứng lại bằng so
sánh số liệu 100% khớp (xem `BUG_FIXED.md`).
