// [Phase 3.12 — 2026-09-23] Kiểm chứng xử lý lỗi mạng/dữ liệu: người dùng PHẢI được báo rõ ràng,
// app KHÔNG được treo, dữ liệu cũ KHÔNG được mất. Mỗi tình huống dưới đây đã được tái hiện là lỗi
// thật trên bản trước (treo vĩnh viễn / báo xanh nhưng báo cáo trống / bấm nút không thấy gì).
// Chạy: npm run test:error-handling   (tuỳ chọn: node tests/test-error-handling.mjs <đường dẫn index.html>)
import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';
import { genPhieuCan, genDNTT, genHDNCC, genHosokeo, toCSV } from './fixtures.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(__dirname, '../dist/index.html');
const ID = { PC: 'tytjQLj', DN: 'zPk2i', HD: 'wW_a10', HK: 'esmF7s' };
const pc = genPhieuCan(40), dn = genDNTT(pc, 15), hd = genHDNCC(dn), hk = genHosokeo(10);
const OK = { PC: toCSV(pc), DN: toCSV(dn), HD: toCSV(hd), HK: toCSV(hk) };
const which = (url) => Object.keys(ID).find((k) => url.includes(ID[k]));
const fulfill = (route, body, status = 200) => route.fulfill({ status, contentType: 'text/csv', body });

let pass = 0, fail = 0;
const check = (name, ok, extra) => { if (ok) pass++; else fail++; console.log((ok ? 'OK   ' : 'FAIL ') + name + (extra ? '  [' + extra + ']' : '')); };

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
async function open(handler, { init, waitMs = 3500 } = {}) {
  const page = await browser.newPage();
  if (init) await page.addInitScript(init);
  page.on('pageerror', () => {});
  await page.route('https://docs.google.com/**', (route) => handler(route, which(route.request().url())));
  await page.goto('file://' + DIST, { waitUntil: 'load' });
  await page.waitForTimeout(waitMs);
  return page;
}
const status = (p) => p.evaluate(() => ({ text: document.querySelector('#statusText').textContent, dot: document.querySelector('#statusDot').className, reloadDisabled: document.querySelector('#btnReload').disabled }));
const lapBC = (p) => p.evaluate(() => { document.querySelector('#fFrom').value = '2024-01-01'; document.querySelector('#fTo').value = '2025-12-31'; document.querySelector('#btnLapBC').click(); });
const count = (p, k) => p.evaluate((key) => document.querySelector('[data-count="' + key + '"]')?.textContent, k);

