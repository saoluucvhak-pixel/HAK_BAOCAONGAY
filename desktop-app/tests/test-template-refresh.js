const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const Module = require('node:module');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hak-managed-report-'));
const appDir = path.join(tmp, 'appdir');
const template = path.join(appDir, 'app', 'index.html');
const report = path.join(tmp, 'report.html');
const config = path.join(tmp, 'company-config.json');
const main = path.join(appDir, 'main.js');
fs.mkdirSync(path.dirname(template), { recursive: true });
fs.copyFileSync(path.join(__dirname, '..', 'main.js'), main);
fs.copyFileSync(path.join(__dirname, '..', 'app', 'source-validator.js'), path.join(appDir, 'app', 'source-validator.js'));
const html = fs.readFileSync(path.join(__dirname, '..', 'app', 'index.html'), 'utf8');
fs.writeFileSync(template, html);
process.resourcesPath = tmp;
const helper = 'test license helper';
fs.writeFileSync(path.join(tmp, 'HAK-License-runtime.exe'), helper);
fs.writeFileSync(path.join(appDir, 'app', 'license-verifier.json'),
  JSON.stringify({ sha256: createHash('sha256').update(helper).digest('hex') }));

const profile = {
  TenCty: 'Công ty Thử nghiệm', DiaChi: 'Đắk Lắk',
  PhieuCan: 'https://docs.google.com/spreadsheets/d/e/TEST_PC/pub?output=csv',
  DNTT: 'https://docs.google.com/spreadsheets/d/e/TEST_DN/pub?output=csv'
};
let active = null;
let pending = null;
let failCommit = false;
let allowLogin = true;
let accountMode = 'direct';
let reportContents;
let loaded = [];
let commands = [];
let ready;
let showError;
let navigation;
let openWindow;
let external = [];
let quits = 0;
const handlers = {};
const switches = {};
const electron = {
  app: {
    isPackaged: true, requestSingleInstanceLock: () => true, getPath: () => tmp,
    whenReady: () => ({ then: (callback) => { ready = callback; } }),
    on() {}, quit() { quits++; },
    commandLine: { appendSwitch: (key, value) => { switches[key] = value; } }
  },
  BrowserWindow: Object.assign(function () {
    this.loadFile = (file) => { loaded.push(file); return Promise.resolve(); };
    this.webContents = {
      setWindowOpenHandler(fn) { openWindow = fn; },
      on(name, fn) { if (name === 'will-navigate') navigation = fn; },
      session: { on() {} }
    };
    reportContents = this.webContents;
    this.on = () => {};
  }, { getAllWindows: () => [] }),
  Menu: { setApplicationMenu() {}, buildFromTemplate: () => ({}) },
  dialog: { showErrorBox: (_title, message) => { showError = message; } },
  shell: { openExternal(url) { external.push(url); return Promise.resolve(); } },
  ipcMain: { handle: (name, fn) => { handlers[name] = fn; } }
};
const encode = (company) => Buffer.from(JSON.stringify(company)).toString('base64');
const originalLoad = Module._load;
Module._load = function (name) {
  if (name === 'electron') return electron;
  if (name === 'node:child_process') return {
    execFile(_file, [command, id], _options, callback) {
      commands.push({ command, id });
      switch (command) {
        case 'check':
          callback(null, { stdout: active ? encode(active) : '' });
          return;
        case 'login':
          if (!allowLogin) {
            callback(Object.assign(new Error('Login canceled'), { code: 1 }));
            return;
          }
          break;
        case 'account-mode':
          callback(null, { stdout: accountMode });
          return;
        case 'configure-account':
          accountMode = id === 'enable' ? 'account' : 'direct';
          callback(null, { stdout: accountMode });
          return;
        case 'enroll-change':
          if (pending) callback(null, { stdout: encode(pending) });
          else callback(Object.assign(new Error('Canceled'), { code: 1 }));
          return;
        case 'commit-change':
          if (failCommit) {
            callback(new Error('Commit failed'));
            return;
          }
          active = pending;
          break;
        case 'discard-change':
          pending = null;
          break;
        default:
          callback(Object.assign(new Error('Unexpected command: ' + command), { code: 1 }));
          return;
      }
      callback(null, { stdout: '' });
    }
  };
  return originalLoad.apply(this, arguments);
};

