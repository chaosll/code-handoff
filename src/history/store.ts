import * as vscode from 'vscode';
import { addRecord, clearHistory, removeRecord, ShareRecord, updateRecord } from '../core/history';

const KEY = 'code-handoff.history.v1';

export class HistoryStore {
  private cache?: ShareRecord[];

  constructor(private readonly memento: vscode.Memento) {}

  load(): ShareRecord[] {
    if (!this.cache) {
      const raw = this.memento.get<unknown>(KEY, []);
      this.cache = Array.isArray(raw) ? (raw as ShareRecord[]) : [];
    }
    return this.cache;
  }

  private commit(next: ShareRecord[]): ShareRecord[] {
    this.cache = next;
    void this.memento.update(KEY, next);
    return next;
  }

  append(record: ShareRecord): ShareRecord[] {
    return this.commit(addRecord(this.load(), record));
  }

  update(id: string, patch: Partial<ShareRecord>): ShareRecord[] {
    return this.commit(updateRecord(this.load(), id, patch));
  }

  remove(id: string): ShareRecord[] {
    return this.commit(removeRecord(this.load(), id));
  }

  clear(): ShareRecord[] {
    return this.commit(clearHistory());
  }
}