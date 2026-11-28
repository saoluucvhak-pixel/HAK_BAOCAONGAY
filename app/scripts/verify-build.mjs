import assert from 'node:assert/strict';
import { appendFileSync, readFileSync, readdirSync } from 'node:fs';

const app = new URL('../', import.meta.url);
const dist = new URL('dist/', app);
assert.deepEqual(readdirSync(dist), ['index.html'], 'Bản web phải có đúng một file index.html.');

const html = readFileSync(new URL('index.html', dist));
assert.match(html.toString('utf8'), /<script id="hak-company-config" type="application\/json">\{\}<\/script>/);
const config = readFileSync(new URL('config.html', app), 'utf8');
const template = config.match(/const APP_TEMPLATE_B64 = "([A-Za-z0-9+/=]+)";/);
assert(template, 'Không tìm thấy HTML nhúng trong config.html.');
const cfgHtml = Buffer.from(template[1], 'base64');
if (!cfgHtml.equals(html)) {
  const msg = `config.html đang chứa bản web cũ (cfg=${cfgHtml.length}, dist=${html.length})`;
  console.error(msg);
  throw new Error(msg);
}

const electronHtml = readFileSync(new URL('../desktop-app/app/index.html', app));
if (!electronHtml.equals(html)) {
  let offset = 0;
  while (offset < electronHtml.length && offset < html.length && electronHtml[offset] === html[offset]) offset++;
  const diag = [
    `MISMATCH: desktop-app/app/index.html vs dist/index.html`,
    `Electron len: ${electronHtml.length}, Dist len: ${html.length}`,
    `First mismatch at offset ${offset}:`,
    `  Electron: ${JSON.stringify(electronHtml.subarray(offset, offset + 120).toString('utf8'))}`,
    `  Dist:     ${JSON.stringify(html.subarray(offset, offset + 120).toString('utf8'))}`
  ].join('\n');
  console.error(diag);
  if (process.env.GITHUB_STEP_SUMMARY) {
    try {
      appendFileSync(process.env.GITHUB_STEP_SUMMARY, '### Verify Build Mismatch\n```\n' + diag + '\n```\n');
    } catch (e) {
      void e;
    }
  }
  throw new Error(`Mẫu Electron đang chứa bản web cũ (offset ${offset})`);
}
console.log('PASS: Một file HTML. Mẫu cấu hình và Electron khớp từng byte.');
