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

## Đóng bộ cài Windows
```
cd desktop-app
npm ci
npm run release        # → release/BaoCaoNgay_Setup_*.part, GHEP_FILE.bat, HUONG_DAN_GHEP_FILE.txt
node tests/test-template-refresh.js
```
Đóng trên Linux/Mac cần Wine; đóng trực tiếp trên Windows thì không cần.

### Cài trên thiết bị đã được HAK duyệt

Bộ cài 2.2.0 xác minh giấy phép trước khi cài. Electron kiểm tra lại mỗi lần mở. Giấy phép gắn với khóa TPM không xuất được trong tài khoản Windows đăng ký. Cần đăng ký bằng đúng tài khoản sẽ chạy báo cáo. Máy Windows cần TPM hoạt động và .NET Framework 4.8.

1. **Thiết lập một lần trên máy quản trị HAK.** Tạo cặp khóa bằng Node.js theo ví dụ dưới đây. Giữ `private.pem` trong kho quản trị. Nội dung `public.jwk` dùng cho biến Actions `HAK_LICENSE_PUBLIC_KEY` hoặc trường `issuer_public_key` của workflow **Release installer**. Workflow mặc định chỉ tạo artifact. Tùy chọn `publish` đăng lên GitHub Releases.
2. **Đăng ký máy.** Gửi `HAK-License.exe` và `Register-HAK.cmd` đã đóng cùng bản phát hành. Người dùng mở `Register-HAK.cmd` trong tài khoản đã duyệt rồi gửi `HAK-YeuCau.hakreq` cho HAK qua kênh công ty.
3. **Phê duyệt và cấp phép.** Đối chiếu yêu cầu với người sử dụng và mã tài sản. Dùng lệnh `issue` bên dưới, ghi mã giấy phép, tài sản và hạn dùng vào sổ cấp phép. Mỗi file giấy phép chỉ khớp khóa TPM đã đăng ký.
4. **Cài và gia hạn.** Đặt `HAK-GiayPhep.haklic` cạnh bộ cài. Lần sau cùng tài khoản có thể cài đè bằng giấy phép còn hiệu lực đã lưu. Khi ứng dụng yêu cầu gia hạn, chọn file mới ngay trong hộp thoại của Electron.

**Dùng nút bấm:** tải [HAK-CapPhep.html](desktop-app/licensing/HAK-CapPhep.html), mở bằng Chrome hoặc Edge rồi chọn **Tạo khóa**. Chỉ gửi `public.jwk` cho bên đóng bộ cài. Giữ `HAK-KhoaRieng.hakkey` và mật khẩu. Sau này dùng mục **Cấp giấy phép cho máy đã duyệt** trong cùng công cụ để ký giấy phép bằng file `.hakkey`.

**Dùng dòng lệnh:** ví dụ sau tạo định dạng khóa riêng PEM cho công cụ Node.js. Chạy ở gốc repo trên máy quản trị và lưu khóa riêng vào thư mục có quyền truy cập giới hạn.

```powershell
$secret = Read-Host 'Mat khau khoa cap phep HAK' -AsSecureString
$address = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
try {
  $env:HAK_LICENSE_KEY_PASSPHRASE = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($address)
  # Chạy một lần để khởi tạo đơn vị:
  node desktop-app/licensing/admin.mjs keygen 'C:\HAK-Keys\private.pem' 'C:\HAK-Keys\public.jwk'
  # Chạy sau khi duyệt mỗi yêu cầu, với hạn sử dụng do HAK chọn:
  node desktop-app/licensing/admin.mjs issue 'C:\HAK-Keys\private.pem' '.\HAK-YeuCau.hakreq' '.\HAK-GiayPhep.haklic' 'HAK-KT-023' '2027-02-28'
}
finally {
  Remove-Item Env:HAK_LICENSE_KEY_PASSPHRASE -ErrorAction SilentlyContinue
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($address)
}
```

Giấy phép kiểm tra offline theo đồng hồ Windows. Việc thu hồi ngay qua mạng cần một dịch vụ riêng. Cài lại Windows, xóa TPM hoặc đổi tài khoản có thể cần đăng ký lại. Bản HTML web và quyền truy cập nguồn Google Sheets do chính sách phân phối dữ liệu của HAK quản lý riêng.

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
