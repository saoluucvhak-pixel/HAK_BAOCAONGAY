import assert from 'node:assert/strict';
import { summarizeDuplicateKeys } from '../src/utils/data-integrity.js';

assert.deepEqual(summarizeDuplicateKeys([], 'So_CT'), { count: 0, extraRows: 0, samples: [] });
assert.deepEqual(summarizeDuplicateKeys([
  { So_CT: ' PC01 ' }, { So_CT: 'PC02' }, { So_CT: 'PC01' },
  { So_CT: 'PC01' }, { So_CT: 'PC02' }, { So_CT: '' }, {}
], 'So_CT'), { count: 2, extraRows: 3, samples: ['PC01', 'PC02'] });
assert.deepEqual(summarizeDuplicateKeys([{ So_CT: 'A' }, { So_CT: 'A' }, { So_CT: 'B' }, { So_CT: 'B' }], 'So_CT', 1),
  { count: 2, extraRows: 2, samples: ['A'] });
console.log('PASS: duplicate-slip detection preserves all original rows.');
