# 修复 doclens-dev 运行中 Node 断言崩溃（better-sqlite3 / Node 24）

## 1. 问题现象

`just doclens-dev` 正常启动并响应若干次 `/api/docs/*`、`/api/reviews/pr-files*` 请求后，进程被 Node 断言杀死：

```
#  next-server (v14.2.35)[50323]: void node::RemoveEnvironmentCleanupHook(Isolate *, CleanupHook, void *):142
#  Assertion failed: (env) != nullptr
4: Statement::~Statement() [better_sqlite3.node]
5: Statement::~Statement() [better_sqlite3.node]
6: v8::internal::GlobalHandles::InvokeFirstPassWeakCallbacks()
```

## 2. 根因

- 触发点是 Node 24.19.0 引入的核心回归：`node::ObjectWrap` 的清理钩子被部分 backport（缺配套的清理钩子注册表），任何基于旧式 `node::ObjectWrap` 的原生插件在 GC 弱回调析构时都会命中 `hooks.cc:142` 的 `CHECK_NOT_NULL(env)` 断言。
- 上游记录：nodejs/node#65446（open）、WiseLibs/better-sqlite3#1515（closed，指向同一 Node issue）。
- 该缺陷写在 `node_object_wrap.h` 头文件里，编译进插件产物，因此**只在“用 24.19+ 头文件本地编译”时出现**：本次 `node_modules/better-sqlite3` 正是 x64 环境下源码编译产物，故必然崩溃。
- 反汇编确认 `Database::~Database()` / `Statement::~Statement()` 内联了 `node::ObjectWrap::~ObjectWrap()` → `RemoveEnvironmentCleanupHook(Isolate::GetCurrent(), ...)`。

## 3. 改动

- `package.json`
  - `better-sqlite3`: `^11.7.2` → `^13.0.3`（v13 起用 node-addon-api 重写为 N-API，不再依赖 `node::ObjectWrap`；同时自带各平台 N-API 预编译产物）。
  - 新增 `engines.node: ">=22"`（`better-sqlite3@13` 的最低要求）。
- `pnpm-lock.yaml`：随安装更新。
- `README.md`：补充 Node ≥ 22 前置条件与 `node-gyp` 的 Python（`distutils`）说明。

## 4. 验证记录

复现脚本（`ObjectWrap` 析构压力：30 万次 `prepare/get` 与 30 万次 `new Database`）：

| 依赖 | 编译方式 | 结果 |
| --- | --- | --- |
| better-sqlite3 11.10.0 | 24.20.0 头文件源码编译 | 退出码 134，命中同一断言 |
| better-sqlite3 12.11.1 | 24.20.0 头文件源码编译 | 退出码 134，命中同一断言 |
| better-sqlite3 13.0.3 | 自带 N-API 预编译产物 | 两种模式均 `SURVIVED`，退出码 0 |
| better-sqlite3 13.0.3 | 24.20.0 头文件源码编译 | 两种模式均 `SURVIVED`，退出码 0（N-API 实现不再经过 `node::ObjectWrap`） |

应用侧验证（Node v24.20.0，`just doclens-dev`，端口 8886）：

- 单测：`pnpm test:run` ✅ 69/69 通过（含 `prFilesRepo` 的 SQLite 用例）。
- 构建：`pnpm build` ✅ 17/17 静态页生成成功。
- 接口冒烟：`GET /` → 307，`GET /docs` → 200，`GET /api/reviews/pr-files` → 200，`GET /api/docs/file?path=...` → 200，`PATCH /api/reviews/pr-files/read` → 200，`GET /api/docs/tree?path=docs` → 200。
- 负载复跑：`pr-files?refresh=1` + `docs/tree` 连续 40 轮全部 200，进程存活，日志无断言。

## 5. 风险与回滚

- 风险：`better-sqlite3` 主版本从 11 升到 13，Node 最低版本提升到 22；当前实现只使用 `prepare/run/get/all/raw/transaction/close/pragma` 等稳定接口，已被 69 个用例与构建覆盖。
- 回滚：`git revert` 本次提交（恢复 `better-sqlite3@^11` 与 lockfile）即可；但回滚后需在 Node ≤ 24.18.x 或上游 Node 修复后再运行，否则崩溃会复现。
- 后续：该 Node 回归仍 open，建议关注 nodejs/node#65446；在升级 Node 小版本后重新跑一次上述压力脚本。
