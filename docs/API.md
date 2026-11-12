# 接口与工作流

10 个正式 DSH 工具均返回结构化 JSON；Native 和 PTC 使用同一实现。需要真实 DSH Agent Session；不接受模型自填 Session 身份。

| 工具 | 必填参数 | 行为 |
|---|---|---|
| `evidence_case_create` | `name` | 创建案例，返回 `case_id` |
| `evidence_resume` | 无 | 找回当前 Session 使用过的案例 |
| `evidence_search` | `case_id, query` | 调用当前 DSH 搜索服务、入库、返回新增材料和重复材料 ID |
| `evidence_ingest` | `case_id, records` | 导入 `{url,text,title?,published_at?,claim?,stance?}`，URL/文本是调用者提供的记录 |
| `evidence_report` | `case_id, format, items` | `format=dsh-evidence-report/v1`；每项 `{text,refs,novelty,claim?,stance?}` |
| `evidence_link` | `case_id,child,parent,relation,note,expected_revision` | 添加可审计来源断言；可加 `reference_excerpt` 检查原文内的 URL 引用 |
| `evidence_link_revoke` | `case_id,edge_id,reason,expected_revision` | 撤销关系，不删除材料和历史 |
| `evidence_context` | `case_id` | 可加 `claim,offset,limit`；返回正文、别名和来源图摘要 |
| `evidence_get` | `case_id,evidence_id` | 原文、来源、身份、指纹、相关边 |
| `evidence_export` | `case_id` | 写入 `root/exports/`，返回文件路径、哈希与校验结果 |

所有写入工具（导出除外）支持 `request_key`。同键同参数返回**历史回执**，不声称当前状态还是旧版本；同键不同参数报错。未传键时用 DSH 调用 ID。搜索已提交回执的重试不再次调用供应商；断网或崩溃发生在供应商响应之后、本地提交之前时仍可能重复付费，不承诺外部调用 exactly-once。

## PTC 例子

```javascript
const p = await tools.evidence_case_create({name:'温度记录调研',request_key:'start'});
const search = await tools.evidence_search({case_id:p.case_id,query:'NASA NOAA 2023 temperature record',request_key:'search-1'});
return {case_id:p.case_id,search};
```

在子 Agent 提示中传入 `case_id` 和待查的 evidence ID，要求先用 `evidence_get` 阅读原文，再调用：

```javascript
await tools.evidence_report({
  case_id:'<实际 case_id>', format:'dsh-evidence-report/v1', request_key:'child-report-1',
  items:[{text:'基于该材料得到的汇报',refs:['<实际 ev_id>'],novelty:'derived',stance:'context'}]
});
```

子 Agent 最终回复中返回回执里的 `case_id` 与 `ids`。父 Agent 调用 `evidence_context` 合并查看，不需要把子 Agent 转述重新当作网页来源。`novelty=new` 保留单独未知来源，refs 只形成 citation，不会把新发现并入旧来源。Agent 的口头“发现了新事实”仍需后续核实。

引用关系不得仅由相似度推断。`citation` 只表示提到父材料。`derivation` 用于当前条目全部来自父材料的情况；同一文档包含自己的调查时，把新增部分单独作为条目录入，或只建立 citation。

## 完整视图与导出

默认每页 50 个保留条目，最大 200；`next_offset` 非空时继续读取。不会截断单条正文；`complete=false` 提示当前页不覆盖全部。`aliases` 是折叠材料 ID，原文及独立 URL 均留在数据库。

每条正文最大 20,000 字符；一次导入 100 条、汇报 50 条，每条最多 30 个 refs；每案例 2,000 条材料、10,000 条关系、10,000 次变更、16 MB 状态。超限报错并回滚，不默默丢弃。URL 查询参数和 fragment 保留，避免把不同资源误合并。

导出校验：

```powershell
node lib/cli.js verify '<导出文件路径>'
```

导出含 `case`、`audit`、`prov` 和总校验值。`prov` 是可独立交给 Python `prov` 的 PROV-JSON 子集。校验检查正文、审计链、末次状态和 PROV 投影的一致性；不鉴定来源真假。
