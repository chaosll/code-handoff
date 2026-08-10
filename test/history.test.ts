import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addRecord,
  clearHistory,
  createId,
  HISTORY_LIMIT,
  removeRecord,
  ShareRecord,
  updateRecord,
} from '../src/core/history';

function rec(over: Partial<ShareRecord> = {}): ShareRecord {
  return {
    id: createId(),
    kind: 'export',
    stashMessage: 'WIP: feature',
    baseCommit: 'a1b2c3d4e5f6',
    createdAt: '2026-08-10T00:00:00.000Z',
    text: 'version: 1\n',
    ...over,
  };
}

test('history 新记录排在最前', () => {
  const a = rec({ id: 'a', text: 'ta' });
  const b = rec({ id: 'b', text: 'tb' });
  const list = addRecord(addRecord([], a), b);
  assert.equal(list[0]?.id, 'b');
  assert.equal(list[1]?.id, 'a');
});

test('history 超过上限自动截断', () => {
  let list: ShareRecord[] = [];
  for (let i = 0; i < HISTORY_LIMIT + 10; i++) {
    list = addRecord(list, rec({ id: `id${i}`, text: `t${i}` }));
  }
  assert.equal(list.length, HISTORY_LIMIT);
  assert.equal(list[0]?.id, `id${HISTORY_LIMIT + 9}`);
});

test('history 连续重复(同 stashMessage+text)去重, 保留最新', () => {
  const a = rec({ id: 'old', stashMessage: 'm', text: 'same' });
  const b = rec({ id: 'new', stashMessage: 'm', text: 'same' });
  const list = addRecord(addRecord([], a), b);
  assert.equal(list.length, 1);
  assert.equal(list[0]?.id, 'new');
});

test('history 不同 text 不去重', () => {
  const a = rec({ id: 'a', stashMessage: 'm', text: 't1' });
  const b = rec({ id: 'b', stashMessage: 'm', text: 't2' });
  const list = addRecord(addRecord([], a), b);
  assert.equal(list.length, 2);
});

test('history remove 与 clear', () => {
  const a = rec({ id: 'a', text: 'ta' });
  const b = rec({ id: 'b', text: 'tb' });
  const list = addRecord(addRecord([], a), b);
  assert.equal(removeRecord(list, 'b').length, 1);
  assert.equal(removeRecord(list, 'a')[0]?.id, 'b');
  assert.deepEqual(clearHistory(), []);
});

test('history update 打补丁', () => {
  const a = rec({ id: 'a' });
  const list = updateRecord([a], 'a', { result: { ok: 1, conflict: 0, failed: 0, skipped: 0 } });
  assert.deepEqual(list[0]?.result, { ok: 1, conflict: 0, failed: 0, skipped: 0 });
  assert.equal(list[0]?.stashMessage, a.stashMessage);
});