/**
 * [2026-10-29] Chọn giao diện (menu trái): chủ đề màu + chế độ Sáng / Tối / Theo máy.
 * Chủ đề: luxe (mặc định, HAK-Enterprise-Design-System), classic (xanh ngọc lam — token gốc teal của
 * Design System), navy, ngọc bích, neutral. Màu khai báo trong index.html (html[data-skin], data-theme).
 *
 * Theo quy tắc Design System: đổi chủ đề KHÔNG ghi vào dữ liệu nghiệp vụ — lưu riêng 1 khoá
 * localStorage (không nằm trong file sao lưu), file Excel/PDF xuất ra giữ màu chuẩn luxe. Đoạn script
 * nhỏ trong <head> đọc cùng khoá để áp màu trước khi vẽ trang (không chớp màu).
 * @module components/theme-picker
 */
import { $ } from '../utils/dom-utils.js';

export const THEME_STORAGE_KEY = 'baocaongay_ui_theme';
export const SKINS = Object.freeze(['luxe', 'classic', 'navy', 'ngoc', 'neutral']);
export const MODES = Object.freeze(['auto', 'light', 'dark']);

/** Đọc lựa chọn đã lưu (lỗi/không có → mặc định luxe + theo máy). */
export function loadTheme() {
  try {
    const t = JSON.parse(localStorage.getItem(THEME_STORAGE_KEY) || '{}');
    return { skin: SKINS.includes(t.skin) ? t.skin : 'luxe', mode: MODES.includes(t.mode) ? t.mode : 'auto' };
  } catch (e) { return { skin: 'luxe', mode: 'auto' }; }
}

/** Áp lên <html>: luxe = không gắn data-skin (màu mặc định); auto = không gắn data-theme (theo máy). */
export function applyTheme(t) {
  const h = document.documentElement;
  if (t.skin && t.skin !== 'luxe') h.setAttribute('data-skin', t.skin); else h.removeAttribute('data-skin');
  if (t.mode === 'light' || t.mode === 'dark') h.setAttribute('data-theme', t.mode); else h.removeAttribute('data-theme');
}

function saveTheme(t) {
  try { localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(t)); } catch (e) { /* không lưu được: vẫn áp cho phiên này */ }
}

/** Gắn 2 ô chọn trong menu trái. Gọi 1 lần lúc khởi động. */
export function initThemePicker() {
  const skinSel = $('#themeSkin'), modeSel = $('#themeMode');
  if (!skinSel || !modeSel) return;
  const t = loadTheme();
  skinSel.value = t.skin; modeSel.value = t.mode;
  applyTheme(t);
  const onChange = () => { const next = { skin: skinSel.value, mode: modeSel.value }; applyTheme(next); saveTheme(next); };
  skinSel.addEventListener('change', onChange);
  modeSel.addEventListener('change', onChange);
}
