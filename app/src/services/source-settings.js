/**
 * Quản lý 4 nguồn dữ liệu từ màn hình Cấu hình của báo cáo HTML.
 * Cấu hình lưu riêng trên thiết bị, không ghi đè file HTML và không ảnh hưởng
 * ứng dụng Electron (cấu hình công ty trên Electron được quản lý bởi main.js).
 */
import { CONFIG } from '../config/config.js';
import { logger } from './logger.js';

export const SHEET_SOURCES = Object.freeze([
  { key: 'PHIEUCAN', label: 'Phiếu cân', fields: ['So_CT', 'Khách hàng', 'Ngày cân 1', 'Giờ cân 1', 'Ngày cân 2', 'Giờ cân 2', 'Biển số 1', 'KL hàng (KG)', 'Đơn giá_TC', 'Thành tiền', 'ĐL', 'NG'] },
  { key: 'DNTT_CT', label: 'Đề nghị thanh toán', fields: ['Ngày thanh toán', 'Số hợp đồng', 'Họ tên Chủ rừng', 'Số CT', 'Khối lượng', 'Đơn giá thanh toán', 'Thành tiền'] },
  { key: 'HD_NCC', label: 'Hợp đồng NCC', fields: ['Số hợp đồng', 'Họ tên Chủ rừng', 'Địa chỉ thường trú'] },
  { key: 'HOSOKEO', label: 'Hồ sơ keo', fields: ['Mã hợp đồng', 'Ngày nhập', 'Số BKLS', 'Họ và tên chủ rừng', 'Khối lượng (Tấn)', 'Đơn giá', 'Thanh toán'] }
]);
const STORAGE_KEY = 'baocaongay_source_urls_v1';
const CHECK_TIMEOUT_MS = 12000;

export function isDesktopReport() {
  return typeof location !== 'undefined' && /\/report\.html(?:$|[?#])/i.test(location.pathname);
}

export function validateSheetUrl(raw) {
  if (typeof raw !== 'string' || /['"`<>\\\r\n]/.test(raw)) return 'Đường dẫn chứa ký tự không hợp lệ.';
  let url;
  try { url = new URL(raw); } catch (e) { return 'Đường dẫn không hợp lệ.'; }
  if (url.protocol !== 'https:' || url.hostname !== 'docs.google.com' || url.port || url.username || url.password) return 'Phải dùng HTTPS của docs.google.com.';
  const published = /^\/spreadsheets\/d\/e\/[^/]+\/pub\/?$/.test(url.pathname) && url.searchParams.get('output') === 'csv';
  const exported = /^\/spreadsheets\/d\/[^/]+\/export\/?$/.test(url.pathname) && url.searchParams.get('format') === 'csv';
  return published || exported ? '' : 'Đường dẫn cần là Google Sheets CSV, không phải link chỉnh sửa.';
}

export function readSourceOverrides() {
  if (isDesktopReport()) return {};
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const result = {};
    for (const source of SHEET_SOURCES) {
      const value = parsed[source.key];
      if (typeof value === 'string' && !validateSheetUrl(value)) result[source.key] = value;
    }
    return result;
  } catch (e) { return {}; }
}

export function getSheetSourceUrl(key) {
  return readSourceOverrides()[key] || CONFIG[key];
}

export function persistSourceOverrides(urls) {
  if (isDesktopReport()) return false;
  const filtered = {};
  for (const src of SHEET_SOURCES) {
    const value = String(urls[src.key] || '').trim();
    if (validateSheetUrl(value)) return false;
    if (value !== CONFIG[src.key]) filtered[src.key] = value;
  }
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered)); return true; }
  catch (e) { logger.error('[Nguồn dữ liệu] Không lưu được cấu hình:', e.message); return false; }
}

