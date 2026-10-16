// Nhúng lại dist/index.html (bản build mới nhất) vào bên trong config.html, dạng base64.
// PHẢI chạy lại script này (npm run build:config) SAU MỖI LẦN `npm run build` nếu định giao
// lại config.html — nếu không, công cụ tạo file cấu hình riêng sẽ tạo ra file dựa trên bản
// dist/index.html CŨ (thiếu tính năng mới thêm sau này).
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DIST_HTML = path.join(ROOT, 'dist/index.html');
const CONFIG_HTML = path.join(ROOT, 'config.html');

if (!fs.existsSync(DIST_HTML)) {
  console.error('Chưa có dist/index.html — chạy "npm run build" trước.');
  process.exit(1);
}

const html = fs.readFileSync(DIST_HTML, 'utf8');
const b64 = Buffer.from(html, 'utf8').toString('base64');

let cfg = fs.readFileSync(CONFIG_HTML, 'utf8');
const marker = /const APP_TEMPLATE_B64 = "[A-Za-z0-9+/=]*";/;
if (!marker.test(cfg)) {
  console.error('Không tìm thấy dòng "const APP_TEMPLATE_B64 = ..." trong config.html — kiểm tra lại file chưa bị sửa cấu trúc.');
  process.exit(1);
}
cfg = cfg.replace(marker, 'const APP_TEMPLATE_B64 = "' + b64 + '";');
fs.writeFileSync(CONFIG_HTML, cfg);
console.log('Đã nhúng dist/index.html (' + html.length + ' ký tự) vào config.html — kích thước config.html mới: ' + fs.statSync(CONFIG_HTML).size + ' bytes.');
