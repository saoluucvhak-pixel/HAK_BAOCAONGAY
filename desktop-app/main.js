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
const { app, BrowserWindow, Menu, shell, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow = null;

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
  BANK_INFO_LITERAL: '{maSoThue:"",diaChi:"",soDienThoai:"",diaChiThuMua:""}',
  WO_INFO_LITERAL: '{maSoThue:"",diaChiThuMua:""}'
};

function replaceOnce(text, oldVal, newVal, label) {
  const idx = text.indexOf(oldVal);
  if (idx === -1) throw new Error('Không tìm thấy vị trí "' + label + '" trong file mẫu — file cài đặt có thể bị lỗi, cài đặt lại ứng dụng.');
  return text.slice(0, idx) + newVal + text.slice(idx + oldVal.length);
}

/** Sinh lại report.html từ ĐÚNG file mẫu gốc (app/index.html) + dữ liệu cấu hình đã lưu — không
 *  bao giờ thay-thế-chồng-lên-report.html-cũ, tránh lỗi thay 2 lần/tìm không thấy do đã bị đổi. */
function buildReportHtml(cfg) {
  let html = fs.readFileSync(TEMPLATE_HTML, 'utf8');
  html = replaceOnce(html, DEFAULTS.TenCty, cfg.TenCty, 'Tên công ty');
  if (cfg.MaHS) html = replaceOnce(html, DEFAULTS.MaHS, cfg.MaHS, 'Mã HS');
  if (cfg.NhaMay) html = replaceOnce(html, DEFAULTS.NhaMay, cfg.NhaMay, 'Mã nhà máy');
  html = replaceOnce(html, DEFAULTS.PhieuCan, cfg.PhieuCan, 'Link Phiếu cân');
  html = replaceOnce(html, DEFAULTS.DNTT, cfg.DNTT, 'Link Đề nghị thanh toán');
  if (cfg.HDNCC) html = replaceOnce(html, DEFAULTS.HDNCC, cfg.HDNCC, 'Link HD_NCC');
  if (cfg.Hosokeo) html = replaceOnce(html, DEFAULTS.Hosokeo, cfg.Hosokeo, 'Link Hồ sơ keo');
  if (cfg.MST || cfg.SDT || cfg.DiaChi || cfg.DiaChiThuMua) {
    const bankInfoNew = '{maSoThue:' + JSON.stringify(cfg.MST || '') + ',diaChi:' + JSON.stringify(cfg.DiaChi || '') + ',soDienThoai:' + JSON.stringify(cfg.SDT || '') + ',diaChiThuMua:' + JSON.stringify(cfg.DiaChiThuMua || '') + '}';
    const woInfoNew = '{maSoThue:' + JSON.stringify(cfg.MST || '') + ',diaChiThuMua:' + JSON.stringify(cfg.DiaChiThuMua || '') + '}';
    html = replaceOnce(html, DEFAULTS.BANK_INFO_LITERAL, bankInfoNew, 'Thông tin mặc định biểu mẫu ngân hàng');
    html = replaceOnce(html, DEFAULTS.WO_INFO_LITERAL, woInfoNew, 'Thông tin mặc định biểu mẫu WO');
  }
  fs.writeFileSync(REPORT_HTML, html, 'utf8');
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
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // [Tinh chỉnh #1] Hộp thoại "Lưu file" khi xuất Excel/PDF/sao lưu JSON — thay vì âm thầm lưu
  // vào Downloads.
  mainWindow.webContents.session.on('will-download', (event, item) => {
    item.setSaveDialogOptions({ defaultPath: item.getFilename(), title: 'Lưu file báo cáo' });
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

// ---- IPC: cầu nối với màn hình setup.html (qua preload.js) ----
ipcMain.handle('get-config', () => {
  if (!fs.existsSync(CONFIG_JSON)) return null;
  try { return JSON.parse(fs.readFileSync(CONFIG_JSON, 'utf8')); } catch (e) { return null; }
});

ipcMain.handle('save-config', (event, data) => {
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

  try {
    buildReportHtml(cfg); // luôn sinh lại từ file mẫu gốc — không bao giờ thay chồng lên report.html cũ
    fs.writeFileSync(CONFIG_JSON, JSON.stringify(cfg, null, 2), 'utf8');
    try { writeStamp(templateHash()); } catch (e) { /* không chặn lưu cấu hình */ }
  } catch (e) {
    return { ok: false, error: e.message };
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
        { label: 'Đổi cấu hình công ty...', click: () => mainWindow && mainWindow.loadFile(SETUP_HTML) },
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
  contents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
});
