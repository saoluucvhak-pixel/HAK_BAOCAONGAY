import { createHash, createPublicKey, generateKeyPairSync } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const policyFile = fileURLToPath(new URL('build/license-policy.json', root));
const qa = process.env.HAK_LICENSE_QA === '1';
let issuer;
if (qa) {
  const dir = process.env.HAK_QA_LICENSE_DIR;
  if (process.env.GITHUB_ACTIONS !== 'true' || process.env.HAK_REQUIRE_SIGNING === '1' || !dir) {
    throw new Error('Chính sách QA chỉ dùng trong CI thử nghiệm.');
  }
  const pair = generateKeyPairSync('ed25519');
  issuer = pair.publicKey.export({ format: 'jwk' });
  writeFileSync(path.join(dir, 'issuer-qa.pem'), pair.privateKey.export({ format: 'pem', type: 'pkcs8' }), { mode: 0o600 });
} else {
  const setting = process.env.HAK_LICENSE_PUBLIC_KEY;
  if (!setting) throw new Error('Cần khóa công khai HAK-PublicKey.jwk từ HTML quản trị.');
  const jwk = JSON.parse(setting);
  if (jwk.kty !== 'OKP' || jwk.crv !== 'Ed25519' || Object.hasOwn(jwk, 'd') ||
      typeof jwk.x !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(jwk.x) ||
      Buffer.from(jwk.x, 'base64url').toString('base64url') !== jwk.x) {
    throw new Error('Chỉ dùng khóa công khai Ed25519 của HAK.');
  }
  issuer = createPublicKey({ key: jwk, format: 'jwk' }).export({ format: 'jwk' });
}
mkdirSync(new URL('build/', root), { recursive: true });
writeFileSync(policyFile, JSON.stringify({ publicKey: issuer.x, qa }));
const out = fileURLToPath(new URL('build/license-bin/', root));
execFileSync('dotnet', ['build', fileURLToPath(new URL('licensing/HakLicense.csproj', root)),
  '-c', 'Release', '-o', out, '-p:HakPolicyPath=' + policyFile], { stdio: 'inherit' });

function digest(filename) {
  const bytes = readFileSync(path.join(out, filename));
  if (!bytes.length) throw new Error('Thiếu thành phần xác minh: ' + filename);
  return createHash('sha256').update(bytes).digest('hex');
}
writeFileSync(new URL('app/license-verifier.json', root), JSON.stringify({
  sha256: digest('HAK-License.exe'), cryptoSha256: digest('BouncyCastle.Cryptography.dll')
}));
