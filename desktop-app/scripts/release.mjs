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
const requireSignature = process.env.HAK_REQUIRE_SIGNING === '1';
const signingFlag = requireSignature ? ' --config.forceCodeSigning=true' : '';
execSync('npm run dist -- --publish never' + signingFlag, { cwd: ROOT, stdio: 'inherit' });

// Công cụ trong resources được xác thực qua SHA-256 bên trong app.asar. Giữ nguyên byte
// khi đóng gói. Bản dùng riêng trong thư mục registration vẫn được ký Authenticode.
const expectedVerifier = JSON.parse(fs.readFileSync(path.join(ROOT, 'app', 'license-verifier.json'), 'utf8'));
const packagedVerifier = fs.readFileSync(path.join(REL, 'win-unpacked', 'resources', 'HAK-License-runtime.exe'));
const cryptoLibrary = path.join(REL, 'win-unpacked', 'resources', 'BouncyCastle.Cryptography.dll');
if (sha256(packagedVerifier) !== expectedVerifier.sha256 ||
    sha256(fs.readFileSync(cryptoLibrary)) !== expectedVerifier.cryptoSha256) {
  throw new Error('App đã đóng gói chứa công cụ xác minh giấy phép sai SHA-256.');
}

const exeName = fs.readdirSync(REL).find((f) => f.endsWith('.exe') && f.includes('Setup'));
if (!exeName) { console.error('Không thấy file .exe trong release/'); process.exit(1); }
const registration = path.join(REL, 'registration');
fs.mkdirSync(registration, { recursive: true });
fs.copyFileSync(path.join(REL, 'win-unpacked', 'HAK-License.exe'), path.join(registration, 'HAK-License.exe'));
fs.copyFileSync(path.join(ROOT, 'licensing', 'Register-HAK.cmd'), path.join(registration, 'Register-HAK.cmd'));
fs.copyFileSync(cryptoLibrary, path.join(registration, 'BouncyCastle.Cryptography.dll'));
const { publicKey } = JSON.parse(fs.readFileSync(path.join(ROOT, 'build', 'license-policy.json'), 'utf8'));
const adminHtml = fs.readFileSync(path.join(ROOT, 'licensing', 'HAK-CapPhep.html'), 'utf8');
const issuerMeta = /(<meta name="hak-issuer-key" content=")[A-Za-z0-9_-]{43}(">)/;
if (!/^[A-Za-z0-9_-]{43}$/.test(publicKey) || !issuerMeta.test(adminHtml)) {
  throw new Error('Không thể đồng bộ khóa công khai của HTML với bộ cài.');
}
fs.writeFileSync(path.join(REL, 'HAK-CapPhep.html'),
  adminHtml.replace(issuerMeta, (_, start, end) => start + publicKey + end));
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

const bat = fs.readFileSync(path.join(ROOT, 'scripts', 'GHEP_FILE.template.bat'), 'latin1')
  .replace('__SHA256__', hash)
  .replace('__REQUIRE_SIGNATURE__', requireSignature ? '1' : '0')
  .replace('__PARTS__', parts.join(' '))
  .replace('__COPY_PARTS__', parts.map((name) => '"' + name + '"').join('+'))
  .replace(/\r?\n/g, '\r\n');
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
  '(C = Có, K = Không).',
  '',
  'CÁCH THỦ CÔNG (PowerShell hoặc Command Prompt, tại thư mục chứa các file .part):',
  '   cmd /c copy /b ' + parts.join('+') + ' "BaoCaoNgay_Setup.exe"',
  '',
  'KIỂM TRA: Get-FileHash "BaoCaoNgay_Setup.exe" -Algorithm SHA256  — phải khớp:',
  '  SHA256: ' + hash,
  ...(requireSignature ? ['  Authenticode: (Get-AuthenticodeSignature .\\BaoCaoNgay_Setup.exe).Status phải là Valid.'] : []),
  '',
  'Cài đè lên bản cũ được; lần mở đầu tiên app tự cập nhật báo cáo theo bản mới, KHÔNG cần cấu hình lại,',
  'KHÔNG mất danh mục/gán Tàu/thông tin đã nhập. Chi tiết thay đổi: CHANGELOG.md trong mã nguồn.',
  '',
].join('\n');
fs.writeFileSync(path.join(REL, 'HUONG_DAN_GHEP_FILE.txt'), guide, 'utf8');
console.log('4) Đã tạo release/GHEP_FILE.bat và release/HUONG_DAN_GHEP_FILE.txt');
console.log('\nGửi cho người dùng: ' + parts.join(', ') + ', GHEP_FILE.bat, HUONG_DAN_GHEP_FILE.txt');
