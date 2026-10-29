# ARCHITECTURE.md — Kiến trúc dự án (Phase 1: Modular hoá)

## 1. Bối cảnh & ràng buộc

Bản gốc `BaoCaoNgay.html` là 1 file HTML/CSS/JS duy nhất (~2.500 dòng), không cần build,
mở trực tiếp bằng trình duyệt (double-click), không backend — đây là **mô hình phân phối
bắt buộc phải giữ được** vì người dùng cuối (kế toán) không có môi trường Node.js/build tool.

Yêu cầu "enterprise upgrade" (tách `/src/components,/services,/utils,/helpers,/store,
/models,/config,/assets,/pages,/styles,/constants,/events,/plugins`, thêm build step) và mô
hình phân phối 1-file-duy-nhất **mâu thuẫn trực tiếp** nếu làm theo nghĩa đen — vì vậy đã hỏi
lại người dùng qua `AskUserQuestion` trước khi làm, và người dùng đã chọn rõ:
- **Kiến trúc**: tách thành nhiều file thật (`/src/...`) + có build step.
- **Tài liệu**: tạo đủ 6 file riêng theo checklist (chứ không gộp vào 1 file).

## 2. Giải pháp: Vite + `vite-plugin-singlefile`

Dùng [Vite](https://vitejs.dev) làm build tool, với plugin
[`vite-plugin-singlefile`](https://github.com/richardtallent/vite-plugin-singlefile) để build
ra **đúng 1 file** `dist/index.html` duy nhất (toàn bộ JS/CSS đã bundle được inline vào trong,
không còn file `.js`/`.css` rời) — đây là cách **duy nhất** dung hoà được cả 2 yêu cầu:
- Trong quá trình phát triển: code thật sự nằm trong nhiều file `/src/...`, có thể tách theo
  module, có thể mở riêng từng file để sửa, dễ đọc, dễ kiểm thử độc lập (Node.js `import` thẳng
  từng file, xem `compare.mjs` trong phần kiểm chứng của BUG_FIXED.md).
- Khi giao cho người dùng cuối: `npm run build` ra `dist/index.html` — **vẫn là 1 file
  double-click mở được**, không cần server, không cần Node.js ở máy người dùng, giống hệt cách
  dùng bản gốc.

```
app/
├── package.json          # Vite 5, vite-plugin-singlefile, ExcelJS/jsPDF/Chart.js/XLSX (chỉ để khai báo version tham chiếu — xem §3)
├── vite.config.js        # cấu hình build ra 1 file duy nhất
├── index.html             # entry point Vite — <head> nạp 5 thư viện qua CDN, <body> giữ nguyên markup gốc
├── src/
│   ├── config/
│   │   ├── config.js       # CONFIG (link Google Sheet, mã HS, tên công ty...) + STORAGE_KEYS + APP_VERSION
│   │   └── pdf-fonts.js    # 2 hằng số base64 font Roboto (Regular/Bold) nhúng cho jsPDF tiếng Việt có dấu
│   ├── constants/
│   │   ├── columns.js      # định nghĩa cột từng báo cáo (*_COLS), REPORT_KEYS, REPORT_TITLES
│   │   └── brand.js        # BRAND (logo/màu), THIN_BORDER, OUTER_BORDER_STYLE (style Excel)
│   ├── utils/
│   │   ├── date-utils.js       # parseDateParts (có cache), dateKey, fmtDate, fmtTime, inDateRange...
│   │   ├── number-utils.js     # parseNum, fmtMoney, fmtKL, roundDown3
│   │   ├── csv-utils.js        # parseCSV, csvToObjects
│   │   └── number-to-words-vn.js  # numToWordsVN (đọc số tiền ra chữ)
│   ├── services/
│   │   ├── report-service.js   # 13 hàm compute*() — TOÀN BỘ business logic tính báo cáo, pure function
│   │   ├── storage-service.js  # StorageService — lớp bọc localStorage (BƯỚC 9, xem §5)
│   │   ├── logger.js           # Logger — thay console.log rải rác bằng log có cấp độ (BƯỚC 8)
│   │   └── data-service.js     # [Phase 2] fetchCSV/loadAllData — ranh giới DUY NHẤT chạm Google Sheet
│   ├── store/
│   │   └── state.js        # [Phase 2] STATE/TABLES (kho dữ liệu dùng chung), danh mục Đại lý/Hỗ trợ, applyFilters
│   ├── components/
│   │   ├── report-table.js # [Phase 2] render/sort/search/phân trang cho cả 14 bảng báo cáo
│   │   ├── dashboard.js    # [Phase 2] KPI cards + biểu đồ Chart.js
│   │   └── compare.js      # [Phase 2] công cụ đối chiếu số liệu Excel gốc vs HTML
│   ├── styles/
│   │   └── main.css        # CSS gốc, giữ nguyên 100%
│   └── legacy-app.js       # renderDMTables + runReport (điều phối) + EXPORT_SERVICE + modal WO/Bank + init/boot — xem §4
└── dist/index.html         # ← FILE GIAO CHO NGƯỜI DÙNG (build output, double-click mở được)
```

**[Phase 2, đợt này]** đã tách tiếp phần **không phụ thuộc thư viện CDN** — nên kiểm chứng được
đầy đủ bằng bộ test UI tự động (`tests/ui-baseline.mjs`, xem §6) — ra khỏi `legacy-app.js`:
`store/state.js`, `services/data-service.js`, `components/report-table.js`,
`components/dashboard.js`, `components/compare.js`. `legacy-app.js` giảm từ 1.447 → 1.137 dòng
(~21%). Phần **EXPORT_SERVICE** (xuất Excel/PDF, phụ thuộc trực tiếp `window.ExcelJS`/
`window.jspdf`) **vẫn giữ nguyên trong `legacy-app.js`** — sandbox hiện tại chặn domain CDN nên
không thể kiểm chứng file Excel/PDF xuất ra có còn đúng hay không nếu tách vội; xem TODO.md.

### Cạnh phụ thuộc vòng (circular import) — có chủ đích, không phải sơ suất

Các module Phase 2 mới đều cần gọi ngược lại 1 vài hàm còn ở `legacy-app.js`
(`exportExcel`/`exportPDF`/`printSection`/`openBankInfoModal` từ `report-table.js`; `RESULTS`
từ `dashboard.js`/`compare.js`; `runReport` từ `data-service.js`) — trong khi `legacy-app.js`
cũng `import` ngược lại các hàm render từ chính các module đó. Đây LÀ vòng phụ thuộc
(circular dependency) thật sự, nhưng **an toàn trong trường hợp cụ thể này** vì 2 lý do:
1. Mọi hàm liên quan đều là `function` declaration (được hoist toàn bộ trong phạm vi module của
   chính nó khi module chạy) hoặc biến `export let` chỉ đọc/ghi bên trong đúng module khai báo.
2. Không có hàm nào trong số này được GỌI ở cấp module (top-level) — tất cả chỉ được gọi bên
   trong 1 hàm khác (event handler khi người dùng bấm nút, hoặc bên trong `runReport()`), tức
   là sau khi toàn bộ đồ thị module đã chạy xong phần khởi tạo. ES module (qua Vite/esbuild)
   xử lý đúng trường hợp này.

Đã kiểm chứng: `npx esbuild --bundle` từng module không báo lỗi, `npm run build` thành công,
và `npm run test:ui` (bộ test UI tự động) báo **KHỚP 100%** với baseline đã lưu trước khi tách.

## 3. Quyết định: thư viện nặng vẫn nạp qua CDN `<script>`, không `import` qua npm

`ExcelJS`, `jsPDF` (+ `jspdf-autotable`), `Chart.js`, `SheetJS/XLSX` **vẫn được nạp bằng thẻ
`<script src="https://cdn.../...">`** trong `index.html`, giống hệt bản gốc — KHÔNG chuyển
sang `import ExcelJS from 'exceljs'` kiểu ES module, dù các gói này đã có trong
`package.json` (`dependencies`).

**Lý do (đánh đổi có cân nhắc, không phải sơ suất):**
- Toàn bộ ~1.450 dòng `legacy-app.js` (EXPORT_SERVICE) gọi trực tiếp `window.ExcelJS`,
  `window.jspdf.jsPDF`, `XLSX.read(...)`, `new Chart(...)` ở hàng trăm chỗ. Đổi sang `import`
  npm đòi phải sửa lại toàn bộ các lệnh gọi này (tên biến, cách khởi tạo có thể khác giữa bản
  UMD dùng qua CDN và bản ESM qua npm) — rủi ro cao, không tương xứng với lợi ích.
- ExcelJS 4.4.0 qua CDN đã được xác nhận từ phiên làm việc trước là bản **tương thích** với
  cấu trúc XML AutoFilter đang dùng (bản SheetJS/XLSX dùng riêng cho đọc file Excel ngân hàng
  người dùng tải lên, vì lý do tương thích `dateGroupItem` — xem ghi chú trong code gốc).
  Đổi sang gói npm có thể là version khác, chưa được kiểm chứng lại.
- `package.json.dependencies` liệt kê các gói này chỉ để **ghi lại version đang dùng** một cách
  tường minh (thay vì version số ẩn trong URL CDN) — không phải để `import`.

Đây là quyết định **Phase 1**, có thể xem lại ở Phase 2/3 nếu có đủ bộ test tự động để đảm bảo
đổi cách nạp thư viện không làm lệch file Excel/PDF xuất ra (xem TODO.md).

## 4. Vì sao `legacy-app.js` vẫn là 1 khối lớn (chưa tách `/components,/pages,/events...`)

Đây là lựa chọn **"Strangler Fig"** (thay thế dần dần, không viết lại toàn bộ 1 lần):

- **Đã tách thật sự** (lớp thuần logic, không đụng DOM, dễ kiểm thử độc lập bằng Node.js —
  xem `compare.mjs` trong BUG_FIXED.md): `utils/`, `constants/`, `config/`,
  `services/report-service.js`, `services/storage-service.js`, `services/logger.js`.
  Đây là lớp **quan trọng nhất** vì là nơi tính ra số liệu báo cáo — sai ở đây là sai số
  liệu đưa cho kế toán, nên được ưu tiên tách + kiểm chứng kỹ trước.
- **Chưa tách** (còn nguyên trong `legacy-app.js`): `UI_SERVICE` (thao tác DOM, render bảng,
  bind sự kiện nút bấm) và `EXPORT_SERVICE` (xuất Excel/PDF, ~70% khối lượng file). Lý do:
  tách khối này ra thành `/components,/pages,/events` "thật" đòi hỏi 1 bộ test UI tự động
  (vd Playwright click-through từng màn hình, so sánh file Excel/PDF xuất ra trước/sau từng
  bước tách) để đảm bảo **không lặng lẽ đổi hành vi** — làm vội trong 1 lần không có lưới an
  toàn này có rủi ro cao hơn lợi ích, vi phạm nguyên tắc "không đổi chức năng, không giảm trải
  nghiệm" đã được xác nhận. Kế hoạch tách tiếp ở TODO.md (Phase 2/3).

## 5. Các lớp mới được thêm (không đổi hành vi cũ, chỉ bọc lại an toàn hơn)

- **`StorageService`** (`services/storage-service.js`): thay 5 nhóm gọi `localStorage.getItem/
  setItem` rải rác trực tiếp trong code cũ bằng 1 lớp bọc có `try/catch` tập trung (Safari
  riêng tư / bộ nhớ đầy sẽ không làm crash app — trước đây có thể crash), có `get/set` với
  version bọc `{__v, data}` để migrate an toàn nếu đổi cấu trúc dữ liệu lưu về sau, và có
  `exportAll()/importAll()` để xuất/nhập toàn bộ dữ liệu đã nhập (danh mục Đại lý/Hỗ trợ,
  thông tin ngân hàng...) ra 1 file JSON backup. **Đọc dữ liệu cũ người dùng đã lưu trước đây
  (chưa có version bọc) vẫn hoạt động bình thường** — có kiểm tra tương thích ngược trong
  `get()`. Xem TODO.md về việc nối `exportAll/importAll` vào nút bấm UI (chưa làm ở Phase 1).
- **`Logger`** (`services/logger.js`): lớp log có cấp độ (DEBUG/INFO/WARN/ERROR/PERF), cấp độ
  lưu vào `localStorage` để bật/tắt log chi tiết khi cần debug mà không phải sửa code. Chưa
  thay thế hết mọi `console.log` cũ trong `legacy-app.js` (xem TODO.md) — chỉ mới có sẵn để
  dùng dần khi tách tiếp Phase 2/3, tránh sửa quá nhiều chỗ 1 lúc trong lần này.

## 5b. Lớp lưu offline (Phase 4.1 — `services/offline-cache.js`)

```
Google Sheet (CSV công khai)
      │ fetchCSVText()  — thời gian chờ 60s, thử lại 1 lần (data-service.js)
      ├── thành công ──► saveSheetText(url, text)  → IndexedDB "baocaongay-offline"/"sheets" (không chờ)
      │                  parseCSV → csvToObjects → STATE → runReport()
      └── thất bại ────► loadSheetText(url) ── có ──► parseCSV → … (y hệt nhánh online) + cảnh báo OFFLINE
                                            └─ không ─► báo lỗi như trước
```

- Lưu **chuỗi CSV thô**, khoá theo **URL** (nhiều cấu hình công ty trên cùng máy không lẫn nhau).
  Dữ liệu offline đi qua đúng 1 đường parse với online → số liệu offline = online (đã kiểm chứng).
- Mọi lỗi IndexedDB (không hỗ trợ, bị chặn, bản ghi hỏng, mở quá 3 giây) → coi như "không có bản
  lưu", app chạy như trước. Phiên bản kho + migration: xem `MIGRATION.md`.
- Chỉ ĐỌC Google Sheet (theo lựa chọn của người dùng ngày 26/09/2026) — chưa có ghi ngược/Sync
  Engine (xem TODO.md, Lộ trình nền tảng).

## 5c. Bản đồ module sau Phase 4.2 (06/10/2026)

```
src/
  legacy-app.js            điều phối: runReport(), gắn sự kiện (initEvents), khởi động (boot), bắt lỗi toàn cục
  config/ constants/ utils/ store/          cấu hình, hằng số, hàm thuần, kho dữ liệu (STATE/TABLES/danh mục)
  services/
    report-service.js      15 hàm compute*() — TOÀN BỘ nghiệp vụ tính báo cáo (thuần, test được trong Node)
    data-service.js        tải Google Sheet (thời gian chờ, thử lại, kiểm tra cột) + offline-cache.js (IndexedDB)
    export-libs.js         nạp ExcelJS/jsPDF khi cần          export-runner.js  "Đang xuất…", chống bấm lặp, báo lỗi
    export/report-meta.js  tên công ty/tiêu đề/nhãn ngày      export/print-sheet.js   nút In
    export/excel-export.js Excel từng báo cáo + "Xuất tất cả" export/pdf-export.js     PDF dạng bảng
    export/wo-form.js      mẫu WO (modal+Excel+PDF)           export/bank-forms.js    02/TNDN, Phiếu nhập kho, mẫu tiền vay
  components/
    report-table.js  dashboard.js  dm-tables.js  tau-modal.js  number-input.js
```
Import vòng (`export/*`, `dm-tables`, `tau-modal` ↔ `legacy-app.js` cho `RESULTS`/`runReport`) an toàn
vì chỉ dùng trong hàm xử lý sự kiện, không dùng lúc nạp module (giống các module tách ở Phase 2).

## 5d. Báo cáo ngân hàng + chuẩn HAK (Phase 4.4 — 29/10/2026)

```
src/utils/hak-format.js          CẦU NỐI DUY NHẤT tới chuẩn HAK: @hak/accounting-report-standard (số, ngày,
                                 căn lề, độ chính xác) + @hak/smart-filter (đọc ngày gõ tay, tìm không dấu).
                                 number-utils.fmtMoney/fmtKL, report-table.alignClass, Excel/PDF đều đi qua đây.
src/services/loan-model.js       hàm thuần: khoản vay 3 cột TH_VAY (Ngày hạch toán, Ngày chứng từ, Tổng tiền vay), kiểm tra dữ liệu,
                                 parseImportRows (file 3 cột, hoặc nguyên sổ phụ VAY ⇒ lọc isTienVay: Diễn giải ∈ CONFIG.DIEN_GIAI_TIEN_VAY)
src/services/loan-store.js       IndexedDB "baocaongay-khoanvay" — ghi theo giao dịch, có rev chống ghi đè, BÁO lỗi khi không ghi được
src/components/tienvay-summary.js  đầu tab Sổ chi tiết tiền vay: số dư đầu kỳ nhập tay (kho meta) + thẻ số liệu tổng
src/components/stat-cards.js     vẽ hàng thẻ số liệu tổng dùng chung (sổ tiền vay, khoản vay, tổng hợp thanh toán)
src/components/card-fit.js       co chữ số trên thẻ cho vừa khung (Dashboard + thẻ sổ tiền vay)
src/components/loan-editor.js    tab "Cập nhật khoản vay" (bảng, lọc Smart Filter, modal thêm/sửa, nhập Excel)
src/services/excel-import-worker.js  đọc Excel trong Web Worker (đổi ngày theo lịch — BUG-TV02)
```
Luồng (đúng Power Query BKCT_TIENVAY của người dùng — CHANGELOG Phase 4.5):
TH_VAY 3 cột (tab 1, IndexedDB) → `STATE.vayRecords` ─┐ Ngày chung = Ngày hạch toán (tải sổ phụ ⇒ lọc Diễn giải lúc nhập, Tổng tiền vay = Thu)
DNTT_CT (Google Sheet, link cấu hình) → `STATE.dntt` ─┤ THTT_NH: Ngày chung = Ngày thanh toán, Số tấn, Tổng tiền chi = Thành tiền
                                                    └→ `computeSoTienVay()` xếp theo Ngày chung, lũy kế từ đầu sổ → bảng/In/Excel/PDF. `loan-editor` KHÔNG import `legacy-app` (nhận hàm gọi lại
`initLoanEditor(changed)`) để không thêm vòng phụ thuộc. 3 gói `@hak/*` cài từ GitHub, ghim theo commit
trong package.json (npm install cần truy cập github.com).

## 6. Build & kiểm chứng

```bash
cd app
npm install         # cài Vite + vite-plugin-singlefile (chỉ cần máy dev, KHÔNG cần ở máy người dùng cuối)
npm run build        # ra dist/index.html — file duy nhất giao cho người dùng
npm run dev           # (tuỳ chọn) chạy dev server có hot-reload khi đang sửa code
```

Mọi thay đổi ở lớp `services/report-service.js` (business logic) **bắt buộc** phải chạy lại
kịch bản so sánh số liệu cũ/mới (xem quy trình + kết quả trong BUG_FIXED.md và
PERFORMANCE_REPORT.md) trước khi coi là an toàn để giao — đúng quy ước đã thống nhất từ đầu dự
án ("Không được tự ý tối ưu nếu chưa chứng minh").
