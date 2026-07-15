---
title: "Claude Code 的 Auto Mode，真正厉害的不是自动，而是可编程的安全分类器"
description: "很多人会把 Auto Mode 理解成“少弹窗、自动放行”。但从 Claude Code 源码看，它的核心不是 YOLO，而是一套围绕分类器、规则注入、缓存优化和失败降级构建的权限决策系统。"
pubDate: 2026-03-31
tags: ["Claude Code","Auto Mode","安全分类器","Agent工程"]
heroImage: ../../../assets/weixin/claude-code-auto-mode-classifier/cover.png
---

在 AI Coding Agent 里，最难做的功能之一，不是写代码，也不是读代码，而是这句产品需求：

> 尽量别老问我，但也别乱来。

这句话几乎天然自相矛盾。

你要少问用户，就得放权；
你要防止乱来，就得收权。

很多产品最后会走向两个极端：

- 要么非常保守，几乎每一步都确认
- 要么非常激进，所谓 auto 实际上接近 “trust me”

Claude Code 的 Auto Mode 有意思的地方在于，它没有简单选边站，而是试图把这个问题改写成：

**能不能让一个专门的安全分类器来做动态权限判断？**

从源码看，这才是 Auto Mode 的真正核心。

## 第一层误解：Auto Mode 不是“默认放行”

如果你只看产品表面，很容易以为 Auto Mode 的意思是：

- 开了之后别再弹确认框

但源码里 `types/permissions.ts`、`permissionSetup.ts`、`yoloClassifier.ts` 一起传达出的意思完全不同：

Auto Mode 的真实语义是：

**把“是否需要用户确认”这件事，交给一套分类器策略系统。**

也就是说，它不是直接绕过权限，而是把权限决策换了个执行者。

这点非常关键。

因为“自动”这个词很容易让人联想到：

- 关闭安全带
- 降低摩擦
- 牺牲控制

而 Claude Code 的做法更像：

- 不再由固定规则或人类实时点按钮决定
- 改由专门的 classifier 做一次上下文感知判断

这和“无脑自动批准”是两回事。

## 第二个关键点：它把 Auto Mode 做成了可编程策略，而不是写死规则

`utils/settings/types.ts` 和 `utils/settings/settings.ts` 里，Auto Mode 提供了三类可配置输入：

- `allow`
- `soft_deny`
- `environment`

这三类配置特别值得琢磨。

### `allow`

告诉分类器：哪些动作通常可以被放行。

### `soft_deny`

告诉分类器：哪些动作应该倾向于拦住，要求用户确认。

### `environment`

告诉分类器：当前环境有什么上下文，比如工作区特点、项目约束、团队习惯。

这套设计其实非常成熟。因为它承认了一个现实：

**安全判断不是只看“动作本身”，而是动作 + 环境 + 用户意图。**

这比传统 allowlist/denylist 高级太多了。

更有意思的是，源码明确把 projectSettings 排除在外，只接受 trusted settings source。注释甚至直接写了原因：

> 否则恶意项目可以注入 classifier allow/deny rules，带来 RCE 风险。

这说明 Claude Code 团队对一个非常容易被忽略的问题想得很清楚：

**如果分类器的规则来自不可信项目本身，那整个安全系统会被反向利用。**

所以它不是简单“让用户配规则”，而是先定义**谁有资格配规则**。

## 第三个关键点：不是所有动作都值得进分类器

`utils/permissions/classifierDecision.ts` 里维护了一份 `SAFE_YOLO_ALLOWLISTED_TOOLS`。

这里面包括：

- 读文件
- Grep / Glob
- LSP
- 一些 task metadata 操作
- Plan Mode 相关工具
- 一些团队协作工具

这意味着 Claude Code 并不是每次 tool use 都跑一遍 classifier。

它先做了一层前置判断：

**足够安全、足够确定的动作，直接跳过分类器。**

这其实非常重要。

因为如果所有动作都交给 classifier：

- 成本会炸
- 延迟会炸
- 用户会感觉系统变慢

所以 Claude Code 的 Auto Mode 实际上是一个分层决策系统：

1. 明显安全的，直接放
2. 有静态规则可判的，走规则
3. 模糊而高风险的，交给 classifier

这才是一个能上线的“自动模式”，而不是学术 demo 里的全量推理。

## 第四个关键点：分类器看的不是原始聊天，而是“投影过的安全转录”

`yoloClassifier.ts` 里一个我非常喜欢的设计是：它不会把完整对话原样丢给分类器。

它会构造一份专门的 transcript：

- 保留 user text
- 保留 assistant 的 `tool_use`
- **不保留 assistant 普通文本**

为什么？

源码里注释给出的答案很直接：

assistant text 是模型自己写的，可能会反过来影响 classifier 的判断。

换句话说，Claude Code 团队非常清楚：

**如果分类器直接读取主模型产出的自由文本，那么分类器本身也会被上游模型的措辞污染。**

所以它做了一个“安全投影”：

只取和权限判断最相关、最结构化的那部分内容。

这是个非常典型的安全工程思路：

- 不是把全部上下文都喂进去
- 而是把上下文压成最小必要证据集

这一步看起来朴素，但非常关键。很多所谓“再让一个模型审一遍”的架构，恰恰死在这里：二级模型被一级模型的文本叙事带偏。

## 第五个关键点：CLAUDE.md 被当成“用户意图”，而不是系统真理

