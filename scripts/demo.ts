import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runGit } from '../src/core/git';
import { produceHandoff } from '../src/core/producer';

async function main() {
  const dir = mkdtempSync(join(tmpdir(), 'handoff-demo-'));
  try {
    const git = (args: string[]) => runGit(args, { cwd: dir });
    await git(['init', '-b', 'main']);
    await git(['config', 'user.name', 'Alice']);
    await git(['config', 'user.email', 'alice@team.dev']);
    await git(['config', 'core.autocrlf', 'false']);
    writeFileSync(join(dir, 'a.txt'), 'export function a() {}\n', 'utf8');
    writeFileSync(join(dir, 'b.txt'), 'export const b = 1;\n', 'utf8');
    await git(['add', '-A']);
    await git(['commit', '-m', 'init']);

    writeFileSync(join(dir, 'a.txt'), 'export function a() {\n  return "wip";\n}\n', 'utf8');
    writeFileSync(join(dir, 'b.txt'), 'export const b = 2;\n', 'utf8');
    await git(['add', 'b.txt']);
    writeFileSync(join(dir, 'new.ts'), 'export const c = 3;\n', 'utf8');
    await git(['stash', 'push', '-u', '-m', 'WIP: login feature']);

    const { text } = await produceHandoff(dir, 'stash@{0}');
    console.log(text);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

main();