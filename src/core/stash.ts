import { runGitOk } from './git';

export interface StashEntry {
  ref: string;
  message: string;
  oid: string;
}

export interface StashDetail {
  entry: StashEntry;
  baseOid: string;
  indexOid: string;
  worktreeOid: string;
  untrackedOid?: string;
}

function lines(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.replace(/\r$/, ''))
    .filter((l) => l.length > 0);
}

export async function listStashes(cwd: string): Promise<StashEntry[]> {
  const out = await runGitOk(['stash', 'list', '--format=%gd%x00%H%x00%s'], { cwd });
  return lines(out).map((line) => {
    const [ref, oid, message] = line.split('\x00');
    return { ref, oid, message: message ?? '' };
  });
}

export async function getStashDetail(cwd: string, ref: string): Promise<StashDetail> {
  const oid = (await runGitOk(['rev-parse', `${ref}^{commit}`], { cwd })).replace(/\r?\n$/, '');
  const parentsLine = (await runGitOk(['rev-list', '--parents', '-n', '1', oid], { cwd })).trim();
  const parents = parentsLine.split(/\s+/);
  if (parents.length < 2) {
    throw new Error(`stash "${ref}" 结构异常(仅 ${parents.length - 1} 个父提交)`);
  }
  const message = (await runGitOk(['log', '-1', '--pretty=%s', oid], { cwd })).trim();
  return {
    entry: { ref, message, oid },
    baseOid: parents[1],
    indexOid: parents[2],
    worktreeOid: oid,
    untrackedOid: parents[3],
  };
}