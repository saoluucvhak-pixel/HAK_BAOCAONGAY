// Regression: một lần mở IndexedDB bị treo không được vô hiệu hoá cache offline mãi mãi.
// Node test độc lập, không cần trình duyệt hoặc mạng; timeout thực tế trong module là 3 giây.
import assert from 'node:assert/strict';

let attempts = 0;
let firstRequest;
globalThis.indexedDB = {
  open() {
    attempts++;
    const req = { result: null, error: null };
    if (attempts === 1) {
      firstRequest = req; // giả lập kho đang bị tab khác khoá, request treo > 3 giây
    } else {
      queueMicrotask(() => {
        req.error = new Error('temporary IndexedDB failure');
        req.onerror?.();
      });
    }
    return req;
  },
};

const { loadSheetText } = await import('../src/services/offline-cache.js');
const startedAt = Date.now();
assert.equal(await loadSheetText('https://example.test/sheet'), null);
assert.ok(Date.now() - startedAt >= 2900, 'timeout phải được kích hoạt');
assert.equal(attempts, 1);

// Lần gọi kế tiếp phải thử indexedDB.open lần thứ hai, không tái sử dụng Promise(null).
assert.equal(await loadSheetText('https://example.test/sheet'), null);
assert.equal(attempts, 2, 'phải thử mở lại IndexedDB sau timeout');

// Nếu request đầu hoàn tất trễ, phải đóng kết nối cũ để không chặn nâng cấp phiên bản.
let closed = false;
firstRequest.result = { close() { closed = true; } };
firstRequest.onsuccess?.();
assert.equal(closed, true, 'kết nối đến muộn phải được đóng');
console.log('PASS: IndexedDB timeout → retry → close late connection');
