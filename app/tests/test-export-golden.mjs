// [2026-10-06] LƯỚI AN TOÀN CHO MỌI FILE XUẤT RA (Excel + PDF): bấm TẤT CẢ các nút xuất trong app
// trên dữ liệu giả lập cố định + đồng hồ cố định, rồi lấy "dấu vân tay" chi tiết của từng file:
//  - Excel: mọi sheet, mọi ô (giá trị, định dạng số, đậm/nghiêng, màu chữ/nền, căn lề, viền), ô gộp,
//    độ rộng cột, chiều cao dòng, autoFilter.
//  - PDF: số trang + từng chữ kèm toạ độ (pdftotext -bbox, làm tròn 0,1pt) → bắt được cả lệch bố cục.
// So với tests/export-golden.json (lưu từ bản trước khi sửa). Bất kỳ file nào lệch dù 1 ô/1 chữ → FAIL.
// Chạy:   npm run test:export-golden            (so sánh)
//         node tests/test-export-golden.mjs --update   (ghi lại mẫu chuẩn — CHỈ khi CHỦ ĐỘNG đổi file xuất)
//         node tests/test-export-golden.mjs --dist <index.html> [--dump <thư mục>]
import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import os from 'os';
import crypto from 'crypto';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import ExcelJS from 'exceljs';
import { genPhieuCan, genDNTT, genHDNCC, genHosokeo, toCSV } from './fixtures.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const arg = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
const DIST = path.resolve(arg('--dist') || path.resolve(__dirname, '../dist/index.html'));
const UPDATE = argv.includes('--update');
const DUMP = arg('--dump');
const GOLDEN = path.resolve(__dirname, 'export-golden.json');

