# DSH Evidence Lineage

基于 DSH 的上下文证据去重与来源追踪插件。

网页、转载与 Agent 汇报可能都在转述同一份材料。这个插件把材料和引用关系保存为可恢复的来源图，在输出上下文时折叠有相同来源记录的重复正文，保留新增信息、不同意见和来源不明的材料。

它管理**来源关系与材料完整性**，不判断新闻真假，不自动证明来源独立，也不承诺降低所有任务的 token 开销。

## 已实现

- 一种搜索入口：`evidence_search` 调用 DSH 自身的 `ctx.web.search`，沿用当前搜索供应商、登录与取消信号。重复检索的已有正文返回 ID，避免再次铺满输出。
- 一种 Agent 汇报协议：`dsh-evidence-report/v1`，每条汇报携带引用 ID、是否增加新观察、立场；Session、调用 ID 和可用的父 Session 身份由 DSH 提供。
- 来源 URL、不可变材料 ID、SHA-256 正文指纹、逐项引用图。**同文字、不同网址且没有来源依据时不合并。**
- `citation` 只表示引用；`derivation` 声明整个材料条目来自父材料。混合文章必须先拆分摘录。关系可撤销，拒绝循环和跨案例引用。
- SQLite 事务、并发写入、重试键、Session 恢复、版本冲突检查、完整原文查询。
- 分页上下文，保留不同正文、标题、日期、立场与议题；导出原文、关系、审计链和 W3C PROV-JSON。

## 安装

需要 Node.js **24.9+**，已在 DSH **0.2.2-alpha.3** 的实际工具执行与 PTC 环境验证。兼容声明为 `>=0.2.2-alpha.3 <0.3.0`；未对该范围内每个版本逐一测试。

```powershell
dsh plugin add https://github.com/shinerain1/dsh-evidence-lineage/releases/download/v0.1.0/dsh-evidence-lineage-0.1.0.tgz
```

包自带编译后的 `lib/` 和 `cordis.patch.yml`，不需要 Python 后端或自行编译。重启对应 DSH 配置后会加载插件。已有 DSH 搜索配置才可使用联网搜索；其余本地工具不需要搜索登录。

默认本地存储：用户目录下 `.dsh-evidence-lineage/lineage.db`。可在插件设置中将 `root` 改为其他绝对路径。材料可能含敏感信息；导出前自行检查，插件不会上传材料。

## 在 DSH 中使用

可以直接说：

> 为这项调研创建证据案例。用 evidence_search 检索，保留来源 ID。转载只能作为同一来源的转述；不明关系保留未知。子 Agent 按 dsh-evidence-report/v1 提交汇报。最后给我完整的 evidence_context 和可追溯导出，区分来源家族数量与独立验证数量。

插件会向 DSH 提供简短工作流提示。它不会接管所有工具：直接调用普通 `web_search`、任意 MCP 工具或自由格式子 Agent 回复，不会被自动改写。首版使用上述入口和协议；也可以通过 `evidence_ingest` 导入已有摘录。

工具参数与 PTC 示例见 [接口说明](docs/API.md) 和 [子 Agent 汇报示例](examples/subagent-report.json)。

## 证据边界

`recorded_origin_count` 是**按记录的衍生关系计算的来源家族数**，不是独立证据数。`independence` 始终明确返回 `unknown`。

来源关系有三种记录依据：调用者声明、在已存正文中可找到的 URL 引用、Agent 汇报的结构化输入引用。后两者能检查引用结构，仍不能证明整个摘要忠实或两个研究统计独立。`derivation` 链接是需要核对的断言；标错关系会影响计数，可以撤销重算。未知同源关系不通过文字相似度自动补全。

折叠是上下文视图操作；原材料和来源身份仍可按 ID 查询、全部导出。不同措辞即使同源也保留，因此长篇改写不会自动压缩。完整性校验不是数字签名，同机有文件访问权限的人可以修改数据库或重新生成校验值。

## 验证

见 [实验报告](docs/EXPERIMENTS.md)、[真实案例及来源](docs/REAL-CASE.md)、[机器可读结果](docs/results/)。包含实际 DSH 工具/PTC 测试、独立进程恢复、对抗样例、真实模型固定上下文对照及 PROV 库互操作。

**没有将确定性计数实验写成“大模型错误率降低”的证据。** 原始 DSH 也可以正确理解来源关系；插件价值是把可恢复记录、保守折叠和可查验引用固化为流程。

## 开发与复现

```powershell
npm ci
npm run check
npm run benchmark
$env:DSH_CHECKOUT = 'E:\dsharness'
npm run dsh:check
```

联网模型试验是可选项，会使用本机已有 DSH 登录及模型额度，不在 `npm test` 或 CI 中自动运行。具体协议见实验报告。

本项目参考 [W3C PROV](https://www.w3.org/TR/prov-o/)、[trungdong/prov](https://github.com/trungdong/prov) 与 [ekzhu/datasketch](https://github.com/ekzhu/datasketch)。标准来源图、哈希去重和相似性检索都是已有技术；本项目贡献是 DSH 工作流适配与可验证实现，不宣称生态首创。详细取舍见 [设计说明](docs/DESIGN.md)。

MIT License。
