---
title: "不绑定任何 Agent 框架：我们如何用双契约设计构建安全智能体平台"
description: "当所有人都在争论该选 LangChain 还是 Claude Code 时，我们选择了一条不同的路——定义两个通用契约，让任何 Coding Agent 都能成为平台的执行引擎。"
pubDate: 2026-03-30
tags: ["AI安全", "Agent架构", "智能体平台", "Context Engineering"]
heroImage: ../../../assets/cover-runtime-agnostic-agent.png
---

## 一个让我们纠结了很久的选择

去年我们启动安全智能体平台项目时，团队面临一个经典难题：**选哪个 Agent 框架？**

LangChain 生态最大但太重、AutoGen 适合多 Agent 但部署复杂、Claude Code 推理能力强但绑定 Anthropic……每个方案都有硬伤。更要命的是，这个领域迭代速度极快——今天的"最佳选择"三个月后可能就落伍了。

最终我们做了一个反直觉的决定：**不选。**

我们不绑定任何单一 Agent 运行时，而是定义一套通用的集成契约，让 pi-mono、Codex CLI、Plandex、OpenCode 等任何兼容的 Coding Agent CLI 都能作为平台的执行引擎。

这个设计我们称之为 **Runtime-Agnostic Agent Platform**。

## 两个契约，解耦一切

核心思路很简单：平台和 Agent 之间只需要两个约定。

**契约一：JSON-RPC 通信协议（控制平面）**

平台通过 stdin/stdout JSON Lines 与 Agent 进程交互。平台发送命令（prompt、abort、set_model），Agent 回传事件（agent_start、message_update、tool_execution 等）。

```
平台 ──(stdin JSON)──> Agent CLI 进程
平台 <──(stdout JSON)── Agent CLI 进程
```

**契约二：MetaSkill HTTP 协议（能力平面）**

平台通过极简的 RESTful API 向 Agent 暴露能力。只有三个端点：

- `GET /discover` — 发现可用技能
- `GET /:name/schema` — 获取参数定义
- `POST /invoke` — 执行技能

**这个 HTTP 协议与任何 Agent 运行时无关。** 无论 Agent 内部用什么机制调用工具——pi-mono 的 Extension、Codex 的 Tool、OpenCode 的 MCP Server——只要最终能发起 HTTP 请求，就能使用平台的全部技能。

新增运行时只需实现 `AgentRuntime` 接口并在 `init()` 中注册：

```go
type AgentRuntime interface {
    Type() RuntimeType
    Start(ctx context.Context, cfg RuntimeConfig) error
    Stop(ctx context.Context) error
    SendCommand(ctx context.Context, cmd Command) (*CommandResponse, error)
    Events() <-chan AgentEvent
    IsRunning() bool
}
```

**一个接口、两个契约，就把"选框架"这个难题消解了。**

## 为什么安全场景特别需要这种设计

你可能会问：通用 Agent 平台也可以这样设计，为什么说安全场景特别需要？

因为安全运营有三个独特需求：

**1. 数据和决策之间的鸿沟**

CrowdStrike 2024 报告显示，简单的云配置错误占所有云安全事件的近 70%。数据采集系统产出海量信息，但从数据到可执行的安全洞察，仍需大量人工分析。

我们的平台内置了七阶段 ETL 管道，将多云安全资产数据采集、CSPM 风险检测、Agent 自主分析融为一体。检测引擎发现新风险后，可以自动启动 Agent 进行深度分析——Agent 会主动调用 `query_assets` 获取关联资产、调用 `get_security_groups` 获取完整规则，然后综合分析给出修复建议。

**这不是"告警→人看→处理"，而是"告警→Agent 分析→推送结论"。**

**2. 沙盒隔离是刚需而非可选**

Agent 能调用工具、能执行代码——这在安全场景下是一把双刃剑。我们在 K8s Pod 中运行 Agent，做了严格的隔离：

- 环境变量清洗（清除所有敏感变量，API Key 只通过 CLI 参数传入）
- 每个 Session 独立的一次性 Bearer Token
- SkillID 白名单 + AssetScope 限制（Agent 只能访问授权的技能和数据）
- 资源限制（CPU/内存/超时硬上限）

McKinsey 的 Agentic AI 安全部署 Playbook 强调：企业级 Agent 部署必须解决授权边界、可追溯性和最小权限三大问题。这正是我们平台管控层的核心价值。

