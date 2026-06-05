# README 文档事实校准简报

## 背景

- 本次任务目标是改进 DocLens 文档，并按长期可维护方案处理。
- 原 README 已覆盖基础启动方式，但对当前实现里的 docs root 模式、星标接口、导出格式、统一状态表和排障口径说明不足。
- `@filename` 未解析到仓库内真实文件，因此选择仓库入口文档 `README.md` 作为长期维护载体。

## 方案

- 不修改运行时代码，只把 README 对齐到当前代码事实。
- 保留 `docs/prd/doclens_prd.md` 作为需求 SSOT，不在本次改动中调整产品范围。
- 将容易影响接手和排障的信息前置到 README：环境前置、路径模式、实际 API、数据库状态模型和收尾验证。

## 改动

- `README.md`
  - 新增适用边界，明确单机/内网、单 docs root、只读 docs 和第一期不开放创建审阅单。
  - 补充 `rg` 前置依赖、`data/` 本地 SQLite 目录说明。
  - 明确 `DOCLENS_DOCS_ROOT` 的 `docs-directory` 与 `project-root` 两种模式。
  - 更新 API 表，补齐 `/api/docs/stars` 与导出格式参数。
  - 补充 `doc_states` 作为文档状态 SSOT，说明 `starred_docs` 为历史兼容表。
  - 增加收尾校验与常见问题。

## 验证

- `pnpm build`
  - 结果：通过
  - 关键输出：`Compiled successfully`，静态页面生成 `17/17`

## 风险与回滚

- 本次只改文档，不改变运行时行为。
- 如需回滚，恢复 `README.md` 并删除本简报后重新执行 `pnpm build`。
