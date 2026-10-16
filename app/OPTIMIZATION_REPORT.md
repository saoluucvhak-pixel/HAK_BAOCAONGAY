# OPTIMIZATION_REPORT.md — Tối ưu trong phạm vi Phase 1 (modular hoá)

## Phân biệt với đợt tối ưu trước

Yêu cầu "24 bước enterprise upgrade" gộp chung "tối ưu hiệu năng" vào danh sách công việc, nhưng
phần tối ưu **thuật toán tính báo cáo** (mục tiêu: giảm thời gian load, giảm RAM, giảm số lần
render, cache dữ liệu, tránh filter/sort/parse date nhiều lần, gom lookup thành Map) đã được
**thực hiện đầy đủ và đo chi tiết ở phiên làm việc trước đó** — xem `package/CHANGELOG.md` (mục
PERF-01, PERF-02, PERF-03) để tránh trùng lặp/mâu thuẫn nội dung. Báo cáo này chỉ liệt kê các
tối ưu **phát sinh thêm** hoặc **được bảo toàn** trong phạm vi Phase 1 (tách file + build).

## 1. Tối ưu được bảo toàn nguyên vẹn (không viết lại, chỉ di chuyển vị trí code)

Cả 3 tối ưu PERF-01/02/03 nằm trong `computeNhapKeo` → thực ra là `parseDateParts` (cache),
`computeHoTroOrTroGia` (Map theo Nguồn gốc), `computeHoaHongDL` (Map theo Đại lý) — khi tách
sang `src/services/report-service.js`, **không có dòng logic nào bị sửa**, chỉ đổi khai báo
`function computeX(...)` (biến toàn cục ẩn trong 1 file HTML) thành `export function
computeX(...)` (module ES6, có thể `import` ở nơi khác). Đã xác nhận lại bằng phép so sánh
`JSON.stringify` 100% khớp trên 8 bộ dữ liệu giả lập (xem `BUG_FIXED.md`).

## 2. Tối ưu mới phát sinh từ việc dùng Vite build (không có ở bản gốc)

- **Minify production**: Vite tự động rút gọn code JS/CSS khi build (`npm run build`), giảm
  ~8% dung lượng file cuối cùng dù đã thêm code mới (`StorageService`, `Logger`) — xem số đo cụ
  thể trong `PERFORMANCE_REPORT.md §1`. Bản gốc (1 file HTML viết tay) không hề qua bước minify
  nào.
- **Loại bỏ trùng lặp khai báo hằng số**: trong bản gốc, các hằng số như `REPORT_KEYS`,
  `REPORT_TITLES`, `BRAND` chỉ tồn tại ở 1 nơi vì cả file là 1 phạm vi biến toàn cục duy nhất.
  Khi tách module, các hằng số này được định nghĩa **đúng 1 lần** ở `constants/` rồi `import`
  vào nơi cần — về bản chất không phải "tối ưu tốc độ" (vì trong 1 file duy nhất vốn cũng không
  hề bị định nghĩa lại), nhưng giúp mọi thay đổi sau này (vd sửa tiêu đề 1 báo cáo) chỉ cần sửa
  **1 chỗ**, tránh nguy cơ sửa sót gây lệch dữ liệu giữa nhiều bản sao — 1 dạng "tối ưu về công
  sức bảo trì", đúng tinh thần BƯỚC 4 (Refactor) của yêu cầu gốc.

## 3. Tối ưu được cân nhắc nhưng CHỦ ĐỘNG KHÔNG làm ở Phase 1 (và lý do)

Theo đúng nguyên tắc đã thống nhất từ đầu dự án — "không tự ý tối ưu nếu chưa chứng minh" —
các hạng mục sau trong yêu cầu 24 bước được cân nhắc nhưng hoãn lại, vì làm ngay có rủi ro cao
hơn lợi ích đo được trong phạm vi 1 lần thay đổi:

| Hạng mục | Vì sao chưa làm ở Phase 1 |
|---|---|
| Virtual-scroll cho bảng dữ liệu lớn | Cần đo trước xem bảng nào thực sự có > vài nghìn dòng gây giật UI thật (chưa có số liệu đo DOM render cụ thể); làm không đúng chỗ có thể phá layout bảng đang hoạt động tốt |
| Web Worker cho import Excel | Đổi luồng xử lý (main thread → worker) là thay đổi kiến trúc lớn, cần bộ test riêng để đảm bảo dữ liệu đọc ra giống hệt (worker không có quyền truy cập DOM trực tiếp, 1 số đoạn code đọc Excel hiện tại có thể phụ thuộc ngầm vào `window`) |
| Fuzzy search realtime | Tính năng UX mới, không phải tối ưu tốc độ thuần tuý — thuộc nhóm "thay đổi trải nghiệm", cần xác nhận trước theo đúng ràng buộc "không giảm trải nghiệm" (thêm tính năng thì được, nhưng cần biết đúng ô tìm kiếm nào người dùng muốn áp dụng) |
| Gộp `.filter()` lặp lại theo cùng khoảng ngày giữa nhiều hàm `compute*()` | Đã ghi nhận ở đợt tối ưu trước: đòi đổi chữ ký hàm đang được export/dùng độc lập bởi kịch bản kiểm thử, rủi ro cao hơn lợi ích đo được (sau khi đã cache ngày, `.filter()` chỉ còn là duyệt mảng, không còn parse ngày lặp lại) |

Các hạng mục này được chuyển sang `TODO.md` làm việc cho các đợt tiếp theo, có điều kiện tiên
quyết cụ thể (vd "cần bộ test UI tự động trước") thay vì mốc thời gian mơ hồ.

## Kết luận

Trong phạm vi Phase 1, không có tối ưu thuật toán mới nào cần thiết vì lớp tính toán đã được
tối ưu đầy đủ ở đợt trước và được bảo toàn nguyên vẹn qua Phase 1. Lợi ích chính của Phase 1
nằm ở khả năng **bảo trì** (module hoá, kiểm thử độc lập từng phần) chứ không phải tốc độ chạy —
đúng với mục tiêu đã nêu trong yêu cầu gốc là 1 bước chuẩn bị nền tảng cho các cải tiến sâu hơn
về sau.
