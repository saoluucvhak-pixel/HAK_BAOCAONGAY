# TODO.md — Việc còn lại cho các Phase tiếp theo

Phase 1 (phiên làm việc này) chỉ tách lớp **business logic thuần** (`utils/`, `constants/`,
`config/`, `services/`) thành module thật, theo chiến lược "Strangler Fig" (xem
`ARCHITECTURE.md §4`) để tránh rủi ro phá vỡ chức năng khi tách vội lớp UI/Export. Danh sách
dưới đây là phần còn lại của yêu cầu "24 bước enterprise upgrade" gốc, sắp theo Phase đề xuất.

## Lộ trình nền tảng (theo bản yêu cầu "HTML Offline Business Platform", 26/09/2026)

Người dùng chọn thứ tự: làm **Offline trước**, đồng bộ Google Sheet **chỉ đọc + lưu offline**.

- [x] **4.1 Offline** — lưu bản Sheet tải thành công gần nhất vào IndexedDB, mất mạng vẫn lập báo
      cáo (`services/offline-cache.js`, `npm run test:offline` 14/14). Xem CHANGELOG Phase 4.1.
- [x] **4.2** Tách `legacy-app.js` (~1.480 → ~310 dòng) thành `services/export/*` + `components/
      {dm-tables,tau-modal}`; không còn file > 800 dòng / hàm > 100 dòng; mở app nhanh gấp ~2,6 lần
      (nạp thư viện xuất file khi cần); lưới an toàn `test:export-golden` (36 file). CHANGELOG Phase 4.2.
- [ ] **4.2b** (còn lại) Event Bus nhẹ + thông báo nổi (toast) + mức log AUDIT/SYNC — chưa làm vì chưa có
      chỗ dùng cụ thể đo được lợi ích; nên làm cùng 4.3 (khung module) khi bắt đầu thêm module mới.
- [ ] (Cân nhắc, CHƯA làm) Vẽ biểu đồ Dashboard chỉ khi đang mở tab Dashboard: đo được tiết kiệm ~25%
      thời gian LẬP BÁO CÁO nhưng chỉ ~15 ms với dữ liệu thật (đã ~55 ms) — lợi ích nhỏ, để sau.
- [ ] **4.3** Khung module/plugin: đăng ký qua file danh sách (manifest) hoặc gộp lúc build — HTML
      offline không tự liệt kê được thư mục nên không "tự nhận" plugin kiểu thả file vào được.
- [ ] **4.4** Ghi ngược Google Sheet (hàng đợi, thử lại, phát hiện xung đột) — CHƯA cần theo lựa
      chọn hiện tại; nếu làm: qua Google Apps Script Web App (không lưu token trong app).
- [ ] **4.5** Khung nhập Excel dùng chung: nhiều file, kéo thả, xem trước, dò tiêu đề, ghép cột.
- [ ] **4.6** Dữ liệu 100.000–500.000 dòng: tính toán trong Web Worker, xuất Excel/PDF dạng
      streaming (hiện đã đo ổn tới 30.000 phiếu cân — PERFORMANCE_REPORT.md §6).

## Phase 2 — Tách lớp UI (ưu tiên cao, cần làm trước Phase 3)

Điều kiện tiên quyết cho toàn bộ Phase 2: **có bộ test UI tự động** (đề xuất Playwright) click
qua từng màn hình chính (nhập bộ lọc → bấm "LẬP BÁO CÁO" → kiểm tra bảng hiển thị đúng → bấm
từng nút xuất Excel/PDF → so sánh file xuất ra byte-for-byte hoặc theo nội dung với bản trước khi
tách) — không có lưới an toàn này thì tách `legacy-app.js` (1.447 dòng, phần lớn thao tác DOM
trực tiếp) có rủi ro cao làm lệch hành vi mà không phát hiện được, vi phạm ràng buộc "không đổi
chức năng, không giảm trải nghiệm".

