# macmini DeepSeek API Key 配置记录

日期：2026-10-13（Asia/Shanghai）

- 用户明确授权复用本地 DocLens 项目的 DeepSeek API Key，为 `macmini:/Users/wangyongchang/Jobs/Code/doclens` 配置聊天能力。
- 使用 Next.js 自己的环境加载器读取本地项目 Key，经 SSH 加密连接的 stdin 传输；Key 不出现在命令参数、工具输出或 Git 中。
- 仅原子更新 mini `.env` 的 `DOCLENS_DEEPSEEK_API_KEY`；其余配置逐行保持一致。`.env` 权限改为 `0600`，原配置备份在项目外私有目录，目录 `0700`、备份 `0600`。
- 使用 mini 项目原有 `getChatConfig()` 读取配置，完整 Key 与来源在进程内比较一致；API 地址、模型也与来源一致。有效模型为 `deepseek-flash`。
- mini 发起一次 `GET /models`，HTTP 200，当前配置模型存在；再发起一次限 16 输出 token、关闭思考的 `POST /chat/completions`，HTTP 200，正常回复 OK，总计 8 token（输入 7、输出 1）。协议依据：[模型列表](https://api-docs.deepseek.com/api/list-models/)、[聊天接口](https://api-docs.deepseek.com/api/create-chat-completion/)。
- 探测仅验证 mini 项目配置及上游实际文本生成；未调用运行中项目的聊天路由，未打开真实 SQLite，也未创建业务会话。
- 既有 8886 服务为 `next dev`。Next 14.2.35 开发监听器会监视 `.env` 并传播环境更新（本机源码 `setup-dev-bundler.js` 的 envFiles / envChange 分支）；未执行服务重启。
- Parent 负责秘密处理、原子配置更新和最小实测；两位 Specialist 分别只读审查配置加载路径、环境文件保护与运行目标，避免把无效会话请求误当成配置验证。
- 本次没有修改代码。构建证据复用同一代码版本的 [macmini 隔离构建日志](T2610131719-macmini-sync-build.txt)（`pnpm build` 退出 0）；对应 203 项测试通过。
- `.env` 已被 Git 忽略。AppleDouble 在配置前后通过统一工具 dry-run 检查，匹配 0。

脱敏实测结果：[验证数据](T2610131739-deepseek-macmini-verification.json)。记录不包含 Key、Key 摘要或请求鉴权头。

回退时可用项目外私有备份恢复原配置，并保持 `0600` 权限；不需要回退代码或数据库。
