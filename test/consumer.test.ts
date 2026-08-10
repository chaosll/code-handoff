import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createTempRepo, cloneFrom } from './helpers/repo';
import { produceHandoff } from '../src/core/producer';
import { consumeHandoff } from '../src/core/consumer';

test('导入后还原暂存/未暂存/untracked', async (t) => {
  const src = createTempRepo();
  await src.init();
  src.write('a.txt', 'base\n');
  src.write('b.txt', 'one\n');
  await src.commitAll('init');
  src.write('a.txt', 'base\nunstaged\n');
  src.write('b.txt', 'one\ntwo\n');
  await src.git(['add', 'b.txt']);
  src.write('new.txt', 'hello new');
  const st = await src.git(['stash', 'push', '-u', '-m', 'wip stuff']);
  assert.equal(st.code, 0, st.stderr);

  const { text } = await produceHandoff(src.dir, 'stash@{0}');
  const tgt = await cloneFrom(src, 'dst');
  t.after(() => {
    src.destroy();
    tgt.destroy();
  });

  const result = await consumeHandoff(tgt.dir, text, {
    onAskUntracked: async () => 'overwrite' as const,
  });
  assert.ok(
    result.issues.every((i) => i.kind !== 'failed'),
    `不应有失败项: ${JSON.stringify(result.issues)}`,
  );

  assert.equal(readFileSync(join(tgt.dir, 'a.txt'), 'utf8'), 'base\nunstaged\n', '未暂存内容应还原');
  const cached = await tgt.git(['diff', '--cached', '--name-only']);
  assert.ok(
    cached.stdout
      .split('\n')
      .map((s) => s.trim())
      .includes('b.txt'),
    '暂存内容应写回 index',
  );
  assert.equal(readFileSync(join(tgt.dir, 'new.txt'), 'utf8'), 'hello new', 'untracked 文件应还原');
});

test('untracked 目标已存在时按用户选择跳过', async (t) => {
  const src = createTempRepo();
  await src.init();
  src.write('a.txt', 'base\n');
  await src.commitAll('init');
  src.write('new.txt', 'from-src');
  const st = await src.git(['stash', 'push', '-u', '-m', 'adds new']);
  assert.equal(st.code, 0, st.stderr);

  const { text } = await produceHandoff(src.dir, 'stash@{0}');
  const tgt = await cloneFrom(src, 'dst');
  t.after(() => {
    src.destroy();
    tgt.destroy();
  });
  tgt.write('new.txt', 'local-version');

  const result = await consumeHandoff(tgt.dir, text, {
    onAskUntracked: async () => 'skip' as const,
  });
  assert.ok(result.issues.some((i) => i.path === 'new.txt' && i.kind === 'skipped'));
  assert.equal(readFileSync(join(tgt.dir, 'new.txt'), 'utf8'), 'local-version', '跳过时应保留本地文件');
});

test('非法输入被拒绝', async (t) => {
  const r = await createTempRepo();
  await r.init();
  t.after(() => r.destroy());
  await assert.rejects(consumeHandoff(r.dir, 'this is not yaml: ['));
  await assert.rejects(
    consumeHandoff(r.dir, 'version: 999\nmeta: { baseCommit: x, stashMessage: y }\n'),
    /版本/,
  );
});