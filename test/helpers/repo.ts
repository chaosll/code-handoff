import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runGit, GitExecResult } from '../../src/core/git';

export class TempRepo {
  readonly dir: string;

  constructor(dir: string) {
    this.dir = dir;
  }

  git(args: string[], input?: string): Promise<GitExecResult> {
    return runGit(args, input !== undefined ? { cwd: this.dir, input } : { cwd: this.dir });
  }

  async init(): Promise<void> {
    const init = await runGit(['init', '-b', 'main'], { cwd: this.dir });
    if (init.code !== 0) throw new Error(`git init failed: ${init.stderr}`);
    await runGit(['config', 'user.name', 'Test'], { cwd: this.dir });
    await runGit(['config', 'user.email', 'handoff@test.dev'], { cwd: this.dir });
    await runGit(['config', 'commit.gpgsign', 'false'], { cwd: this.dir });
    await runGit(['config', 'core.autocrlf', 'false'], { cwd: this.dir });
  }

  write(rel: string, content: string | Buffer): void {
    writeFileSync(join(this.dir, rel), content);
  }

  read(rel: string): string {
    return readFileSync(join(this.dir, rel), 'utf8');
  }

  async commitAll(message: string): Promise<void> {
    const add = await runGit(['add', '-A'], { cwd: this.dir });
    if (add.code !== 0) throw new Error(`git add failed: ${add.stderr}`);
    const commit = await runGit(['commit', '-m', message], { cwd: this.dir });
    if (commit.code !== 0) throw new Error(`git commit failed: ${commit.stderr}`);
  }

  destroy(): void {
    rmSync(this.dir, { recursive: true, force: true });
  }
}

export function createTempRepo(): TempRepo {
  return new TempRepo(mkdtempSync(join(tmpdir(), 'handoff-src-')));
}

export async function cloneFrom(src: TempRepo, tag = 'dst'): Promise<TempRepo> {
  const dir = mkdtempSync(join(tmpdir(), `handoff-${tag}-`));
  const r = await runGit(['-c', 'core.autocrlf=false', 'clone', '--quiet', src.dir, dir]);
  if (r.code !== 0) throw new Error(`git clone failed: ${r.stderr}`);
  const repo = new TempRepo(dir);
  await runGit(['config', 'user.name', 'Test'], { cwd: dir });
  await runGit(['config', 'user.email', 'handoff@test.dev'], { cwd: dir });
  await runGit(['config', 'commit.gpgsign', 'false'], { cwd: dir });
  await runGit(['config', 'core.autocrlf', 'false'], { cwd: dir });
  return repo;
}