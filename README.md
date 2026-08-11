# code-handoff

把本地 `git stash` 导出成一份可分享的 YAML,交给同事后在他的仓库里导入应用。避免为了交接未完成代码而 push 无用 commit。

## 流程

```
分享方:  Ctrl/Cmd+Shift+P → Code Handoff: Export Stash…
  选一个 stash → 复制到剪贴板 或 保存为 .code-handoff.yaml 文件

接收方:  Ctrl/Cmd+Shift+P → Code Handoff: Import Stash…
  从剪贴板或文件读取 → 应用(暂存/未暂存/untracked 三份状态)
  → 与 stash pop 一致: 无冲突自动应用, 有冲突在文件里留 <<<<<<< 标记让你解决
```

## 最近分享记录(侧边栏)

左侧活动栏的 **Code Handoff** 图标打开「最近分享记录」面板,用 **导入 / 导出** 两个
tab 区分,每条记录支持:

- **导入**:把上次分享重新应用到当前工作区(复用完整导入/冲突流程)
- **复制**:把该记录的 YAML 重新复制到剪贴板,可直接再次发送
- **删除**:移除单条记录
- **清空全部**:清空历史(二次确认)

导出成功 / 导入成功都会自动写入历史(跨工作区持久化,最多保留 30 条,连续重复自动去重)。
命令面板里也有 **Code Handoff: 打开最近分享记录…** 可随时唤出。

## 导入前预检

开始导入前自动做一次只读预检,并在弹窗中提示风险(可选「继续导入/取消」):

- **工作区脏文件**:当前还有未提交改动,继续导入可能加剧冲突
- **基准提交缺失**:stash 的基准 `baseCommit` 不在本仓库(浅克隆或未拉取),3-way 合并可能降级为硬应用
- **补丁无法应用**:预跑 `git apply --check` 或 文件名清单,提前暴露即将失败的路径

## 0.1 范围与限制

- 仅支持**文本文件**;导出时检测到二进制/超大文件会拒绝并列出清单
- 保留 staged / unstaged / untracked 三份状态(通过 stash 的父提交精确拆分)
- 冲突处理复用 `git apply --3way`;base blob 缺失时退化为上下文匹配
- 已知限制:
  - 同一文件**同时有暂存和未暂存改动**时,两次独立应用可能产生重复 hunk
  - 导入到「工作区已被本地修改」的仓库时,可能比导入到干净仓库更容易冲突
  - 建议导入到相对干净的、基于同一远程历史的分支

## 导出格式(v1)

```yaml
version: 1
meta:
  createdAt: "..."
  stashMessage: "WIP: xxx"
  baseCommit: a1b2c3d...
  branch: feature/xxx
  createdBy: alice
staged:
  files: [...]
  patch: |                      # git diff base..index
worktree:
  files: [...]
  patch: |                      # git diff index..worktree
untracked:
  - path: src/new.ts
    content: |                  # 文件全文
```

## 开发

```bash
npm install
npm run typecheck   # tsc --noEmit
npm run build       # esbuild → out/extension.cjs
npm test            # node:test 集成测试(临时真实 git 仓库, 不依赖网络/键位)
```

按 F5 即可打开 Extension Development Host 调试。