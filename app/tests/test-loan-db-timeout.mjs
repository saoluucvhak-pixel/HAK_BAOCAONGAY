// Regression test: timeout mở kho khoản vay phải cho phép retry và đóng kết nối tới muộn.
import assert from 'node:assert/strict';
let attempts = 0, firstRequest;
globalThis.indexedDB = {
  open() {
    attempts++;
    const req = { result: null, error: null };
    if (attempts === 1) firstRequest = req;
    else queueMicrotask(() => { req.error = new Error('temporary DB unavailable'); req.onerror?.(); });
    return req;
  },
};
const { listLoans } = await import('../src/services/loan-store.js');
await assert.rejects(listLoans(), /quá thời gian chờ/);
assert.equal(attempts, 1);
await assert.rejects(listLoans(), /Lỗi mở kho khoản vay/);
assert.equal(attempts, 2, 'kho phải mở lại được sau lần timeout đầu');
let closed = false;
firstRequest.result = { close() { closed = true; } };
firstRequest.onsuccess?.();
assert.equal(closed, true, 'kết nối quá hạn phải được đóng');
console.log('PASS: loan DB timeout, retry and late connection cleanup');
