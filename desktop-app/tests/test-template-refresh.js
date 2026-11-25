// Kiểm chứng: sau khi cài BẢN MỚI (app/index.html mẫu thay đổi), lần mở app kế tiếp phải dùng
// báo cáo sinh từ MẪU MỚI — không được tiếp tục mở report.html cũ sinh từ mẫu của lần cài trước.
// Chạy: node tests/test-template-refresh.js   (giả lập module 'electron', không cần mở cửa sổ)
const Module = require('module');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bcn-'));
const userData = path.join(tmp, 'userData'); fs.mkdirSync(userData);
const appDir = path.join(tmp, 'appdir'); fs.mkdirSync(path.join(appDir, 'app'), { recursive: true });
const realTemplate = fs.readFileSync(path.join(__dirname, '..', 'app', 'index.html'), 'utf8');
fs.writeFileSync(path.join(appDir, 'app', 'setup.html'), '<html>setup</html>');
fs.copyFileSync(path.join(__dirname, '..', 'main.js'), path.join(appDir, 'main.js'));
fs.copyFileSync(path.join(__dirname, '..', 'app', 'source-validator.js'), path.join(appDir, 'app', 'source-validator.js'));

let loaded = [], readyCb = null, windowOpenHandler = null, navigationHandler = null, externalUrls = [];
const switches = {};
const handlers = {};
const electronMock = {
  app: { getPath: () => userData, whenReady: () => ({ then: (cb) => { readyCb = cb; } }), on: () => {}, quit: () => {}, commandLine: { appendSwitch: (k, v) => { switches[k] = v; } } },
  BrowserWindow: Object.assign(function () { this.loadFile = (f) => loaded.push(f); this.webContents = { setWindowOpenHandler(fn) { windowOpenHandler = fn; }, on(name, fn) { if (name === 'will-navigate') navigationHandler = fn; }, session: { on() {} } }; this.on = () => {}; }, { getAllWindows: () => [] }),
  Menu: { setApplicationMenu() {}, buildFromTemplate: () => ({}) },
  shell: { openExternal(url) { externalUrls.push(url); return Promise.resolve(); } },
  ipcMain: { handle: (n, fn) => { handlers[n] = fn; } },
};
const origLoad = Module._load;
Module._load = function (req, parent, isMain) { if (req === 'electron') return electronMock; return origLoad.apply(this, arguments); };

function startApp() {
  delete require.cache[require.resolve(path.join(appDir, 'main.js'))];
  loaded = [];
  require(path.join(appDir, 'main.js'));
  readyCb();
  return loaded[loaded.length - 1];
}
let pass = 0, fail = 0;
const check = (n, ok, x) => { ok ? pass++ : fail++; console.log((ok ? 'OK   ' : 'FAIL ') + n + (x ? '  [' + x + ']' : '')); };

// Lần cài 1: mẫu v1 → người dùng cấu hình công ty
fs.writeFileSync(path.join(appDir, 'app', 'index.html'), realTemplate.replace('</body>', '<!--TEMPLATE-V1--></body>'));
startApp();
check('[2026-10-29] Ô ngày theo tiếng Việt: main.js bật --lang=vi', switches.lang === 'vi', switches.lang);
const trustedSetupEvent = { senderFrame: { url: require('url').pathToFileURL(path.join(appDir, 'app', 'setup.html')).toString() } };
const untrustedEvent = { senderFrame: { url: 'https://untrusted.example/path' } };
check('Không cho trang lạ lấy cấu hình', handlers['get-config'](untrustedEvent) === null);
check('Không cho trang lạ sửa cấu hình', handlers['save-config'](untrustedEvent, { TenCty: 'HACK' }).ok === false);
const res = handlers['save-config'](trustedSetupEvent, { TenCty: 'CONG TY THU NGHIEM', PhieuCan: 'https://docs.google.com/spreadsheets/d/e/TEST_PC/pub?output=csv', DNTT: 'https://docs.google.com/spreadsheets/d/e/TEST_DN/pub?output=csv' });
check('Cấu hình lần đầu thành công', res && res.ok, JSON.stringify(res));
const badCfg = handlers['save-config'](trustedSetupEvent, { TenCty: 'FORGED', PhieuCan: 'http://localhost/private', DNTT: 'javascript:alert(1)' });
check('Link sai/không bảo mật bị từ chối ngay tại IPC', badCfg.ok === false);
check('Cấu hình đang dùng giữ nguyên khi đường dẫn không hợp lệ', handlers['get-config'](trustedSetupEvent).TenCty === 'CONG TY THU NGHIEM');
const reportPath = path.join(userData, 'report.html');
check('report.html sinh từ mẫu v1', fs.readFileSync(reportPath, 'utf8').includes('TEMPLATE-V1'));

