import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTempRepo, TempRepo } from './helpers/repo';
import { produceHandoff, UnsupportedExportError } from '../src/core/producer';
import { parseHandoff } from '../src/core/handoff';

async function makeStashedRepo(): Promise<TempRepo> {
  const r = createTempRepo();
  await r.init();
  r.write('a.txt', 'base\n');
  r.write('b.txt', 'one\n');
  await r.commitAll('init');
  r.write('a.txt', 'base\nunstaged\n');
  r.write('b.txt', 'one\ntwo\n');
  await r.git(['add', 'b.txt']);
  r.write('new.txt', 'hello new');
  const st = await r.git(['stash', 'push', '-u', '-m', 'wip stuff']);
  if (st.code !== 0) throw new Error(`stash push failed: ${st.stderr}`);
  return r;
}

test('producer 拆分暂存/未暂存/untracked 三份状态', async (t) => {
  const r = await makeStashedRepo();
  t.after(() => r.destroy());

  const { text, file } = await produceHandoff(r.dir, 'stash@{0}');

  assert.ok(file.staged.patch.includes('b.txt'), 'staged patch 应包含 b.txt');
  assert.ok(!file.staged.patch.includes('a.txt'), 'staged patch 不应包含 a.txt');
  assert.ok(file.worktree.patch.includes('a.txt'), 'worktree patch 应包含 a.txt');
  assert.ok(
    file.untracked.some((u) => u.path === 'new.txt' && u.content === 'hello new'),
    'untracked 应包含 new.txt 的全文',
  );
  assert.ok(file.meta.stashMessage.includes('wip stuff'), '应记录 stash message');
  assert.ok(file.meta.baseCommit.length >= 7, '应记录 base commit');

  const parsed = parseHandoff(text);
  assert.deepEqual(parsed, file, '序列化后再解析应还原为同一结构');
});

test('producer 拒绝二进制文件', async (t) => {
  const r = createTempRepo();
  await r.init();
  r.write('a.txt', 'base\n');
  r.write('bin.dat', Buffer.from([0, 1, 2, 3, 4, 0xff, 0x80]));
  await r.commitAll('init');

  r.write('bin.dat', Buffer.from([9, 8, 7, 6, 5]));
  await r.git(['add', 'bin.dat']);

  const st = await r.git(['stash', 'push', '-u', '-m', 'wip bin']);
  assert.equal(st.code, 0, st.stderr);
  t.after(() => r.destroy());

  await assert.rejects(produceHandoff(r.dir, 'stash@{0}'), UnsupportedExportError);
});

test('producer 空仓库下无 untracked 的极简 stash (仅两个父提交)', async (t) => {
  const r = createTempRepo();
  await r.init();
  r.write('a.txt', 'base\n');
  r.write('b.txt', 'one\n');
  await r.commitAll('init');
  r.write('a.txt', 'base\nunstaged\n');
  const st = await r.git(['stash', 'push', '-m', 'only tracked']);
  assert.equal(st.code, 0, st.stderr);
  t.after(() => r.destroy());

  const { file } = await produceHandoff(r.dir, 'stash@{0}');
  assert.ok(file.worktree.patch.includes('a.txt'));
  assert.equal(file.untracked.length, 0);
});