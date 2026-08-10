import * as vscode from 'vscode';

const zh = {
  noWorkspace: '请先打开一个包含 Git 仓库的文件夹。',
  gitFailed: 'Git 命令执行失败: {0}',
  noStash: '当前仓库没有 stash。',
  pickStashPlaceholder: '选择要分享导出的 stash',
  pickSource: '选择导入来源',
  fromClipboard: '从剪贴板导入',
  fromFile: '选择文件导入',
  toClipboard: '复制到剪贴板',
  toFile: '保存为文件',
  toClipboardDetail: '把 YAML 内容复制到剪贴板,直接粘贴给同事',
  toFileDetail: '保存为 .code-handoff.yaml 文件再发送',
  copied: '已复制分享内容({0} 字符),直接发给同事即可',
  savedTo: '已保存: {0}',
  exportUnsupported: '导出被拒绝: {0}',
  exportFailed: '导出失败: {0}',
  clipboardNotHandoff: '剪贴板内容不是有效的 code-handoff 内容(应以 version: 1 开头)',
  importFailed: '导入失败: {0}',
  untrackedExists: '目标已存在同名文件 "{0}",是否覆盖?',
  overwrite: '覆盖',
  skip: '跳过',
  summary: '导入完成 · 成功 {0} · 冲突 {1} · 失败 {2} · 跳过 {3}',
  showDetails: '查看详情',
  outputName: 'Code Handoff',
  emptyImport: '未获得任何分享内容。',
  historyTabImport: '导入',
  historyTabExport: '导出',
  historyEmpty: '暂无记录,先 导出 或 导入 一次分享',
  historyClearAll: '清空全部',
  historyActionImport: '导入',
  historyActionCopy: '复制',
  historyActionRemove: '删除',
  historyConfirmClear: '确定清空全部分享记录吗?此操作不可恢复。',
  historyConfirmClearYes: '清空',
  historyCancel: '取消',
  historyResult: '成功 {0} · 冲突 {1} · 失败 {2} · 跳过 {3}',
  historySourceClipboard: '剪贴板',
  historySourceHistory: '历史',
  historyRelJust: '刚刚',
  historyRelMin: '{0} 分钟前',
  historyRelHour: '{0} 小时前',
  historyRelDay: '{0} 天前',
} as const;

const en: Record<keyof typeof zh, string> = {
  noWorkspace: 'Please open a folder that contains a git repository.',
  gitFailed: 'Git command failed: {0}',
  noStash: 'No stash entries in the current repository.',
  pickStashPlaceholder: 'Select the stash to share',
  pickSource: 'Choose import source',
  fromClipboard: 'Import from clipboard',
  fromFile: 'Import from file',
  toClipboard: 'Copy to clipboard',
  toFile: 'Save to file',
  toClipboardDetail: 'Copy the YAML to clipboard so colleagues can paste it',
  toFileDetail: 'Save as a .code-handoff.yaml file',
  copied: 'Copied {0} characters of share content, ready to send',
  savedTo: 'Saved: {0}',
  exportUnsupported: 'Export rejected: {0}',
  exportFailed: 'Export failed: {0}',
  clipboardNotHandoff: 'Clipboard does not contain valid code-handoff content (should start with version: 1)',
  importFailed: 'Import failed: {0}',
  untrackedExists: 'Target file "{0}" already exists. Overwrite?',
  overwrite: 'Overwrite',
  skip: 'Skip',
  summary: 'Import done · ok {0} · conflict {1} · failed {2} · skipped {3}',
  showDetails: 'Show details',
  outputName: 'Code Handoff',
  emptyImport: 'No share content obtained.',
  historyTabImport: 'Import',
  historyTabExport: 'Export',
  historyEmpty: 'No records yet. Export or import a share first.',
  historyClearAll: 'Clear all',
  historyActionImport: 'Import',
  historyActionCopy: 'Copy',
  historyActionRemove: 'Delete',
  historyConfirmClear: 'Clear all share history? This cannot be undone.',
  historyConfirmClearYes: 'Clear',
  historyCancel: 'Cancel',
  historyResult: 'ok {0} · conflict {1} · failed {2} · skipped {3}',
  historySourceClipboard: 'clipboard',
  historySourceHistory: 'history',
  historyRelJust: 'just now',
  historyRelMin: '{0} min ago',
  historyRelHour: '{0} h ago',
  historyRelDay: '{0} d ago',
};

type Key = keyof typeof zh;
const table: Record<Key, Record<'zh' | 'en', string>> = {} as never;
for (const k of Object.keys(zh) as Key[]) {
  table[k] = { zh: zh[k], en: en[k] };
}

export function currentLanguage(): 'zh' | 'en' {
  const lang = vscode.env.language || 'en';
  return lang.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

export function t(key: Key, ...args: unknown[]): string {
  const lang = currentLanguage();
  let s = table[key][lang];
  args.forEach((a, i) => {
    s = s.split(`{${i}}`).join(String(a));
  });
  return s;
}