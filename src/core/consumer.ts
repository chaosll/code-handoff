import { existsSync, mkdirSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { parseHandoff, HandoffSection } from './handoff';
import { GitExecResult, runGit } from './git';

export type OverwriteDecision = 'overwrite' | 'skip';

export interface ApplyIssue {
  kind: 'ok' | 'conflict' | 'failed' | 'skipped';
  path: string;
  detail: string;
}

export interface ApplyResult {
  issues: ApplyIssue[];
}

export interface ImportPreview {
  dirty: boolean;
  dirtyFiles: string[];
  baseCommit: string;
  baseCommitPresent: boolean;
  stagedFails: string[];
  worktreeFails: string[];
}

const STAGE_ERROR_RE = /error: patch failed: (.+?):\d+/g;
const INDEX_MISMATCH_RE = /error: (.+?): does not match index/g;

async function capturedCheckFails(cwd: string, patch: string, cached: boolean): Promise<string[]> {
  if (!patch.trim()) return [];
  const flags = cached ? ['--check', '--cached'] : ['--check'];
  const r = await runGit(['apply', ...flags, '-'], { cwd, input: patch });
  if (r.code === 0) return [];
  const out: string[] = [];
  STAGE_ERROR_RE.lastIndex = 0;
  for (const m of r.stderr.matchAll(STAGE_ERROR_RE)) {
    const f = m[1].trim();
    if (f && !out.includes(f)) out.push(f);
  }
  INDEX_MISMATCH_RE.lastIndex = 0;
  for (const m of r.stderr.matchAll(INDEX_MISMATCH_RE)) {
    const f = m[1].trim();
    if (f && !out.includes(f)) out.push(f);
  }
  if (out.length === 0) out.push(`<${cached ? 'staged' : 'worktree'}>`);
  return out.slice(0, 10);
}

export async function previewImport(cwd: string, text: string, sourceName = '输入'): Promise<ImportPreview> {
  const hf = parseHandoff(text, sourceName);

  const status = await runGit(['status', '--porcelain'], { cwd });
  const dirtyFiles: string[] = [];
  for (const line of status.stdout.split('\n')) {
    if (line.startsWith('?? ')) continue;
    const f = line.slice(3).trim();
    if (f && dirtyFiles.length < 5) dirtyFiles.push(f);
  }

  const base = await runGit(['cat-file', '-e', `${hf.meta.baseCommit}^{commit}`], { cwd });

  const stagedFails = await capturedCheckFails(cwd, hf.staged.patch, true);
  const worktreeFails = await capturedCheckFails(cwd, hf.worktree.patch, false);

  return {
    dirty: dirtyFiles.length > 0,
    dirtyFiles,
    baseCommit: hf.meta.baseCommit,
    baseCommitPresent: base.code === 0,
    stagedFails,
    worktreeFails,
  };
}

async function collectUnmerged(cwd: string): Promise<Set<string>> {
  const r = await runGit(['ls-files', '-u', '--'], { cwd });
  const set = new Set<string>();
  for (const line of r.stdout.split('\n')) {
    if (!line) continue;
    const path = line.split('\t').pop();
    if (path) set.add(path);
  }
  return set;
}

function markSection(opts: {
  label: string;
  section: HandoffSection;
  result: GitExecResult;
  prev: Set<string>;
  cur: Set<string>;
  issues: ApplyIssue[];
}): void {
  const { label, section, result, prev, issues } = opts;
  const newlyConflicted = new Set([...opts.cur].filter((p) => !prev.has(p)));
  const files = section.files;

  if (result.code === 0) {
    for (const f of files) {
      if (newlyConflicted.has(f)) {
        issues.push({ kind: 'conflict', path: f, detail: `${label}: 冲突由 3-way 自动合并` });
      } else {
        issues.push({ kind: 'ok', path: f, detail: `${label} 已应用` });
      }
    }
    return;
  }

  const failedByMsg = new Map<string, string>();
  STAGE_ERROR_RE.lastIndex = 0;
  for (const m of result.stderr.matchAll(STAGE_ERROR_RE)) {
    failedByMsg.set(m[1], '补丁上下文不匹配');
  }

  for (const f of files) {
    if (newlyConflicted.has(f)) {
      issues.push({ kind: 'conflict', path: f, detail: `${label}: 冲突,已写入标记请手动解决` });
    } else if (failedByMsg.has(f)) {
      issues.push({ kind: 'failed', path: f, detail: `${label}: ${failedByMsg.get(f)}` });
    } else {
      issues.push({ kind: 'failed', path: f, detail: `${label}: 应用失败` });
    }
  }
  const raw = (result.stderr || `git apply exit ${result.code}`).trim().slice(0, 2000);
  if (!files.length && raw) {
    issues.push({ kind: 'failed', path: `<${label}>`, detail: raw });
  }
}

export interface ConsumeOptions {
  onAskUntracked?: (path: string) => Promise<OverwriteDecision>;
  sourceName?: string;
}

async function applyPatch(cwd: string, patch: string, flags: string[]): Promise<GitExecResult> {
  return runGit(['apply', ...flags, '--whitespace=nowarn', '-'], { cwd, input: patch });
}

export async function consumeHandoff(
  cwd: string,
  text: string,
  opts: ConsumeOptions = {},
): Promise<ApplyResult> {
  const hf = parseHandoff(text, opts.sourceName);
  const issues: ApplyIssue[] = [];
  const onAsk = opts.onAskUntracked ?? (async () => 'overwrite' as const);

  let prev = await collectUnmerged(cwd);

  let stagedResult = await applyPatch(cwd, hf.staged.patch, ['--cached', '--3way']);
  if (stagedResult.code !== 0) {
    stagedResult = await applyPatch(cwd, hf.staged.patch, ['--cached']);
  }
  let cur = await collectUnmerged(cwd);
  markSection({ label: 'staged', section: hf.staged, result: stagedResult, prev, cur, issues });
  prev = cur;

  let worktreeResult = await applyPatch(cwd, hf.worktree.patch, ['--3way']);
  if (worktreeResult.code !== 0) {
    worktreeResult = await applyPatch(cwd, hf.worktree.patch, []);
  }
  cur = await collectUnmerged(cwd);
  markSection({ label: 'worktree', section: hf.worktree, result: worktreeResult, prev, cur, issues });
  prev = cur;

  if (worktreeResult.code === 0) {
    // --3way 隐含 --index,会把本应"未暂存"的文件也写入 index。
    // 这里把 worktree 独有的文件从 index 摘除,恢复到"未暂存"语义。
    const toUnstage = hf.worktree.files.filter((f) => !hf.staged.files.includes(f));
    if (toUnstage.length > 0) {
      await runGit(['restore', '--staged', '--ignore-unmerged', '--', ...toUnstage], { cwd });
    }
  }

  for (const u of hf.untracked) {
    const target = join(cwd, u.path);
    if (existsSync(target)) {
      const decision = await onAsk(u.path);
      if (decision === 'skip') {
        issues.push({ kind: 'skipped', path: u.path, detail: '目标文件已存在,已跳过' });
        continue;
      }
    }
    mkdirSync(dirname(target), { recursive: true });
    await writeFile(target, u.content, 'utf8');
    issues.push({ kind: 'ok', path: u.path, detail: 'untracked 文件已还原' });
  }

  return { issues };
}