// Đóng bộ cài app desktop "Báo cáo ngày" — chạy được trên Windows/Mac/Linux:  npm run release
// Các bước (đúng quy trình đã dùng cho mọi bản giao):
//  1) Chép bản web mới nhất (../app/dist/index.html) vào app/index.html (file mẫu của app desktop).
//  2) electron-builder → release/"Báo cáo ngày Setup <version>.exe".
//  3) Chia file cài thành các phần ≤ 28 MB (gửi qua Zalo/email có giới hạn dung lượng), kiểm tra ghép
//     lại khớp tuyệt đối (SHA256).
//  4) Sinh GHEP_FILE.bat (nhấp đúp để ghép + kiểm tra SHA256 + mở cài đặt) và HUONG_DAN_GHEP_FILE.txt.
// Trước khi chạy: ở thư mục ../app đã `npm run build && npm run build:config` và chạy đủ bộ test.
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REL = path.join(ROOT, 'release');
const PART_SIZE = 28000000;
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

const webHtml = path.resolve(ROOT, '../app/dist/index.html');
if (!fs.existsSync(webHtml)) { console.error('Không thấy ' + webHtml + ' — vào thư mục app chạy "npm run build" trước.'); process.exit(1); }
fs.copyFileSync(webHtml, path.join(ROOT, 'app', 'index.html'));
console.log('1) Đã chép bản web mới nhất vào app/index.html');

for (const f of fs.existsSync(REL) ? fs.readdirSync(REL) : []) {
  if (/\.part$|\.exe$|\.blockmap$|^GHEP_FILE\.bat$|^HUONG_DAN_GHEP_FILE\.txt$|^builder-debug\.yml$/.test(f)) fs.rmSync(path.join(REL, f), { force: true });
}
console.log('2) Đang đóng bộ cài (electron-builder)...');
execSync('npx electron-builder --win --x64', { cwd: ROOT, stdio: 'inherit' });

const exeName = fs.readdirSync(REL).find((f) => f.endsWith('.exe') && f.includes('Setup'));
if (!exeName) { console.error('Không thấy file .exe trong release/'); process.exit(1); }
const exe = fs.readFileSync(path.join(REL, exeName));
const hash = sha256(exe);
const parts = [];
for (let i = 0, n = 0; i < exe.length; i += PART_SIZE, n++) {
  const name = 'BaoCaoNgay_Setup_' + String(n).padStart(2, '0') + '.part';
  fs.writeFileSync(path.join(REL, name), exe.subarray(i, i + PART_SIZE));
  parts.push(name);
}
const rejoined = Buffer.concat(parts.map((p) => fs.readFileSync(path.join(REL, p))));
if (sha256(rejoined) !== hash) { console.error('LỖI: ghép các phần không khớp file gốc!'); process.exit(1); }
console.log('3) Đã chia ' + parts.length + ' phần, ghép thử khớp tuyệt đối. SHA256 = ' + hash);
if (parts.length !== 3) console.warn('   LƯU Ý: số phần khác 3 — sửa danh sách file trong scripts/GHEP_FILE.template.bat cho khớp.');

const bat = fs.readFileSync(path.join(ROOT, 'scripts', 'GHEP_FILE.template.bat'), 'latin1').replace('__SHA256__', hash).replace(/\r?\n/g, '\r\n');
fs.writeFileSync(path.join(REL, 'GHEP_FILE.bat'), bat, 'latin1');
const guide = [
  'HƯỚNG DẪN GHÉP FILE CÀI ĐẶT (BaoCaoNgay_Setup_*.part) — bản ' + pkg.version + ', đóng ngày ' + new Date().toLocaleDateString('vi-VN'),
  '========================================================',
  '',
  'File cài đặt "' + exeName + '" (~' + Math.round(exe.length / 1048576) + ' MB) được chia thành ' + parts.length + ' file:',
  ...parts.map((p) => '  - ' + p),
  '',
  'CÁCH GHÉP — NHANH NHẤT: đặt các file .part và GHEP_FILE.bat CÙNG 1 thư mục, nhấp đúp GHEP_FILE.bat.',
  'File .bat tự ghép, kiểm tra SHA256 (file hỏng sẽ báo lỗi và tự xoá), rồi hỏi có mở trình cài đặt không',
  '(C = Có, K = Không). Nếu Windows hiện "Windows đã bảo vệ PC của bạn": bấm "Thông tin bổ sung" → "Vẫn chạy".',
  '',
  'CÁCH THỦ CÔNG (PowerShell hoặc Command Prompt, tại thư mục chứa các file .part):',
  '   cmd /c copy /b ' + parts.join('+') + ' "BaoCaoNgay_Setup.exe"',
  '',
  'KIỂM TRA: Get-FileHash "BaoCaoNgay_Setup.exe" -Algorithm SHA256  — phải khớp:',
  '  SHA256: ' + hash,
  '',
  'Cài đè lên bản cũ được; lần mở đầu tiên app tự cập nhật báo cáo theo bản mới, KHÔNG cần cấu hình lại,',
  'KHÔNG mất danh mục/gán Tàu/thông tin đã nhập. Chi tiết thay đổi: CHANGELOG.md trong mã nguồn.',
  '',
].join('\n');
fs.writeFileSync(path.join(REL, 'HUONG_DAN_GHEP_FILE.txt'), guide, 'utf8');
console.log('4) Đã tạo release/GHEP_FILE.bat và release/HUONG_DAN_GHEP_FILE.txt');
console.log('\nGửi cho người dùng: ' + parts.join(', ') + ', GHEP_FILE.bat, HUONG_DAN_GHEP_FILE.txt');
