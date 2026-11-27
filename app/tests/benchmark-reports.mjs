import assert from 'node:assert/strict';
import { stat } from 'node:fs/promises';
import { platform, release, cpus } from 'node:os';
import { performance } from 'node:perf_hooks';
import { launchChromium } from './browser-launcher.mjs';
import { genDNTT, genHDNCC, genHosokeo, genPhieuCan, toCSV } from './fixtures.mjs';

const sizes = process.argv.slice(2).map(Number);
assert(sizes.every((size) => Number.isSafeInteger(size) && size > 0), 'Số phiếu cân phải là số nguyên dương.');
const url = new URL('../dist/index.html', import.meta.url).href;
const template = genPhieuCan(1)[0];
const MiB = 1024 ** 2;
const browser = await launchChromium();

async function measure(page, cdp, operation) {
  await page.evaluate(() => { window.hakLongTasks.length = 0; });
  const before = await cdp.send('Performance.getMetrics');
  const start = performance.now();
  const result = await operation();
  const elapsed = performance.now() - start;
  await page.evaluate(() => new Promise((done) => setTimeout(done, 0)));
  const after = await cdp.send('Performance.getMetrics');
  const longTasks = await page.evaluate(() => window.hakLongTasks);
  const heap = (data) => (data.metrics.find((entry) => entry.name === 'JSHeapUsedSize')?.value || 0) / MiB;
  return {
    ms: Math.round(elapsed),
    heapBeforeMiB: Math.round(heap(before)), heapAfterMiB: Math.round(heap(after)),
    longTasks: longTasks.length, longestTaskMs: Math.round(Math.max(0, ...longTasks)),
    ...(typeof result === 'number' ? { fileMiB: +(result / MiB).toFixed(2) } : {})
  };
}

async function runCase(size) {
  const scaleRows = Array.from({ length: size }, (_, index) => {
    const day = index % 30 + 1;
    return {
      ...template, 'So_CT': 'PC' + index, 'Ngày cân 1': '2026-06-' + String(day).padStart(2, '0'), 'Ngày cân 2': '2026-06-' + String(day).padStart(2, '0'),
      'Giờ cân 1': '08:00', 'Giờ cân 2': '08:40', 'Thành tiền': '12600000',
      'KL hàng (KG)': '8000', 'ĐL': index % 2 ? 'DT' : 'QT'
    };
  });
  const payments = genDNTT(scaleRows, 200);
  const sources = [
    ['tytjQLj', toCSV(scaleRows)], ['zPk2i', toCSV(payments)],
    ['wW_a10', toCSV(genHDNCC(payments))], ['esmF7s', toCSV(genHosokeo(50))]
  ];
  const context = await browser.newContext({ acceptDownloads: true });
  try {
    const page = await context.newPage();
    page.setDefaultTimeout(180_000);
    await page.addInitScript(() => {
      window.hakLongTasks = [];
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) window.hakLongTasks.push(entry.duration);
      }).observe({ type: 'longtask' });
    });
    await page.route('https://docs.google.com/**', (route) => {
      const source = sources.find(([match]) => route.request().url().includes(match));
      return route.fulfill({ status: 200, contentType: 'text/csv', body: source?.[1] || '' });
    });
    const cdp = await context.newCDPSession(page);
    await cdp.send('Performance.enable');
    async function report(from, to, expected) {
      await page.fill('#fFrom', from);
      await page.fill('#fTo', to);
      await page.click('#btnLapBC');
      await page.waitForFunction((count) => {
        const text = document.querySelector('[data-count="nhapkeo"]')?.textContent.replace(/\D/g, '');
        return Number(text) === count && !document.querySelector('#btnLapBC').hasAttribute('aria-busy');
      }, expected);
    }
    async function download(selector) {
      const [file] = await Promise.all([page.waitForEvent('download'), page.click(selector)]);
      const bytes = (await stat(await file.path())).size;
      await page.locator('#exportProgress').waitFor({ state: 'hidden' });
      return bytes;
    }

    await page.goto(url);
    await page.waitForFunction(() => document.querySelector('#dashCards .card'));
    const monthlyReport = await measure(page, cdp, () => report('2026-06-01', '2026-06-30', size));
    const dailyRows = Math.ceil(size / 30);
    await page.click('[data-target="baocao"]');
    await page.fill('#fTo', '2026-06-01');
    const dailyExcel = await measure(page, cdp, () => download('#btnExportAllNgay'));
    await report('2026-06-01', '2026-06-01', dailyRows);
    const dailyPdf = await measure(page, cdp, () => download('[data-tools="nhapkeo"] [data-act="pdf"]'));
    console.log(JSON.stringify({ rows: size, dailyRows, monthlyReport, dailyExcel, dailyPdf }));
  } finally {
    await context.close();
  }
}

try {
  console.log(JSON.stringify({
    platform: platform(), os: release(), cpu: cpus()[0].model,
    logicalCores: cpus().length, chromium: browser.version()
  }));
  for (const size of sizes.length ? sizes : [10_000, 30_000, 100_000]) await runCase(size);
} finally {
  await browser.close();
}
