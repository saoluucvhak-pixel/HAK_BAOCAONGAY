import { $ } from '../utils/dom-utils.js';
import { notify } from '../utils/event-bus.js';
import { getPendingReport } from '../store/report-runtime.js';
import { setStatus } from './data-service.js';
import { logger } from './logger.js';
import { ensureExportLibs } from './export-libs.js';

let busy = false;

/** Nhường một khung hình để trình duyệt hiển thị mốc tiến trình trước bước nặng. */
function nextPaint() {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, 100); // dự phòng nếu cửa sổ đang ẩn
    requestAnimationFrame(() => {
      clearTimeout(timer);
      setTimeout(resolve, 0);
    });
  });
}

export function updateExportProgress(value, description) {
  $('#exportProgressBar').value = value;
  $('#exportProgressLabel').textContent = value + '% — ' + description;
  return nextPaint();
}

export async function writeWorkbook(workbook) {
  await updateExportProgress(85, 'Đóng gói sổ Excel');
  const buffer = await workbook.xlsx.writeBuffer();
  await updateExportProgress(96, 'Chuẩn bị tải file Excel');
  return buffer;
}

export async function savePdf(doc, filename) {
  await updateExportProgress(92, 'Ghi và tải file PDF');
  doc.save(filename);
  return true;
}

/** Chạy một lượt xuất file và chờ báo cáo đang lập hoàn tất. */
export function runExport(label, fn) {
  return async function (...args) {
    if (busy) return;
    busy = true;
    const panel = $('#exportProgress');
    const textEl = $('#statusText'), dotEl = $('#statusDot');
    const prev = { text: textEl.textContent, title: textEl.title, dot: dotEl.className };
    const busyText = 'Đang ' + label + '… (dữ liệu lớn có thể mất vài giây, vui lòng chờ)';
    setStatus(busyText, 'busy');
    panel.hidden = false;
    try {
      await updateExportProgress(5, 'Chuẩn bị thư viện xuất file');
      await ensureExportLibs();
      while (getPendingReport()) await getPendingReport();
      await updateExportProgress(15, 'Chuẩn bị dữ liệu');
      // Một báo cáo mới có thể bắt đầu trong khung hình vừa nhường.
      while (getPendingReport()) await getPendingReport();
      if (await fn.apply(this, args)) {
        await updateExportProgress(100, 'Đã tạo file');
        notify('success', 'Đã tạo file và bắt đầu tải xuống.');
      }
      if (textEl.textContent === busyText) {
        textEl.textContent = prev.text;
        textEl.title = prev.title;
        dotEl.className = prev.dot;
      }
    } catch (err) {
      const message = 'Lỗi khi ' + label + ': ' + (err?.message || String(err));
      logger.error('[Xuất file] ' + message);
      setStatus(message + ' — file chưa được tạo, vui lòng thử lại', 'err');
      notify('error', message);
    } finally {
      setTimeout(() => {
        panel.hidden = true;
        busy = false;
      }, 300);
    }
  };
}
