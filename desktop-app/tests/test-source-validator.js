// Unit tests of the HAK Sheet source validator (no Google access required).
const assert = require('node:assert/strict');
const { SOURCES, validateUrl, csvHeaders, probeSource, checkAll } = require('../app/source-validator.js');

const url = 'https://docs.google.com/spreadsheets/d/e/TEST_SOURCE/pub?gid=0&single=true&output=csv';
const source = SOURCES.find((s) => s.key === 'PhieuCan');
const okFetch = async (_url, opts) => {
  assert.equal(opts.cache, 'no-store');
  return { ok: true, status: 200, body: null, text: async () => source.columns.join(',') + '\n1,2,3' };
};
assert.equal(validateUrl(url), '');
assert.equal(validateUrl('https://docs.google.com/spreadsheets/d/ABC/export?format=csv'), '');
for (const bad of ['http://docs.google.com/spreadsheets/d/e/x/pub?output=csv',
  'https://evil.example/spreadsheets/d/e/x/pub?output=csv',
  'javascript:alert(1)', 'file:///etc/passwd', 'https://docs.google.com/spreadsheets/d/e/x/pub',
  'https://docs.google.com@evil.example/spreadsheets/d/e/x/pub?output=csv']) {
  assert.notEqual(validateUrl(bad), '', 'unsafe URL must be rejected: ' + bad);
}
assert.deepEqual(csvHeaders('\uFEFF"So,CT","Tên ""đại lý""",Ngày'), ['So,CT', 'Tên "đại lý"', 'Ngày']);
const good = await probeSource(source, url, okFetch, 100);
assert.equal(good.ok, true, JSON.stringify(good));
assert.equal((await probeSource(source, url, async () => ({
  ok: true, body: null, text: async () => 'So_CT,Khách hàng\n1,A'
}), 100)).ok, false, 'missing required columns must block save');
const notCsv = await probeSource(source, url, async () => ({
  ok: true, body: null, text: async () => '<!DOCTYPE html><html>Login</html>'
}), 100);
assert.equal(notCsv.ok, false);
assert.equal((await probeSource(source, url, async () => { throw Error('offline'); }, 100)).ok, false);
assert.equal((await probeSource(source, 'http://localhost:3000', okFetch, 100)).ok, false);
const optional = SOURCES.find((s) => s.key === 'HDNCC');
assert.equal((await probeSource(optional, '', okFetch, 100)).ok, true);
assert.equal((await probeSource(source, '', okFetch, 100)).ok, false);
// Streamed reader stops after header; must not read full spreadsheet on verification.
let readCount = 0, cancelled = false;
const stream = await probeSource(source, url, async () => ({
  ok: true, body: { getReader() { return {
    async read() {
      readCount++;
      return { done: false, value: new TextEncoder().encode(source.columns.join(',') + '\nDATA: SECRET,NEVER FETCH THIS') };
    },
    async cancel() { cancelled = true; }
  }; } }
}), 100);
assert.equal(stream.ok, true);
assert.equal(readCount, 1);
assert.equal(cancelled, true);
const all = await checkAll({ PhieuCan: url, DNTT: '', HDNCC: '', Hosokeo: '' }, okFetch, 100);
assert.equal(all.length, 4);
assert.equal(all.find((v) => v.key === 'DNTT').ok, false);
console.log('PASS: secure URL, CSV schema, streaming, offline, required/optional sources');