/** Chỉ tải phần tiêu đề để kiểm tra, không lưu lại dữ liệu bảng vào bộ nhớ đệm. */
export async function verifySheetSource(source, rawUrl, fetcher = fetch) {
  const error = validateSheetUrl(rawUrl);
  if (error) return { ok: false, message: error };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);
  try {
    const response = await fetcher(rawUrl, { cache: 'no-store', signal: controller.signal });
    if (!response.ok) return { ok: false, message: 'HTTP ' + response.status + ' — nguồn không thể đọc.' };
    if (response.url) {
      const final = new URL(response.url);
      if (final.protocol !== 'https:' || !(/(^|\.)googleusercontent\.com$/.test(final.hostname) || final.hostname === 'docs.google.com')) {
        return { ok: false, message: 'Google Sheets chuyển hướng tới website không tin cậy.' };
      }
    }
    let text = '', reader;
    try {
      if (response.body && response.body.getReader) {
        reader = response.body.getReader();
        const decoder = new TextDecoder();
        let bytes = 0, complete = false;
        while (!complete) {
          const chunk = await reader.read();
          if (chunk.done) { text += decoder.decode(); break; }
          bytes += chunk.value.byteLength;
          if (bytes > 65536) throw new Error('Tiêu đề dữ liệu lớn bất thường.');
          text += decoder.decode(chunk.value, { stream: true });
          complete = /\r|\n/.test(text);
        }
      } else {
        text = (await response.text()).slice(0, 65536);
      }
    } finally { if (reader) await reader.cancel().catch(() => {}); }
    if (/^\s*<(!doctype|html)/i.test(text)) return { ok: false, message: 'Nguồn trả về trang HTML, không phải CSV.' };
    // Tiêu đề CSV của HAK dùng các tên cột chuẩn, parser tương thích dữ liệu có dấu nháy kép.
    const line = text.split(/\r?\n/, 1)[0].replace(/^\uFEFF/, '');
    const fields = [];
    let col = '', quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (quoted && line[i + 1] === '"') { col += '"'; i++; }
        else quoted = !quoted;
      } else if (ch === ',' && !quoted) { fields.push(col.trim()); col = ''; }
      else col += ch;
    }
    fields.push(col.trim());
    const missing = source.fields.filter(field => !fields.includes(field));
    return missing.length ? { ok: false, message: 'Thiếu cột: ' + missing.join(', ') } :
      { ok: true, message: 'Kết nối thành công, đủ ' + source.fields.length + ' cột.' };
  } catch (e) {
    return { ok: false, message: e.name === 'AbortError' ? 'Quá thời gian kiểm tra (12 giây).' : 'Không thể kiểm tra: ' + e.message };
  } finally { clearTimeout(timer); }
}

export function initSourceSettings(reload) {
  const root = document.getElementById('sheetSourceSettings');
  if (!root) return;
  const inputs = Object.fromEntries(SHEET_SOURCES.map(src => [src.key, root.querySelector('[data-sheet-url="' + src.key + '"]')]));
  for (const src of SHEET_SOURCES) inputs[src.key].value = getSheetSourceUrl(src.key);
  const msg = document.getElementById('sheetSourceMsg');
  const btn = document.getElementById('sheetSourceApply');
  const checkBtn = document.getElementById('sheetSourceCheck');
  const setMessage = (t, ok) => { msg.textContent = t; msg.style.color = ok ? 'var(--accent)' : 'var(--err)'; };
  if (isDesktopReport()) {
    setMessage('Bản Windows lưu nguồn qua menu Báo cáo ngày → Đổi cấu hình công ty. Hãy thay nguồn ở đó.', true);
    btn.disabled = true; checkBtn.disabled = true;
    return;
  }
  let verified = '';
  const values = () => Object.fromEntries(SHEET_SOURCES.map(s => [s.key, inputs[s.key].value.trim()]));
  const stamp = urls => JSON.stringify(SHEET_SOURCES.map(s => urls[s.key]));
  for (const src of SHEET_SOURCES) inputs[src.key].addEventListener('input', () => { verified = ''; setMessage('Đã sửa đường dẫn — cần kiểm tra lại trước khi áp dụng.', false); });
  async function verify(urls) {
    checkBtn.disabled = true; btn.disabled = true;
    setMessage('Đang kiểm tra kết nối và các cột dữ liệu...', true);
    try {
      const results = await Promise.all(SHEET_SOURCES.map(async src => ({ src, result: await verifySheetSource(src, urls[src.key]) })));
      const failed = results.filter(row => !row.result.ok);
      for (const row of results) {
        const el = root.querySelector('[data-sheet-status="' + row.src.key + '"]');
        el.textContent = (row.result.ok ? '✓ ' : '✗ ') + row.result.message;
        el.style.color = row.result.ok ? 'var(--accent)' : 'var(--err)';
      }
      verified = failed.length ? '' : stamp(urls);
      setMessage(failed.length ? 'Chưa áp dụng: ' + failed.length + ' nguồn lỗi. Đường dẫn cũ vẫn giữ nguyên.' : 'Cả 4 nguồn hợp lệ. Có thể áp dụng.', !failed.length);
      return failed.length === 0;
    } finally { checkBtn.disabled = false; btn.disabled = false; }
  }
  checkBtn.addEventListener('click', () => { verify(values()).catch(e => setMessage(e.message, false)); });
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    try {
      const urls = values();
      if (verified !== stamp(urls) && !(await verify(urls))) return;
      if (!persistSourceOverrides(urls)) { setMessage('Không lưu được cấu hình vào trình duyệt. Không thay đổi nguồn đang dùng.', false); return; }
      setMessage('Đã áp dụng nguồn mới; đang tải dữ liệu...', true);
      await reload();
    } catch (e) { setMessage('Lỗi cập nhật nguồn: ' + e.message, false); }
    finally { btn.disabled = false; }
  });
}