function mulberry32(seed) { return function () { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
Math.random = mulberry32(777);
const pc = genPhieuCan(45), dn = genDNTT(pc, 20), hd = genHDNCC(dn), hk = genHosokeo(12);
hd.forEach((r, i) => { r['Số CCCD Chủ rừng'] = '0491' + String(10000000 + i); r['Số ĐT DĐ Chủ rừng'] = '09' + String(1000000 + i); });
const CSV = { tytjQLj: toCSV(pc), zPk2i: toCSV(dn), wW_a10: toCSV(hd), esmF7s: toCSV(hk) };

// ---- Chuẩn hoá Excel thành JSON so sánh được
function normCell(c) {
  const v = c.value;
  let val = v;
  if (v && typeof v === 'object') {
    if (v instanceof Date) val = 'DATE:' + v.toISOString();
    else if (v.richText) val = 'RICH:' + v.richText.map((t) => t.text).join('');
    else if (v.formula || v.sharedFormula) val = 'F:' + (v.formula || v.sharedFormula) + '=' + JSON.stringify(v.result);
    else val = JSON.stringify(v);
  }
  const s = c.style || {};
  return [c.address, val, s.numFmt || '', JSON.stringify(s.font || {}), JSON.stringify(s.fill || {}), JSON.stringify(s.alignment || {}), JSON.stringify(s.border || {})];
}
async function normXlsx(buf) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const out = [];
  wb.eachSheet((ws) => {
    const cells = [];
    ws.eachRow({ includeEmpty: true }, (row, rn) => { cells.push(['ROW', rn, row.height || null]); row.eachCell({ includeEmpty: true }, (c) => cells.push(normCell(c))); });
    const cols = []; for (let i = 1; i <= ws.columnCount; i++) cols.push(ws.getColumn(i).width || null);
    out.push({ name: ws.name, merges: Object.keys(ws._merges || {}).sort(), cols, autoFilter: ws.autoFilter || null, cells });
  });
  return out;
}
// ---- Chuẩn hoá PDF: số trang + từng chữ kèm toạ độ
function normPdf(file) {
  const pages = +(execSync(`pdfinfo "${file}"`, { encoding: 'utf8' }).match(/Pages:\s+(\d+)/) || [])[1];
  const xml = execSync(`pdftotext -bbox "${file}" -`, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const words = [];
  const re = /<page width="([\d.]+)" height="([\d.]+)">|<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)<\/word>/g;
  let m; const r1 = (x) => (Math.round(+x * 10) / 10).toFixed(1);
  while ((m = re.exec(xml))) { if (m[1]) words.push('PAGE ' + r1(m[1]) + 'x' + r1(m[2])); else words.push([r1(m[3]), r1(m[4]), r1(m[5]), r1(m[6]), m[7]].join(' ')); }
  return { pages, words };
}
const sha = (o) => crypto.createHash('sha1').update(typeof o === 'string' ? o : JSON.stringify(o)).digest('hex').slice(0, 16);

// ---- Danh sách nút xuất (bấm bằng DOM click để không phụ thuộc tab đang mở)
const GENERIC = ['nhapkeo', 'xecho', 'thanhtoan', 'congno', 'hotro', 'trogia', 'tonghoptro', 'hoahong', 'tonghop', 'bklsct', 'bklsth', 'tautonghop', 'tienvay'];
const ACTIONS = [];
GENERIC.forEach((k) => { ACTIONS.push([k + '.xlsx', `[data-tools="${k}"] [data-act="excel"]`]); ACTIONS.push([k + '.pdf', `[data-tools="${k}"] [data-act="pdf"]`]); });
ACTIONS.push(['tonghop-thang.xlsx', '#btnExportAllThang'], ['tonghop-ngay.xlsx', '#btnExportAllNgay'], ['lamsan.xlsx', '#btnExportAllLamSan'], ['nganhang.xlsx', '#btnExportAllNganHang'], ['mau-tienvay.xlsx', '#btnTienVayTemplate']);
ACTIONS.push(['WO.pdf', ['#btnWOModal', '#btnWOPdf']], ['WO.xlsx', ['#btnWOModal', '#btnWOExcel']]);
ACTIONS.push(['TNDN.pdf', ['#btnTNDNModal', '#btnBankPdf']], ['TNDN.xlsx', ['#btnTNDNModal', '#btnBankExcel']], ['PNK.pdf', ['#btnPNKModal', '#btnBankPdf']]);

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ acceptDownloads: true, viewport: { width: 1440, height: 900 } });
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
page.on('dialog', (d) => d.accept());
// Đồng hồ cố định: các chữ "In lúc…", "Ngày … tháng … năm" và tên file không đổi giữa các lần chạy.
await page.addInitScript(() => {
  const FIXED = Date.UTC(2026, 9, 6, 3, 0, 0); const D = Date;
  class FixedDate extends D { constructor(...a) { super(...(a.length ? a : [FIXED])); } static now() { return FIXED; } }
  // eslint-disable-next-line no-global-assign
  Date = FixedDate;
});
await page.route('https://docs.google.com/**', (r) => { const k = Object.keys(CSV).find((x) => r.request().url().includes(x)); return r.fulfill({ status: 200, contentType: 'text/csv', body: k ? CSV[k] : '' }); });
await page.goto('file://' + DIST);
await page.waitForFunction(() => /phiếu cân/.test(document.querySelector('#statusText').textContent), null, { timeout: 20000 });
await page.evaluate(() => { document.querySelector('#fFrom').value = '2024-01-01'; document.querySelector('#fTo').value = '2025-12-31'; document.querySelector('#btnLapBC').click(); });
// Gán Tàu cho vài dòng BKLS (để báo cáo theo Tàu có dữ liệu) — qua localStorage như app lưu
await page.evaluate(() => {
  const rows = [...document.querySelectorAll('#tbl-bklsct tbody tr')].slice(0, 3);
  void rows; // dữ liệu gán Tàu không bắt buộc cho lưới an toàn; giữ trống để tránh phụ thuộc thứ tự hiển thị
});

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'golden-'));
const result = {};
for (const [name, sel] of ACTIONS) {
  const sels = Array.isArray(sel) ? sel : [sel];
  try {
    const [dl] = await Promise.all([
      page.waitForEvent('download', { timeout: 60000 }),
      (async () => { for (const s of sels) { await page.evaluate((q) => document.querySelector(q).click(), s); await page.waitForTimeout(150); } })(),
    ]);
    const f = path.join(tmp, name);
    await dl.saveAs(f);
    const norm = name.endsWith('.xlsx') ? await normXlsx(fs.readFileSync(f)) : normPdf(f);
    result[name] = { file: dl.suggestedFilename(), hash: sha(norm) };
    if (DUMP) { fs.mkdirSync(DUMP, { recursive: true }); fs.writeFileSync(path.join(DUMP, name + '.json'), JSON.stringify(norm, null, 1)); }
  } catch (e) {
    result[name] = { error: e.message.split('\n')[0] };
  }
  await page.evaluate(() => { document.querySelectorAll('.modalOverlay.active').forEach((m) => m.classList.remove('active')); });
  await page.waitForTimeout(400); // qua thời gian chặn bấm lặp của nút xuất
}
await browser.close();
fs.rmSync(tmp, { recursive: true, force: true });

if (UPDATE) {
  fs.writeFileSync(GOLDEN, JSON.stringify(result, null, 1) + '\n');
  console.log('Đã ghi mẫu chuẩn ' + Object.keys(result).length + ' file → ' + GOLDEN);
  console.log(JSON.stringify(result, null, 1));
  process.exit(Object.values(result).some((r) => r.error) || errs.length ? 1 : 0);
}
const golden = JSON.parse(fs.readFileSync(GOLDEN, 'utf8'));
let pass = 0, fail = 0;
for (const name of Object.keys(golden)) {
  const g = golden[name], r = result[name] || { error: 'không chạy' };
  const ok = !r.error && r.hash === g.hash && r.file === g.file;
  ok ? pass++ : fail++;
  console.log((ok ? 'OK   ' : 'FAIL ') + name.padEnd(22) + (ok ? '' : '  mẫu=' + JSON.stringify(g) + ' nay=' + JSON.stringify(r)));
}
const okErr = errs.length === 0; okErr ? pass++ : fail++;
console.log((okErr ? 'OK   ' : 'FAIL ') + 'Không có lỗi JS' + (okErr ? '' : '  ' + JSON.stringify(errs)));
console.log('\n=== RESULT: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail ? 1 : 0);
