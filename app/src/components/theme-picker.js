/** Lưu giao diện riêng với dữ liệu nghiệp vụ. Bootstrap trong index.html đọc cùng khóa. */
import { $ } from '../utils/dom-utils.js';

export const THEME_STORAGE_KEY = 'baocaongay_ui_theme';
export const SKINS = Object.freeze(['luxe', 'classic', 'navy', 'ngoc', 'neutral', 'glass', 'frost', 'forest', 'night']);
export const MODES = Object.freeze(['auto', 'light', 'dark']);

/** Người dùng mới dùng Kính Sương và chế độ theo máy. */
export function loadTheme() {
  try {
    const t = JSON.parse(localStorage.getItem(THEME_STORAGE_KEY) || '{}') ?? {};
    return { skin: SKINS.includes(t.skin) ? t.skin : 'frost', mode: MODES.includes(t.mode) ? t.mode : t.skin === 'night' ? 'dark' : 'auto' };
  } catch { return { skin: 'frost', mode: 'auto' }; }
}

/** Áp lên <html>: luxe = không gắn data-skin (màu mặc định); auto = không gắn data-theme (theo máy). */
export function applyTheme(t) {
  const h = document.documentElement;
  if (t.skin && t.skin !== 'luxe') h.setAttribute('data-skin', t.skin); else h.removeAttribute('data-skin');
  if (t.mode === 'light' || t.mode === 'dark') h.setAttribute('data-theme', t.mode); else h.removeAttribute('data-theme');
}

function saveTheme(t) {
  try { localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(t)); } catch { /* không lưu được: vẫn áp cho phiên này */ }
}

export function initThemePicker() {
  const quick = { skin: $('#themeSkin'), mode: $('#themeMode') };
  const settings = { skin: $('#settingsThemeSkin'), mode: $('#settingsThemeMode') };
  if (!quick.skin || !quick.mode) return;
  const pickers = settings.skin && settings.mode ? [quick, settings] : [quick];
  if (pickers.length > 1) {
    for (const key of ['skin', 'mode']) {
      settings[key].replaceChildren(...Array.from(quick[key].options, option => option.cloneNode(true)));
    }
  }
  function render(theme) {
    applyTheme(theme);
    window.api?.setReportTheme?.(theme)?.catch(() => {});
    for (const { skin, mode } of pickers) {
      skin.value = theme.skin;
      mode.value = theme.mode;
    }
  }
  render(loadTheme());
  for (const { skin, mode } of pickers) {
    const update = event => {
      const next = { skin: skin.value, mode: event.target === skin && skin.value === 'night' ? 'dark' : mode.value };
      render(next);
      saveTheme(next);
    };
    skin.addEventListener('change', update);
    mode.addEventListener('change', update);
  }
}
