import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const app = new URL('../', import.meta.url);
const dist = new URL('dist/', app);
assert.deepEqual(readdirSync(dist), ['index.html'], 'Bản web phải có đúng một file index.html.');

const html = readFileSync(new URL('index.html', dist));
assert.match(html.toString('utf8'), /<script id="hak-company-config" type="application\/json">\{\}<\/script>/);
const config = readFileSync(new URL('config.html', app), 'utf8');
const template = config.match(/const APP_TEMPLATE_B64 = "([A-Za-z0-9+/=]+)";/);
assert(template, 'Không tìm thấy HTML nhúng trong config.html.');
assert.equal(Buffer.compare(Buffer.from(template[1], 'base64'), html), 0, 'config.html đang chứa bản web cũ.');
assert.equal(Buffer.compare(readFileSync(new URL('../desktop-app/app/index.html', app)), html), 0, 'Mẫu Electron đang chứa bản web cũ.');
console.log('PASS: Một file HTML. Mẫu cấu hình và Electron khớp từng byte.');
