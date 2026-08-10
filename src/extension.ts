import * as vscode from 'vscode';
import { exportStashCommand } from './commands/exportStash';
import { importStashCommand } from './commands/importStash';
import { HistoryStore } from './history/store';
import { HistoryViewProvider } from './views/historyPanel';

export function activate(context: vscode.ExtensionContext): void {
  const store = new HistoryStore(context.globalState);

  context.subscriptions.push(
    vscode.commands.registerCommand('code-handoff.exportStash', () => exportStashCommand(vscode, store)),
    vscode.commands.registerCommand('code-handoff.importStash', () => importStashCommand(vscode, store)),
  );

  const provider = new HistoryViewProvider(store);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(HistoryViewProvider.viewType, provider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.commands.registerCommand('code-handoff.showHistory', () => provider.focus()),
  );
}

export function deactivate(): void {}