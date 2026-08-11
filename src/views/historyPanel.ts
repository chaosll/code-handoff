import * as vscode from 'vscode';
import { basename } from 'node:path';
import { HistoryStore } from '../history/store';
import { ShareRecord } from '../core/history';
import { exportStashCommand } from '../commands/exportStash';
import { importStashCommand, runImportText } from '../commands/importStash';
import { t } from '../i18n';

interface ViewItem {
  id: string;
  kind: 'export' | 'import';
  stashMessage: string;
  baseShort: string;
  createdAt: string;
  result?: { ok: number; conflict: number; failed: number; skipped: number };
  sourceText: string;
}

interface WebStrings {
  tabImport: string;
  tabExport: string;
  runImport: string;
  runExport: string;
  empty: string;
  clear: string;
  actImport: string;
  actCopy: string;
  actRemove: string;
  result: string;
  just: string;
  min: string;
  hour: string;
  day: string;
}

export class HistoryViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'code-handoff.history';
  private view?: vscode.WebviewView;

  constructor(private readonly store: HistoryStore) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = { enableScripts: true };
    view.webview.html = this.renderHtml(view.webview.cspSource);
    view.webview.onDidReceiveMessage((msg) => void this.handleMessage(view, msg));
  }

  focus(): void {
    if (this.view) {
      this.view.show(true);
    }
    this.pushState();
  }

  private pushState(records?: ShareRecord[]): void {
    if (!this.view) return;
    const list = records ?? this.store.load();
    const items: ViewItem[] = list.map((r) => ({
      id: r.id,
      kind: r.kind,
      stashMessage: r.stashMessage || '(no message)',
      baseShort: (r.baseCommit || '').slice(0, 7),
      createdAt: r.createdAt,
      result: r.result,
      sourceText:
        r.source === 'clipboard'
          ? t('historySourceClipboard')
          : r.source?.startsWith('file:')
            ? basename(r.source.slice('file:'.length))
            : r.source === 'history'
              ? t('historySourceHistory')
              : '',
    }));
    void this.view.webview.postMessage({ type: 'state', items });
  }

  private async handleMessage(view: vscode.WebviewView, msg: unknown): Promise<void> {
    const data = msg as { type?: string; id?: string };
    switch (data?.type) {
      case 'list':
        this.pushState();
        break;
      case 'runExport':
        await exportStashCommand(vscode, this.store);
        this.pushState();
        break;
      case 'runImport':
        await importStashCommand(vscode, this.store);
        this.pushState();
        break;
      case 'import': {
        const rec = this.store.load().find((r) => r.id === data.id);
        if (!rec) break;
        const folder = vscode.workspace.workspaceFolders?.[0];
        if (!folder) {
          void vscode.window.showErrorMessage(t('noWorkspace'));
          break;
        }
        await runImportText(vscode, folder.uri.fsPath, rec.text, {
          sourceLabel: rec.kind === 'import' ? 'history' : 'clipboard',
          store: this.store,
        });
        this.pushState();
        break;
      }
      case 'copy': {
        const rec = this.store.load().find((r) => r.id === data.id);
        if (!rec) break;
        await vscode.env.clipboard.writeText(rec.text);
        void vscode.window.showInformationMessage(t('copied', rec.text.length));
        break;
      }
      case 'remove':
        this.store.remove(data.id ?? '');
        this.pushState();
        break;
      case 'clearRequest': {
        const choice = await vscode.window.showWarningMessage(
          t('historyConfirmClear'),
          { modal: true },
          t('historyConfirmClearYes'),
          t('historyCancel'),
        );
        if (choice === t('historyConfirmClearYes')) {
          this.store.clear();
          this.pushState();
        }
        break;
      }
    }
  }

  private renderHtml(cspSource: string): string {
    const S: WebStrings = {
      tabImport: t('historyImportRecords'),
      tabExport: t('historyExportRecords'),
      runImport: t('historyRunImport'),
      runExport: t('historyRunExport'),
      empty: t('historyEmpty'),
      clear: t('historyClearAll'),
      actImport: t('historyActionImport'),
      actCopy: t('historyActionCopy'),
      actRemove: t('historyActionRemove'),
      result: t('historyResult'),
      just: t('historyRelJust'),
      min: t('historyRelMin'),
      hour: t('historyRelHour'),
      day: t('historyRelDay'),
    };
    const sJson = JSON.stringify(S).replace(/</g, '\\u003c');

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy"
  content="default-src 'none'; style-src 'unsafe-inline' ${cspSource}; script-src 'unsafe-inline';">
<style>
:root { font-size: 13px; }
body { margin: 0; padding: 10px; color: var(--vscode-foreground); font-family: var(--vscode-font-family); }
.actions { display: flex; gap: 6px; margin-bottom: 10px; }
.primary-action { flex: 1; padding: 5px 0; cursor: pointer; border: 1px solid var(--vscode-button-background);
  border-radius: 4px; background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
.secondary-action { flex: 1; padding: 5px 0; cursor: pointer; border: 1px solid var(--vscode-button-secondaryBackground);
  border-radius: 4px; background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
.tabs { display: flex; gap: 4px; margin-bottom: 10px; }
.tab { flex: 1; padding: 4px 0; text-align: center; cursor: pointer; border: 1px solid var(--vscode-input-border);
  border-radius: 4px; background: transparent; color: var(--vscode-foreground); }
.tab.active { background: var(--vscode-button-background); border-color: var(--vscode-button-background); color: var(--vscode-button-foreground); }
.rec { border: 1px solid var(--vscode-panel-border); border-radius: 4px; padding: 8px; margin-bottom: 8px; }
.rec-title { font-weight: 600; word-break: break-all; }
.rec-meta { color: var(--vscode-descriptionForeground); font-size: 12px; margin-top: 2px; word-break: break-all; }
.rec-result { font-size: 12px; margin-top: 2px; }
.rec-actions { margin-top: 6px; display: flex; gap: 4px; }
.rec-actions button { font-size: 12px; }
.empty { color: var(--vscode-descriptionForeground); text-align: center; padding: 20px 0; }
.footer { margin-top: 8px; text-align: right; }
</style>
</head>
<body>
<div class="actions">
  <button id="btnRunImport" class="secondary-action">${t('historyRunImport')}</button>
  <button id="btnRunExport" class="primary-action">${t('historyRunExport')}</button>
</div>
<div class="tabs">
  <div class="tab active" data-kind="import">${t('historyImportRecords')}</div>
  <div class="tab" data-kind="export">${t('historyExportRecords')}</div>
</div>
<div id="list"></div>
<div class="footer"><button id="btnClear" class="button-clear">${t('historyClearAll')}</button></div>
<script>
var S = ${sJson};
var vs = acquireVsCodeApi();
var currentKind = 'import';
var listEl = document.getElementById('list');
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c];
  });
}
function relTime(iso) {
  if (!iso) return '';
  var t = (Date.now() - new Date(iso).getTime()) / 1000;
  if (t < 60) return S.just;
  if (t < 3600) return S.min.replace('{0}', Math.floor(t / 60));
  if (t < 86400) return S.hour.replace('{0}', Math.floor(t / 3600));
  if (t < 2592000) return S.day.replace('{0}', Math.floor(t / 86400));
  return new Date(iso).toLocaleDateString();
}
function render(items) {
  var shown = items.filter(function (i) { return i.kind === currentKind; });
  if (!shown.length) {
    listEl.innerHTML = '<div class="empty">' + esc(S.empty) + '</div>';
    return;
  }
  listEl.innerHTML = shown.map(function (i) {
    var meta = [i.baseShort, relTime(i.createdAt), i.sourceText].filter(Boolean).join(' \u00b7 ');
    var res = '';
    if (i.result) {
      res = '<div class="rec-result">' + esc(S.result
        .replace('{0}', i.result.ok).replace('{1}', i.result.conflict)
        .replace('{2}', i.result.failed).replace('{3}', i.result.skipped)) + '</div>';
    }
    return '<div class="rec" data-id="' + esc(i.id) + '">' +
      '<div class="rec-title">' + esc(i.stashMessage) + '</div>' +
      '<div class="rec-meta">' + esc(meta) + '</div>' + res +
      '<div class="rec-actions">' +
      '<button data-act="import">' + esc(S.actImport) + '</button>' +
      '<button data-act="copy">' + esc(S.actCopy) + '</button>' +
      '<button data-act="remove">' + esc(S.actRemove) + '</button>' +
      '</div></div>';
  }).join('');
}
listEl.addEventListener('click', function (e) {
  var btn = (e.target && e.target.closest) ? e.target.closest('button[data-act]') : null;
  if (!btn) return;
  var rec = btn.closest('.rec');
  if (!rec) return;
  vs.postMessage({ type: btn.getAttribute('data-act'), id: rec.getAttribute('data-id') });
});
document.querySelectorAll('.tab').forEach(function (tab) {
  tab.addEventListener('click', function () {
    document.querySelectorAll('.tab').forEach(function (x) { x.classList.remove('active'); });
    tab.classList.add('active');
    currentKind = tab.getAttribute('data-kind');
    vs.postMessage({ type: 'list' });
  });
});
document.getElementById('btnClear').addEventListener('click', function () {
  vs.postMessage({ type: 'clearRequest' });
});
document.getElementById('btnRunImport').addEventListener('click', function () {
  vs.postMessage({ type: 'runImport' });
});
document.getElementById('btnRunExport').addEventListener('click', function () {
  vs.postMessage({ type: 'runExport' });
});
window.addEventListener('message', function (e) {
  var m = e.data;
  if (m.type === 'state') render(m.items || []);
});
vs.postMessage({ type: 'list' });
</script>
</body>
</html>`;
  }
}
