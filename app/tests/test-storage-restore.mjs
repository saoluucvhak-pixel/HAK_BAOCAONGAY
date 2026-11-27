// Kiểm thử dữ liệu sao lưu: từ chối cấu trúc hỏng; không báo thành công khi ghi lỗi;
// khôi phục các giá trị cũ khi lỗi giữa chừng.
import assert from 'node:assert/strict';
import { CONFIG } from '../src/config/config.js';
const records = new Map();
let failOnceFor = null;
globalThis.localStorage = {
  getItem(key) { return records.has(key) ? records.get(key) : null; },
  setItem(key, value) {
    if (key === failOnceFor) { failOnceFor = null; throw new Error('QuotaExceededError'); }
    records.set(key, String(value));
  },
  removeItem(key) { records.delete(key); },
};
const { storageService } = await import('../src/services/storage-service.js');
assert.equal(storageService.importAll({ data: null }).ok, false);
assert.equal(storageService.importAll({ data: [] }).ok, false);
assert.equal(storageService.importAll({}).ok, false);
const dm = CONFIG.STORAGE_KEYS.DM_DL;
const bank = CONFIG.STORAGE_KEYS.BANK_INFO;
localStorage.setItem(dm, '"original-dm"');
localStorage.setItem(bank, '"original-bank"');
failOnceFor = bank;
const failed = storageService.importAll({ data: { DM_DL: ['new'], BANK_INFO: { name: 'new' } } });
assert.equal(failed.ok, false, 'phải báo lỗi khi có một key không ghi được');
assert.deepEqual(failed.restoredKeys, [], 'không được công bố đã khôi phục khi chưa hoàn tất');
assert.equal(localStorage.getItem(dm), '"original-dm"', 'phải hoàn nguyên mục đã ghi trước khi lỗi');
assert.equal(localStorage.getItem(bank), '"original-bank"', 'phải giữ mục bị lỗi');
const ok = storageService.importAll({ data: { DM_DL: ['new'], BANK_INFO: { name: 'new' } } });
assert.equal(ok.ok, true);
assert.deepEqual(ok.restoredKeys, ['DM_DL', 'BANK_INFO']);
assert.deepEqual(storageService.get(dm), ['new']);
assert.deepEqual(storageService.get(bank), { name: 'new' });
// Snapshot nguyên trạng phải nhớ cả khoá CHƯA TỒN TẠI, không chỉ giá trị != null.
const wo = CONFIG.STORAGE_KEYS.WO_INFO;
records.delete(wo);
const snap = storageService.snapshotRaw();
localStorage.setItem(wo, '"introduced-by-restore"');
storageService.set(dm, ['changed-again']);
assert.equal(storageService.restoreRaw(snap), true);
assert.equal(localStorage.getItem(wo), null, 'khôi phục phải xoá khoá vốn không tồn tại');
assert.deepEqual(storageService.get(dm), ['new'], 'khôi phục giá trị cũ byte-for-byte');
console.log('PASS: restore validates backup, rolls back failed writes, preserves existing data');

const history = CONFIG.STORAGE_KEYS.forestryHistory;
const old = { source: 'old', from: '2026-01-01', to: '2026-01-31', createdAt: '2026-02-01T00:00:00Z', opening: 0, closing: 12, selected: ['M'] };
assert.ok(storageService.set(history, [old]));
assert.equal(storageService.importAll({ data: { forestryHistory: [{ ...old, createdAt: 'invalid' }], DM_DL: ['wrong'] } }).ok, false);
assert.deepEqual(storageService.get(history), [old]);
