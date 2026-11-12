# v0.1.0

首个可安装版本：一个 DSH/Node 插件，无额外后台服务。正式工具与接口见 [API](API.md)，实验与局限见 [验证报告](EXPERIMENTS.md)。

发布包包括预编译代码、Cordis patch、文档和示例，不包含测试用数据库、网页原文、模型凭据、临时会话日志或开发依赖。

安装入口：

```powershell
dsh plugin add https://github.com/shinerain1/dsh-evidence-lineage/releases/download/v0.1.0/dsh-evidence-lineage-0.1.0.tgz
```

GitHub Release 同时提供 SHA256SUMS 文件，用于下载完整性核验。发布为 prerelease，强调来源语义推断和自主工作流评估仍有边界。首版适配 DSH web search seam 与本项目结构化 Agent 汇报协议，不拦截所有工具结果。