- [x] **Đã làm (khung cơ bản)**: `tests/ui-baseline.mjs` + `tests/fixtures.mjs` — mở
      `dist/index.html` bằng Playwright, chặn 4 URL Google Sheet thật và trả về dữ liệu giả lập
      cố định (seed ngẫu nhiên cố định, kết quả lặp lại y hệt mỗi lần chạy), bấm "LẬP BÁO CÁO",
      đọc số dòng hiển thị của cả 14 bảng báo cáo trên UI, lưu thành `tests/ui-baseline.json`.
      Chạy `npm run test:ui` để so sánh lần chạy hiện tại với baseline đã lưu — thoát mã lỗi
      (exit code 1) nếu có sai khác. Đã tự kiểm chứng script phát hiện đúng sai khác (thử đổi
      số dòng dữ liệu giả lập từ 40 → 41, script báo "LỆCH" đúng như kỳ vọng, sau đó revert).
      **Còn thiếu (chưa làm trong phần khung này)**: chưa bấm thử từng nút xuất Excel/PDF và so
      sánh nội dung file xuất ra — vì môi trường sandbox hiện tại chặn domain CDN
      (cdnjs.cloudflare.com) nên ExcelJS/jsPDF không nạp được để thực thi xuất file (xem
      `BUG_FIXED.md`/`CHANGELOG.md`); phần này cần chạy ở máy có mạng đầy đủ trước khi bắt đầu
      tách `EXPORT_SERVICE`.
- [ ] Mở rộng bộ test: bấm từng nút xuất Excel/PDF (bao gồm 3 luồng ngân hàng: Sổ chi tiết vay /
      02-TNDN / Phiếu nhập kho) và so sánh nội dung file xuất ra (không nhất thiết byte-for-byte
      vì Excel/PDF có thể chứa timestamp; so sánh theo nội dung ô/text trích xuất được) —
      **làm ở môi trường có thể tải được 5 thư viện CDN**, trước khi tách `EXPORT_SERVICE`.
- [x] **Đã làm**: Tách `STATE`/`TABLES`/danh mục Đại lý-Hỗ trợ + `applyFilters` ra
      `src/store/state.js`. Đây là nơi hợp lý để về sau thêm `AppState` có undo/redo (Phase 3).
- [x] **Đã làm**: Tách `DATA_SERVICE` (fetch CSV Google Sheet, chuẩn hoá) ra
      `src/services/data-service.js`.
- [x] **Đã làm**: Tách phần render bảng báo cáo (`renderReportTable`, sort/search/phân trang)
      ra `src/components/report-table.js`.
- [x] **Đã làm**: Tách Dashboard (KPI cards + Chart.js) ra `src/components/dashboard.js`, và
      công cụ đối chiếu Excel ra `src/components/compare.js`.
      **Kiểm chứng**: `npm run test:ui` báo KHỚP 100% với baseline đã lưu; `legacy-app.js` giảm
      1.447 → 1.137 dòng. Chi tiết cách xử lý phụ thuộc vòng (circular import) giữa các module
      mới và `legacy-app.js` xem `ARCHITECTURE.md §2`.
- [ ] **Chưa làm — phần khó nhất, cần môi trường có mạng đầy đủ**: Tách `EXPORT_SERVICE` (xuất
      Excel/PDF, ~70% khối lượng còn lại của `legacy-app.js`, ~1.137 dòng) ra
      `src/services/export/` — tách riêng theo loại xuất (Excel/PDF/tổng hợp) vì mỗi loại có
      logic style/layout khác nhau, gộp chung sẽ khó đọc hơn là chia nhỏ. **Bắt buộc** mở rộng
      `tests/ui-baseline.mjs` để bấm thử từng nút xuất và so sánh nội dung file xuất ra TRƯỚC
      khi tách phần này (xem mục ngay dưới) — sandbox hiện tại không làm được vì bị chặn CDN.
