import { execFileSync } from 'node:child_process';
import { createPrivateKey } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { newRequest, packSetup, response } from './ed25519-fixtures.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const dir = process.env.HAK_QA_LICENSE_DIR;
if (process.env.GITHUB_ACTIONS !== 'true' || process.platform !== 'win32' || !dir)
  throw new Error('Chỉ dùng để thử trên runner Windows.');
const helper = path.join(root, 'build', 'license-bin', 'HAK-License.exe');
const req = path.join(dir, 'device.hakreq');
execFileSync(helper, ['prepare-install-qa', req], { stdio: 'inherit' });
const issuer = createPrivateKey(readFileSync(path.join(dir, 'issuer-qa.pem')));
const { device } = JSON.parse(readFileSync(req, 'utf8'));
writeFileSync(path.join(dir, 'approved-response.txt'), response(issuer, device));

const company = {
  TenCty: 'Công ty HAK QA', DiaChi: 'Đắk Lắk',
  PhieuCan: 'https://docs.google.com/spreadsheets/d/e/hak-windows-qa-PhieuCan/pub?output=csv',
  DNTT: 'https://docs.google.com/spreadsheets/d/e/hak-windows-qa-DNTT/pub?output=csv',
  XuatHang: 'https://docs.google.com/spreadsheets/d/hak-windows-qa-XuatHang/edit'
};
function fixture(filename, setup) {
  writeFileSync(path.join(dir, filename), JSON.stringify(setup));
}
fixture('wrong-device.haklic', packSetup(issuer, newRequest().wire, company));
const now = Math.floor(Date.now() / 1000);
fixture('expired.haklic', packSetup(issuer, device, company, { issuedAt: now - 60, expiresAt: now - 1 }));
const valid = packSetup(issuer, device, company);
const tampered = { ...valid, body: (valid.body[0] === 'A' ? 'B' : 'A') + valid.body.slice(1) };
fixture('tampered.haklic', tampered);
fixture('tampered.haksetup', tampered);
fixture('approved.haksetup', valid);
fixture('approved-upgrade.haksetup', packSetup(issuer, device, {
  ...company, TenCty: 'HAK Windows QA', MaHS: '4401220088', NhaMay: 'HAK-QA',
  HDNCC: 'https://docs.google.com/spreadsheets/d/e/hak-windows-qa-HDNCC/pub?output=csv',
  Hosokeo: 'https://docs.google.com/spreadsheets/d/e/hak-windows-qa-Hosokeo/pub?output=csv'
}));
