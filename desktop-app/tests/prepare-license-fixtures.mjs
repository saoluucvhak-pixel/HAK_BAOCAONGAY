import { execFileSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const dir = process.env.HAK_QA_LICENSE_DIR;
if (process.env.GITHUB_ACTIONS !== 'true' || process.platform !== 'win32' || !dir)
  throw new Error('Chỉ dùng để thử trên runner Windows.');
const helper = path.join(root, 'build', 'license-bin', 'HAK-License.exe');
const req = path.join(dir, 'device.hakreq');
execFileSync(helper, ['prepare-install-qa', req], { stdio: 'inherit' });
const { seed } = JSON.parse(readFileSync(path.join(root, 'build', 'license-policy.json'), 'utf8'));
const { device } = JSON.parse(readFileSync(req, 'utf8'));
const issuedAt = Math.floor(Date.now() / 1000);
const parsed = { product: 'com.hakgroup.baocaongay', version: 2, device, issuedAt, expiresAt: issuedAt + 86400 };
function mac(domain, body) {
  return createHmac('sha256', Buffer.from(seed, 'base64')).update(parsed.product + '\n' + domain + '\n').update(body).digest();
}
const code = String(mac('code-v1', device).readUIntBE(0, 6) % 1000000000000).padStart(12, '0');
writeFileSync(path.join(dir, 'approved.haklic'), code);

function fixture(filename, license, authenticated = true) {
  const body = Buffer.from(JSON.stringify(license));
  const signature = mac('setup-v1', body);
  if (!authenticated) signature[0] ^= 1;
  writeFileSync(path.join(dir, filename), JSON.stringify({ body: body.toString('base64'), signature: signature.toString('base64') }));
}

const company = {
  TenCty: 'Công ty HAK QA', DiaChi: 'Đắk Lắk',
  PhieuCan: 'https://docs.google.com/spreadsheets/d/e/hak-windows-qa-PhieuCan/pub?output=csv',
  DNTT: 'https://docs.google.com/spreadsheets/d/e/hak-windows-qa-DNTT/pub?output=csv'
};
fixture('wrong-device.haklic', { ...parsed, company, device: device === '00000000' ? '00000001' : '00000000' });
fixture('expired.haklic', { ...parsed, company, issuedAt: issuedAt - 60, expiresAt: issuedAt - 1 });
fixture('tampered.haklic', { ...parsed, company }, false);
fixture('approved.haksetup', { ...parsed, company });
fixture('tampered.haksetup', { ...parsed, company }, false);
