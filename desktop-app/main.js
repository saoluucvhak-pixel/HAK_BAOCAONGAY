/**
 * Ứng dụng desktop (Electron) cho "Báo cáo ngày" — dùng chung cho các đơn vị HAK Group
 * (HAK, Chi nhánh Quế Sơn, Đại Hiệp, HAKQN...), không phải riêng Đại Hiệp nữa.
 *
 * [Phase 2 — cấu hình theo công ty] Trước đây app chỉ đóng gói cứng 1 bản báo cáo Đại Hiệp.
 * Theo yêu cầu người dùng ("tạo bộ cài điền config sẵn rồi áp dụng từng công ty"), giờ đây:
 * - `app/index.html` là bản MẪU GỐC (nguyên trạng bản build Đại Hiệp, KHÔNG bao giờ bị ghi đè)
 *   — dùng làm nguồn để tìm-và-thay-thế (cùng kỹ thuật, cùng logic ĐÃ KIỂM CHỨNG với công cụ
 *   web `config.html`: mỗi giá trị mặc định chỉ xuất hiện ĐÚNG 1 LẦN trong file mẫu, an toàn để
 *   thay nguyên khối).
 * - Lần mở app ĐẦU TIÊN (chưa có cấu hình nào lưu trong thư mục dữ liệu người dùng của máy),
 *   hiện màn hình `app/setup.html` yêu cầu điền Tên công ty + link Google Sheet riêng của đơn vị
 *   đó. Lưu xong, main.js tự sinh ra bản báo cáo ĐÃ THAY ĐÚNG công ty (`report.html`, lưu trong
 *   thư mục dữ liệu người dùng, KHÔNG đụng tới `app/index.html` gốc) rồi mở luôn báo cáo đó.
 * - Những lần mở SAU sẽ vào thẳng báo cáo đã cấu hình, không hỏi lại — có thể đổi cấu hình bất kỳ
 *   lúc nào qua menu "Báo cáo ngày → Đổi cấu hình công ty...".
 *
 * KHÔNG đổi hành vi/nghiệp vụ của app báo cáo — toàn bộ logic tính toán, xuất Excel/PDF, giao
 * diện... giữ nguyên 100% như bản web gốc; chỉ khác 3 giá trị công ty/link được thay bằng đúng
 * kỹ thuật find-and-replace đã kiểm chứng của `config.html` (xem `scripts/build-config-html.mjs`
 * và phần JS trong `config.html` ở dự án `app/` để đối chiếu — cùng 1 bộ DEFAULTS).
 * @module main
 */
const { app, BrowserWindow, Menu, shell, ipcMain, dialog } = require('electron');
// [CHUẨN HAK — 2026-10-29] Ô chọn ngày (Từ ngày/Đến ngày) hiển thị dd/mm/yyyy như chuẩn HAK, bất kể
// Windows đang để ngôn ngữ gì — ô <input type="date"> theo ngôn ngữ của Chromium. Chỉ đổi hiển thị;
// giá trị bên trong vẫn là yyyy-mm-dd như trước.
app.commandLine.appendSwitch('lang', 'vi');
const path = require('path');
const fs = require('fs');
const { validateUrl, shippingSheetId } = require('./app/source-validator.js');

let mainWindow = null;

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

/** Renderer chỉ được điều hướng giữa trang setup và report đã được app quản lý. */
function isTrustedAppUrl(value) {
  try {
    if (typeof value !== 'string' || !value.startsWith('file:')) return false;
    const { fileURLToPath } = require('url');
    const p = path.normalize(fileURLToPath(value));
    return p === path.normalize(SETUP_HTML) || p === path.normalize(REPORT_HTML);
  } catch (e) { return false; }
}

const TEMPLATE_HTML = path.join(__dirname, 'app', 'index.html');
const SETUP_HTML = path.join(__dirname, 'app', 'setup.html');
const CONFIG_JSON = path.join(app.getPath('userData'), 'company-config.json');
const REPORT_HTML = path.join(app.getPath('userData'), 'report.html');

