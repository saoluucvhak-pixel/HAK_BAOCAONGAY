/**
 * Preload — cầu nối AN TOÀN (contextIsolation:true) giữa màn hình cấu hình
 * (`app/setup.html`, chạy trong renderer, không có quyền Node) và tiến trình chính
 * (`main.js`, nơi thực sự đọc/ghi file cấu hình + sinh lại báo cáo).
 * @module preload
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  /** Lấy dòng thông tin công ty đã lưu để hiển thị trong màn hình thiết lập. */
  getConfig: () => ipcRenderer.invoke('get-config'),
  /** Lưu cấu hình mới — main.js sẽ tự sinh lại báo cáo đúng công ty rồi báo kết quả. */
  saveConfig: (data) => ipcRenderer.invoke('save-config', data),
  /** Mở màn hình quản lý Google Sheets trong cùng cửa sổ Desktop. */
  openConfig: () => ipcRenderer.invoke('open-config'),
  backToReport: () => ipcRenderer.invoke('back-to-report'),
  setReportTheme: theme => ipcRenderer.invoke('set-report-theme', theme),
  forestryExportFolder: () => ipcRenderer.invoke('forestry-export-folder'),
  chooseForestryExportFolder: () => ipcRenderer.invoke('choose-forestry-export-folder'),
  saveForestryExport: (payload) => ipcRenderer.invoke('save-forestry-export', payload)
});
