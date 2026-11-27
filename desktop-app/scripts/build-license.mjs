import { createHash, createPublicKey } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const policyFile = fileURLToPath(new URL('build/license-policy.json', root));
const publicSetting = process.env.HAK_LICENSE_PUBLIC_KEY;
if (!publicSetting) throw new Error('Cần đặt HAK_LICENSE_PUBLIC_KEY thành nội dung public.jwk của HAK.');
const qa = process.env.HAK_LICENSE_QA === '1';
if (qa && (process.env.GITHUB_ACTIONS !== 'true' || process.env.HAK_REQUIRE_SIGNING === '1'))
  throw new Error('Chính sách phần mềm QA chỉ dùng trong CI thử nghiệm.');
const jwk = JSON.parse(publicSetting);
if (jwk.kty !== 'RSA' || Object.hasOwn(jwk, 'd')) throw new Error('Chỉ nhập khóa công khai RSA JWK.');
const key = createPublicKey({ key: jwk, format: 'jwk' });
if (key.asymmetricKeyDetails.modulusLength < 3072) throw new Error('Khóa công khai HAK phải có ít nhất 3072 bit.');
const { n, e } = key.export({ format: 'jwk' });
mkdirSync(new URL('build/', root), { recursive: true });
writeFileSync(policyFile, JSON.stringify({ n, e, qa }));
const out = fileURLToPath(new URL('build/license-bin/', root));
execFileSync('dotnet', ['build', fileURLToPath(new URL('licensing/HakLicense.csproj', root)),
  '-c', 'Release', '-o', out, '-p:HakPolicyPath=' + policyFile], { stdio: 'inherit' });
const verifier = readFileSync(new URL('build/license-bin/HAK-License.exe', root));
if (!verifier.length) throw new Error('Thiếu công cụ cấp phép Windows.');
const sha256 = createHash('sha256').update(verifier).digest('hex');
writeFileSync(new URL('app/license-verifier.json', root), JSON.stringify({ sha256 }));
