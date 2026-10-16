# BUG_FIXED.md — Lỗi phát hiện & sửa trong quá trình modular hoá

Tất cả lỗi dưới đây được phát hiện **trong quá trình tách file**, không phải lỗi có sẵn từ
trước trong `BaoCaoNgay.html` gốc (bản gốc vẫn hoạt động đúng — đây là lỗi tự phát sinh khi copy
code sang cấu trúc module mới, đã được bắt và sửa **trước khi giao**, đúng quy trình "kiểm chứng
trước khi giao" đã thống nhất).

---

## [Không phải lỗi do tách file] "Failed to fetch" khi double-click `dist/index.html` trực tiếp

**Người dùng báo:** mở `dist/index.html` bằng double-click thấy "Lỗi tải dữ liệu: PHIEUCAN:
Failed to fetch"; chạy qua Node (`npm run dev`/`preview`, tức qua `http://localhost`) thì không
lỗi.

**Đã kiểm tra:** đoạn code gọi dữ liệu (`fetchCSV()` trong `src/services/data-service.js`, dùng
`fetch(url, { cache: 'no-store' })`) **giống 100% byte-for-byte** với bản gốc `BaoCaoNgay.html`
(dòng 1063) — không có gì bị đổi trong quá trình tách file ở Phase 1/2/3. Vậy đây **không phải**
lỗi phát sinh từ việc tách module.

**Nguyên nhân thực sự:** khi mở file bằng double-click, trình duyệt coi trang đó có gốc
(origin) là `file://` — nhiều trình duyệt/máy (tuỳ chính sách bảo mật, phần mềm diệt virus, hay
phiên bản trình duyệt) chặn hoặc không cho phép trang `file://` gọi ra dữ liệu ở tên miền khác
(ở đây là Google Sheet), trong khi mở qua `http://localhost` (một "trang web" thật sự) thì được
phép bình thường. Đây là giới hạn bảo mật của trình duyệt/máy đó, không phải lỗi của app.

**Cách khắc phục (không cần sửa code, không đổi hành vi app)**: thêm `server.mjs` +
`start.bat`/`start.sh` — 1 server tĩnh cực nhỏ chỉ dùng module có sẵn của Node.js (không cần
cài thêm gì, không cần internet), mở `dist/index.html` qua `http://localhost:8791` thay vì mở
trực tiếp kiểu double-click. Giao diện/hành vi bên trong app không đổi gì — chỉ khác cách mở.
Xem hướng dẫn trong `README.md`.

**Kiểm chứng:** chạy `node server.mjs`, so sánh nội dung trả về qua `http://localhost:8791/index.html`
với `dist/index.html` bằng `diff` — **khớp byte-for-byte**; kiểm tra file không tồn tại trả về
404 đúng; kiểm tra chặn truy cập ra ngoài thư mục `dist/` (path traversal) trả về 404 đúng.

---

## [Phase 3.12] (Nghiêm trọng) App desktop: cài bản mới vẫn mở báo cáo cũ — các bản sửa không có tác dụng

**Phát hiện khi rà luồng dữ liệu** (không phải người dùng báo trực tiếp; nếu người dùng mở báo cáo bằng
app desktop thì đây có thể là lý do các lỗi đã sửa vẫn còn thấy — ảnh chụp gần đây là bản web qua
localhost:8791 nên không khẳng định chắc): `desktop-app/main.js`
chỉ sinh `report.html` (bản báo cáo đã thay tên công ty/link Sheet) ở lần cấu hình đầu tiên. Cài bản
mới chỉ thay file mẫu `app/index.html`, còn `report.html` trong thư mục dữ liệu người dùng giữ nguyên
bản cũ và vẫn được mở. Đã tái hiện bằng `desktop-app/tests/test-template-refresh.js` (giả lập
Electron): bản cũ 6/8, bản sửa 8/8. Sửa: lưu SHA-1 của file mẫu, mẫu đổi thì tự sinh lại.

## [Phase 3.12] `config.html` nhúng bản app cũ (quy trình giao)

`config.html` nhúng 1 bản `dist/index.html` (base64) để tạo file cấu hình riêng, nhưng không được
nhúng lại sau mỗi lần build từ 22/09 → `npm run test:config` báo lệch kích thước (22/23). Đã chạy
`npm run build:config`; từ nay là bước bắt buộc trước khi đóng gói.

---

## [Phase 3.6] Thiếu import `unassignTau` — bấm "Gỡ gán các dòng đã chọn" ở màn hình Tàu bị `ReferenceError`

**Phát hiện lúc nào:** trong lúc tự viết code mới cho tính năng "Xuất theo Tàu" (nhóm BKLS theo
Tàu/Khách hàng), **trước khi giao** — không phải lỗi người dùng gặp phải.

**Nguyên nhân:** `src/services/tau-assignment.js` export 5 hàm (`loadTauAssignments`,
`getTauInfo`, `isLockedToOtherTau`, `listKnownTau`, `assignTau`, `unassignTau`), nhưng dòng
`import` tương ứng ở `src/legacy-app.js` lúc viết ban đầu chỉ liệt kê 4 hàm, thiếu
`unassignTau` — trong khi hàm `confirmTauUnassignClick()` (gắn cho nút "Gỡ gán các dòng đã
chọn") có gọi `unassignTau(list)`. `npm run build` (Vite) **không bắt được** lỗi này vì
`unassignTau` chỉ được tham chiếu bên trong thân hàm, không phải lỗi cú pháp/resolve module tĩnh.

**Cách sửa:** thêm `unassignTau` vào danh sách import; đồng thời gỡ `isLockedToOtherTau` khỏi
import đó vì hàm này chỉ thực sự được gọi bên trong `tau-assignment.js` (làm lớp bảo vệ cuối của
`assignTau()`), không được gọi trực tiếp ở `legacy-app.js` — logic khoá/mở khoá hiển thị trên UI
tự tính lại độc lập trong `renderTauRowList()`.

**Kiểm chứng:** viết test riêng `tests/test-tau-assignment.mjs` (`npm run test:tau`), có bước bấm
"Gỡ gán" thật trên trình duyệt (Playwright) và kiểm tra `page.on('pageerror')` không ghi nhận lỗi
nào chứa `unassignTau` — 17/17 test tính năng Tàu pass, bao gồm cả kiểm tra localStorage xoá đúng
dữ liệu sau khi gỡ gán.

---

## [Phase 3.5] Cột "Mã ĐL"/"Tên đại lý" (và "Nguồn gốc") trong "Danh mục & cấu hình" bị co lại chỉ hiện 1 ký tự

**Người dùng báo:** chụp ảnh màn hình tab "Danh mục & cấu hình" — 2 cột đầu bảng "DM_DL — Danh mục
đại lý" chỉ hiện được 1 ký tự (`[`, `(`...), không đọc được/gõ được nội dung, hỏi vì sao "danh mục
đâu thấy chữ mà điền".

**Mức độ:** Trung bình — dữ liệu KHÔNG bị mất (giá trị vẫn còn nguyên trong ô, `renderDMTables()`
gán `inp.value` đúng qua DOM property như bình thường), chỉ là ô nhập quá hẹp nên không nhìn thấy
để đọc/sửa — nhưng ảnh hưởng trực tiếp tới việc quản lý danh mục Đại lý/Hỗ trợ hàng ngày.

**Nguyên nhân:** Bảng `#dmDLTable`/`#dmHTTable` dùng `table-layout` mặc định (`auto`) — với kiểu
này, trình duyệt chia độ rộng cột theo "độ rộng ưu tiên" của nội dung từng cột, mà `<input
type=date>`/`<input type=number>` có độ rộng tối thiểu khá lớn do chính trình duyệt quy định
(không co nhỏ được). Kết quả: 2 cột `<input type=text>` ("Mã ĐL", "Tên đại lý") bị các cột
ngày/số "giành" hết chỗ, co lại chỉ còn vài px — CHỈ lộ rõ khi cửa sổ không đủ rộng (đúng tình
huống ứng dụng desktop Electron chạy cửa sổ hẹp hơn màn hình, hoặc khi thu nhỏ cửa sổ trình
duyệt) — đây là hành vi có sẵn từ bản gốc `BaoCaoNgay.html` (không phải lỗi phát sinh khi tách
file hay khi đóng gói Electron), chỉ là trước giờ chưa ai dùng ở cửa sổ đủ hẹp để lộ ra.

**Cách sửa:** Thêm `<colgroup>` cố định tỉ lệ % từng cột + `table-layout:fixed` cho
`.dmCard table` — đảm bảo 2 cột chữ luôn có độ rộng tối thiểu đủ đọc, không phụ thuộc độ rộng cửa
sổ/mức zoom nữa. **Lưu ý phát hiện thêm khi sửa**: CSS thật sự dùng để hiển thị app nằm trong
khối `<style>` nhúng thẳng trong `index.html` — file `src/styles/main.css` (tách ra từ Phase 1)
**không hề được `import` ở bất kỳ đâu**, là file mồ côi không có tác dụng gì với bản build thực
tế (đã sửa cả 2 nơi cho đồng bộ, tránh nhầm lẫn về sau — xem TODO.md).

**Kiểm chứng:** Dựng lại bằng Playwright, đo `getBoundingClientRect().width` của từng ô nhập ở
dòng đầu bảng DM_DL trước/sau khi sửa: trước — cột "Mã ĐL" 18px/"Tên đại lý" 23px (chỉ hiện 1 ký
tự); sau — 30px/81px (đọc được đầy đủ "D1"/"Duy Thức", "Q1"/"Quang Tèo", "KL"/"Khách Lẻ" trong
ảnh chụp màn hình thật). Chạy lại `test:ui` (KHỚP 100%), `test:features` (22/22),
`test:export-libs` (10/10), `test:config` (23/23) — không có tác dụng phụ nào khác.

---

## [Phase 3.4 — BUG-M4] (Nghiêm trọng) `fmtCell` không được import — Nút Excel/PDF/In đều lỗi ngay khi bấm

**Người dùng báo:** "NÚT XUẤT EXCEL, IN, PDF VÀ XUẤT TẤT CẢ ĐỀU DÙNG KG ĐC" (đều không dùng được).

**Mức độ:** Cao — đây là lỗi ảnh hưởng gần như toàn bộ tính năng xuất báo cáo của app (4/4 nút
xuất chính đều gãy), không phải lỗi phụ.

**Nguyên nhân:** Hàm `fmtCell` (định dạng giá trị ô theo đúng kiểu cột — số/tiền/ngày — dùng
chung khi vẽ bảng lẫn khi xuất Excel/PDF/In) được định nghĩa và `export` từ
`src/components/report-table.js` (tách ra ở Phase 2), nhưng khi `legacy-app.js` import từ file
đó chỉ lấy `renderReportTable`, **bỏ sót `fmtCell`** — trong khi `legacy-app.js` vẫn gọi
`fmtCell(...)` ở 6 chỗ (bên trong `buildPrintSheet`, `buildWorksheet`, và phần định dạng ô cho
Excel/PDF/In). Kết quả: bấm bất kỳ nút xuất nào cũng gặp ngay
`ReferenceError: fmtCell is not defined`. Đây là lỗi tiềm ẩn có từ Phase 2 (lúc tách
`report-table.js`), không bị `esbuild`/`vite build` bắt được (không phải lỗi cú pháp) và không
bị `ui-baseline.mjs` bắt được (bộ test đó không bấm nút xuất) — chỉ lộ ra khi thao tác thật, đúng
như người dùng đã gặp phải.

**Cách sửa:** Thêm `fmtCell` vào import đã có sẵn:
`import { renderReportTable, fmtCell } from './components/report-table.js';` — không đổi logic
nào khác.

**Kiểm chứng:** Viết `tests/test-export-libs.mjs` (Playwright, trình duyệt thật) — bấm lần lượt
nút Excel, PDF, In, "XUẤT TẤT CẢ (Excel)" của báo cáo, xác nhận **không còn lỗi JS nào** và file
tải về là file thật, đọc được (mở lại file `.xlsx` bằng chính package `exceljs`, xác nhận có đúng
dữ liệu, không rỗng) — 10/10 khớp.

---

## [Phase 3.4] Thư viện xuất báo cáo (ExcelJS/jsPDF/jspdf-autotable/Chart.js/XLSX) phụ thuộc CDN — lỗi khi mạng chặn

**Người dùng báo:** cùng báo cáo với [BUG-M4] ở trên ("nút xuất đều dùng kg được") — đây là
nguyên nhân THỨ HAI, độc lập với lỗi `fmtCell`, cùng góp phần vào cùng 1 triệu chứng.

**Mức độ:** Cao — nếu mạng/máy người dùng chặn `cdnjs.cloudflare.com` hoặc `cdn.jsdelivr.net`
(tường lửa công ty, phần mềm diệt virus, ISP chặn...) thì `window.ExcelJS`/`window.jspdf`/`Chart`
không bao giờ được gán, mọi nút xuất Excel/PDF và biểu đồ Dashboard đều gãy — đây chính là kịch
bản mà code gốc đã có sẵn dòng cảnh báo dự phòng ("chưa tải được — kiểm tra kết nối Internet") —
xác nhận đây là rủi ro THẬT đã từng được nhận diện trước, không phải suy đoán.

**Cách sửa:** Chuyển cả 5 thư viện (ExcelJS, jsPDF, jspdf-autotable, Chart.js, xlsx) từ nạp qua
`<script src="https://cdn...">` trong `index.html` sang `import` thẳng qua npm (cả 5 gói đã có
sẵn trong `package.json` từ Phase 1, chỉ chưa từng được `import`/dùng) — Vite đóng gói (bundle)
thẳng vào `dist/index.html`, không còn phụ thuộc mạng để tải thư viện nữa:
- `legacy-app.js`: `import ExcelJS from 'exceljs'; import { jsPDF } from 'jspdf'; import 'jspdf-autotable';` — bỏ toàn bộ các đoạn kiểm tra `window.ExcelJS`/`window.jspdf` và thay
  `new window.jspdf.jsPDF(...)` → `new jsPDF(...)`.
- `components/dashboard.js`: `import Chart from 'chart.js/auto';`.
- `services/excel-import-worker.js`: Worker đọc file "Sổ chi tiết tiền vay" trước đây tự
  `importScripts('https://cdnjs.../xlsx...js')` ngay trong Worker — cùng rủi ro, cùng đã sửa
  bằng cách nhúng thẳng mã nguồn `xlsx.full.min.js` vào chuỗi nguồn Worker qua Vite `?raw` import
  (không phụ thuộc mạng nữa).
- `index.html`: xoá 5 thẻ `<script src="cdn...">` không còn cần thiết.

**Kiểm chứng (nghiêm ngặt hơn bình thường — mô phỏng đúng tình huống người dùng gặp phải):**
`tests/test-export-libs.mjs` **CHẶN HẲN** cả 2 domain CDN (`cdnjs.cloudflare.com`,
`cdn.jsdelivr.net`) bằng `page.route(...).abort('blockedbyclient')` trước khi mở trang, rồi bấm
thử toàn bộ nút xuất (Excel/PDF/In/Xuất tất cả) + kiểm tra Dashboard vẽ được biểu đồ — **10/10
khớp dù mạng bị chặn hoàn toàn**, chứng minh export không còn phụ thuộc CDN nữa.

---

## [BUG-M0] (Nghiêm trọng) `handleTienVayFile` bị bỏ sót hoàn toàn — nút tải file "Sổ chi tiết tiền vay" báo lỗi

**Phát hiện khi:** đang triển khai tính năng Web Worker cho việc đọc file Excel (theo yêu cầu bổ
sung của người dùng) — mở đúng khu vực code cần chuyển sang Worker thì phát hiện hàm nguồn không
hề tồn tại trong bất kỳ module nào đã tách.

**Mức độ:** Cao — người dùng bấm chọn file ở ô "Nguồn dữ liệu — tải file Excel Sổ chi tiết tiền
vay" (tab "Báo cáo ngân hàng") sẽ nhận lỗi `ReferenceError: handleTienVayFile is not defined`
ngay lập tức, tab "Sổ chi tiết tiền vay" sẽ vĩnh viễn trống (0 dòng) vì không cách nào nạp được
dữ liệu — đây là 1 trong 3 báo cáo ngân hàng chính của app.

**Nguyên nhân:** Hàm `handleTienVayFile()` (dòng 837-883 bản gốc, đọc file Excel bằng thư viện
`XLSX`/SheetJS ngay trên trình duyệt) nằm giữa 2 khối code khác đã được trích xuất đúng
(`excelSerialToStr` → `services/report-service.js`, `computeSoTienVay` → cũng đã tách) — khi trích
xuất thủ công theo từng đoạn ở Phase 1, đoạn này bị nhảy qua hoàn toàn, không rơi vào bất kỳ
`sed`/phạm vi trích xuất nào đã dùng. `input#tienVayFileInput` (HTML) và biến `STATE.tienVayRaw`
(store) vẫn còn nguyên — chỉ riêng hàm xử lý sự kiện là bị mất — nên lỗi này KHÔNG bị phát hiện
bởi `esbuild`/`vite build` (không phải lỗi cú pháp) và cũng KHÔNG bị bộ test `ui-baseline.mjs`
bắt được (bộ test đó không click vào nút tải file này) — chỉ lộ ra khi thực sự thao tác đúng
tính năng đó.

**Cách sửa:** Khôi phục đúng 100% logic gốc, tách làm 2 phần theo đúng ranh giới DOM/thuần logic:
- `services/excel-import-worker.js`: phần đọc/parse file (dò dòng tiêu đề có cột "Tổng tiền vay",
  build từng dòng dữ liệu, loại dòng "Total"/"Tổng cộng" lạ) — chạy trong Web Worker (nhân tiện
  đáp ứng luôn yêu cầu bổ sung "Web Worker cho import Excel", xem mục riêng bên dưới).
- `services/tien-vay-import.js`: phần đụng DOM (đọc `file.arrayBuffer()`, cập nhật
  `#tienVayFileStatus`, gán `STATE.tienVayRaw`, gọi `runReport()`) — giữ ở luồng chính.

**Kiểm chứng:**
- Test thuật toán parse bằng package `xlsx` (Node.js): dựng file Excel giả lập đúng cấu trúc
  thật (2 dòng tiêu đề công ty ở trên + dòng "Total" lạ chèn giữa dữ liệu — đúng ca biên đã ghi
  chú trong code gốc) — **6/6 kiểm tra khớp đúng**, bao gồm việc loại đúng dòng "Total" và dòng
  trống, giữ đúng toàn bộ dữ liệu hợp lệ.
- Test Playwright (trình duyệt thật): bắn sự kiện `change` vào `#tienVayFileInput` — **không còn
  `ReferenceError`** (trước khi sửa, đây chính là lỗi sẽ xảy ra).

---

## [BUG-M1] (Nghiêm trọng) Thiếu 2 hằng số font PDF tiếng Việt khi tách CONFIG

**Mức độ:** Cao — nếu không phát hiện, mọi nút "Xuất PDF" sẽ báo lỗi `ReferenceError` ngay khi
bấm, vì hàm `ensurePdfFont(doc)` (dùng để đăng ký font Roboto có dấu tiếng Việt vào jsPDF trước
khi vẽ) tham chiếu 2 biến không tồn tại.

**Nguyên nhân:** 2 hằng số `PDF_FONT_REGULAR_B64`/`PDF_FONT_BOLD_B64` (chuỗi base64 font Roboto,
~456KB tổng cộng) nằm trong khối `CONFIG` của file gốc nhưng **không được copy** khi tách
`config/config.js` — bị bỏ sót vì các giá trị `CONFIG` khác (link Google Sheet, mã HS...) được
gõ lại thủ công, không tự động trích xuất nguyên khối.

**Cách phát hiện:** Sau khi build lần đầu (`npx vite build`), `dist/index.html` chỉ nặng
**108,39 kB** — bất thường so với kỳ vọng (~620KB, vì 2 chuỗi font base64 chiếm phần lớn dung
lượng file gốc). Nghi ngờ thiếu dữ liệu → kiểm tra và xác nhận đúng là thiếu.

**Cách sửa:** Trích xuất lại chính xác 2 chuỗi base64 từ file gốc bằng script Node.js dùng regex
neo đúng khai báo biến (tránh cắt nhầm/thiếu ký tự do chuỗi quá dài), tạo file
`src/config/pdf-fonts.js` export 2 hằng số này, rồi `import` vào `legacy-app.js`.

**Kiểm chứng:**
- So khớp **từng ký tự** 2 chuỗi base64 giữa bản gốc và bản mới (độ dài 228.904 và 227.680 ký
  tự) — khớp 100% (`dist.includes(chuỗi_gốc_đầy_đủ)` = `true` cho cả 2 font).
- Build lại: `dist/index.html` = **564,95 kB** (gzip 250,15 kB) — đúng như kỳ vọng.
- Chạy Playwright (headless Chromium) mở `dist/index.html`: không có `pageerror` nào khi trang
  tải và chạy toàn bộ script khởi tạo (`initEvents`, `loadAllData`...).

---

## [BUG-M2] `const groups` bị gán lại — lỗi cú pháp khi tách `numToWordsVN`

**Mức độ:** Trung bình — nếu không sửa, `npx vite build` **sẽ báo lỗi và không build được**
(không phải lỗi âm thầm), nhưng vẫn được ghi nhận vì đây là sai khác so với bản gốc.

**Nguyên nhân:** Trong bản gốc, biến đếm nhóm 3 chữ số (`groups`) được khai báo bằng `var`
(phạm vi hàm, cho phép gán lại thoải mái). Khi tách sang module ES6 và chuyển quy ước
`var` → `const`/`let` theo best-practice hiện đại, dòng khai báo bị gõ nhầm thành
`const groups = []`, trong khi 2 dòng sau đó **vẫn gán lại** giá trị
(`if (groups.length === 0) groups = [0];`) — `const` không cho phép việc này.

**Cách phát hiện:** `npx esbuild --bundle` báo lỗi cú pháp ngay: *"Cannot assign to 'groups'
because it is a constant"* — bắt được ở bước kiểm tra cú pháp nhanh, trước khi chạy Vite build
đầy đủ.

**Cách sửa:** Đổi `const groups = []` → `let groups = []`. Logic bên trong hàm **không đổi bất
kỳ dòng nào khác**.

**Kiểm chứng:** Viết script so sánh `numToWordsVN()` bản gốc (load qua `vm.runInContext` từ
đúng đoạn code gốc) và bản mới trên 30 giá trị test (gồm các mốc dễ sai: 0, số tròn chục/trăm,
số có "lẻ", số âm, số thập phân, số có nhóm rỗng ở giữa như 1.000.005, số lớn 999.999.999) —
**khớp 100%** cho cả 30 trường hợp.

---

## [BUG-M3] 4 lỗi khai báo trùng lặp khi trích xuất `legacy-app.js` (bắt được trước khi ảnh hưởng runtime)

**Mức độ:** Thấp/Trung bình — đều là lỗi cú pháp chặn build (`esbuild`/`vite` báo lỗi ngay,
không có khả năng lọt qua thành lỗi âm thầm lúc chạy), nhưng liệt kê đầy đủ để minh bạch quá
trình.

| # | Lỗi | Nguyên nhân | Cách sửa |
|---|---|---|---|
| 1 | `var REPORT_KEYS`/`REPORT_TITLES` khai báo trùng | Đã `import` từ `constants/columns.js` nhưng khối EXPORT_SERVICE trích xuất từ file gốc vẫn còn khai báo `var` cục bộ y hệt tên | Xoá khai báo `var` cục bộ, giữ lại `import` |
| 2 | `var BRAND`/`THIN_BORDER`/`OUTER_BORDER_STYLE` khai báo trùng | Tương tự #1, với `constants/brand.js` | Xoá khai báo `var` cục bộ |
| 3 | `function numToWordsVN` khai báo trùng (gồm cả hàm nội bộ `readGroup`) | Tương tự #1, với `utils/number-to-words-vn.js` | Xoá toàn bộ định nghĩa hàm trùng, giữ `import` |
| 4 | Dấu `{` mở khối mồ côi ở cuối file (`if (typeof module !== 'undefined') {` không có phần thân/đóng) | Khi cắt đoạn code gốc theo số dòng để trích xuất, điểm cắt rơi đúng ngay sau dòng mở khối `module.exports` (khối này được dùng để export cho kịch bản kiểm thử Node.js ở bản gốc — không cần thiết trong module ES6 vì đã có `export` riêng từng hàm) | Cắt bỏ toàn bộ đoạn từ dòng mở khối mồ côi trở đi |

**Cách phát hiện:** Cả 4 lỗi đều được bắt bằng `npx esbuild --bundle --format=esm
--outfile=/dev/null` (kiểm tra cú pháp/trùng khai báo nhanh, không cần chạy Vite build đầy đủ)
— dùng như bước kiểm tra nhanh trước khi build chính thức.

**Kiểm chứng:** Sau khi sửa cả 4, `esbuild` và `npx vite build` đều chạy sạch, không còn cảnh
báo trùng khai báo.

---

## Kiểm chứng tổng thể lớp business logic (báo cáo)

Sau khi sửa xong toàn bộ lỗi trên, chạy kịch bản so sánh **bản gốc (`BaoCaoNgay.html`, đã
`require()` qua CommonJS) vs bản mới (module ES6, `import` trực tiếp từng file)** trên dữ liệu
tổng hợp ngẫu nhiên (8 bộ dữ liệu giả lập khác nhau, mỗi bộ 60 dòng phiếu cân + danh mục Hỗ
trợ/Trợ giá/Đại lý + 30 dòng thanh toán):

| Hạng mục kiểm chứng | Số phép so sánh | Kết quả |
|---|---|---|
| Hàm util thuần (`parseDateParts`, `dateKey`, `parseNum`, `fmtMoney`, `fmtKL`, `roundDown3`, `parseCSV`, `csvToObjects`) | 42 | **Khớp 100%** |
| `numToWordsVN` (đọc số ra chữ) | 30 | **Khớp 100%** |
| `computeNhapKeo`, `computeXeCho1h`, `computeThanhToan`, `computeCongNo`, `computeHoTroOrTroGia` (cả 2 hình thức), `computeHoaHongDL` (6 hàm × 8 bộ dữ liệu) | 48 | **Khớp 100%** |
| **Tổng** | **120** | **120/120 khớp — 0 sai khác** |

So sánh bằng `JSON.stringify()` từng ký tự (không làm tròn/bỏ qua khác biệt nhỏ) — xem chi tiết
kịch bản kiểm thử trong `ARCHITECTURE.md §6`.

---

## [2026-09-22] LỖI THẬT, ẢNH HƯỞNG SỐ LIỆU — Đảo Ngày↔Tháng khi cả 2 số ≤12, gây Công nợ sai (4,28 tỷ → 17,44 tỷ)

**Người dùng báo:** file Excel đối chiếu (Power Query, cùng nối vào đúng 2 Google Sheet app
dùng) tính Công nợ ra **4.277.601.000đ**, nhưng app tính ra **17.440.814.000đ** cho cùng khoảng
"Từ ngày 01/09 đến 22/09/2026" — chênh **13.361.629.000đ**. Đồng thời "Tổng hợp Nhập/Thanh toán"
không đúng cấu trúc bản mẫu (xem mục riêng bên dưới nếu áp dụng).

**Quá trình kiểm chứng (không sửa mò):**
1. Đối chiếu công thức: trích M-code (Power Query) thật trong file Excel mẫu — công thức tính
   Công nợ **giống hệt 100%** logic `computeCongNo()` của app (unpaid nếu chưa có thanh toán,
   hoặc có thanh toán nhưng sau ngày báo cáo) → loại trừ khả năng sai công thức.
2. Người dùng xác nhận Refresh All trong Excel (đọc cùng 1 nguồn sống với app) **vẫn ra 4,28
   tỷ** → loại trừ khả năng dữ liệu 2 bên khác nhau theo thời gian → chắc chắn lỗi nằm trong
   cách app tự xử lý dữ liệu sau khi tải về.
3. So từng dòng file app xuất (967 dòng, 17,44 tỷ) với file Excel mẫu (216 dòng, 4,28 tỷ): 762
   dòng dư ra đều là phiếu cân **rất cũ** (23/12/2025 → đầu 07/2026) lẽ ra đã thanh toán từ lâu.
4. Người dùng gửi ảnh chụp Google Sheet nguồn — cột ngày hiển thị dạng `1/10/2026` = **ngày 10
   tháng 1** (không phải ngày 1 tháng 10) — xác nhận cả 2 sheet PHIEUCAN và DNTT_CT đều xuất CSV
   theo định dạng **Tháng/Ngày/Năm** (theo locale của Google Sheet nguồn).

**Nguyên nhân gốc:** `parseDateParts()` (`src/utils/date-utils.js`) khi gặp chuỗi ngày dạng
"X/Y/Năm" mà **cả 2 số đều ≤12** (trường hợp mập mờ, vd "1/10") — mặc định đoán là
**Ngày/Tháng** (kiểu Việt Nam thường gặp), NHƯNG dữ liệu thật của Google Sheet lại là
**Tháng/Ngày** (kiểu Mỹ) → bị đảo Ngày↔Tháng cho MỌI ngày có cả 2 số ≤12 (~1/3 số ngày trong
năm), trong đó nhiều ngày ở nửa đầu năm (tháng 1–9, ngày ≤12) bị đảo thành tháng sau — ví dụ
"Ngày thanh toán" thật là 10/01/2026 (đã thanh toán từ lâu) bị đọc nhầm thành 01/10/2026 (sau kỳ
báo cáo 22/09) → phiếu đó bị tính nhầm là "chưa thanh toán" → cộng dồn sai vào Công nợ. Lỗi này
ảnh hưởng MỌI báo cáo có lọc/sắp xếp theo ngày (không riêng Công nợ) bất cứ khi nào ngày dữ liệu
rơi vào trường hợp mập mờ (cả 2 số ≤12).

**Đã sửa:** đổi mặc định của nhánh mập mờ trong `parseDateParts()` từ `{mo:b, d:a}` (Ngày/Tháng)
sang `{mo:a, d:b}` (Tháng/Ngày) — khớp đúng định dạng dữ liệu nguồn thực tế. 2 nhánh xử lý
trường hợp KHÔNG mập mờ (khi 1 trong 2 số >12, chỉ có 1 cách đọc hợp lệ) giữ nguyên, không đổi.

**Kiểm chứng bằng đúng dữ liệu thật của người dùng (không phải dữ liệu giả lập):**
- `"1/10/2026"` → trước: `{mo:10,d:1}` (01/10 — sai) → sau: `{mo:1,d:10}` (10/01 — đúng, khớp
  ảnh chụp Google Sheet người dùng gửi).
- `"6/2/2026"` → trước: `{mo:2,d:6}` (06/02 — sai) → sau: `{mo:6,d:2}` (02/06 — đúng).
- `"4/3/2026"` → trước: `{mo:3,d:4}` (04/03 — sai) → sau: `{mo:4,d:3}` (03/04 — đúng).
- `"25/12/2025"` (không mập mờ, ngày >12) → cả trước và sau đều ra `{mo:12,d:25}` — không đổi,
  đúng như kỳ vọng (nhánh này không phụ thuộc vào bản vá).

**Chưa kiểm chứng được (cần người dùng xác nhận sau khi cập nhật bản mới):** chưa có dữ liệu
Phiếu cân + DNTT_CT sống để tự chạy lại `computeCongNo()` đối chiếu ra đúng 4,28 tỷ (sandbox này
không truy cập được Google Sheet trực tiếp) — người dùng cần mở lại app bản đã sửa, kiểm tra số
Công nợ có về đúng ~4,2–4,3 tỷ (chênh lệch nhỏ do có thể vài phiếu đã phát sinh/thanh toán thêm
từ lúc lấy số liệu đối chiếu) hay chưa, rồi báo lại.

## [2026-09-22] LỖI THẬT — "Bảng kê 02/TNDN" (Báo cáo ngân hàng) sai nguồn dữ liệu + sai khóa ghép, khiến Số CCCD/Địa chỉ/SĐT trống + Số lượng/Đơn giá/Tổng tiền không đúng số đã chốt thanh toán

**Người dùng phản ánh:** nhiều dòng "Bảng kê 02/TNDN" bị trống "Số CCCD", và khẳng định theo
đúng công thức Power Query gốc thì "về bản chất không bao giờ trống CCCD". Sau đó người dùng
gửi thêm file mẫu gốc `ChungTuNganHang_DH.xlsx` (sheet chính "VAY", có sẵn cả sheet
"BK02_TNDN") và yêu cầu phân tích sâu đúng Power Query của chính file này — vì đây là bằng
chứng chuẩn nhất (không phải suy đoán).

**Trích xuất Power Query (customXml/item1.xml → Formulas/Section1.m), query `BK02_TNDN`:**

```
shared BK02_TNDN = let
    Source = DNTT_CT,                                                     // nguồn = Đề nghị thanh toán
    #"Merged Queries" = Table.NestedJoin(Source, {"Số CT"}, PHIEUCAN, {"So_CT"}, "PHIEUCAN", JoinKind.LeftOuter),
    #"Expanded PHIEUCAN" = ...chỉ lấy "Ngày cân 1"...,
    #"Merged Queries1" = Table.NestedJoin(..., {"Số hợp đồng"}, HD_NCC, {"Số hợp đồng"}, "HD_NCC", JoinKind.LeftOuter),  // CHỈ ghép theo Số hợp đồng
    #"Expanded HD_NCC" = ...lấy "Địa chỉ thường trú","Số CCCD Chủ rừng","Số ĐT DĐ Chủ rừng"...
    ...
in
    // Cột cuối: Ngày cân 1, Họ tên Chủ rừng (từ DNTT_CT), Địa chỉ/CCCD/SĐT (từ HD_NCC),
    // Khối lượng/Đơn giá thanh toán/Thành tiền (từ DNTT_CT), Số CT
```

**Kết luận, 2 lỗi thật trong code app trước đây (`computeBankTNDN` trong `report-service.js`):**

1. **Sai nguồn (Source):** code cũ duyệt từ PHIEUCAN (mọi phiếu cân trong kỳ) rồi mới dò ngược
   sang DNTT_CT — nên phiếu cân CHƯA có đề nghị thanh toán vẫn bị đưa vào báo cáo (không có
   Số hợp đồng → không tra được HD_NCC → CCCD/Địa chỉ trống). Đúng công thức gốc, các dòng này
   không tồn tại trong BK02_TNDN vì nguồn xuất phát là DNTT_CT.
2. **Sai khóa ghép sang HD_NCC:** code cũ ghép bằng khóa GHÉP "Số hợp đồng||Họ tên Chủ rừng".
   Công thức gốc CHỈ ghép bằng "Số hợp đồng" (một mình). Hậu quả: chỉ cần Họ tên Chủ rừng ghi
   khác 1 chút giữa DNTT_CT và HD_NCC (dấu, khoảng trắng, viết hoa/thường...) là khóa ghép cũ
   lệch → Số CCCD/Địa chỉ/SĐT bị trống dù Số hợp đồng vẫn khớp đúng và công thức gốc vẫn tra ra
   được bình thường. Đây là nguyên nhân chính khiến CCCD "về bản chất không bao giờ trống"
   theo công thức gốc nhưng lại trống trên app.
3. (Phụ, phát hiện thêm khi đối chiếu) Số lượng/Đơn giá/Tổng giá thanh toán trước đây lấy từ
   PHIEUCAN (KL hàng (KG)/1000, Đơn giá_TC, Thành tiền của phiếu cân) — đúng công thức gốc phải
   lấy từ DNTT_CT (Khối lượng, Đơn giá thanh toán, Thành tiền của ĐỀ NGHỊ THANH TOÁN đã chốt,
   có thể khác số trên phiếu cân do khấu trừ...).

**Sửa lỗi:**
- Thêm `STATE.hdnccBySoHopDong` (map Số hợp đồng → dòng HD_NCC, khóa đơn — khác `hdmbByKey`
  khóa ghép vẫn giữ nguyên cho báo cáo BKLS xuất khẩu, không đụng tới).
- Viết lại `computeBankTNDN(dntt, phieucanBySoCT, hdnccBySoHopDong, fromKey, toKey)`: duyệt từ
  `dntt` (đề nghị thanh toán), tra "Ngày cân 1" qua `phieucanBySoCT` để lọc theo kỳ báo cáo, tra
  Địa chỉ/CCCD/SĐT qua `hdnccBySoHopDong[r['Số hợp đồng']]`, lấy Số lượng/Đơn giá/Tổng tiền từ
  chính dòng đề nghị thanh toán — đúng 100% công thức Power Query gốc `BK02_TNDN`.
- Cột hiển thị (`BANKTNDN_COLS`), Excel/PDF export không đổi tên field nên không cần sửa gì
  thêm ở tầng UI/export.

**Kiểm chứng:**
- Test độc lập: Họ tên ghi khác kiểu (chữ hoa/thường, dấu) giữa DNTT_CT và HD_NCC nhưng Số hợp
  đồng khớp → CCCD vẫn tra ra đúng (PASS, đúng như công thức gốc — trước đây sẽ bị trống).
- Phiếu cân chưa có đề nghị thanh toán → không xuất hiện trong báo cáo (PASS, đúng công thức
  gốc `Source = DNTT_CT`).
- Dữ liệu demo nội bộ: số dòng "Bảng kê 02/TNDN" đổi từ 40 → 15 dòng sau khi sửa (giảm đúng số
  phiếu cân chưa có đề nghị thanh toán, không phải mất dữ liệu — các dòng bị loại ra đều là
  dòng lẽ ra không nên xuất hiện trong báo cáo này).
- `npm run test:ui` (đã cập nhật baseline vì đây là thay đổi hành vi CHỦ ĐỘNG, đã xác nhận bằng
  chứng) và `npm run test:features` đều PASS sau khi sửa.