// 1) Google Sheet không trả lời → phải hết chờ, báo lỗi, mở lại nút (thời gian chờ rút ngắn còn 2s cho test)
{
  const p = await open((r, k) => (k === 'PC' ? undefined : fulfill(r, OK[k])), { init: () => { window.__bcFetchTimeoutMs = 2000; }, waitMs: 6000 });
  const s = await status(p);
  check('Sheet treo: không đứng mãi ở "Đang tải..." — báo lỗi quá thời gian chờ', /không phản hồi/.test(s.text) && s.dot.includes('err'), s.text);
  check('Sheet treo: nút "CẬP NHẬT DỮ LIỆU" được mở lại để thử lại', s.reloadDisabled === false);
  await p.close();
}
// 2) Sheet phụ (HOSOKEO) lỗi → các báo cáo khác vẫn chạy, nhưng phải CẢNH BÁO
{
  const p = await open((r, k) => (k === 'HK' ? fulfill(r, 'err', 500) : fulfill(r, OK[k])));
  const s = await status(p);
  check('HOSOKEO lỗi 500: vẫn tải xong dữ liệu chính', /Đã tải 40 phiếu cân/.test(s.text), s.text);
  check('HOSOKEO lỗi 500: có cảnh báo rõ (chấm vàng) thay vì báo xanh im lặng', s.dot.includes('warn') && /HOSOKEO/.test(s.text));
  await lapBC(p);
  check('HOSOKEO lỗi 500: báo cáo nhập keo vẫn đủ dữ liệu', (await count(p, 'nhapkeo')) === '40 dòng');
  await p.close();
}
// 3) Mất mạng → thông báo tiếng Việt dễ hiểu
{
  const p = await open((r) => r.abort('internetdisconnected'));
  const s = await status(p);
  check('Mất mạng: thông báo dễ hiểu "kiểm tra kết nối Internet"', /kiểm tra kết nối Internet/.test(s.text) && s.dot.includes('err'), s.text);
  await p.close();
}
// 4) Lỗi mạng thoáng qua → tự thử lại 1 lần, tải thành công, không báo lỗi
{
  let n = 0;
  const p = await open((r, k) => { if (k === 'PC' && n++ === 0) return r.abort('connectionreset'); return fulfill(r, OK[k]); }, { waitMs: 5000 });
  const s = await status(p);
  check('Lỗi mạng thoáng qua: tự thử lại và tải thành công', /Đã tải 40 phiếu cân/.test(s.text) && s.dot === 'dot ok', s.text + ' | số lần gọi PHIEUCAN=' + n);
  await p.close();
}
// 5) Sheet bị đổi tên cột → cảnh báo thiếu cột nào
{
  const bad = OK.PC.replace('Ngày cân 1', 'Ngay can 1');
  const p = await open((r, k) => fulfill(r, k === 'PC' ? bad : OK[k]));
  const s = await status(p);
  check('Đổi tên cột: cảnh báo đúng Sheet + đúng tên cột bị thiếu', s.dot.includes('warn') && /PHIEUCAN thiếu cột: Ngày cân 1/.test(s.text), s.text);
  await p.close();
}
// 6) Dữ liệu chuẩn → KHÔNG có cảnh báo giả
{
  const p = await open((r, k) => fulfill(r, OK[k]));
  const s = await status(p);
  check('Dữ liệu chuẩn: trạng thái xanh, không cảnh báo giả', s.dot === 'dot ok' && s.text === 'Đã tải 40 phiếu cân, 15 đề nghị thanh toán', s.text);
  // 7) Lỗi khi bấm xuất file → phải hiện lên thanh trạng thái
  await lapBC(p);
  await p.evaluate(() => { window.Blob = function () { throw new Error('Out of memory (giả lập)'); }; });
  await p.click('[data-target="baocao"]');
  await p.click('[data-tools="nhapkeo"] [data-act="excel"]');
  await p.waitForTimeout(2500);
  const s2 = await status(p);
  check('Lỗi khi xuất Excel: báo lên thanh trạng thái (không im lặng)', s2.dot.includes('err') && /Out of memory/.test(s2.text), s2.text);
  await p.close();
}
// 8) Làm mới thất bại khi đã có dữ liệu → dữ liệu cũ vẫn còn nguyên + nói rõ
{
  let n = 0;
  const p = await open((r, k) => { if (k === 'PC') n++; return (k === 'PC' && n > 1) ? r.abort('internetdisconnected') : fulfill(r, OK[k]); });
  await lapBC(p);
  const before = await count(p, 'nhapkeo');
  await p.click('#btnReload');
  await p.waitForTimeout(4000);
  await lapBC(p);
  const after = await count(p, 'nhapkeo');
  const s = await status(p);
  check('Làm mới thất bại: KHÔNG mất dữ liệu đang có (' + before + ' → ' + after + ')', before === '40 dòng' && after === '40 dòng');
  // Từ Phase 4.1 (offline): làm mới thất bại → dùng bản lưu offline (chính là dữ liệu vừa hiển thị)
  // và báo "ĐANG XEM DỮ LIỆU OFFLINE … lưu lúc …"; không có bản lưu → "dữ liệu lần tải trước".
  check('Làm mới thất bại: nói rõ đang xem dữ liệu lần tải trước / dữ liệu offline', /dữ liệu lần tải trước|DỮ LIỆU OFFLINE[^|]*lưu lúc/.test(s.text), s.text);
  await p.close();
}
// 9) Xuất file lâu: phải hiện "Đang tạo…" ngay khi bấm, bấm lặp chỉ ra 1 file, xong trả lại trạng thái
{
  const big = genPhieuCan(3000), bigDn = genDNTT(big, 500);
  const BIG = { PC: toCSV(big), DN: toCSV(bigDn), HD: toCSV(genHDNCC(bigDn)), HK: OK.HK };
  const page = await browser.newPage({ acceptDownloads: true });
  page.on('pageerror', () => {});
  await page.route('https://docs.google.com/**', (route) => fulfill(route, BIG[which(route.request().url())]));
  await page.goto('file://' + DIST, { waitUntil: 'load' });
  await page.waitForFunction(() => document.querySelector('#statusText').textContent.includes('phiếu cân'));
  await lapBC(page);
  await page.click('[data-target="baocao"]');
  await page.evaluate(() => {
    window.__statusLog = [];
    new MutationObserver(() => window.__statusLog.push(document.querySelector('#statusText').textContent)).observe(document.querySelector('#statusText'), { childList: true, characterData: true, subtree: true });
  });
  let downloads = 0; page.on('download', () => { downloads++; });
  const btn = '[data-tools="nhapkeo"] [data-act="pdf"]';
  await page.evaluate((sel) => { const b = document.querySelector(sel); b.click(); b.click(); b.click(); }, btn); // bấm 3 lần liên tiếp
  await page.waitForEvent('download', { timeout: 120000 });
  await page.waitForTimeout(1500);
  const log = await page.evaluate(() => window.__statusLog);
  const s = await status(page);
  check('Xuất PDF: hiện "Đang tạo file PDF…" ngay khi bấm', log.some((t) => /^Đang tạo file PDF/.test(t)), JSON.stringify(log.slice(0, 2)));
  check('Xuất PDF: bấm 3 lần liên tiếp chỉ ra đúng 1 file', downloads === 1, 'số file=' + downloads);
  check('Xuất PDF: xong thì trả lại trạng thái cũ (xanh)', s.dot === 'dot ok' && /^Đã tải 3\.000 phiếu cân/.test(s.text), s.text);
  await page.close();
}
await browser.close();
console.log('\n=== RESULT: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail ? 1 : 0);
