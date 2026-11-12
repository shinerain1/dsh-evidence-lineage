# 设计与已有工作的关系

这里需要解决的是来源记录与上下文处理，不是发明新的去重算法。

1. **W3C PROV-O / PROV-JSON**：采用 entity、derivation 与 influence 的已有概念。导出中的 `wasDerivedFrom` 对应记录的 derivation，citation 映射为更宽泛的 `wasInfluencedBy`。扩展属性保留 basis、说明和 `semanticVerification=false`，防止把声明冒充验证结果。[标准](https://www.w3.org/TR/prov-o/)
2. **trungdong/prov**：使用成熟 Python 库验证导出的 PROV-JSON 能解析并往返转换。它是验证用依赖，不是插件运行依赖；插件保持一个 Node 包，避免额外后台服务。[仓库](https://github.com/trungdong/prov)
3. **ekzhu/datasketch**：研究其 MinHash、LSH 文档和候选误匹配边界。它解决集合相似性，不能提供转载来源证明。首版只有 2,000 条材料上限，使用确定性 SHA-256 足够；没有为了显得复杂而加入 LSH/向量库。[MinHash](https://ekzhu.com/datasketch/minhash.html)、[LSH 实现文档](https://github.com/ekzhu/datasketch/blob/master/docs/lsh.rst)
4. **DSH 官方源码**：搜索适配来自 `packages/web/web/src/types.ts` 与 `packages/web/tool-web/src/search.ts`；工具注册和执行身份来自 `packages/core/tools`，Session 父子关系来自 DSH Session header。测试固定 commit `8bd073392eef6f54e921a093b95076248eb08cbb`。不复制或修改 DSH 核心。[源码](https://github.com/deepseek-ai/deepseek-harness/tree/8bd073392eef6f54e921a093b95076248eb08cbb)

相关认知研究说明人可能低估信息源之间的相关性；它不能直接证明某个 DSH 插件有效。参见 Enke 与 Zimmermann 的 [Correlation Neglect in Belief Formation](https://benjamin-enke.com/pdf/Correlation_neglect.pdf)。本仓库的运行结果单独报告。

## 保守折叠

将每条材料作为不可变节点，source ID 对应精确保留查询参数的 URL；相同 URL 的不同正文、标题和日期是不同快照。来源图只沿 derivation 边追溯，citation 不改变来源家族。

折叠要求：正文 SHA-256、标题、发布时间、议题、立场和记录的来源集合全部相等。不同来源的同文不折叠；同源的不同正文也不折叠。汇报中的新观察保持自己的来源候选。

图中的 assertion 不是语义证明：URL 字符串出现只证明字面引用，report refs 只证明该汇报声明了哪些输入。手工提供的错误边会导致错误来源计数，这是明确的产品边界；不会声称解决任意网页的真实来源推断。

## DSH 特点

- Cordis 插件生命周期负责注册、卸载、存储连接清理；可选 systemPrompt 服务提供工作流提示。
- 正式结构化工具同时供 Native 与 PTC 使用；PTC 可以批处理收集、汇报、查看与导出。
- Session/调用身份由 `exec.agent`、`exec.callId` 读取；没有把 Agent 自称的名字当作身份。
- SQLite 将状态放在模型上下文之外；压缩或重启后按 Session 找回。
- 搜索走 DSH 的 web service seam，取消信号传给当前搜索供应商；没有另做一套 API key 管理。

这是受信任的本地插件，不是多租户权限系统。case ID 不是访问控制；同一配置内知道 ID 的 Agent 可使用该案例。存储是宿主本地文件，不受 PTC 子进程文件沙箱单独隔离。首版不抓取任意 URL，不执行材料内的代码，不主动启动子 Agent，不后台联网；网络请求只在调用搜索工具时交给 DSH 服务。