// Cùng 1 bộ giá trị mặc định (Đại Hiệp) với `config.html` — PHẢI khớp byte-for-byte với những gì
// thực sự nằm trong `app/index.html`, nếu không sẽ báo lỗi "không tìm thấy vị trí..." khi lưu.
const DEFAULTS = {
  TenCty: 'CÔNG TY TNHH SXTMDV ĐẠI HIỆP',
  MaHS: '4401220090',
  NhaMay: 'CNHAK',
  PhieuCan: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTj7PHtJtv1iBaF9tCKJ9zgnTyc4j6Hbt9CEYX36sVIDXwJDQUvMGd-O_bc8E-N6iEh5JqH9tytjQLj/pub?output=csv',
  DNTT: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSqRW3Yk2MBgXp1qi29tQZQyn1R-opTUjE5PqBFIH7knAOcr1YvthP_AuXa_10knbaprgtM4i_zPk2i/pub?gid=1612289204&single=true&output=csv',
  HDNCC: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRmYRMAG3XDhHz74P7L1-NrKyPD8Zozp5lPU9rR-_dirOq5UHfSMNdZ4pq4PF5DpI6nosDBlAwW_a10/pub?gid=1578334272&single=true&output=csv',
  Hosokeo: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vT0mcMT2TsD7lOLSNrTqZPVjJJ395kI54SxSri5-n_VxrfAcC74IKkgCnesT30d1bhx59gJC4esmF7s/pub?gid=0&single=true&output=csv',
  XuatHang: 'https://docs.google.com/spreadsheets/d/1ZZ2iUwkkKe8wXdztA7mL-v9j6fmgY5c5rlDdI1sNoAk/edit?usp=sharing',
  BANK_INFO_LITERAL: '{maSoThue:"",diaChi:"",soDienThoai:"",diaChiThuMua:""}',
  WO_INFO_LITERAL: '{maSoThue:"",diaChiThuMua:""}'
};

function replaceOnce(text, oldVal, newVal, label) {
  const idx = text.indexOf(oldVal);
  if (idx === -1) throw new Error('Không tìm thấy vị trí "' + label + '" trong file mẫu — file cài đặt có thể bị lỗi, cài đặt lại ứng dụng.');
  return text.slice(0, idx) + newVal + text.slice(idx + oldVal.length);
}

