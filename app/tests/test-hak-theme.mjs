// [2026-10-29] Màu giao diện + màu file xuất phải ĐÚNG token "luxe" của HAK-Enterprise-Design-System
// (node_modules/@hak/enterprise-design-system/tokens/luxe.css) và chữ/nền phải đạt tương phản WCAG AA
// (≥ 4,5:1) — cùng tiêu chí tests/contrast.test.js của Design System.
// Chạy: npm run test:hak-theme
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { BRAND } from '../src/constants/brand.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const tokensCss = fs.readFileSync(require.resolve('@hak/enterprise-design-system/tokens/luxe.css'), 'utf8');
const html = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');

let pass = 0, fail = 0;
const check = (n, ok, x) => { ok ? pass++ : fail++; console.log((ok ? 'OK   ' : 'FAIL ') + n + (x !== undefined ? '  [' + x + ']' : '')); };

/** Lấy biến CSS trong khối có selector đúng bằng `sel`. */
function block(css, sel) {
  const i = css.indexOf(sel + '{'); if (i < 0) return {};
  const body = css.slice(i + sel.length + 1, css.indexOf('}', i));
  const out = {}; body.replace(/--([\w-]+)\s*:\s*([^;]+);?/g, (m, k, v) => { out[k] = v.trim(); return m; }); return out;
}
const luxeLight = Object.assign({}, block(tokensCss, ':root'), block(tokensCss, ':root{--mut-aa:#6b655a'.slice(0, 5)), block(tokensCss, '[data-skin="luxe"]'));
luxeLight['mut-aa'] = (tokensCss.match(/--mut-aa:(#[0-9a-f]{6})/i) || [])[1];
const luxeDark = block(tokensCss, '[data-skin="luxe"][data-theme="dark"]');
const appLight = block(html, ':root');
const appDark = block(html, ':root[data-theme="dark"]');

// Biến của app ← token luxe (sáng / tối)
const MAP_LIGHT = { bg: 'bg', panel: 'card', ink: 'ink', muted: 'mut-aa', line: 'line', accent: 'brand', 'accent-2': 'brand2', head: 'th', hover: 'hover', champ: 'champ', champL: 'champL' };
const MAP_DARK = { bg: 'bg', panel: 'card', ink: 'ink', muted: 'mut', line: 'line', accent: 'brand', 'accent-2': 'brand2', 'accent-ink': 'onBrand', head: 'th', hover: 'hover' };
for (const [app, tok] of Object.entries(MAP_LIGHT)) check('Sáng: --' + app + ' = luxe --' + tok, (appLight[app] || '').toLowerCase() === (luxeLight[tok] || '').toLowerCase(), appLight[app] + ' / ' + luxeLight[tok]);
for (const [app, tok] of Object.entries(MAP_DARK)) check('Tối: --' + app + ' = luxe --' + tok, (appDark[app] || '').toLowerCase() === (luxeDark[tok] || '').toLowerCase(), appDark[app] + ' / ' + luxeDark[tok]);

// Tương phản WCAG
const lum = (hex) => { const c = hex.replace('#', '').match(/../g).map((x) => parseInt(x, 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4))); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const PAIRS = [['ink', 'bg'], ['ink', 'panel'], ['muted', 'panel'], ['muted', 'bg'], ['accent-ink', 'accent'], ['side-ink', 'side'], ['err', 'panel'], ['ok', 'panel']];
for (const [theme, v] of [['Sáng', appLight], ['Tối', Object.assign({}, appLight, appDark)]]) {
  for (const [fg, bg] of PAIRS) { const r = ratio(v[fg], v[bg]); check(theme + ': tương phản --' + fg + ' trên --' + bg + ' ≥ 4,5', r >= 4.5, r.toFixed(2)); }
}
// [2026-10-29] Các chủ đề chọn được (html[data-skin]) — mỗi chủ đề sáng + tối đều đạt AA.
const PAIRS_ALL = PAIRS.concat([['accent', 'panel'], ['side-active', 'side']]);
const blockAt = (css, sel) => { const i = css.indexOf(sel + '{'); return i < 0 ? {} : block(css.slice(i), sel); };
for (const skin of ['classic', 'navy', 'ngoc', 'neutral']) {
  const L = blockAt(html, ':root[data-skin="' + skin + '"]'), Dk = blockAt(html, ':root[data-skin="' + skin + '"][data-theme="dark"]');
  const Dm = blockAt(html, '  :root[data-skin="' + skin + '"]:not([data-theme="light"])'.trim());
  check(skin + ': có đủ khối sáng / tối / tối-theo-máy', Object.keys(L).length >= 25 && Object.keys(Dk).length >= 25 && Object.keys(Dm).length >= 25);
  check(skin + ': tối theo máy = tối chọn tay (cùng bảng màu)', JSON.stringify(Dm) === JSON.stringify(Dk));
  for (const [theme, v] of [['sáng', L], ['tối', Dk]]) {
    const bad = PAIRS_ALL.filter(([fg, bg]) => ratio(v[fg], v[bg]) < 4.5).map(([fg, bg]) => fg + '/' + bg + '=' + ratio(v[fg], v[bg]).toFixed(2));
    const badCard = ['card1', 'card2', 'card3', 'card4'].filter((c) => ratio(v[c], v.panel) < 3);
    check(skin + ' ' + theme + ': chữ/nền đạt AA, số trên thẻ ≥ 3:1', !bad.length && !badCard.length, bad.concat(badCard).join(' '));
  }
}
// Classic = token gốc (teal) của chính Design System (:root và [data-theme="dark"] trong luxe.css)
{
  const base = block(tokensCss, ':root'), baseDark = block(tokensCss, '[data-theme="dark"]');
  const L = blockAt(html, ':root[data-skin="classic"]'), Dk = blockAt(html, ':root[data-skin="classic"][data-theme="dark"]');
  const MAP = { bg: 'bg', panel: 'card', ink: 'ink', line: 'line', accent: 'brand', head: 'th', hover: 'hover' };
  const full = (h) => (h || '').toLowerCase().replace(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/, '#$1$1$2$2$3$3');
  const eq = (a, b) => full(a) === full(b);
  check('Classic sáng = token gốc Design System', Object.entries(MAP).every(([a, t]) => eq(L[a], base[t])));
  check('Classic tối = token gốc Design System', Object.entries(Object.assign({}, MAP, { muted: 'mut', 'accent-ink': 'onBrand' })).every(([a, t]) => eq(Dk[a], baseDark[t])));
}

// File xuất: tiêu đề cột chữ trắng trên nền navy luxe
const argb = (s) => '#' + s.slice(2);
check('Excel/PDF: nền tiêu đề cột = luxe --brand', argb(BRAND.headerFillARGB).toLowerCase() === luxeLight.brand.toLowerCase(), BRAND.headerFillARGB);
check('Excel/PDF: chữ trắng trên nền tiêu đề ≥ 4,5', ratio('#ffffff', argb(BRAND.headerFillARGB)) >= 4.5, ratio('#ffffff', argb(BRAND.headerFillARGB)).toFixed(2));
check('Excel/PDF: dòng tổng = luxe --th', argb(BRAND.totalFillARGB).toLowerCase() === luxeLight.th.toLowerCase());
check('Excel/PDF: đường kẻ = luxe --ctl', argb(BRAND.lineARGB).toLowerCase() === luxeLight.ctl.toLowerCase());
check('Excel/PDF: chữ đen trên dòng tổng/xen kẽ ≥ 4,5', ratio('#141414', argb(BRAND.totalFillARGB)) >= 4.5 && ratio('#1e1e1e', argb(BRAND.zebraFillARGB)) >= 4.5);

console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);
