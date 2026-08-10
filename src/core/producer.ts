import { runGitBuffer, runGitOk } from './git';
import { getStashDetail } from './stash';
import { HANDOFF_VERSION, HandoffFile, HandoffUntracked, serializeHandoff } from './handoff';
import { collectBinaryFiles, isBinaryBuffer } from './binaryDetect';

export class UnsupportedExportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsupportedExportError';
  }
}

export interface ProducedHandoff {
  text: string;
  file: HandoffFile;
}

function lines(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.replace(/\r$/, ''))
    .filter((l) => l.length > 0);
}

export async function produceHandoff(cwd: string, stashRef: string): Promise<ProducedHandoff> {
  const detail = await getStashDetail(cwd, stashRef);

  const stagedPatch = await runGitOk(['diff', detail.baseOid, detail.indexOid], { cwd });
  const worktreePatch = await runGitOk(['diff', detail.indexOid, detail.worktreeOid], { cwd });
  const stagedFiles = lines(await runGitOk(['diff', '--name-only', detail.baseOid, detail.indexOid], { cwd }));
  const worktreeFiles = lines(
    await runGitOk(['diff', '--name-only', detail.indexOid, detail.worktreeOid], { cwd }),
  );

  const untracked: HandoffUntracked[] = [];
  const untrackedBinaryRejects: string[] = [];
  if (detail.untrackedOid) {
    const names = (await runGitOk(['ls-tree', '-r', '--name-only', '-z', detail.untrackedOid], { cwd }))
      .split('\u0000')
      .filter((n) => n.length > 0);
    for (const name of names) {
      const res = await runGitBuffer(['show', `${detail.untrackedOid}:${name}`], { cwd });
      if (res.code !== 0) throw new Error(`读取 untracked 文件 "${name}" 失败: ${res.stderr}`);
      if (isBinaryBuffer(res.stdout)) {
        untrackedBinaryRejects.push(name);
        continue;
      }
      untracked.push({ path: name, content: res.stdout.toString('utf8') });
    }
  }

  const binaryHits = collectBinaryFiles([
    { label: 'staged', patch: stagedPatch },
    { label: 'worktree', patch: worktreePatch },
  ]);
  const rejects = [
    ...binaryHits.map((h) => `[${h.section}] ${h.file}`),
    ...untrackedBinaryRejects.map((p) => `[untracked] ${p}`),
  ];
  if (rejects.length > 0) {
    throw new UnsupportedExportError(
      `检测到二进制文件,0.1 版暂不支持导出,请先手动处理:\n${rejects.join('\n')}`,
    );
  }

  let branch = '';
  try {
    branch = (await runGitOk(['branch', '--show-current'], { cwd })).trim();
  } catch {
    branch = '';
  }
  let createdBy = '';
  try {
    createdBy = (await runGitOk(['config', 'user.name'], { cwd })).trim();
  } catch {
    createdBy = '';
  }

  const hf: HandoffFile = {
    version: HANDOFF_VERSION,
    meta: {
      createdAt: new Date().toISOString(),
      stashMessage: detail.entry.message,
      baseCommit: detail.baseOid,
      ...(branch ? { branch } : {}),
      ...(createdBy ? { createdBy } : {}),
    },
    staged: { files: stagedFiles, patch: stagedPatch },
    worktree: { files: worktreeFiles, patch: worktreePatch },
    untracked,
  };
  return { text: serializeHandoff(hf), file: hf };
}