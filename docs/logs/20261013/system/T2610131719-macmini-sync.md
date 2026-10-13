# DocLens 同步至 macmini 验证记录

日期：2026-10-13（Asia/Shanghai）

## 同步范围

- 用户目标：通过 SSH 将项目同步至 `macmini:/Users/wangyongchang/Jobs/Code/doclens`。
- 保留本地“新建独立空白聊天”、100,000 字符输入及既有文档聊天改动；保留 mini 端 SQLite 13 / Node 24 与非安全上下文剪贴板兼容修复。
- 使用 Git 集成两端历史，再以 `git merge --ff-only` 更新；只同步 Git 跟踪文件，原目录的 `.env`、`data/`、`node_modules/`、`.next/` 和原有未跟踪 `test.zip` 不进入传输包。

## 基线与集成

- 本地原 main：`d7663e785e5a3cb2ab58d22f19a3bc9f1d360d8a`。
- mini 原 main：`0bade7715e62673a721ccdcbe9b99bca15e16476`。
- 共同祖先：`cf4084b2103fdfc33ca1f6caf3f739456a2c68f6`；两端分别有 5 / 2 个独有提交。
- 集成代码提交：`8477190f2e312a476b200e2326a29633aedac10b`；两个 parent 正是两端原 main，合并无冲突。
- 集成代码 tree：`9417f4a8fc926dc03690850c6583f2dba9b1b72d`。
- 相对本地仅引入 mini 的既有 8 文件修复；`package.json`、`pnpm-lock.yaml` 与 mini 原基线完全相同。
- 在 SSH 传输后逐文件比较 SHA256，mini 隔离候选源码 323 / 323 文件一致；独立验证 Specialist 在两端再次核对，差异为 0。
- 本记录及测试、构建日志在代码验证之后提交；相对集成代码提交仅新增验证文档。

## 验证结果

验证目录：`/private/tmp/doclens-sync-macmini-20261013-1713.cX0LVB/source`，在 mini 上运行。

- Node `v24.20.0`，`darwin/x64`；使用 mini 自己的原生依赖副本，未从本地 arm64 主机传输 `node_modules`。
- `better-sqlite3 13.0.3` 内存数据库加载、查询、关闭成功，SQLite `3.53.4`。
- 包管理器为隔离 Corepack 缓存中的 `pnpm 8.15.4`，未改全局包管理器配置。
- `pnpm test:run`：24 个文件、203 项测试全部通过，退出码 0。
- `pnpm build`：编译、类型检查、静态页面生成、构建产物检查完成，退出码 0。
- 构建读取隔离目录的 docs，数据库路径显式指向临时目录；未加载目标目录 `.env`，未打开或复制真实 SQLite 文件。
- 测试包含聊天 100K 输入及请求/历史边界、剪贴板回退、docs 路径安全、搜索解析、审阅单持久化等回归覆盖。

完整命令输出：

- [测试日志](T2610131719-macmini-sync-tests.txt)
- [构建日志](T2610131719-macmini-sync-build.txt)

## 保护与协作

- Parent 负责 Git 集成、传输、构建执行与两端主分支更新。
- Git Specialist 只读审查父提交、祖先关系、差异范围、快进更新条件与回退锚点。
- 验证 Specialist 只读独立核对两端源码 SHA256、聊天与兼容修复共存、mini 原生运行环境及最终状态。
- 原目标端口 8886 是既有 `next dev`，未执行重启，也未在原目录执行构建；源文件更新可能由开发服务自动检测，本轮未进行线上模型调用验收。
- AppleDouble 使用 mini 已安装 `/usr/local/bin/clean-appledouble`：先 dry-run 匹配 19 个，清理删除 19 个、错误 0 个，再 dry-run 为 0；隔离源码在验证前后均为 0。
- 更新前必须重新核对两端 HEAD 与已跟踪工作区，遇到漂移停止更新并重新集成；更新后核对两端 HEAD、tree、全部跟踪文件及原 `.env`、`test.zip` 元数据。
- 两个原 main 的精确 SHA 均保留在 merge 的 parent 中。需要回退时基于对应锚点创建回滚提交，不使用强制推送或重置覆盖历史。
