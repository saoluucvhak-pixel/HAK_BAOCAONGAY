import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const policyFile = fileURLToPath(new URL('build/license-policy.json', root));
const qa = process.env.HAK_LICENSE_QA === '1';
if (qa && (process.env.GITHUB_ACTIONS !== 'true' || process.env.HAK_REQUIRE_SIGNING === '1'))
  throw new Error('Chính sách QA chỉ dùng trong CI thử nghiệm.');
const seed = randomBytes(32).toString('base64');
mkdirSync(new URL('build/', root), { recursive: true });
writeFileSync(policyFile, JSON.stringify({ seed, qa }));
const admin = readFileSync(new URL('licensing/HAK-CapPhep.html', root), 'utf8');
if (!admin.includes('__HAK_BUILD_SEED__')) throw new Error('Thiếu vị trí cấu hình bộ giải mã.');
writeFileSync(new URL('build/HAK-CapPhep.html', root), admin.replace('__HAK_BUILD_SEED__', seed));
const out = fileURLToPath(new URL('build/license-bin/', root));
execFileSync('dotnet', ['build', fileURLToPath(new URL('licensing/HakLicense.csproj', root)),
  '-c', 'Release', '-o', out, '-p:HakPolicyPath=' + policyFile], { stdio: 'inherit' });
const verifier = readFileSync(new URL('build/license-bin/HAK-License.exe', root));
if (!verifier.length) throw new Error('Thiếu công cụ cấp phép Windows.');
const sha256 = createHash('sha256').update(verifier).digest('hex');
writeFileSync(new URL('app/license-verifier.json', root), JSON.stringify({ sha256 }));
