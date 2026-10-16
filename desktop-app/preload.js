/**
 * Preload — cầu nối AN TOÀN (contextIsolation:true) giữa màn hình cấu hình
 * (`app/setup.html`, chạy trong renderer, không có quyền Node) và tiến trình chính
 * (`main.js`, nơi thực sự đọc/ghi file cấu hình + sinh lại báo cáo).
 * @module preload
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  /** Lấy cấu hình đã lưu trước đó (để điền sẵn lại form khi bấm "Đổi cấu hình công ty"). */
  getConfig: () => ipcRenderer.invoke('get-config'),
  /** Lưu cấu hình mới — main.js sẽ tự sinh lại báo cáo đúng công ty rồi báo kết quả. */
  saveConfig: (data) => ipcRenderer.invoke('save-config', data)
});