function jsString(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

function replaceString(text, oldVal, newVal, label) {
  return replaceOnce(text, JSON.stringify(oldVal), jsString(newVal), label);
}

function normalizeShippingLink(value) {
  if (!value || value === DEFAULTS.XuatHang) return DEFAULTS.XuatHang;
  const id = shippingSheetId(value);
  if (id === shippingSheetId(DEFAULTS.XuatHang)) return DEFAULTS.XuatHang;
  return 'https://docs.google.com/spreadsheets/d/' + id + '/edit';
}

/** Sinh lại report.html từ ĐÚNG file mẫu gốc (app/index.html) + dữ liệu cấu hình đã lưu — không
 *  bao giờ thay-thế-chồng-lên-report.html-cũ, tránh lỗi thay 2 lần/tìm không thấy do đã bị đổi. */
function buildReportHtml(cfg, dest = REPORT_HTML) {
  let html = fs.readFileSync(TEMPLATE_HTML, 'utf8');
  html = replaceString(html, DEFAULTS.TenCty, cfg.TenCty, 'Tên công ty');
  if (cfg.MaHS) html = replaceString(html, DEFAULTS.MaHS, cfg.MaHS, 'Mã HS');
  if (cfg.NhaMay) html = replaceString(html, DEFAULTS.NhaMay, cfg.NhaMay, 'Mã nhà máy');
  html = replaceString(html, DEFAULTS.PhieuCan, cfg.PhieuCan, 'Link Phiếu cân');
  html = replaceString(html, DEFAULTS.DNTT, cfg.DNTT, 'Link Đề nghị thanh toán');
  if (cfg.HDNCC) html = replaceString(html, DEFAULTS.HDNCC, cfg.HDNCC, 'Link HD_NCC');
  if (cfg.Hosokeo) html = replaceString(html, DEFAULTS.Hosokeo, cfg.Hosokeo, 'Link Hồ sơ keo');
  const shippingLink = normalizeShippingLink(cfg.XuatHang);
  if (shippingLink !== DEFAULTS.XuatHang) {
    html = replaceString(html, DEFAULTS.XuatHang, shippingLink, 'Link XUATHANG_DN');
  }
  if (cfg.MST || cfg.SDT || cfg.DiaChi || cfg.DiaChiThuMua) {
    const bankInfoNew = '{maSoThue:' + jsString(cfg.MST || '') + ',diaChi:' + jsString(cfg.DiaChi || '') + ',soDienThoai:' + jsString(cfg.SDT || '') + ',diaChiThuMua:' + jsString(cfg.DiaChiThuMua || '') + '}';
    const woInfoNew = '{maSoThue:' + jsString(cfg.MST || '') + ',diaChiThuMua:' + jsString(cfg.DiaChiThuMua || '') + '}';
    html = replaceOnce(html, DEFAULTS.BANK_INFO_LITERAL, bankInfoNew, 'Thông tin mặc định biểu mẫu ngân hàng');
    html = replaceOnce(html, DEFAULTS.WO_INFO_LITERAL, woInfoNew, 'Thông tin mặc định biểu mẫu WO');
  }
  fs.writeFileSync(dest, html, 'utf8');
}

/**
 * [SỬA 2026-09-23 — LỖI NGHIÊM TRỌNG] Trước đây report.html CHỈ được sinh 1 lần (lúc cấu hình lần
 * đầu). Cài bản mới đè lên thì app/index.html (mẫu) được thay, nhưng lần mở sau app vẫn mở
 * report.html CŨ trong thư mục dữ liệu người dùng → MỌI bản sửa lỗi giao sau lần cấu hình đầu
 * tiên KHÔNG có tác dụng trên app desktop (đã tái hiện bằng tests/test-template-refresh.js).
 * Nay lưu "dấu vân tay" (SHA-1) của file mẫu đã dùng để sinh report.html; mỗi lần mở app, nếu mẫu
 * đã đổi (vừa cài bản mới) thì tự sinh lại report.html từ mẫu mới + cấu hình công ty đã lưu.
 * report.html giữ NGUYÊN đường dẫn cũ → dữ liệu người dùng lưu trong app (danh mục Đại lý/Hỗ
 * trợ, gán Tàu, thông tin biểu mẫu...) không bị ảnh hưởng. Nếu sinh lại thất bại (mẫu lỗi) thì
 * vẫn mở báo cáo đang có như trước, không đẩy người dùng về màn hình cấu hình.
 */
const TEMPLATE_STAMP = path.join(app.getPath('userData'), 'report-template.sha1');
function templateHash() {
  return require('crypto').createHash('sha1').update(fs.readFileSync(TEMPLATE_HTML)).digest('hex');
}
function readStamp() { try { return fs.readFileSync(TEMPLATE_STAMP, 'utf8').trim(); } catch (e) { return ''; } }
function writeStamp(h) { try { fs.writeFileSync(TEMPLATE_STAMP, h, 'utf8'); } catch (e) { /* không chặn việc mở app */ } }

function loadSetupOrReport() {
  if (fs.existsSync(CONFIG_JSON)) {
    const hasReport = fs.existsSync(REPORT_HTML);
    let curHash = '';
    try { curHash = templateHash(); } catch (e) { /* không đọc được mẫu: dùng report đang có nếu có */ }
    if (!hasReport || (curHash && curHash !== readStamp())) {
      try {
        buildReportHtml(JSON.parse(fs.readFileSync(CONFIG_JSON, 'utf8')));
        if (curHash) writeStamp(curHash);
      } catch (e) {
        if (!hasReport) { mainWindow.loadFile(SETUP_HTML); return; }
        // Có report cũ dùng được → mở tiếp, không làm mất báo cáo của người dùng.
      }
    }
    mainWindow.loadFile(REPORT_HTML);
  } else {
    mainWindow.loadFile(SETUP_HTML);
  }
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

  loadSetupOrReport();

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openSafeExternalUrl(url);
    return { action: 'deny' };
  });
  // Không cho điều hướng cửa sổ chính tới website bên ngoài rồi dùng preload của app.
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isTrustedAppUrl(url)) event.preventDefault();
  });

  // [Tinh chỉnh #1] Hộp thoại "Lưu file" khi xuất Excel/PDF/sao lưu JSON — thay vì âm thầm lưu
  // vào Downloads.
  mainWindow.webContents.session.on('will-download', (event, item) => {
    item.setSaveDialogOptions({ defaultPath: item.getFilename(), title: 'Lưu file báo cáo' });
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

// ---- IPC: cầu nối với màn hình setup.html (qua preload.js) ----
function isTrustedSetupSender(event) {
  return !!(event && event.senderFrame && isTrustedSetupUrl(event.senderFrame.url));
}

function isTrustedSetupUrl(value) {
  try {
    const { fileURLToPath } = require('url');
    return typeof value === 'string' && value.startsWith('file:') &&
      path.normalize(fileURLToPath(value)) === path.normalize(SETUP_HTML);
  } catch (e) { return false; }
}

const FORESTRY_FOLDER = path.join(app.getPath('userData'), 'forestry-export-folder.json');

function forestryFolder() {
  try {
    const folder = JSON.parse(fs.readFileSync(FORESTRY_FOLDER, 'utf8'));
    return typeof folder === 'string' && path.isAbsolute(folder) ? folder : '';
  } catch { return ''; }
}

function isReportSender(event) {
  const frame = event?.senderFrame;
  if (!frame || !isTrustedAppUrl(frame.url)) return false;
  return !isTrustedSetupUrl(frame.url);
}

function validExportDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00Z');
  return Number.isFinite(+date) && date.toISOString().slice(0, 10) === value;
}

ipcMain.handle('forestry-export-folder', event => isReportSender(event) ? forestryFolder() : '');

ipcMain.handle('choose-forestry-export-folder', async event => {
  if (!isReportSender(event) || !mainWindow) return { ok: false, error: 'Nguồn yêu cầu không được phép.' };
  const selection = await dialog.showOpenDialog(mainWindow, {
    title: 'Chọn thư mục lưu báo cáo kiểm lâm',
    defaultPath: forestryFolder() || app.getPath('documents'),
    properties: ['openDirectory', 'createDirectory'],
  });
  if (selection.canceled || !selection.filePaths.length) return { canceled: true };
  try {
    const folder = selection.filePaths[0];
    fs.writeFileSync(FORESTRY_FOLDER, JSON.stringify(folder));
    return { ok: true, folder };
  } catch {
    return { ok: false, error: 'Không lưu được thiết lập thư mục.' };
  }
});

ipcMain.handle('save-forestry-export', async (event, payload) => {
  if (!isReportSender(event)) return { ok: false, error: 'Nguồn yêu cầu không được phép.' };
  const { from, to, format, bytes } = payload ?? {};
  if (!validExportDate(from) || !validExportDate(to) || from > to ||
      !['xlsx', 'docx'].includes(format) || !(bytes instanceof Uint8Array) ||
      bytes.length < 4 || bytes.length > 64 * 1024 * 1024 ||
      bytes[0] !== 0x50 || bytes[1] !== 0x4b || bytes[2] !== 3 || bytes[3] !== 4) {
    return { ok: false, error: 'Dữ liệu xuất báo cáo không hợp lệ.' };
  }
  const base = forestryFolder();
  if (!base) return { ok: false, error: 'Hãy chọn thư mục lưu báo cáo.' };
  const period = from + '_' + to;
  const folder = path.join(base, period);
  try {
    const realBase = await fs.promises.realpath(base);
    await fs.promises.mkdir(folder).catch(error => { if (error.code !== 'EEXIST') throw error; });
    const realFolder = await fs.promises.realpath(folder);
    if (path.relative(realBase, realFolder) !== period) throw new Error('Thư mục kỳ không hợp lệ.');
    for (let index = 1; index <= 999; index++) {
      const filename = 'BaoCaoKiemLam_' + period + (index === 1 ? '' : '_' + index) + '.' + format;
      const destination = path.join(realFolder, filename);
      const file = await fs.promises.open(destination, 'wx').catch(error => {
        if (error.code !== 'EEXIST') throw error;
        return null;
      });
      if (!file) continue;
      try {
        await file.writeFile(bytes);
        await file.close();
      } catch (error) {
        await file.close().catch(() => {});
        await fs.promises.unlink(destination).catch(() => {});
        throw error;
      }
      return { ok: true, destination };
    }
    return { ok: false, error: 'Đã có quá nhiều file cho kỳ này.' };
  } catch {
    return { ok: false, error: 'Không ghi được báo cáo. Kiểm tra quyền ghi hoặc chọn thư mục khác.' };
  }
});

let reportTheme = {};
function openSetupWithTheme() {
  mainWindow.loadFile(SETUP_HTML, { query: reportTheme });
}

ipcMain.handle('set-report-theme', (event, theme) => {
  if (!isReportSender(event)) return;
  const skin = theme?.skin;
  const mode = theme?.mode;
  if (typeof skin === 'string' && /^(luxe|classic|navy|ngoc|neutral|glass|frost|forest|night)$/.test(skin) &&
      ['auto', 'light', 'dark'].includes(mode)) reportTheme = { skin, mode };
});

ipcMain.handle('back-to-report', event => {
  if (!isTrustedSetupSender(event) || !mainWindow || !fs.existsSync(REPORT_HTML)) {
    return { ok: false, error: 'Chưa có báo cáo để mở.' };
  }
  mainWindow.loadFile(REPORT_HTML);
  return { ok: true };
});

ipcMain.handle('open-config', (event) => {
  // Chỉ trang báo cáo được tạo trong thư mục dữ liệu ứng dụng mới được yêu cầu mở cấu hình.
  if (!event || !event.senderFrame || !isTrustedAppUrl(event.senderFrame.url)) {
    return { ok: false, error: 'Nguồn yêu cầu không được phép.' };
  }
  if (!mainWindow) return { ok: false, error: 'Không có cửa sổ báo cáo.' };
  openSetupWithTheme();
  return { ok: true };
});

ipcMain.handle('get-config', (event) => {
  if (!isTrustedSetupSender(event)) return null;
  if (!fs.existsSync(CONFIG_JSON)) return null;
  try {
    const { TenCty, MST, DiaChi, SDT } = JSON.parse(fs.readFileSync(CONFIG_JSON, 'utf8'));
    return { TenCty, MST, DiaChi, SDT };
  } catch { return null; }
});

ipcMain.handle('save-config', (event, data) => {
  if (!isTrustedSetupSender(event)) return { ok: false, error: 'Yêu cầu thay đổi cấu hình không đến từ màn hình thiết lập.' };
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { ok: false, error: 'Cấu hình gửi lên không hợp lệ.' };
  const cfg = {
    TenCty: String(data.TenCty || '').trim(),
    MaHS: String(data.MaHS || '').trim(),
    NhaMay: String(data.NhaMay || '').trim(),
    PhieuCan: String(data.PhieuCan || '').trim(),
    DNTT: String(data.DNTT || '').trim(),
    HDNCC: String(data.HDNCC || '').trim(),
    Hosokeo: String(data.Hosokeo || '').trim(),
    XuatHang: String(data.XuatHang || '').trim(),
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
    if (!cfg[key]) continue; // nguồn tùy chọn bỏ trống: giữ logic mặc định cũ.
    const error = validateUrl(cfg[key]);
    if (error) return { ok: false, error: key + ': ' + error };
  }

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
    try { writeStamp(templateHash()); } catch (e) { /* không chặn lưu cấu hình */ }
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

  if (mainWindow) mainWindow.loadFile(REPORT_HTML);
  return { ok: true };
});

function buildMenu() {
  const template = [
    {
      label: 'Báo cáo ngày',
      submenu: [
        { label: 'In...', accelerator: 'CmdOrCtrl+P', click: () => mainWindow && mainWindow.webContents.print({ silent: false }) },
        { label: 'Tải lại', accelerator: 'CmdOrCtrl+R', click: () => mainWindow && mainWindow.reload() },
        { type: 'separator' },
        { label: 'Đổi cấu hình công ty...', click: () => mainWindow && openSetupWithTheme() },
        { type: 'separator' },
        { label: 'Công cụ hỗ trợ (DevTools)', accelerator: 'CmdOrCtrl+Shift+I', click: () => mainWindow && mainWindow.webContents.toggleDevTools() },
        { type: 'separator' },
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

app.whenReady().then(() => {
  buildMenu();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('web-contents-created', (_event, contents) => {
  contents.setWindowOpenHandler(({ url }) => { openSafeExternalUrl(url); return { action: 'deny' }; });
});
