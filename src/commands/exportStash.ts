import * as vscode from 'vscode';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { listStashes } from '../core/stash';
import { produceHandoff, UnsupportedExportError } from '../core/producer';
import { createId } from '../core/history';
import { HistoryStore } from '../history/store';
import { t } from '../i18n';

function sanitizeFileName(name: string): string {
  const clean = name
    .replace(/[\u0000-\u001f<>:"/\\|?*]/g, '_')
    .replace(/^\.+/, '')
    .trim();
  return (clean || 'stash').slice(0, 60);
}

async function showError(api: typeof vscode, message: string, err: unknown): Promise<void> {
  const detail = err instanceof Error ? err.message : String(err);
  await api.window.showErrorMessage(`${message}\n${detail}`);
}

export async function exportStashCommand(api: typeof vscode, store: HistoryStore): Promise<void> {
  const folder = api.workspace.workspaceFolders?.[0];
  if (!folder) {
    await api.window.showErrorMessage(t('noWorkspace'));
    return;
  }
  const cwd = folder.uri.fsPath;

  let stashes;
  try {
    stashes = await listStashes(cwd);
  } catch (e) {
    await showError(api, t('gitFailed', 'git stash list'), e);
    return;
  }
  if (stashes.length === 0) {
    await api.window.showInformationMessage(t('noStash'));
    return;
  }

  const picked = await api.window.showQuickPick(
    stashes.map((s) => ({
      label: s.message || s.ref,
      description: s.ref,
      detail: s.oid,
      entry: s,
    })),
    { placeHolder: t('pickStashPlaceholder') },
  );
  if (!picked) return;

  let produced;
  try {
    produced = await produceHandoff(cwd, picked.entry.ref);
  } catch (e) {
    if (e instanceof UnsupportedExportError) {
      await api.window.showWarningMessage(t('exportUnsupported', e.message));
    } else {
      await showError(api, t('exportFailed'), e);
    }
    return;
  }

  const dest = await api.window.showQuickPick(
    [
      { label: t('toClipboard'), description: t('toClipboardDetail') },
      { label: t('toFile'), description: t('toFileDetail') },
    ],
    { placeHolder: t('pickSource') },
  );
  if (!dest) return;

  const record = {
    id: createId(),
    kind: 'export' as const,
    stashMessage: produced.file.meta.stashMessage,
    baseCommit: produced.file.meta.baseCommit,
    branch: produced.file.meta.branch,
    createdBy: produced.file.meta.createdBy,
    createdAt: new Date().toISOString(),
    charCount: produced.text.length,
    text: produced.text,
  };
  store.append(record);

  if (dest.label === t('toClipboard')) {
    await api.env.clipboard.writeText(produced.text);
    await api.window.showInformationMessage(t('copied', produced.text.length));
    return;
  }

  const defaultName = sanitizeFileName(picked.entry.message);
  const defaultUri = api.Uri.file(join(cwd, '.code-handoff', `${defaultName}.code-handoff.yaml`));
  const uri = await api.window.showSaveDialog({
    defaultUri,
    filters: { 'Code Handoff / YAML': ['yaml', 'yml'] },
  });
  if (!uri) return;
  await mkdir(dirname(uri.fsPath), { recursive: true });
  await writeFile(uri.fsPath, produced.text, 'utf8');
  await api.window.showInformationMessage(t('savedTo', uri.fsPath));
}