**3. 长期记忆改变游戏规则**

安全运营的很多知识是跨会话积累的——"上周修复的安全组问题又复发了""这个 IP 段过去三个月被标记过五次""团队约定的合规豁免规则"。

我们为每个 Agent 绑定了持久化的 Memory 系统。Agent 启动时加载历史记忆，运行中可读写，终止时自动同步。记忆按 `Importance × Recency` 排序，支持用户显式写入、Agent 自提取、系统自动派生三种来源。

**同一个 CSPM 分析 Agent 在第十次处理安全组问题时，已经"记住"了前九次的结论和团队偏好。这是无状态 LLM 调用无法实现的能力跃迁。**

## Context Engineering：把上下文管理当内存管理来做

Agent 的上下文窗口是有限的。当工具返回一个 50KB 的资产列表时，直接塞进上下文会迅速耗尽 Token 预算。

我们的方案是**将上下文管理类比为 OS 的内存管理**：

**虚拟文件系统（VFS）**：工具执行的大结果存入数据库，只返回摘要 + file_id 给 LLM。LLM 需要详细数据时，通过 `read_context` 工具按需分页读取。

**分级记忆**：
- **L1 短期**：完整内容（最近几轮对话）
- **L2 工作**：文件引用（工具结果存 VFS，只保留摘要）
- **L3 归档**：仅摘要（旧对话压缩为关键信息）

**智能压缩**：保留近期完整内容，折叠旧的工具调用，截断超长消息。在 Token 预算内组装最优上下文。

**格式化策略**：不同工具的结果用不同的格式化器处理。资产查询结果用表格摘要，安全组规则用结构化列表，日志数据用关键行提取。超阈值的结果自动转入 VFS。

这套体系让 Agent 能在有限的上下文窗口内高效处理大规模安全数据，而不会因为一次查询就"撑爆"了整个对话。

## 与业界方案的差异

| 维度 | 传统 SOAR | 纯 Agent 框架 | 我们的方案 |
|------|-----------|--------------|-----------|
| 编排方式 | 预定义 Playbook | 需自行实现 | Agent 自主推理 + 平台管控 |
| 数据基座 | 外部对接 | 依赖外部 | 内置 ETL + 动态表 |
| 运行隔离 | 有限 | 同进程 | K8s Pod 容器级 |
| 运行时 | 固定 | 绑定框架 | 可插拔（双契约） |
| 长期记忆 | 无 | 无内置 | Memory 系统 |

Omdia 的 Agentic SOC 报告指出，传统 SOAR 的增量改进已到瓶颈，Agentic 模式代表了 SecOps 从规则驱动到推理驱动的根本转变。

## 实践中的教训

几个月的实践下来，有些教训值得分享：

**1. Agent 不是万能的，但 Agent + 结构化数据是。** 单独让 LLM 分析安全问题，它会给出正确但空泛的建议。但当 Agent 能查询到具体的资产配置、历史告警记录、安全组规则时，它的分析质量会跃升一个量级。数据管道是 Agent 能力的放大器。

**2. MetaSkill 的"先问后用"模式意外好用。** Agent 调用 `execute_skill` 时如果不传参数，会返回 Schema。这让 Agent 能"先看说明书再操作"，显著降低了工具调用的错误率。

**3. Memory 需要衰减机制。** 早期版本的记忆只增不减，几周后 Agent 的系统提示词被历史记忆塞满，反而影响了当前任务的推理质量。引入 `LastUsedAt` 时间衰减后，记忆系统才真正变得实用。

**4. 运行时可插拔不是理论优势。** 我们实际在生产中根据任务类型切换运行时——深度安全分析用推理能力更强的模型，简单资产查询用轻量运行时。不同 AgentDefinition 配置不同的 RuntimeType，这是双契约设计带来的真实收益。

## 最后

当所有人都在争论"选 A 还是选 B"时，也许正确的问题是"能不能不选"。

通过两个简单的契约——JSON-RPC 控制平面 + MetaSkill 能力平面——我们把"Agent 框架选型"从一次性的重大决策，变成了可以随时切换的运行时配置。

安全智能体平台的核心价值不在于用了哪个 Agent 框架，而在于：数据管道能不能提供高质量的安全上下文，管控层能不能保证执行安全边界，记忆系统能不能让 Agent 越用越聪明。

**框架会过时，契约不会。**

---