- [ ] Tách phần bind sự kiện còn lại (`initEvents()`, hiện vẫn gộp hết vào 1 hàm dài) ra
      `src/events/` — nên làm CÙNG LÚC hoặc SAU khi tách `EXPORT_SERVICE`, vì phần lớn sự kiện
      còn lại trong `initEvents()` là mở modal/bấm nút xuất — tách trước sẽ phải tách lại.
- [ ] Sau khi tách xong `EXPORT_SERVICE`, chạy lại `npm run test:ui` (đã mở rộng) + đối chiếu
      file Excel/PDF xuất ra trước/sau bằng công cụ diff nhị phân hoặc so sánh nội dung ô — chỉ
      merge khi khớp 100%.

## Phase 3 — Tính năng mới

- [x] **Đã làm**: `store/app-state.js` — Undo/redo (Ctrl+Z/Ctrl+Y + nút "↩ Hoàn tác"/"↪ Làm
      lại") cho danh mục Đại lý và Hỗ trợ/Trợ giá (2 nơi duy nhất người dùng tự nhập tay dữ
      liệu). KHÔNG áp dụng cho bộ lọc báo cáo (Từ ngày/Đến ngày/Đại lý/...) — phạm vi này chỉ
      là điều kiện xem tạm thời, không phải dữ liệu "nhập vào" cần bảo vệ khỏi mất.
- [x] **Đã làm**: `utils/fuzzy-search.js` — tìm không dấu (accent-insensitive) cho ô tìm kiếm
      của **mọi** bảng báo cáo (dùng chung 1 hàm `applySortSearch`, nên tự động áp dụng cho cả
      14 bảng, không cần chọn riêng từng bảng).
- [x] **Đã làm**: Virtual scroll cho bảng > 300 dòng sau lọc/tìm, trong
      `components/report-table.js` — áp dụng đồng loạt cho cả 14 bảng (dùng chung 1 hàm render),
      ngưỡng 300 chọn bảo thủ để không ảnh hưởng phần lớn báo cáo ngày thường.
- [x] **Đã làm**: Web Worker cho đọc file Excel "Sổ chi tiết tiền vay"
      (`services/excel-import-worker.js` + `services/tien-vay-import.js`) — đây cũng là báo
      cáo ngân hàng DUY NHẤT hiện đọc file Excel người dùng tải lên (Excel xuất RA thì vẫn ở
      luồng chính, không cần Worker vì không phải bước tốn CPU với dữ liệu lớn theo cùng kiểu).
      Khi làm tính năng này đã phát hiện và sửa luôn 1 lỗi nghiêm trọng có sẵn — xem
      `BUG_FIXED.md` [BUG-M0].
      **Kiểm chứng cả 4 mục trên**: `npm run test:features` — 10/10 kiểm tra khớp trên trình
      duyệt thật (Playwright), bao gồm cả thuật toán parse Excel test riêng bằng package `xlsx`
      thật trong Node.js (6/6 khớp, có ca biên "dòng Total lạ chèn giữa dữ liệu"). Chi tiết xem
      `CHANGELOG.md` mục Phase 3.
- [x] **Đã làm**: Nối `StorageService.exportAll()/importAll()` vào UI —
      `src/services/backup-restore.js` + thẻ mới "Sao lưu / Khôi phục dữ liệu" trong tab
      "Danh mục & cấu hình" (nút "💾 Sao lưu dữ liệu" tải file JSON xuống máy; nút
      "📂 Khôi phục dữ liệu" đọc lại file JSON đó và ghi đè dữ liệu đã lưu). Đặt cùng khu vực
      cấu hình hiện có, không sửa layout tổng thể. An toàn thêm: `restoreData()` gọi
      `pushUndoSnapshot()` TRƯỚC khi ghi đè, nên khôi phục nhầm file vẫn bấm "Hoàn tác"
      (Ctrl+Z) quay lại được. CHỈ sao lưu/khôi phục dữ liệu người dùng tự nhập (danh mục Đại
      lý/Hỗ trợ, đối chiếu Excel, thông tin ngân hàng/WO) — không đụng dữ liệu Google Sheet
      (luôn tải lại từ nguồn).
      **Kiểm chứng**: `npm run test:features` — 22/22 (mở rộng từ 10 lên 22 kiểm tra), gồm
      cả kịch bản round-trip đầy đủ (thêm 1 đại lý → export → xoá bằng Hoàn tác → import lại
      từ đúng file JSON vừa export → số đại lý khớp lại đúng). `npm run test:ui` vẫn KHỚP
      100% (không đổi hành vi 14 bảng báo cáo hiện có).
