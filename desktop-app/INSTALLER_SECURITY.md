# HAK_BAOCAONGAY — xác minh bộ cài Windows

## Vấn đề
Một bộ cài Electron chưa có chữ ký Authenticode có thể bị trình duyệt/Windows SmartScreen cảnh báo. Build/test xanh không chứng minh file không có mã độc và không thay thế danh tiếng của nhà phát hành.

## Cơ chế kiểm soát khi build trên main
1. Tạo EXE Windows từ đúng commit đã kiểm thử.
2. Nếu đã cấu hình chứng thư ký số hợp lệ qua GitHub Actions secrets `HAK_WINDOWS_CSC_LINK` và `HAK_WINDOWS_CSC_PASSWORD`, electron-builder ký EXE. Khi có cấu hình chứng thư, job **bắt buộc** xác nhận chữ ký Authenticode `Valid` hoặc từ chối phát hành.
3. Nếu **chưa có chứng thư**, phát hành được đánh dấu minh bạch là `NotSigned` trong `INSTALLER_SECURITY.json`. Không được mô tả bộ cài là đã ký số.
4. Ghi SHA-256 của EXE vào `SHA256SUMS.txt`; tạo báo cáo chữ ký, người ký, thời gian và kết quả kiểm tra Microsoft Defender (nếu máy runner hỗ trợ).
5. Tạo GitHub build-provenance attestation cho EXE từ đúng workflow và commit. **Attestation chứng minh nguồn gốc build, không phải chữ ký Windows hay chứng chỉ an toàn.**
6. Lưu EXE + manifest trong cùng GitHub Actions Artifact. Kiểm tra bản phát hành bằng SHA-256 và nguồn gốc; **không hướng dẫn tắt Google Safe Browsing/SmartScreen**.

## Thiết lập ký số hợp lệ
Chủ sở hữu công ty cần chứng thư Code Signing được phát hành cho tổ chức hoặc dịch vụ ký số đáng tin cậy tương đương. Không lưu chứng thư, mật khẩu hay khóa bí mật trong repo hoặc trong tệp đính kèm của PR.

- GitHub Repository → Settings → Secrets and variables → Actions.
- `HAK_WINDOWS_CSC_LINK`: nội dung base64 của chứng thư PFX/P12 hợp lệ hoặc đường dẫn HTTPS bảo vệ phù hợp (tuân theo cấu hình nhà cung cấp).
- `HAK_WINDOWS_CSC_PASSWORD`: mật khẩu chứng thư.
- Test trên môi trường phát hành có kiểm soát và xác nhận chữ ký `Valid` trước khi sử dụng.

Dùng `WIN_CSC_LINK/WIN_CSC_KEY_PASSWORD` bên trong CI, chỉ tiêm qua GitHub secrets. Không tạo hoặc dùng chứng thư tự ký để giả mạo nhà phát hành.

## Giới hạn và kiểm tra sau build
- Không thể bảo đảm Chrome/Google/SmartScreen sẽ bỏ cảnh báo ngay cả khi đã ký số; uy tín được xây dựng theo lịch sử của nhà phát hành và tệp.
- Trạng thái `windows_defender_status=not_available` nghĩa là **chưa có kết quả quét**; không được xem là chứng nhận sạch.
- Không chuyển tới người sử dụng làm bộ cài đã được nghiệm thu nếu thiếu ký số hoặc chưa có kết quả quét phù hợp với chính sách phát hành.
- Nếu trình duyệt báo nguy hiểm, ghi nhận chính xác nội dung thông báo và yêu cầu đánh giá qua kênh bảo mật chính thức sau khi kiểm tra thành phần và SHA-256. Không đặt tên file khác hoặc chia nhỏ để né cảnh báo.

## Đối chiếu trên Windows (sau khi đã tải qua kênh an toàn)
PowerShell:
```powershell
Get-FileHash "Bao.cao.ngay.Setup.1.0.0.exe" -Algorithm SHA256
Get-AuthenticodeSignature "Bao.cao.ngay.Setup.1.0.0.exe" | Format-List
```
So sánh mã SHA-256 với `SHA256SUMS.txt` của cùng một GitHub Actions run.
