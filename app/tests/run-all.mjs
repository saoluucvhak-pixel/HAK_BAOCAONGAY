// Chạy lần lượt mọi tests/test-*.mjs (và ui-baseline nếu có --ui), in bảng tóm tắt, thoát != 0 nếu có test hỏng.
// Chạy: npm test   (cần `npm run build` trước vì các test mở dist/index.html)
import { readdirSync } from 'fs';
import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const only = process.argv[2];
const files = readdirSync(dir).filter((f) => /^test-.*\.mjs$/.test(f) && (!only || f.includes(only))).sort();
const failed = [];
for (const f of files) {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [path.join(dir, f)], { encoding: 'utf8', timeout: 300000, maxBuffer: 64 * 1024 * 1024 });
  const ok = r.status === 0;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${f.padEnd(34)} ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  if (!ok) { failed.push(f); console.log((r.stdout || '').split('\n').slice(-12).join('\n') + (r.stderr || '').split('\n').slice(-6).join('\n')); }
}
console.log(`\n${files.length - failed.length}/${files.length} test đạt` + (failed.length ? `; hỏng: ${failed.join(', ')}` : ''));
process.exit(failed.length ? 1 : 0);