async function start() {
  delete require.cache[require.resolve(main)];
  require(main);
  loaded = [];
  await ready();
}

async function run() {
  await start();
  assert.deepEqual(loaded, [], 'Ứng dụng cần cấu hình xác minh để mở');
  assert.match(showError, /Cần file cấu hình/);
  assert.equal(quits, 1);

  active = profile;
  allowLogin = false;
  await start();
  assert.deepEqual(loaded, [], 'Hủy đăng nhập không được mở báo cáo');
  assert.equal(quits, 2);
  allowLogin = true;
  await start();
  assert.equal(switches.lang, 'vi');
  assert.deepEqual(loaded, [report]);
  assert.equal(handlers['save-config'], undefined);
  assert.equal(handlers['get-config'], undefined);

  // A replacement of the local projections is discarded on reopening.
  fs.writeFileSync(config, JSON.stringify({ TenCty: 'Tên tự sửa' }));
  fs.writeFileSync(report, '<html>Tên tự sửa</html>');
  fs.writeFileSync(template, html.replace('</body>', '<!--NEW-TEMPLATE--></body>'));
  await start();
  assert.equal(JSON.parse(fs.readFileSync(config, 'utf8')).TenCty, profile.TenCty);
  assert(fs.readFileSync(report, 'utf8').includes('NEW-TEMPLATE'));

  const trusted = { sender: reportContents, senderFrame: { url: pathToFileURL(report).href } };
  const untrusted = { senderFrame: { url: 'https://untrusted.example/' } };
  assert.equal((await handlers['account-mode'](untrusted)).ok, false);
  assert.equal((await handlers['configure-account'](trusted, 'unexpected')).ok, false);
  assert.deepEqual(await handlers['account-mode'](trusted), { ok: true, mode: 'direct' });
  assert.deepEqual(await handlers['configure-account'](trusted, 'enable'), { ok: true, mode: 'account' });
  assert.deepEqual(await handlers['configure-account'](trusted, 'disable'), { ok: true, mode: 'direct' });

  const before = commands.length;
  assert.equal((await handlers['open-config'](untrusted)).ok, false);
  assert.equal(commands.length, before);
  assert.deepEqual(await handlers['open-config'](trusted), { ok: true, canceled: true });
  assert.equal(commands[before].command, 'enroll-change');

  pending = { ...profile, PhieuCan: 'http://localhost/private' };
  assert.equal((await handlers['open-config'](trusted)).ok, false);
  assert.equal(JSON.parse(fs.readFileSync(config, 'utf8')).PhieuCan, profile.PhieuCan);

  pending = { ...profile, DiaChi: 'Địa chỉ mới' };
  failCommit = true;
  assert.equal((await handlers['open-config'](trusted)).ok, false);
  assert.equal(JSON.parse(fs.readFileSync(config, 'utf8')).DiaChi, profile.DiaChi);

  pending = { ...profile, DiaChi: 'Địa chỉ đã duyệt' };
  failCommit = false;
  assert.equal((await handlers['open-config'](trusted)).ok, true);
  assert.equal(JSON.parse(fs.readFileSync(config, 'utf8')).DiaChi, 'Địa chỉ đã duyệt');
  assert.equal(loaded.at(-1), report);
  const commit = commands.findLast((step) => step.command === 'commit-change');
  const enrollment = commands.findLast((step) => step.command === 'enroll-change');
  assert.equal(commit.id, enrollment.id);

  for (const url of ['javascript:alert(1)', 'file:///etc/passwd', 'customapp://payload']) {
    assert.equal(openWindow({ url }).action, 'deny');
  }
  assert.deepEqual(external, []);
  openWindow({ url: 'https://example.org/help' });
  assert.deepEqual(external, ['https://example.org/help']);
  let prevented = 0;
  const event = { preventDefault() { prevented++; } };
  navigation(event, 'https://example.org/foreign');
  navigation(event, 'file:///tmp/untrusted.html');
  navigation(event, trusted.senderFrame.url);
  assert.equal(prevented, 2);
  console.log('PASS: login gate, trusted account settings, managed profiles and rollback.');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => {
  Module._load = originalLoad;
  fs.rmSync(tmp, { recursive: true, force: true });
});
