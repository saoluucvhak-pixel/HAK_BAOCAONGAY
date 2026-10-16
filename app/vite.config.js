import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Build ra DUY NHẤT 1 file dist/index.html (JS + CSS được nhúng inline) — vẫn giữ được
// cách phân phối "mở trực tiếp bằng cách click đúp, không cần server" như bản gốc,
// dù mã nguồn (src/) giờ đã tách thành nhiều module để dễ bảo trì/mở rộng.
export default defineConfig({
  plugins: [viteSingleFile()],
  build: {
    target: 'es2018',
    cssCodeSplit: false,
    assetsInlineLimit: 100 * 1024 * 1024, // nhúng toàn bộ asset (kể cả font base64) vào 1 file
    chunkSizeWarningLimit: 10 * 1024 // file to do nhung font Roboto base64, tat canh bao mac dinh
  }
});
