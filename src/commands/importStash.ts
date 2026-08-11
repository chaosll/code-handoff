import * as vscode from 'vscode';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { consumeHandoff, ApplyResult, previewImport } from '../core/consumer';
import { parseHandoff } from '../core/handoff';
import { createId } from '../core/history';
import { HistoryStore } from '../history/store';
import { t } from '../i18n';

async function showError(api: typeof vscode, message: string, err: unknown): Promise<void> {
  const detail = err instanceof Error ? err.message : String(err);
  await api.window.showErrorMessage(`${message}\n${detail}`);
}

function summarize(result: ApplyResult): { ok: number; conflict: number; failed: number; skipped: number } {
  let ok = 0;
  let conflict = 0;
  let failed = 0;
  let skipped = 0;
  for (const i of result.issues) {
    if (i.kind === 'ok') ok++;
    else if (i.kind === 'conflict') conflict++;
    else if (i.kind === 'failed') failed++;
    else skipped++;
  }
  return { ok, conflict, failed, skipped };
}

export interface RunImportOptions {
  sourceLabel?: string;
  store?: HistoryStore;
}

export async function runImportText(
  api: typeof vscode,
  cwd: string,
  text: string,
  opts: RunImportOptions = {},
): Promise<void> {
  try {
    const preview = await previewImport(cwd, text, opts.sourceLabel ?? '输入');
    const problems: string[] = [];
    if (preview.dirty) {
      problems.push(t('previewDirty', preview.dirtyFiles.length, preview.dirtyFiles.slice(0, 3).join(', ')));
    }
    if (!preview.baseCommitPresent) {
      problems.push(t('previewBaseMissing', preview.baseCommit.slice(0, 7)));
    }
    if (preview.stagedFails.length > 0) {
      problems.push(t('previewStageFail', preview.stagedFails.join(', ')));
    }
    if (preview.worktreeFails.length > 0) {
      problems.push(t('previewWorktreeFail', preview.worktreeFails.join(', ')));
    }
    if (problems.length > 0) {
      const choice = await api.window.showWarningMessage(
        problems.join('\n'),
        { modal: true },
        t('previewProceed'),
        t('historyCancel'),
      );
      if (choice !== t('previewProceed')) return;
    }
  } catch (e) {
    // 预检失败(如非法内容)交给 consumeHandoff 统一报错
  }

  const channel = api.window.createOutputChannel(t('outputName'));
  let result: ApplyResult;
  try {
    result = await consumeHandoff(cwd, text, {
      onAskUntracked: async (path) => {
        const choice = await api.window.showWarningMessage(
          t('untrackedExists', path),
          { modal: true },
          t('overwrite'),
          t('skip'),
        );
        return choice === t('overwrite') ? 'overwrite' : 'skip';
      },
    });
  } catch (e) {
    await showError(api, t('importFailed'), e);
    return;
  }

  const { ok, conflict, failed, skipped } = summarize(result);
  channel.appendLine(`[code-handoff] import into ${cwd}`);
  for (const issue of result.issues) {
    channel.appendLine(`  ${issue.kind.padEnd(9)} ${issue.path} :: ${issue.detail}`);
  }

  const message = api.window.showInformationMessage(t('summary', ok, conflict, failed, skipped), t('showDetails'));

  if (conflict > 0) {
    const conflictPaths = result.issues.filter((i) => i.kind === 'conflict').map((i) => i.path);
    for (const p of conflictPaths) {
      try {
        const doc = await api.workspace.openTextDocument(join(cwd, p));
        await api.window.showTextDocument(doc, {
          preview: true,
          preserveFocus: true,
          viewColumn: api.ViewColumn.Beside,
        });
      } catch {
        // ignore open failures (e.g. conflicts in index without worktree files)
      }
    }
  }

  const action = await message;
  if (action === t('showDetails')) {
    channel.show(true);
  }

  if (opts.store) {
    const hf = parseHandoff(text);
    opts.store.append({
      id: createId(),
      kind: 'import',
      stashMessage: hf.meta.stashMessage,
      baseCommit: hf.meta.baseCommit,
      branch: hf.meta.branch,
      createdBy: hf.meta.createdBy,
      createdAt: new Date().toISOString(),
      text,
      source: opts.sourceLabel ?? 'clipboard',
      result: { ok, conflict, failed, skipped },
    });
  }
}

export async function importStashCommand(api: typeof vscode, store: HistoryStore): Promise<void> {
  const folder = api.workspace.workspaceFolders?.[0];
  if (!folder) {
    await api.window.showErrorMessage(t('noWorkspace'));
    return;
  }
  const cwd = folder.uri.fsPath;

  const source = await api.window.showQuickPick(
    [
      { label: t('fromClipboard'), description: t('toClipboardDetail') },
      { label: t('fromFile') },
    ],
    { placeHolder: t('pickSource') },
  );
  if (!source) return;

  let text: string;
  let sourceLabel: string;
  if (source.label === t('fromClipboard')) {
    text = await api.env.clipboard.readText();
    if (!text || !/^\s*version:\s*1\b/.test(text)) {
      await api.window.showWarningMessage(t('clipboardNotHandoff'));
      return;
    }
    sourceLabel = 'clipboard';
  } else {
    const uris = await api.window.showOpenDialog({
      canSelectMany: false,
      filters: { 'Code Handoff / YAML': ['yaml', 'yml'] },
    });
    if (!uris || uris.length === 0) return;
    text = await readFile(uris[0].fsPath, 'utf8');
    sourceLabel = `file:${uris[0].fsPath}`;
  }

  if (!text?.trim()) {
    await api.window.showWarningMessage(t('emptyImport'));
    return;
  }

  await runImportText(api, cwd, text, { sourceLabel, store });
}