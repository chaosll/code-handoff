import { dump, load } from 'js-yaml';

export const HANDOFF_VERSION = 1;

export interface HandoffMeta {
  createdAt: string;
  stashMessage: string;
  baseCommit: string;
  branch?: string;
  createdBy?: string;
}

export interface HandoffSection {
  files: string[];
  patch: string;
}

export interface HandoffUntracked {
  path: string;
  content: string;
}

export interface HandoffFile {
  version: 1;
  meta: HandoffMeta;
  staged: HandoffSection;
  worktree: HandoffSection;
  untracked: HandoffUntracked[];
}

export function serializeHandoff(f: HandoffFile): string {
  return dump(f, { lineWidth: 120 });
}

function isString(v: unknown): v is string {
  return typeof v === 'string';
}

export function parseHandoff(text: string, sourceName = '输入'): HandoffFile {
  let obj: unknown;
  try {
    obj = load(text);
  } catch (e) {
    throw new Error(`${sourceName} 不是合法的 YAML: ${(e as Error).message}`);
  }
  if (typeof obj !== 'object' || obj === null) {
    throw new Error(`${sourceName} 格式不正确: 期望一个 YAML 对象`);
  }
  const hf = obj as Record<string, unknown>;
  if (hf.version !== HANDOFF_VERSION) {
    throw new Error(`不支持的内容版本: ${String(hf.version)} (期望 ${HANDOFF_VERSION})`);
  }
  const meta = hf.meta as Record<string, unknown>;
  if (typeof meta !== 'object' || meta === null) {
    throw new Error('缺少 meta 字段');
  }
  if (!isString(meta.baseCommit) || !isString(meta.stashMessage)) {
    throw new Error('meta.baseCommit / meta.stashMessage 必须为字符串');
  }
  const section = (key: string): HandoffSection => {
    const s = hf[key] as Record<string, unknown>;
    if (typeof s !== 'object' || s === null) {
      throw new Error(`缺少 ${key} 字段`);
    }
    if (!isString(s.patch)) throw new Error(`${key}.patch 必须是字符串`);
    const files = Array.isArray(s.files) ? s.files.filter(isString) : [];
    return { files, patch: s.patch };
  };
  const untrackedRaw = Array.isArray(hf.untracked) ? (hf.untracked as unknown[]) : [];
  const untracked: HandoffUntracked[] = untrackedRaw.map((u, i) => {
    const item = u as Record<string, unknown>;
    if (!isString(item?.path) || !isString(item?.content)) {
      throw new Error(`untracked[${i}] 需要 path 和 content 字符串字段`);
    }
    return { path: item.path, content: item.content };
  });
  return {
    version: HANDOFF_VERSION,
    meta: {
      createdAt: isString(meta.createdAt) ? meta.createdAt : '',
      stashMessage: meta.stashMessage,
      baseCommit: meta.baseCommit,
      branch: isString(meta.branch) ? meta.branch : undefined,
      createdBy: isString(meta.createdBy) ? meta.createdBy : undefined,
    },
    staged: section('staged'),
    worktree: section('worktree'),
    untracked,
  };
}