源码里还有一处特别妙的处理：classifier 在构造输入时，会把 `CLAUDE.md` 包成一个特殊 message，并明确告诉分类器：

这代表用户提供给 agent 的配置，应当视为用户意图的一部分。

这背后其实是权限系统里一个很难的问题：

**本地约束文件，到底属于谁的意图？**

如果把 `CLAUDE.md` 当成纯系统规则，它可能过强；
如果完全忽略，又会丢失用户真实期望。

Claude Code 选了一个中间位：

**它把 CLAUDE.md 视为 user-provided configuration。**

这个语义很重要，因为它影响 classifier 对动作的解读：

- 某个动作是不是符合用户意图
- 某条限制是不是用户主动声明的边界

这类“归属语义”的细节，恰恰最体现团队是否真的做过复杂 Agent 产品。

## 第六个关键点：它甚至把分类器做成两阶段

`yoloClassifier.ts` 里最让我印象深刻的，是 XML 版两阶段分类器。

它支持三种模式：

- `fast`
- `thinking`
- `both`

默认的 `both` 逻辑大概是：

1. 先跑一个超快阶段，快速判断是否可以直接放行
2. 如果 fast 阶段判阻断，再升级到 thinking 阶段
3. thinking 阶段给出更稳的阻断结论和理由

这套设计特别像现代搜索/风控系统里的 coarse-to-fine pipeline：

- 第一层便宜、粗糙、召回高
- 第二层贵一点，但只处理真正疑难样本

它解决的是一个非常现实的问题：

**你不能让所有动作都走深度推理，但你又不能只靠浅层判断。**

于是 Claude Code 的答案是：分阶段。

这点非常值得做 Agent 安全的团队参考。因为“安全”和“可用”经常不是二选一，很多时候只是缺一个多级流水线。

## 第七个关键点：两阶段之间还做了 prompt cache 设计

更妙的是，这两阶段不是简单串起来，而是专门为了缓存去布置前缀。

源码注释提到：

- stage 1 和 stage 2 共享同一个 system prompt 和 transcript prefix
- `cache_control` 被放在 action block 上
- 这样 stage 2 可以命中 stage 1 的完整前缀缓存

这件事看起来很底层，但价值很大。

因为两阶段 classifier 最大的问题就是“更准，但更贵”。

Claude Code 的处理方式不是放弃两阶段，而是尽可能让第二阶段吃到第一阶段写下的缓存。

这说明他们在做的不是一个“逻辑正确”的 Auto Mode，而是一个**成本上可持续的 Auto Mode**。

## 第八个关键点：失败时不是一律瞎放，而是做安全降级

`YoloClassifierResult` 里有很多字段都在说明一件事：这个团队默认相信分类器会出故障。

比如：

- `unavailable`
- `transcriptTooLong`
- `errorDumpPath`
- `stage1Usage`
- `stage2Usage`

而在异常路径里，它也不是简单“classifier 挂了那就算了”，而是区分不同情况：

- transcript 过长
- stage 1 成功但 stage 2 失败
- 完全不可用

然后选择：

- 阻断
- 要求用户确认
- 给出 warning

这里我最欣赏的一点是：**它不神化 classifier。**

很多 AI 产品一旦引入“第二个模型做审核”，就会下意识把它当真理。

Claude Code 不是。它把 classifier 也当成一个会超时、会溢出、会失败、会不可靠的服务来设计。

这才是工程，不是信仰。

## 第九个关键点：Auto Mode 连 sub-agent handoff 也会审

在 `tools/AgentTool/agentToolUtils.ts` 里，Auto Mode 甚至会在子 Agent 完成后，对 handoff 做一次 classifier 审查。

这非常值得注意。

因为如果你只审工具调用，不审子 Agent 回传结果，就会留下一个很大的漏洞：

- 子 Agent 可能做了危险动作
- 主 Agent 把它的输出当“可信中间结果”继续推进

Claude Code 看到这个问题了，所以它把 handoff 也纳入 Auto Mode 的审查链。

这说明它在设计上已经不再是：

- 只保护单 Agent 单步动作

而是在向：

- **保护整个 agent graph 的状态传递**

靠近。

## 我最认同的设计思想

如果让我总结 Claude Code Auto Mode 最值得学的地方，不是“用 LLM 审 LLM”，而是它把 Auto Mode 做成了一个完整的安全产品层：

**第一，规则是可编排的。**
允许用户和系统一起定义 allow / soft_deny / environment。

**第二，输入是投影过的。**
不是全量聊天记录，而是权限判断最需要的结构化上下文。

**第三，执行是分层的。**
allowlist、静态规则、fast classifier、thinking classifier 各干各的。

**第四，失败是可降级的。**
不是“AI 说了算”，而是出错时有明确 fallback。

很多团队谈 Auto Mode，实际上讨论的是“弹窗优化”。

Claude Code 讨论的却是：

**如何把“少打扰用户”和“保持安全边界”变成一个可持续运行的决策系统。**

这就是层级差距。

## 最后

所以我会把 Claude Code 的 Auto Mode 定义为：

**它不是一个自动放行开关，而是一套由分类器驱动、由可信配置塑形、由缓存和降级策略托底的权限编排系统。**

如果你在做自己的 Agent 产品，这里面最值得借鉴的一点也许不是具体 Prompt，而是这套思路：

不要问“要不要 Auto Mode”，而要问：

**你的自动，到底由谁决策、看什么证据、失败时怎么退回。**

想清楚这三个问题，Auto Mode 才可能真正可用。
