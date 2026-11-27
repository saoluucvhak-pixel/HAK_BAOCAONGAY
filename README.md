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
Node.js 22.12 trở lên (chỉ cần ở máy phát triển — người dùng cuối KHÔNG cần cài Node).
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

## Cấp phép Báo cáo ngày cho từng máy Windows

1. Trên máy quản trị, mở [HAK-CapPhep.html](desktop-app/licensing/HAK-CapPhep.html) bằng Chrome hoặc Edge cập nhật. Mở **Tạo hoặc khôi phục khóa**, đặt mật khẩu rồi bấm **Tạo khóa chung**. Giữ bản sao mã hóa `HAK-KhoaChung.hakkey` và mật khẩu ở nơi an toàn. Trên máy quản trị mới, chọn **Khôi phục khóa** với bản sao đó.
2. Dùng cùng bộ cài Báo cáo ngày cho các máy cần cài. Bộ cài 2.6.0 đã có khóa công khai HAK. Mỗi máy được cấp phản hồi riêng theo mã yêu cầu của lần cài.
3. Người cài sao chép mã yêu cầu `HAK4.…`. HTML hiển thị mã ứng dụng và mã máy. Chọn hoặc nhập công ty rồi bấm **Tạo mã và file HAK**. Gửi lại mã và file `.haksetup`. Người dùng giữ cửa sổ mở, kiểm tra mã rồi nạp file.

Mỗi lần cài lại hoặc đổi cấu hình có mã ngẫu nhiên mới. HAK ký bằng Ed25519. App xác minh chữ ký, hạn dùng, mã ứng dụng và mã máy trước khi mở. Mã máy dùng `MachineGuid` và serial mainboard nếu đọc được. Dự phòng lần lượt dùng UUID phần cứng, serial ổ đĩa đầu tiên rồi `MachineGuid` nếu Windows không cung cấp thông tin phần cứng. Cài lại Windows hoặc thay phần cứng ảnh hưởng đến mã định danh có thể cần HAK cấp lại.

Hồ sơ trong file phản hồi được mã hóa AES-256-GCM cho khóa X25519 riêng của máy và lần yêu cầu. Trạng thái cấp phép trên máy được bảo vệ bằng DPAPI của tài khoản Windows. Trong app, **Cấu hình → Thông tin công ty** chỉ đọc và ẩn link Google Sheets trên giao diện. Thay cấu hình bằng mã và file mới do HAK cấp.

Dùng **Thêm công ty** và **Lưu công ty** để dùng lại thông tin. Phiếu cân và Đề nghị thanh toán là nguồn bắt buộc. Khi đổi máy quản trị, dùng **Sao lưu danh sách công ty** để chuyển hồ sơ. File cấp phép của máy trạm được mã hóa cho máy đó.

### Tài khoản đăng nhập trên Windows

Sau bước nạp file cấu hình ở lần cài đầu tiên, chọn **Một người sử dụng · Bỏ qua** để mở ứng dụng trực tiếp, hoặc **Sử dụng tài khoản đăng nhập** để tạo tên người dùng và mật khẩu. Nếu đã chọn ở bản trước, cài lại hoặc nâng cấp dùng lại chế độ hiện có.

Trong ứng dụng, vào **Cấu hình → Cài đặt chung → Tài khoản đăng nhập**. Chọn **Bật đăng nhập** để đặt tài khoản và mật khẩu. Chọn **Tắt đăng nhập** rồi nhập tài khoản và mật khẩu hiện tại để quay về chế độ một người sử dụng. Mật khẩu cần ít nhất 8 ký tự.

Tài khoản dùng cục bộ trong hồ sơ Windows hiện tại. Ứng dụng lưu thông tin xác minh mật khẩu bằng DPAPI của Windows và dùng chung hồ sơ báo cáo hiện có khi đổi chế độ.

### Phát hành bản nâng cấp

Chạy `desktop-app/Dong-Bo-Cai-HAK.cmd` trên Windows có Node.js 22.12+ và .NET SDK. Công cụ dùng `desktop-app/licensing/HAK-PublicKey.jwk` đã lưu trong kho. Nếu khóa công khai chưa có trong kho, công cụ cho chọn file và lưu tại `%LOCALAPPDATA%\HAK\Issuer` để dùng lại.

GitHub Actions dùng khóa công khai đã lưu trong kho khi chạy **Release installer**. Tham số `issuer_public_key` hoặc biến kho `HAK_LICENSE_PUBLIC_KEY` có thể chỉ định khóa công khai khác. Chọn `publish=true` trên nhánh `main` để phát hành Setup. Khóa riêng và mật khẩu bảo vệ khóa ở lại HAK. Bộ cài chưa ký Authenticode và phát hành kèm SHA-256.

### Đo hiệu năng báo cáo

Chạy trong thư mục `app` sau khi build và cài Chromium của Playwright.

```sh
node tests/benchmark-reports.mjs 10000 30000 100000
```

Dữ liệu giả lập phân đều trong 30 ngày. Kịch bản đo lập báo cáo tháng và xuất báo cáo một ngày. Kết quả JSON ghi thời gian, dung lượng file, heap JavaScript của renderer trước/sau và tác vụ luồng chính dài nhất. Heap JavaScript khác mức RAM toàn ứng dụng.

Kết quả một lượt trên runner Linux, Chromium 156 và 5 CPU logic. Dữ liệu theo tháng dùng để lập báo cáo, còn hai file xuất chỉ lấy một ngày.

| Phiếu cân trong tháng | Phiếu cân ngày xuất | Lập báo cáo tháng | Excel ngày | PDF ngày | Tác vụ luồng chính dài nhất khi xuất PDF |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 10.000 | 334 | 0,19 s | 1,21 s | 0,84 s | 0,37 s |
| 30.000 | 1.000 | 0,79 s | 1,96 s | 1,60 s | 0,88 s |
| 100.000 | 3.334 | 1,95 s | 3,07 s | 3,33 s | 2,52 s |

Với 100.000 phiếu cân, heap của renderer trước/sau lần xuất PDF là 182/269 MiB. Trong cùng lượt, tác vụ luồng chính dài nhất khi xuất Excel là 1,08 s. Hai số đo này xếp bước dàn trang PDF lên trước khi tối ưu xuất file.

Bản web dùng ngay (không cần cài): `app/dist/index.html`. Trang cấu hình Google Sheet: `app/config.html`.
