import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Build ra DUY NHẤT 1 file dist/index.html (JS + CSS được nhúng inline) — vẫn giữ được
// cách phân phối "mở trực tiếp bằng cách click đúp, không cần server" như bản gốc,
// dù mã nguồn (src/) giờ đã tách thành nhiều module để dễ bảo trì/mở rộng.
export default defineConfig({
  plugins: [viteSingleFile()],
  build: {
    // [2026-10-29] es2018 → es2020: thư viện chuẩn HAK_ACCOUNTING_REPORT_STANDARD (định dạng số) dùng
    // BigInt để không sai chữ số với số rất lớn — es2018 không có. es2020 chạy trên Chrome/Edge ≥ 80
    // (2020) và Electron của bản cài; không phải sửa/chép lại thư viện chuẩn.
    target: 'es2020',
    cssCodeSplit: false,
    assetsInlineLimit: 100 * 1024 * 1024, // nhúng toàn bộ asset (kể cả font base64) vào 1 file
    chunkSizeWarningLimit: 10 * 1024 // file to do nhung font Roboto base64, tat canh bao mac dinh
  }
});
