// Server tĩnh đơn giản, KHÔNG cần cài thêm gì (chỉ dùng module có sẵn của Node.js, không cần
// internet/npm) — chỉ để mở dist/index.html qua http://localhost thay vì mở trực tiếp kiểu
// double-click (file://). Một số trình duyệt/máy chặn app gọi dữ liệu Google Sheet khi mở kiểu
// file://, nhưng lại cho phép bình thường khi mở qua http://localhost — dùng file này để mở
// đúng theo cách chạy được, không cần biết lập trình, không cần "npm run dev".
//
// Cách dùng: double-click "start.bat" (Windows) hoặc "start.sh" (Mac/Linux). File này tự chạy,
// tự mở trình duyệt tới http://localhost:8791 — dùng y hệt như trước, không có gì khác trên
// giao diện.
import http from 'http';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.join(__dirname, 'dist');
const PORT = 8791;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
  var reqPath = decodeURIComponent((req.url || '/').split('?')[0]);
  var filePath = path.join(DIST_DIR, reqPath === '/' ? 'index.html' : reqPath);
  // Chặn truy cập ra ngoài thư mục dist/ (an toàn cơ bản, dù chỉ chạy trên máy của chính người dùng).
  if (!filePath.startsWith(DIST_DIR)) { res.writeHead(403); res.end('Forbidden'); return; }
  fs.readFile(filePath, function (err, data) {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Không tìm thấy: ' + reqPath); return; }
    var ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

server.on('error', function (err) {
  if (err.code === 'EADDRINUSE') {
    console.log('Cổng ' + PORT + ' đang bận (có thể cửa sổ trước chưa đóng hẳn) — mở lại http://localhost:' + PORT + '/index.html là được, không cần chạy lại.');
  } else {
    console.log('Lỗi khởi động server: ' + err.message);
  }
});

server.listen(PORT, function () {
  var url = 'http://localhost:' + PORT + '/index.html';
  console.log('Đang chạy tại: ' + url);
  console.log('(Cứ để cửa sổ này mở trong lúc dùng báo cáo; đóng cửa sổ này hoặc bấm Ctrl+C khi xong việc.)');
  var opener = process.platform === 'win32' ? 'start ""' : (process.platform === 'darwin' ? 'open' : 'xdg-open');
  exec(opener + ' ' + url, function () { /* im lặng nếu máy không tự mở được trình duyệt — người dùng tự copy link ở trên dán vào trình duyệt */ });
});
