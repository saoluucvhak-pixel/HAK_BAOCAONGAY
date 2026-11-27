import { execFileSync } from 'node:child_process';
import { createPrivateKey, randomBytes, sign } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const dir = process.env.HAK_QA_LICENSE_DIR;
if (process.env.GITHUB_ACTIONS !== 'true' || process.platform !== 'win32' || !dir)
  throw new Error('Chỉ dùng để thử trên runner Windows.');
const helper = path.join(root, 'build', 'license-bin', 'HAK-License.exe');
const req = path.join(dir, 'device.hakreq');
execFileSync(helper, ['request', req], { stdio: 'inherit' });
const privatePath = path.join(dir, 'private.pem');
const agreed = path.join(dir, 'approved.haklic');
const future = new Date(Date.now() + 20 * 86400000).toISOString().slice(0, 10);
execFileSync(process.execPath, [path.join(root, 'licensing', 'admin.mjs'), 'issue', privatePath,
  req, agreed, 'HAK-WINDOWS-QA', future, '--qa'], { stdio: 'inherit' });

const key = createPrivateKey(readFileSync(privatePath));
const original = JSON.parse(readFileSync(agreed, 'utf8'));
const parsed = JSON.parse(Buffer.from(original.body, 'base64'));
function fixture(kind, license, signBody) {
  const body = Buffer.from(JSON.stringify(license));
  const signature = signBody ? sign('sha256', body, key).toString('base64') : original.signature;
  writeFileSync(path.join(dir, kind + '.haklic'), JSON.stringify({ body: body.toString('base64'), signature }));
}
fixture('wrong-device', { ...parsed, device: randomBytes(32).toString('base64') }, true);
fixture('expired', { ...parsed, issuedAt: parsed.issuedAt - 60, expiresAt: parsed.issuedAt - 1 }, true);
fixture('tampered', { ...parsed, expiresAt: parsed.expiresAt + 86400 }, false);
