import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import XLSX from 'xlsx';
import { launchChromium } from './browser-launcher.mjs';
import { genDNTT, genHDNCC, genHosokeo, genPhieuCan, toCSV } from './fixtures.mjs';

const url = new URL('../dist/index.html', import.meta.url).href;
const rows = genPhieuCan(10_001).map((row, index) => ({
  ...row, 'Ngày cân 1': '15/6/2026', 'Ngày cân 2': '15/6/2026',
  'KL hàng (KG)': index === 0 ? '1234.567' : '0',
  'Thành tiền': index === 0 ? '-1234.50' : '0'
}));
const payments = genDNTT(rows, 4).map((row) => ({ ...row, 'Ngày thanh toán': '16/6/2026' }));
const shipments = genHosokeo(4).map((row) => ({ ...row, 'Ngày nhập': '16/6/2026' }));
const payloads = [
  ['tytjQLj', toCSV(rows)], ['zPk2i', toCSV(payments)],
  ['wW_a10', toCSV(genHDNCC(payments))], ['esmF7s', toCSV(shipments)]
];

const browser = await launchChromium();
try {
  const page = await browser.newPage({ acceptDownloads: true, colorScheme: 'light', viewport: { width: 1280, height: 800 } });
  page.setDefaultTimeout(30_000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('https://docs.google.com/**', (route) => {
    const found = payloads.find(([match]) => route.request().url().includes(match));
    return route.fulfill({ status: 200, contentType: 'text/csv', body: found?.[1] || '' });
  });
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    window.reportWorkers = { results: 0, source: '', blocked: false };
    window.Worker = class extends NativeWorker {
      constructor(source, options) {
        if (window.reportWorkers.blocked) throw new Error('Worker chặn trong kiểm thử');
        super(source, options);
        window.reportWorkers.source = String(source);
        this.addEventListener('message', ({ data }) => {
          if (data.result?.nhap?.rows.length === 10_001) window.reportWorkers.results++;
        });
      }
    };
  });

  async function runReport() {
    await page.evaluate(() => {
      document.querySelector('#fFrom').value = '2026-06-01';
      document.querySelector('#fTo').value = '2026-06-30';
      document.querySelector('#btnLapBC').click();
    });
    await page.waitForFunction(() => !document.querySelector('#btnLapBC').hasAttribute('aria-busy'));
  }

  await page.goto(url);
  await page.waitForFunction(() => document.querySelector('#dashCards .card'));
  await runReport();
  const workers = await page.evaluate(() => window.reportWorkers);
  assert.match(workers.source, /^(blob:|data:)/, 'Worker nằm trong bản HTML mở qua file://');
  assert.equal(workers.results, 1, 'Worker tính đủ 10.001 phiếu trong kỳ');
  const reportSummary = () => page.locator('[data-count], table[id^="tbl-"] tfoot').allTextContents();
  const expected = await reportSummary();
  assert.match(await page.locator('#tbl-nhapkeo tfoot').textContent(), /1\.235.*-1\.234/s);

  const waitForBarColor = (rgb) => page.waitForFunction(([red, green, blue]) => {
    const canvas = document.querySelector('#chartKLNgay');
    const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    for (let offset = 0; offset < pixels.length; offset += 4) {
      if (pixels[offset] === red && pixels[offset + 1] === green && pixels[offset + 2] === blue) return true;
    }
    return false;
  }, rgb);
  await waitForBarColor([29, 58, 99]); // Luxe
  await page.selectOption('#themeSkin', 'ngoc');
  await waitForBarColor([4, 120, 87]); // Ngọc bích
  await page.selectOption('#themeMode', 'dark');
  await waitForBarColor([52, 211, 153]);

  await page.evaluate(() => { window.reportWorkers.blocked = true; });
  await runReport();
  assert.deepEqual(await reportSummary(), expected, 'Kết quả Worker khớp với fallback');

  // Bảng hiện có được vẽ lại, giá trị raw của Excel vẫn giữ đủ độ chính xác.
  await page.click('[data-target="cauhinh"]');
  await page.click('#btnPrecisionSettings');
  await page.selectOption('[name="moneyDigits"]', '2');
  await page.selectOption('[name="quantityDigits"]', '3');
  await page.selectOption('[name="negative"]', 'parentheses');
  await page.click('#btnPrecisionSave');
  assert.match(await page.locator('#tbl-nhapkeo tfoot').textContent(), /1\.234,567.*\(1\.234,50\)/s);
  const toast = page.locator('.toast-success').filter({ hasText: 'Đã lưu cài đặt định dạng số' });
  await toast.getByRole('button', { name: 'Đóng thông báo' }).click();
  assert.equal(await toast.count(), 0);

  await page.click('[data-target="baocao"]');
  await page.fill('[data-search="nhapkeo"]', 'CT0000');
  const excelButton = '[data-tools="nhapkeo"] [data-act="excel"]';
  const [excel] = await Promise.all([page.waitForEvent('download'), page.click(excelButton)]);
  const book = XLSX.read(readFileSync(await excel.path()), { type: 'buffer', cellNF: true });
  const cells = Object.values(book.Sheets.nhapkeo);
  assert(cells.some(({ v, z }) => v === -1234.50 && z === '#,##0.00;(#,##0.00)'));
  assert(cells.some(({ v, z }) => v === 1234.567 && z === '#,##0.000;(#,##0.000)'));
  await page.locator('#exportProgress').waitFor({ state: 'hidden' });

  await page.evaluate(() => {
    window.print = () => { window.printedText = document.querySelector('#printSheet').textContent; };
  });
  await page.click('[data-tools="nhapkeo"] [data-act="print"]');
  assert.match(await page.evaluate(() => window.printedText), /\(1\.234,50\)/);

  const [pdf] = await Promise.all([
    page.waitForEvent('download'), page.click('[data-tools="nhapkeo"] [data-act="pdf"]')
  ]);
  const pdfText = execFileSync('pdftotext', [await pdf.path(), '-'], { encoding: 'utf8' });
  assert.match(pdfText, /\(1\.234,50\)/);
  assert.match(pdfText, /1\.234,567/);
  await page.locator('.toast-success').filter({ hasText: 'Đã tạo file' }).last().waitFor();

  await page.reload();
  await page.waitForFunction(() => document.querySelector('#dashCards .card'));
  await runReport();
  assert.match(await page.locator('#tbl-nhapkeo tfoot').textContent(), /1\.234,567.*\(1\.234,50\)/s);
  assert.deepEqual(errors, []);
  console.log('PASS: Worker offline, fallback, cài đặt lưu qua lần tải lại, toast, In, Excel và PDF.');
} finally {
  await browser.close();
}
