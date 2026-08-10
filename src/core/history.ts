export type ShareRecordKind = 'export' | 'import';

export interface ShareResult {
  ok: number;
  conflict: number;
  failed: number;
  skipped: number;
}

export interface ShareRecord {
  id: string;
  kind: ShareRecordKind;
  stashMessage: string;
  baseCommit: string;
  branch?: string;
  createdBy?: string;
  createdAt: string;
  text: string;
  charCount?: number;
  result?: ShareResult;
  source?: string;
}

export const HISTORY_LIMIT = 30;

export function createId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function isSameShare(a: ShareRecord, b: ShareRecord): boolean {
  return a.stashMessage === b.stashMessage && a.text === b.text;
}

export function addRecord(list: ShareRecord[], record: ShareRecord, limit = HISTORY_LIMIT): ShareRecord[] {
  const withoutDuplicate = list.filter((r) => !isSameShare(r, record));
  return [record, ...withoutDuplicate].slice(0, limit);
}

export function removeRecord(list: ShareRecord[], id: string): ShareRecord[] {
  return list.filter((r) => r.id !== id);
}

export function updateRecord(list: ShareRecord[], id: string, patch: Partial<ShareRecord>): ShareRecord[] {
  return list.map((r) => (r.id === id ? { ...r, ...patch } : r));
}

export function clearHistory(): ShareRecord[] {
  return [];
}