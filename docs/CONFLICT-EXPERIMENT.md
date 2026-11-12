# 当前插件能识别原始 DSH 漏掉的冲突吗？

**这次实验没有支持该命题。原始 DSH、保留来源信息的普通去重、当前插件视图，全部正确完成了预设案例；没有出现“原始组漏判、插件组检出”的配对。**

实验运行于 2026-11-12，固定现有 v0.1.0，没有添加冲突检测算法。运行前已将[协议](../experiments/conflicts/PROTOCOL.md)、样本和评分代码提交到 [31ac597](https://github.com/shinerain1/dsh-evidence-lineage/commit/31ac597)。没有根据结果换题或追加有利样本。

## 实际运行了什么

- DSH commit：`8bd073392eef6f54e921a093b95076248eb08cbb`。
- 模型：`deepseek-official/deepseek-flash`。
- 实际 headless Session 和正式 Native 工具管线。每次模型先调用 `conflict_packet` 读取资料，再作答；12 次运行均实际调用一次工具、经历两次主任务 completion。
- `lineage` 组的材料视图由生产版 `Store` 和 `project` 生成；其代码哈希与冻结版本一致。实验适配工具只负责交付材料，不分类冲突。
- 三组用户指令、来源事实和可用判断依据一致。普通去重组保留了折叠材料的 ID、URL 和引用边，没有使用会丢来源的弱基线。
- 12 个独立案例：6 个冲突、4 个可兼容、2 个信息不足。每例 2 条核心材料加 8 条转载；输入不带答案、支持/反对立场或冲突标签。

来源关系是事先给定的，转载是控制样例。两个案例采用真实 NASA/NOAA 温度报道作为事实基础，其中一个故意注入“把华氏温差写成摄氏温差”的转述错误。**这不是发现真实 NASA 新闻稿自相矛盾，也不是自主联网、多 Agent 实地研究。**

## 结果

主试验使用 reasoning effort `off`，4,096 输出 token 上限；seed 17、29、43 只改变材料顺序，三个组都跑三次。

| 组 | 冲突检出 | 非冲突/信息不足误报 | 全部判定正确 | 未完成 |
|---|---:|---:|---:|---:|
| 原始 DSH 材料 | 18/18 | 0/18 | 36/36 | 0 |
| 保留来源的普通去重 | 18/18 | 0/18 | 36/36 | 0 |
| 插件视图 | 18/18 | 0/18 | 36/36 | 0 |

每组三次重复来自同样 12 个案例，不是 36 个独立现实案例。每次冲突判断必须引用互斥的两条材料，重复副本之间不能算冲突。独立评分器按原始正文复核了引用对。

补充试验使用 reasoning effort `low`，16,384 输出 token 上限，seed=17，三组各一次：三组都检出 **6/6** 个冲突，全部 **12/12** 判定正确，误报和未完成均为 **0**。该结果单独报告，没有和 off 模式择优拼接。

**配对增益为 0，配对退步也为 0。** 没有把预算耗尽或工具失败算作原始组识别错误；这批运行中也没有此类失败。

## 具体检出了哪些问题

三个组都能识别：

- 同一个 NASA 年度分析和参考期下，1.2°C 被转述为 2.1°C。
- 同一个软件版本的默认配置，从“不允许未签名扩展”转述成“允许”。
- 同一笔最终退款的金额从 138 美元变成 183 美元。
- 同一批次“全部通过”与“其中一件未通过”。
- 同一规则对恰好 18 岁申请人的资格判断相反。
- 明确声称最终 revision 3，却使用 revision 2 的计数。

它们也都没有把不同统计基线、不同月份、32°F 与 0°C、2 个百分点与 25% 相对增长误判为冲突；缺失时间或人群范围的材料均判断为信息不足。

## 开销

以下是 DSH `step_end` 记录的主任务 token 使用量，包含输入缓存读取和模型输出。自动会话标题另有 12 次后台请求，其使用量不在此表中；这不是账户结算总账。

| 组 | off 三次主任务总 token | low 一次主任务总 token |
|---|---:|---:|
| 原始材料 | 44,088 | 15,066 |
| 普通去重 | 33,910 | 12,135 |
| 插件视图 | 41,420 | 15,677 |

插件在 off 试验中比原始材料少约 6%，比普通去重多约 22%；low 试验中比原始材料多约 4%。当前结果也不能支持普遍节省 token。

## 实验完整性检查

- [输入核查脚本](../experiments/conflicts/validate-inputs.mjs) 检查三组保留相同的两条核心断言、全部 10 个材料 ID、相同引用事实，且没有 gold 字段进入工具包。
- [会话交付核查](results/conflicts/delivery-audit.json) 逐一读取了 12 个 DSH 持久化 Session，确认完整工具结果与冻结输入哈希一致、最终文本与公开回答一致。
- DSH headless 会截断终端 JSONL 中的长展示字符串。这里额外核查了压缩 Session 文件中的完整 `tool/result`，确认没有把展示截断误当作模型拿到的资料。
- [独立评分器](../experiments/conflicts/audit-results.mjs) 重新核对了全部 144 个题目判定与引用对；底层仍是 12 个独立案例。
- [机器可读结果](results/conflicts/results.json)、每组最终回答、冻结输入与清单均公开。原始会话日志留在本地，不上传登录信息或模型内部推理。

## 对项目定位的影响

当前插件可以提供来源链、恢复、保守折叠和追溯交付；**这批实验不能把“新增冲突识别能力”作为它的卖点。** 这些冲突在同样任务说明和材料条件下，原始 DSH 已能识别。

样例出现了天花板效应。它不能证明所有复杂场景都没有增益，但也不能用“将来可能有用”代替当前证据。跨多轮遗忘、开放网页口径隐含、证据漏检和真实子 Agent 转述仍未在本试验中验证；任何后续实验都应另行固定协议和更强基线。

## 复现

先检查公开结果，不调用模型：

```powershell
node experiments/conflicts/validate-inputs.mjs
node experiments/conflicts/audit-results.mjs
```

重新执行会使用当前 DSH 模型登录和额度，并生成新的独立 Session：

```powershell
$env:DSH_CHECKOUT='E:\dsharness'
node scripts/conflict-eval.mjs prepare
node scripts/conflict-eval.mjs preflight
# 按 docs/results/conflicts/manifest.json 的 plans 顺序，对每个 id 执行：
node scripts/conflict-eval.mjs run off-17-raw
# 完成全部计划后：
node scripts/conflict-eval.mjs audit
node experiments/conflicts/audit-delivery.mjs
```

重新准备会生成新一轮输入和本地位置记录；运行器拒绝覆盖同一轮已经观察到的运行结果。