- [x] **Đã làm**: `config.html` — công cụ độc lập tạo file báo cáo đã cấu hình sẵn (tên công ty,
      Mã HS, mã nhà máy, 4 link Google Sheet, và Mã số thuế/SĐT/Địa chỉ/Địa chỉ thu mua dùng
      làm mặc định cho modal ngân hàng/WO) cho từng đơn vị HAK Group, không cần sửa mã nguồn.
      Xem chi tiết `CHANGELOG.md` mục Phase 3.2/3.3, hướng dẫn dùng trong `README.md`. Kèm theo:
      `scripts/build-config-html.mjs` (bảo trì) + `tests/test-config-generator.mjs` (23/23).
- [x] **Đã làm (ngoài dự án `app/` — thư mục riêng `desktop-app/`)**: Ứng dụng desktop Windows
      (Electron), 1 bộ cài duy nhất dùng chung cho mọi đơn vị HAK Group — lần mở đầu tiên hiện
      màn hình điền Tên công ty + link Google Sheet (dùng lại ĐÚNG logic find-and-replace đã kiểm
      chứng của `config.html`, thao tác trên bản mẫu gốc Đại Hiệp không bao giờ bị ghi đè), lưu
      lại cho những lần mở sau, đổi được qua menu "Đổi cấu hình công ty...". Xem
      `desktop-app/main.js`. **Kiểm chứng**: chạy thử toàn bộ luồng bằng Electron thật (không chỉ
      đọc code) — lần đầu hiện đúng màn hình cấu hình, điền xong tự chuyển đúng sang báo cáo đã
      thay tên công ty, mở lại app (tiến trình mới) vào thẳng báo cáo không hỏi lại, mở màn hình
      "Đổi cấu hình" điền sẵn đúng giá trị đã lưu trước đó.
- [ ] **Multi-format export** (nếu có định dạng nào ngoài Excel/PDF hiện có mà người dùng cần)
      — cần hỏi rõ định dạng cụ thể, hiện chưa có yêu cầu định dạng nào khác được nêu.
- [ ] **Autosave** — cần xác định autosave cái gì (bộ lọc đang nhập dở? danh mục đang sửa?) và
      tần suất, tránh ghi `localStorage` quá thường xuyên gây giật khi nhập liệu.

## Phase 4 — Hoàn thiện chất lượng (có thể làm song song, ít rủi ro hơn Phase 2/3)

- [ ] **Dọn dẹp CSS trùng lặp**: phát hiện ở Phase 3.5 — `src/styles/main.css` (tách ra từ Phase
      1) là file MỒ CÔI, không được `import` ở bất kỳ đâu trong `src/`. CSS thật sự dùng để build
      `dist/index.html` nằm trong khối `<style>` nhúng thẳng trong `index.html`. Hiện đang phải
      sửa CẢ 2 NƠI mỗi khi đổi style (đã làm vậy ở Phase 3.5) để tránh 2 file lệch nhau — nên gộp
      lại thành 1 nguồn duy nhất (import `main.css` thật vào `index.html` qua `<link>`/Vite xử lý
      CSS, xoá `<style>` nhúng tay) một khi có thời gian, tránh rủi ro sửa nhầm file không có tác
      dụng về sau.

