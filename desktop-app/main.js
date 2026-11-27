// The report is generated from the company profile accepted by the HAK verifier.
const { app, BrowserWindow, Menu, shell, ipcMain, dialog } = require('electron');
// [CHUẨN HAK — 2026-10-29] Ô chọn ngày (Từ ngày/Đến ngày) hiển thị dd/mm/yyyy như chuẩn HAK, bất kể
// Windows đang để ngôn ngữ gì — ô <input type="date"> theo ngôn ngữ của Chromium. Chỉ đổi hiển thị;
// giá trị bên trong vẫn là yyyy-mm-dd như trước.
app.commandLine.appendSwitch('lang', 'vi');
const path = require('path');
const fs = require('fs');
const { validateUrl } = require('./app/source-validator.js');

let mainWindow = null;
let authorizedProfile = null;

/** Chỉ cho phép mở liên kết web thông thường, tránh file:, javascript:, custom protocols. */
function openSafeExternalUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
    if (!url.hostname || url.username || url.password) return false;
    Promise.resolve(shell.openExternal(url.toString())).catch(() => {});
    return true;
  } catch (e) { return false; }
}

/** Check the report URL before allowing its configuration action. */
function isTrustedAppUrl(value) {
  try {
    if (typeof value !== 'string' || !value.startsWith('file:')) return false;
    const { fileURLToPath } = require('url');
    const p = path.normalize(fileURLToPath(value));
    return p === path.normalize(REPORT_HTML);
  } catch (e) { return false; }
}

const TEMPLATE_HTML = path.join(__dirname, 'app', 'index.html');
const CONFIG_JSON = path.join(app.getPath('userData'), 'company-config.json');
const REPORT_HTML = path.join(app.getPath('userData'), 'report.html');

// Khối JSON giữ nguyên qua các phiên bản bundler; không sửa trực tiếp mã JavaScript đã minify.
const COMPANY_TEMPLATE = '<script id="hak-company-config" type="application/json">{}</script>';

