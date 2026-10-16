// [Phase 4.1 — 2026-09-26] Kiểm chứng chế độ OFFLINE (lưu dữ liệu Google Sheet vào IndexedDB).
// Yêu cầu: mất mạng vẫn mở được báo cáo với SỐ LIỆU GIỐNG HỆT lần online gần nhất, báo rõ đang xem
// dữ liệu offline + giờ lưu; có mạng lại thì tự dùng bản mới; mọi lỗi IndexedDB KHÔNG làm hỏng app.
// Chạy: npm run test:offline   (tuỳ chọn: node tests/test-offline-cache.mjs <index.html>)
import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';
import { genPhieuCan, genDNTT, genHDNCC, genHosokeo, toCSV } from './fixtures.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(__dirname, '../dist/index.html');
function mulberry32(seed) { return function () { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
Math.random = mulberry32(11);
const ID = { PC: 'tytjQLj', DN: 'zPk2i', HD: 'wW_a10', HK: 'esmF7s' };
function dataset(n) { const pc = genPhieuCan(n), dn = genDNTT(pc, 15), hd = genHDNCC(dn), hk = genHosokeo(10); return { PC: toCSV(pc), DN: toCSV(dn), HD: toCSV(hd), HK: toCSV(hk) }; }
const V1 = dataset(40), V2 = dataset(41);
const which = (url) => Object.keys(ID).find((k) => url.includes(ID[k]));
const REPORTS = ['nhapkeo', 'xecho', 'thanhtoan', 'congno', 'hotro', 'trogia', 'tonghoptro', 'hoahong', 'tonghop', 'bklsct', 'bklsth', 'tndn', 'pnk'];

let pass = 0, fail = 0;
const check = (n, ok, x) => { ok ? pass++ : fail++; console.log((ok ? 'OK   ' : 'FAIL ') + n + (x ? '  [' + x + ']' : '')); };

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

/** net: 'online' | 'offline' | 'hk-down' ; data: bộ dữ liệu trả về khi online */
async function newApp({ init } = {}) {
  const context = await browser.newContext();
  const state = { net: 'online', data: V1 };
  const page = await context.newPage();
  if (init) await page.addInitScript(init);
  page.on('pageerror', (e) => { state.pageErrors = (state.pageErrors || []).concat(e.message); });
  await page.route('https://docs.google.com/**', (route) => {
    const k = which(route.request().url());
    if (state.net === 'offline' || (state.net === 'hk-down' && k === 'HK')) return route.abort('internetdisconnected');
    return route.fulfill({ status: 200, contentType: 'text/csv', body: state.data[k] });
  });
  return { context, page, state };
}
const waitLoaded = (p) => p.waitForFunction(() => /Đã tải|Lỗi tải/.test(document.querySelector('#statusText').textContent), null, { timeout: 20000 });
const status = (p) => p.evaluate(() => ({ text: document.querySelector('#statusText').textContent, dot: document.querySelector('#statusDot').className, last: document.querySelector('#lastUpdated').textContent }));
async function snapshot(p) {
  await p.evaluate(() => { document.querySelector('#fFrom').value = '2024-01-01'; document.querySelector('#fTo').value = '2025-12-31'; document.querySelector('#btnLapBC').click(); });
  return p.evaluate((keys) => keys.map((k) => k + ':' + (document.querySelector('[data-count="' + k + '"]')?.textContent || '') + ':' + (document.querySelector('#tbl-' + k + ' tfoot')?.textContent || '')).join('\n'), REPORTS);
}
const idbCount = (p) => p.evaluate(() => new Promise((res) => { const r = indexedDB.open('baocaongay-offline'); r.onsuccess = () => { try { const q = r.result.transaction('sheets').objectStore('sheets').count(); q.onsuccess = () => { res(q.result); r.result.close(); }; } catch (e) { res(-1); } }; r.onerror = () => res(-1); }));

// ---- A→D: cùng 1 "máy" (context giữ IndexedDB qua các lần mở lại)
{
  const { context, page, state } = await newApp();
  await page.goto('file://' + DIST); await waitLoaded(page);
  const sA = await status(page);
  check('Online lần đầu: tải bình thường, trạng thái xanh (không đổi so với trước)', sA.dot === 'dot ok' && sA.text === 'Đã tải 40 phiếu cân, 15 đề nghị thanh toán', sA.text);
  await page.waitForTimeout(500);
  check('Online lần đầu: đã lưu đủ 4 Sheet vào bộ nhớ offline', (await idbCount(page)) === 4);
  const onlineSnap = await snapshot(page);

  state.net = 'offline';
  await page.reload(); await waitLoaded(page);
  const sB = await status(page);
  check('Mất mạng khi mở app: vẫn tải được từ bộ nhớ offline', /Đã tải 40 phiếu cân/.test(sB.text), sB.text.slice(0, 90));
  check('Mất mạng: báo rõ "ĐANG XEM DỮ LIỆU OFFLINE" + giờ lưu, chấm vàng', sB.dot === 'dot warn' && /DỮ LIỆU OFFLINE/.test(sB.text) && /lưu lúc \d\d:\d\d \d\d\/\d\d\/\d{4}/.test(sB.text));
  check('Mất mạng: "Cập nhật lần cuối" ghi "(dữ liệu offline)"', /\(dữ liệu offline\)/.test(sB.last), sB.last);
  const offlineSnap = await snapshot(page);
  check('Mất mạng: 13 báo cáo (số dòng + dòng tổng) GIỐNG HỆT lần online', offlineSnap === onlineSnap, offlineSnap === onlineSnap ? '' : offlineSnap.split('\n').find((l, i) => l !== onlineSnap.split('\n')[i]));

  state.net = 'online'; state.data = V2;
  await page.click('#btnReload'); await page.waitForFunction(() => /41 phiếu cân/.test(document.querySelector('#statusText').textContent), null, { timeout: 20000 });
  const sC = await status(page);
  check('Có mạng lại + bấm CẬP NHẬT: dùng dữ liệu MỚI, trạng thái xanh, bỏ nhãn offline', sC.dot === 'dot ok' && sC.text === 'Đã tải 41 phiếu cân, 15 đề nghị thanh toán' && !/offline/.test(sC.last), sC.text);
  await page.waitForTimeout(500);

  state.net = 'offline';
  await page.reload(); await waitLoaded(page);
  check('Mất mạng lần 2: bộ nhớ offline đã được cập nhật theo bản mới (41 phiếu)', /Đã tải 41 phiếu cân/.test((await status(page)).text));

  state.net = 'hk-down';
  await page.reload(); await waitLoaded(page);
  const sE = await status(page);
  check('Chỉ HOSOKEO mất kết nối: các Sheet khác online, riêng HOSOKEO dùng bản lưu và được ghi rõ', sE.dot === 'dot warn' && /OFFLINE[^|]*HOSOKEO lưu lúc/.test(sE.text) && !/PHIEUCAN lưu lúc/.test(sE.text), sE.text.slice(0, 140));
  await snapshot(page);
  check('Chỉ HOSOKEO mất kết nối: Bảng kê lâm sản vẫn có dữ liệu', (await page.evaluate(() => document.querySelector('[data-count="bklsct"]').textContent)) !== '0 dòng');
  check('Không có lỗi JS nào trong suốt các bước trên', !state.pageErrors, JSON.stringify(state.pageErrors || []));
  await context.close();
}
// ---- F: máy chưa từng online (chưa có bản lưu) + mất mạng → báo lỗi như trước
{
  const { context, page, state } = await newApp();
  state.net = 'offline';
  await page.goto('file://' + DIST); await waitLoaded(page);
  const s = await status(page);
  check('Chưa có bản lưu + mất mạng: báo lỗi kết nối như trước (không hiện dữ liệu rỗng giả)', s.dot === 'dot err' && /kiểm tra kết nối Internet/.test(s.text), s.text.slice(0, 90));
  await context.close();
}
// ---- G: trình duyệt không có IndexedDB → online vẫn chạy y như cũ
{
  const { context, page, state } = await newApp({ init: () => { try { Object.defineProperty(window, 'indexedDB', { value: undefined, configurable: true }); } catch (e) { /* */ } } });
  await page.goto('file://' + DIST); await waitLoaded(page);
  const s = await status(page);
  check('Không có IndexedDB: online vẫn tải bình thường, không lỗi', s.dot === 'dot ok' && s.text === 'Đã tải 40 phiếu cân, 15 đề nghị thanh toán' && !state.pageErrors, s.text);
  await context.close();
}
// ---- H: bản lưu bị hỏng (sai cấu trúc) → coi như chưa có, không crash
{
  const { context, page, state } = await newApp();
  await page.goto('file://' + DIST); await waitLoaded(page); await page.waitForTimeout(400);
  await page.evaluate(() => new Promise((res) => { const r = indexedDB.open('baocaongay-offline'); r.onsuccess = () => { const st = r.result.transaction('sheets', 'readwrite').objectStore('sheets'); const all = st.getAll(); all.onsuccess = () => { all.result.forEach((rec) => st.put(Object.assign({}, rec, { schema: 999, text: 12345 }))); st.transaction.oncomplete = () => { r.result.close(); res(); }; }; }; }));
  state.net = 'offline';
  await page.reload(); await waitLoaded(page);
  const s = await status(page);
  check('Bản lưu hỏng: bỏ qua an toàn, báo lỗi kết nối, không crash', s.dot === 'dot err' && !state.pageErrors, s.text.slice(0, 80));
  await context.close();
}
await browser.close();
console.log('\n=== RESULT: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail ? 1 : 0);