- [x] **Đã làm**: Thay toàn bộ `console.log`/`console.warn` còn sót trong `legacy-app.js` bằng
      `logger` — rà lại xác nhận không còn lệnh `console.*` nào ngoài chính `services/logger.js`.
      Sửa luôn kèm theo: `boot()` gán `window.app = { logger, storageService }` — JSDoc của
      `logger.js` từ đầu đã mô tả việc đổi cấp độ log ngay từ console trình duyệt lúc hỗ trợ từ
      xa (vd `app.logger.setLevel('DEBUG')`) nhưng `window.app` chưa từng thực sự được gán, nên
      sửa nốt cho đúng lời hứa JSDoc. **Kiểm chứng**: `npm run test:features` có 3 kiểm tra
      riêng xác nhận `window.app.logger.setLevel` và `window.app.storageService.exportAll` gọi
      được từ console.
- [ ] Viết JSDoc đầy đủ hơn cho các hàm còn lại trong `legacy-app.js` (hiện các module đã tách
      ở Phase 1 đã có JSDoc, `legacy-app.js` thì chưa vì đây là phần trích xuất gần như nguyên
      trạng).
- [ ] Rà soát bảo mật (XSS khi hiển thị dữ liệu người dùng nhập vào bảng, kiểm tra input file
      Excel tải lên trước khi parse) — chưa rà trong Phase 1 vì phạm vi Phase 1 chỉ là tách
      file, không sửa logic xử lý input.
      **Đã phát hiện 1 điểm cụ thể** (kế thừa từ bản gốc, KHÔNG phải lỗi mới phát sinh khi tách
      file — xem `BaoCaoNgay.html` dòng 1464): `components/compare.js` hàm `renderCompare()`
      chèn `saved[row.key]` (giá trị người dùng gõ vào ô "Đối chiếu Excel", lưu ở
      `localStorage`) thẳng vào thuộc tính `value="..."` của `<input>` qua `innerHTML`, KHÔNG
      qua `esc()` — nếu giá trị chứa ký tự `"` có thể phá vỡ thuộc tính HTML. Rủi ro thực tế
      thấp (dữ liệu chỉ do chính người dùng gõ vào trình duyệt của họ, không có server nhiều
      người dùng), nhưng nên sửa cho chắc chắn (đổi `value="..."` trong chuỗi HTML thành gán
      `input.value = ...` bằng DOM property sau khi tạo phần tử, giống cách `renderDMTables` đã
      làm) — CHƯA sửa ở đây vì đây là thay đổi hành vi hiển thị, cần xác nhận trước khi đụng
      vào theo đúng nguyên tắc đã thống nhất.
- [x] **Đã làm (Phase 3.4)**: "Xem xét lại quyết định 'thư viện nặng nạp qua CDN, không qua npm
      import'" — đã có đủ bộ test UI tự động (`tests/test-export-libs.mjs`) để kiểm chứng, đã
      chuyển hẳn cả 5 thư viện (ExcelJS/jsPDF/jspdf-autotable/Chart.js/xlsx) sang bundle qua npm.
      Lý do thúc đẩy: người dùng thực tế báo lỗi "nút xuất Excel/PDF/In/Xuất tất cả đều dùng kg
      được" — đúng kịch bản CDN bị chặn mà mục TODO này từng lo ngại. Chi tiết `CHANGELOG.md`
      mục Phase 3.4, `BUG_FIXED.md`.

## Đã hoàn thành ở Phase 1 (tham khảo, không cần làm lại)

- [x] Tách `utils/`, `constants/`, `config/`, `services/report-service.js` thành module ES6
      độc lập, kiểm thử được bằng Node.js không cần trình duyệt.
- [x] `StorageService` (lớp lõi — chưa nối UI, xem mục Phase 3 ở trên).
- [x] `Logger` (lớp lõi — chưa thay hết `console.log` cũ, xem mục Phase 4 ở trên).
- [x] Build ra 1 file `dist/index.html` duy nhất bằng Vite + `vite-plugin-singlefile`, giữ được
      khả năng double-click mở trực tiếp.
- [x] Sửa 5 lỗi phát sinh trong quá trình tách file (xem `BUG_FIXED.md`), kiểm chứng lại bằng
      120 phép so sánh số liệu — khớp 100%.