function buildReportHtml(cfg, dest = REPORT_HTML) {
  const html = fs.readFileSync(TEMPLATE_HTML, 'utf8');
  if (!html.includes(COMPANY_TEMPLATE)) throw new Error('Không tìm thấy khối cấu hình công ty trong file mẫu.');
  const json = JSON.stringify(cfg).replace(/</g, '\\u003c');
  fs.writeFileSync(dest, html.replace(COMPANY_TEMPLATE, () => COMPANY_TEMPLATE.replace('{}', () => json)), 'utf8');
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    title: 'Báo cáo ngày',
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.js')
    },
    autoHideMenuBar: true
  });

  mainWindow.loadFile(app.isPackaged ? REPORT_HTML : TEMPLATE_HTML);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openSafeExternalUrl(url);
    return { action: 'deny' };
  });
  // Không cho điều hướng cửa sổ chính tới website bên ngoài rồi dùng preload của app.
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isTrustedAppUrl(url) && (app.isPackaged || url !== require('url').pathToFileURL(TEMPLATE_HTML).href)) event.preventDefault();
  });

  // [Tinh chỉnh #1] Hộp thoại "Lưu file" khi xuất Excel/PDF/sao lưu JSON — thay vì âm thầm lưu
  // vào Downloads.
  mainWindow.webContents.session.on('will-download', (event, item) => {
    item.setSaveDialogOptions({ defaultPath: item.getFilename(), title: 'Lưu file báo cáo' });
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

ipcMain.handle('open-config', (event) => {
  if (!app.isPackaged || !event?.senderFrame || !isTrustedAppUrl(event.senderFrame.url)) {
    return { ok: false, error: 'Nguồn yêu cầu không được phép.' };
  }
  return importCompanyFile();
});

function validateCompanyConfig(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { ok: false, error: 'Cấu hình gửi lên không hợp lệ.' };
  const cfg = {
    TenCty: String(data.TenCty || '').trim(),
    MaHS: String(data.MaHS || '').trim(),
    NhaMay: String(data.NhaMay || '').trim(),
    PhieuCan: String(data.PhieuCan || '').trim(),
    DNTT: String(data.DNTT || '').trim(),
    HDNCC: String(data.HDNCC || '').trim(),
    Hosokeo: String(data.Hosokeo || '').trim(),
    MST: String(data.MST || '').trim(),
    SDT: String(data.SDT || '').trim(),
    DiaChi: String(data.DiaChi || '').trim(),
    DiaChiThuMua: String(data.DiaChiThuMua || '').trim()
  };
  if (!cfg.TenCty) return { ok: false, error: 'Cần nhập Tên công ty.' };
  if (!cfg.PhieuCan) return { ok: false, error: 'Cần nhập link Google Sheet "Phiếu cân" (bắt buộc).' };
  if (!cfg.DNTT) return { ok: false, error: 'Cần nhập link Google Sheet "Đề nghị thanh toán" (bắt buộc).' };
  // Kiểm tra lần nữa tại main process: không tin tưởng dữ liệu renderer gửi qua IPC.
  for (const key of ['PhieuCan', 'DNTT', 'HDNCC', 'Hosokeo']) {
    if (!cfg[key]) continue; // Các nguồn tùy chọn được phép để trống.
    const error = validateUrl(cfg[key]);
    if (error) return { ok: false, error: key + ': ' + error };
  }

  return { ok: true, config: cfg };
}

function persistCompanyConfig(cfg) {
  // Dựng 2 file mới trước khi thay bất kỳ cấu hình đang chạy nào.
  // Nếu bước ghi/đổi tên thất bại, trả lại nguyên trạng từ snapshot.
  const tempReport = REPORT_HTML + '.pending';
  const tempConfig = CONFIG_JSON + '.pending';
  let previousReport = null, previousConfig = null;
  let reportReplaced = false, configReplaced = false;
  try {
    previousReport = fs.existsSync(REPORT_HTML) ? fs.readFileSync(REPORT_HTML) : null;
    previousConfig = fs.existsSync(CONFIG_JSON) ? fs.readFileSync(CONFIG_JSON) : null;
    buildReportHtml(cfg, tempReport);
    fs.writeFileSync(tempConfig, JSON.stringify(cfg, null, 2), 'utf8');
    fs.renameSync(tempReport, REPORT_HTML);
    reportReplaced = true;
    fs.renameSync(tempConfig, CONFIG_JSON);
    configReplaced = true;
  } catch (e) {
    let rollbackFailed = false;
    try {
      if (reportReplaced) {
        if (previousReport) fs.writeFileSync(REPORT_HTML, previousReport);
        else fs.rmSync(REPORT_HTML, { force: true });
      }
      if (configReplaced) {
        if (previousConfig) fs.writeFileSync(CONFIG_JSON, previousConfig);
        else fs.rmSync(CONFIG_JSON, { force: true });
      }
    } catch (rollbackError) { rollbackFailed = true; }
    for (const tmp of [tempReport, tempConfig]) {
      try { fs.rmSync(tmp, { force: true }); } catch (cleanupError) { /* không che lỗi chính */ }
    }
    return { ok: false, error: e.message +
      (rollbackFailed ? ' — CẢNH BÁO: không thể hoàn nguyên đầy đủ, cần kiểm tra bộ nhớ.' : ' — cấu hình cũ đã được giữ lại.') };
  }

  return { ok: true };
}

function buildMenu() {
  const template = [
    {
      label: 'Báo cáo ngày',
      submenu: [
        { label: 'In...', accelerator: 'CmdOrCtrl+P', click: () => mainWindow && mainWindow.webContents.print({ silent: false }) },
        { label: 'Tải lại', accelerator: 'CmdOrCtrl+R', click: () => mainWindow && mainWindow.reload() },
        { type: 'separator' },
        ...(!app.isPackaged ? [{ label: 'Công cụ hỗ trợ (DevTools)', accelerator: 'CmdOrCtrl+Shift+I', click: () => mainWindow && mainWindow.webContents.toggleDevTools() }] : []),
        ...(app.isPackaged ? [{ label: 'Đổi cấu hình công ty…', click: importCompanyFile }] : []),
        { role: 'quit', label: 'Thoát' }
      ]
    },
    {
      label: 'Chỉnh sửa',
      submenu: [
        { role: 'undo', label: 'Hoàn tác' }, { role: 'redo', label: 'Làm lại' }, { type: 'separator' },
        { role: 'cut', label: 'Cắt' }, { role: 'copy', label: 'Sao chép' }, { role: 'paste', label: 'Dán' },
        { role: 'selectAll', label: 'Chọn tất cả' }
      ]
    },
    {
      label: 'Xem',
      submenu: [
        { role: 'zoomIn', label: 'Phóng to' }, { role: 'zoomOut', label: 'Thu nhỏ' }, { role: 'resetZoom', label: 'Cỡ chữ mặc định' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Toàn màn hình' }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

const { execFile } = require('node:child_process');
const { createHash, randomBytes } = require('node:crypto');
const { promisify } = require('node:util');
const execLicense = promisify(execFile);

function runLicense(command, args = []) {
  const reference = path.join(__dirname, 'app', 'license-verifier.json');
  const helper = path.join(process.resourcesPath, 'HAK-License-runtime.exe');
  const { sha256 } = JSON.parse(fs.readFileSync(reference, 'utf8'));
  if (createHash('sha256').update(fs.readFileSync(helper)).digest('hex') !== sha256) {
    throw new Error('Công cụ xác minh giấy phép không khớp với bản đóng gói.');
  }
  return execLicense(helper, [command, ...args], { windowsHide: true, timeout: command.startsWith('enroll') ? 0 : 45000 });
}

function readVerifiedProfile(stdout) {
  if (!stdout.trim()) throw new Error('Cần file cấu hình công ty do HAK cấp.');
  const result = validateCompanyConfig(JSON.parse(Buffer.from(stdout.trim(), 'base64').toString('utf8')));
  if (!result.ok) throw new Error(result.error);
  return { ...result.config, _hakCompanyProfile: true };
}

function applyProfile(config) {
  const saved = persistCompanyConfig(config);
  if (!saved.ok) throw new Error(saved.error);
}

let importingCompanyFile = false;
async function importCompanyFile() {
  if (importingCompanyFile || !mainWindow) return { ok: false, error: 'Đang mở xác minh của HAK.' };
  importingCompanyFile = true;
  const session = randomBytes(16).toString('hex');
  try {
    let pending;
    try {
      pending = await runLicense('enroll-change', [session]);
    } catch (error) {
      if (error.code === 1) return { ok: true, canceled: true };
      throw error;
    }
    const next = readVerifiedProfile(pending.stdout);
    applyProfile(next);
    try {
      await runLicense('commit-change', [session]);
    } catch (error) {
      try { applyProfile(authorizedProfile); }
      catch { mainWindow?.close(); }
      throw error;
    }
    authorizedProfile = next;
    await mainWindow?.loadFile(REPORT_HTML);
    return { ok: true };
  } catch (error) {
    const message = error.stderr?.trim() || error.message;
    dialog.showErrorBox('Không đổi được cấu hình công ty', message);
    return { ok: false, error: message };
  } finally {
    await runLicense('discard-change', [session]).catch(() => {});
    importingCompanyFile = false;
  }
}

async function authorizeInstalledApp() {
  let verified;
  const checkOnly = process.argv.includes('--hak-check-license');
  try {
    verified = await runLicense('check');
  } catch (error) {
    if (checkOnly) {
      console.error(error.stderr?.trim() || error.message);
      app.exit(31);
      return false;
    }
    try {
      await runLicense('enroll');
      verified = await runLicense('check');
    } catch (failure) {
      if (failure.code !== 1) {
        dialog.showErrorBox('Không mở được màn hình kích hoạt HAK', failure.stderr?.trim() || failure.message);
      }
      return false;
    }
  }
  try {
    const profile = readVerifiedProfile(verified.stdout);
    if (checkOnly) {
      app.exit(0);
      return false;
    }
    applyProfile(profile);
    authorizedProfile = profile;
    return true;
  } catch (error) {
    if (checkOnly) {
      app.exit(31);
    } else {
      dialog.showErrorBox('Không lưu được cấu hình công ty', error.message);
    }
    return false;
  }
}

async function startApp() {
  const authorized = app.isPackaged ? await authorizeInstalledApp() : true;
  if (!authorized) {
    app.quit();
    return;
  }
  buildMenu();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}
if (app.isPackaged && !process.argv.includes('--hak-check-license') && !app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.whenReady().then(startApp);
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('web-contents-created', (_event, contents) => {
  contents.setWindowOpenHandler(({ url }) => { openSafeExternalUrl(url); return { action: 'deny' }; });
});
