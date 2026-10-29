# HAK_BAOCAONGAY — Báo cáo ngày HAK


## Cấu trúc

```
app/                    Bản web (Vite → 1 file HTML chạy offline)
  src/
    config/ constants/  Cấu hình, hằng số (link Google Sheet, cột bắt buộc…)
    utils/              Ngày, số, tìm kiếm không dấu
    store/state.js      Trạng thái dùng chung
    services/           Đọc dữ liệu (data-service), tính báo cáo (report-service),
                        lưu offline (offline-cache), nạp thư viện xuất file khi cần (export-libs),
                        export/ (Excel, PDF, in, mẫu WO / ngân hàng)
    components/         Bảng báo cáo, dashboard, so sánh, danh mục, gán Tàu, ô nhập số,
                        loan-editor (tab Cập nhật khoản vay)
    utils/hak-format.js Cầu nối tới chuẩn HAK (định dạng số/ngày, căn lề, Smart Filter)
    legacy-app.js       Khởi động + gắn sự kiện (294 dòng)
  tests/                Bộ kiểm thử Playwright/Node (xem README.md trong app)
  scripts/              build-config-html.mjs (tạo config.html)
  *.md                  CHANGELOG, ARCHITECTURE, PERFORMANCE_REPORT, TODO, MIGRATION, BUG_FIXED
desktop-app/            Vỏ Electron (Windows)
  main.js, preload.js   Tiến trình chính (contextIsolation + sandbox)
  scripts/release.mjs   Đóng bộ cài + chia .part + tạo GHEP_FILE.bat
  tests/                Kiểm thử tự cập nhật mẫu báo cáo
```

## Yêu cầu
Node.js 18 trở lên (chỉ cần ở máy phát triển — người dùng cuối KHÔNG cần cài Node).
`npm install` tải 3 gói chuẩn HAK trực tiếp từ GitHub (ghim theo commit trong `app/package.json`):
HAK_ACCOUNTING_REPORT_STANDARD, HAK_SMART_FILTER, HAK-Enterprise-Design-System.

## Build bản web
```
cd app
npm install
npm run build          # → dist/index.html
npm run build:config   # → config.html (trang cấu hình địa chỉ Google Sheet)
```

## Kiểm thử (chạy hết trước mỗi lần giao bản)
```
npm run test:export-golden   # 36 file xuất phải khớp mẫu chuẩn
npm run test:ui
npm run test:features
npm run test:tau
npm run test:perf-equivalence
npm run test:error-handling
npm run test:ng-codes
npm run test:offline
npm run test:dm-recalc
npm run test:number-input
npm run test:export-libs
npm run test:pdf-money-wrap
npm run test:pdf-custom-money-wrap
npm run test:print-blankpage
npm run test:print-total-row
npm run test:config
npm run test:tienvay-import
npm run test:khoanvay
npm run test:khoanvay-model
npm run test:hak-theme
npm run test:theme-picker
npm run test:dashboard-fit
```
Lần đầu cần Chromium cho Playwright: `npx playwright install chromium`.
Nếu cố ý thay đổi file xuất: `node tests/test-export-golden.mjs --update` (ghi lại mẫu chuẩn) — chỉ làm khi đã kiểm tra bằng mắt.

## Đóng bộ cài Windows
```
cd desktop-app
npm install
npm run release        # → release/BaoCaoNgay_Setup_00..02.part, GHEP_FILE.bat, HUONG_DAN_GHEP_FILE.txt
node tests/test-template-refresh.js
```
Đóng trên Linux/Mac cần Wine; đóng trực tiếp trên Windows thì không cần.

Bản web dùng ngay (không cần cài): `app/dist/index.html`. Trang cấu hình Google Sheet: `app/config.html`.
