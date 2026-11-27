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

## Kích hoạt và cấu hình công ty trên Windows

1. **Máy cần cài** mở bộ cài rồi bấm **Sao chép** để gửi mã yêu cầu `HAK-R1.…` cho HAK. Giữ cửa sổ mở trong khi chờ phản hồi.
2. **Quản trị viên HAK** mở [HAK-CapPhep.html](desktop-app/licensing/HAK-CapPhep.html), mở khóa bằng file khóa riêng và mật khẩu, rồi dán mã yêu cầu. Mở **Thông tin công ty và nguồn Google Sheets**, điền tên công ty và các thông tin cần dùng. Dán liên kết CSV cho **Phiếu cân** và **Đề nghị thanh toán**. Có thể để trống **Hợp đồng NCC** và **Hồ sơ keo** khi không dùng hai nguồn này. Chọn ngày hết hạn rồi bấm **Tạo file cài đặt HAK**.
3. **Máy cần cài** bấm **Nạp file HAK…** rồi chọn `HAK-CaiDat.haksetup`. Nếu ứng dụng đang hoạt động, dùng **Nạp file cài đặt HAK…** trong menu ứng dụng. Sau khi xác minh chữ ký, thời hạn và đúng máy được duyệt, ứng dụng tự đưa cấu hình vào báo cáo.

Mỗi lần mở bộ cài sinh một mã ngẫu nhiên mới. Phản hồi chỉ có hiệu lực cho lần cài, máy và tài khoản Windows tạo yêu cầu. Mở lại ứng dụng đã cài dùng giấy phép đang còn hạn. HAK có thể tạo file và người nhận có thể nạp file khi offline. Ứng dụng cần Internet để lấy dữ liệu mới từ Google Sheets. File có chứa thông tin công ty và liên kết CSV, vì vậy gửi riêng cho đầu mối được duyệt.

### Cấp lại khi cài lại ứng dụng hoặc Windows

Khi cài lại ứng dụng hoặc Windows, dùng mã yêu cầu mới để cấp phản hồi mới.

1. Máy mở lại bộ cài, sao chép mã yêu cầu mới `HAK-R1.…` và gửi HAK.
2. Quản trị viên mở `HAK-CapPhep.html` bằng Chrome hoặc Edge. Chọn khóa riêng đã mã hóa dùng để cấp file cũ và nhập mật khẩu. Trong **Dùng lại cấu hình khi cài lại**, chọn file `.haksetup` cũ và bấm **Nạp cấu hình từ file cũ**. Công cụ xác minh chữ ký và điền lại thông tin công ty cùng các liên kết Google Sheets, kể cả khi giấy phép cũ đã hết hạn.
3. Kiểm tra thông tin, dán mã yêu cầu mới, chọn ngày hết hạn rồi bấm **Tạo file cài đặt HAK**. Gửi file mới cho người dùng để chọn **Nạp file HAK…**.

Khi không còn file cũ, điền lại cấu hình theo hồ sơ công ty đã duyệt. Giữ một bản file cấp phép ở nơi quản trị viên được phép truy cập để thuận tiện cấp lại.

### Chỉ kích hoạt bằng mã trả lời

1. **Máy cần cài** mở bộ cài và bấm **Sao chép** để gửi mã yêu cầu `HAK-R1.…` cho HAK.
2. **Quản trị viên HAK** mở [HAK-CapPhep.html](desktop-app/licensing/HAK-CapPhep.html), mở khóa bằng file khóa riêng và mật khẩu, dán mã yêu cầu rồi bấm **Tạo mã trả lời**. Công cụ cấp mã `HAK-A1.…` và mặc định hạn dùng 90 ngày. Có thể thay đổi ngày hết hạn.
3. **Máy cần cài** dán mã trả lời vào bộ cài và bấm **Kích hoạt**. Electron xác minh lại khi mở app. Đăng ký và cài bằng cùng tài khoản Windows có TPM hoạt động và .NET Framework 4.8.

Mỗi lần mở trang quản trị, chỉ cần mở khóa một lần để xử lý nhiều máy. Đóng trang sẽ khóa lại. Mã dùng cùng một bộ cài đã đóng với khóa công khai của công ty. Khi hết hạn, ứng dụng mở lại cùng hộp thoại để nhập mã mới. Bộ cài vẫn đọc file giấy phép cũ đặt cạnh EXE.

### Đóng bộ cài trên máy quản trị HAK

- Máy đóng gói dùng Windows với Node.js 22.12 trở lên và .NET SDK có bộ tham chiếu .NET Framework 4.8.
- Mở `desktop-app/Dong-Bo-Cai-HAK.cmd` và đặt mật khẩu quản trị khi được hỏi. Công cụ lưu khóa riêng đã mã hóa tại `%LOCALAPPDATA%\HAK\Issuer\HAK-KhoaRieng.hakkey`, tự đưa phần khóa công khai vào bộ cài và xuất bộ cài cùng `HAK-CapPhep.html` trong `desktop-app/release`.
- Khi cần đóng lại bộ cài, nhập mật khẩu đã dùng. Khi duyệt máy, mở `HAK-CapPhep.html`, chọn cùng file `.hakkey` và cấp file phản hồi như trên. Sao lưu file khóa đã mã hóa để giữ khả năng cấp phép nếu máy quản trị được cài lại.
- Bộ cài đóng cục bộ theo cách này dùng xác minh giấy phép HAK theo máy và được kiểm tra SHA-256. Bộ cài có thể hiện cảnh báo nhà phát hành chưa xác định trên Windows.

### Phát hành có chữ ký Authenticode

Workflow **Release installer** trên GitHub dùng chứng thư Code Signing của đơn vị qua Actions secrets `HAK_WINDOWS_CSC_LINK` và `HAK_WINDOWS_CSC_PASSWORD`. Chứng thư phải dùng được với electron-builder trên runner Windows. Workflow ký SHA-256 với dấu thời gian RFC 3161, kiểm tra trạng thái `Valid` rồi công bố EXE, SHA-256 và bản kê kiểm tra. Khóa riêng nằm trong hệ thống quản lý secrets của đơn vị.

Trên Windows, có thể kiểm tra nhà phát hành và dấu thời gian của file đã tải bằng PowerShell.

```powershell
Get-AuthenticodeSignature -FilePath '.\BaoCaoNgay_Setup.exe' |
  Format-List Status, SignerCertificate, TimeStamperCertificate
```

Job `desktop-upgrade-tests` cài bản 1.0.0 đã công bố và đối chiếu dữ liệu khi cài đè bằng bộ cài mới có chữ ký thử nghiệm. Chứng thư kiểm thử được tạo trên runner tạm thời.

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
