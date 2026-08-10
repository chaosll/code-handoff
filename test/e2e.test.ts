import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createTempRepo, cloneFrom } from './helpers/repo';
import { produceHandoff } from '../src/core/producer';
import { consumeHandoff } from '../src/core/consumer';

test('e2e: 对方已本地修改时, 导入产生 3-way 冲突并留标记', async (t) => {
  const src = createTempRepo();
  await src.init();
  src.write('a.txt', 'base\n');
  await src.commitAll('init');
  src.write('a.txt', 'base\nmine\n');
  const st = await src.git(['stash', 'push', '-m', 'conflict demo']);
  assert.equal(st.code, 0, st.stderr);

  const { text } = await produceHandoff(src.dir, 'stash@{0}');

  const tgt = await cloneFrom(src, 'dst');
  t.after(() => {
    src.destroy();
    tgt.destroy();
  });

  tgt.write('a.txt', 'base\nlocal\n');
  await tgt.git(['add', 'a.txt']);

  const result = await consumeHandoff(tgt.dir, text, {});
  assert.ok(
    result.issues.some((i) => i.kind === 'conflict' && i.path === 'a.txt'),
    `应报告 a.txt 冲突: ${JSON.stringify(result.issues)}`,
  );

  const content = readFileSync(join(tgt.dir, 'a.txt'), 'utf8');
  assert.ok(content.includes('<<<<<<<'), `应留下冲突标记:\n${content}`);
});

test('e2e: 干净仓库导入后 git status 与分享方一致', async (t) => {
  const src = createTempRepo();
  await src.init();
  src.write('a.txt', 'base\n');
  src.write('b.txt', 'one\n');
  await src.commitAll('init');
  src.write('a.txt', 'base\nunstaged\n');
  src.write('b.txt', 'one\ntwo\n');
  await src.git(['add', 'b.txt']);
  const st = await src.git(['stash', 'push', '-m', 'clean demo']);
  assert.equal(st.code, 0, st.stderr);

  const { text } = await produceHandoff(src.dir, 'stash@{0}');
  const tgt = await cloneFrom(src, 'dst');
  t.after(() => {
    src.destroy();
    tgt.destroy();
  });

  const result = await consumeHandoff(tgt.dir, text, {});
  assert.ok(
    result.issues.every((i) => i.kind !== 'failed'),
    JSON.stringify(result.issues),
  );

  const cached = await tgt.git(['diff', '--cached']);
  const worktree = await tgt.git(['diff']);
  assert.ok(/b\.txt/.test(cached.stdout), 'b.txt 应在 index 中');
  assert.ok(/a\.txt/.test(worktree.stdout), 'a.txt 应保持未暂存并出现在工作区 diff 中');
});