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

let loaded = [], readyCb = null;
const handlers = {};
const electronMock = {
  app: { getPath: () => userData, whenReady: () => ({ then: (cb) => { readyCb = cb; } }), on: () => {}, quit: () => {} },
  BrowserWindow: Object.assign(function () { this.loadFile = (f) => loaded.push(f); this.webContents = { setWindowOpenHandler() {}, session: { on() {} } }; this.on = () => {}; }, { getAllWindows: () => [] }),
  Menu: { setApplicationMenu() {}, buildFromTemplate: () => ({}) },
  shell: { openExternal() {} },
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
const res = handlers['save-config'](null, { TenCty: 'CONG TY THU NGHIEM', PhieuCan: 'https://example.com/pc.csv', DNTT: 'https://example.com/dn.csv' });
check('Cấu hình lần đầu thành công', res && res.ok, JSON.stringify(res));
const reportPath = path.join(userData, 'report.html');
check('report.html sinh từ mẫu v1', fs.readFileSync(reportPath, 'utf8').includes('TEMPLATE-V1'));

// Lần cài 2: cài bản MỚI (mẫu v2) rồi mở app
fs.writeFileSync(path.join(appDir, 'app', 'index.html'), realTemplate.replace('</body>', '<!--TEMPLATE-V2--></body>'));
const opened = startApp();
const html = fs.readFileSync(reportPath, 'utf8');
check('Sau khi cài bản mới: mở đúng report.html', opened === reportPath, opened);
check('Sau khi cài bản mới: báo cáo đã dùng MẪU MỚI (v2), không còn mẫu cũ (v1)', html.includes('TEMPLATE-V2') && !html.includes('TEMPLATE-V1'));
check('Sau khi cài bản mới: vẫn giữ đúng cấu hình công ty đã lưu', html.includes('CONG TY THU NGHIEM') && html.includes('https://example.com/pc.csv'));

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

Module._load = origLoad;
fs.rmSync(tmp, { recursive: true, force: true });
console.log('\n=== RESULT: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail ? 1 : 0);