// Lần cài 2: cài bản MỚI (mẫu v2) rồi mở app
fs.writeFileSync(path.join(appDir, 'app', 'index.html'), realTemplate.replace('</body>', '<!--TEMPLATE-V2--></body>'));
const opened = startApp();
const html = fs.readFileSync(reportPath, 'utf8');
check('Sau khi cài bản mới: mở đúng report.html', opened === reportPath, opened);
check('Sau khi cài bản mới: báo cáo đã dùng MẪU MỚI (v2), không còn mẫu cũ (v1)', html.includes('TEMPLATE-V2') && !html.includes('TEMPLATE-V1'));
check('Sau khi cài bản mới: vẫn giữ đúng cấu hình công ty đã lưu', html.includes('CONG TY THU NGHIEM') && html.includes('https://docs.google.com/spreadsheets/d/e/TEST_PC/pub?output=csv'));

// Lần mở 3: KHÔNG đổi mẫu → không cần sinh lại (không ghi file thừa)
const mtime1 = fs.statSync(reportPath).mtimeMs;
const t = Date.now(); while (Date.now() - t < 30) {}
startApp();
check('Mở lại khi mẫu không đổi: không sinh lại file thừa', fs.statSync(reportPath).mtimeMs === mtime1);

// Người dùng ĐANG dùng bản cũ (đã cấu hình từ trước, chưa có file dấu vân tay) cài bản mới
fs.rmSync(path.join(userData, 'report-template.sha1'), { force: true });
fs.writeFileSync(reportPath, fs.readFileSync(reportPath, 'utf8').replace('TEMPLATE-V2', 'TEMPLATE-OLDINSTALL'));
fs.writeFileSync(path.join(appDir, 'app', 'index.html'), realTemplate.replace('</body>', '<!--TEMPLATE-V3--></body>'));
startApp();
check('Nâng cấp từ bản cũ (chưa có dấu vân tay): tự sinh lại theo mẫu mới', fs.readFileSync(reportPath, 'utf8').includes('TEMPLATE-V3'));

// Mẫu mới bị hỏng (không tìm thấy vị trí thay thế) → vẫn mở được báo cáo cũ, không mất gì
fs.writeFileSync(path.join(appDir, 'app', 'index.html'), '<html>mau hong</html>');
const opened2 = startApp();
check('Mẫu mới lỗi: vẫn mở báo cáo đang có (không bị đẩy về màn hình cấu hình/mất báo cáo)', opened2 === reportPath && fs.readFileSync(reportPath, 'utf8').includes('CONG TY THU NGHIEM'), opened2);

// Security regression: giới hạn protocol bên ngoài và chặn điều hướng cửa sổ tới URL lạ.
windowOpenHandler({ url: 'javascript:alert(1)' });
windowOpenHandler({ url: 'file:///etc/passwd' });
windowOpenHandler({ url: 'customapp://payload' });
check('Không mở giao thức javascript/file/custom ra ngoài', externalUrls.length === 0);
const openResult = windowOpenHandler({ url: 'https://example.org/help' });
check('HTTPS được mở bằng trình duyệt mặc định, popup Electron bị từ chối', externalUrls.length === 1 && externalUrls[0] === 'https://example.org/help' && openResult.action === 'deny');
let prevented = 0;
navigationHandler({ preventDefault() { prevented++; } }, 'https://example.org/foreign');
navigationHandler({ preventDefault() { prevented++; } }, 'file:///tmp/untrusted.html');
check('Chặn điều hướng cửa sổ chính ra website và file lạ', prevented === 2);
navigationHandler({ preventDefault() { prevented++; } }, require('url').pathToFileURL(reportPath).toString());
check('Vẫn cho phép điều hướng tới báo cáo do app quản lý', prevented === 2);

Module._load = origLoad;
fs.rmSync(tmp, { recursive: true, force: true });
console.log('\n=== RESULT: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail ? 1 : 0);
