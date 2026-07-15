---
title: "Claude Code 的 /btw 为什么很妙：一个不打断主线的 Side Question 是怎么做的"
description: "表面上，/btw 只是“顺手问一句”。但从源码看，它背后其实是一套很精巧的 sidecar 架构：复用主会话上下文、复用 prompt cache、禁止工具、单轮返回、并且不污染主线程。"
pubDate: 2026-03-31
tags: ["Claude Code","Agent工程","Prompt Cache","交互设计"]
heroImage: ../../../assets/weixin/claude-code-btw-side-question/cover.png
---

一个好的 AI 产品，往往不是靠“大功能”拉开差距，而是靠那些你第一次用时觉得“嗯，这个很顺”的小设计。

Claude Code 里的 `/btw`，就是这种功能。

它的产品体验非常自然：

- 你正在一个复杂任务里推进
- 突然想追问一个小问题
- 但你又不想把主线对话带偏

于是你输入：

```text
/btw 这个错误栈里真正关键的是哪一层？
```

系统给你一个答案，但不会把主线程上下文搞乱。

这看起来像个“交互小彩蛋”。可从源码看，`/btw` 背后其实藏着一套非常值得抄作业的设计：**用 forked agent 处理侧边问题，同时尽可能复用主线程已有上下文和缓存。**

## 第一层：/btw 不是聊天命令，而是 Side Question

在 `commands/btw/btw.tsx` 里，`/btw` 被注册成一个 local JSX command，描述是：

> Ask a quick side question without interrupting the main conversation

重点不在“quick question”，而在后半句：

**without interrupting the main conversation**

这说明产品层面对 `/btw` 的定义，不是“发一条额外消息”，而是**开一条侧边支线**。

这两种思路差别很大。

如果只是往主对话里追加一句话，会带来三个问题：

1. 污染主线历史
2. 改变后续上下文分布
3. 让模型把这个问题误判成“当前主任务的一部分”

Claude Code 显然不想要这种结果。所以它没有把 `/btw` 做成一个 prompt trick，而是做成 `side_question`。

## 第二层：真正执行 /btw 的，是一个 forked agent

`commands/btw/btw.tsx` 最终会调用 `runSideQuestion(...)`，而 `runSideQuestion(...)` 又会调用 `runForkedAgent(...)`。

这意味着 `/btw` 的执行方式不是：

- 在当前 agent 上再问一句

而是：

- **拉起一个轻量分叉 agent**
- 给它一份受控上下文
- 只让它回答这一个问题
- 然后把结果展示回来

这在 Agent 架构里是个非常重要的分界线。

因为它把“附带问题”从主线程剥离成了一个 sidecar worker。主线保持纯净，侧问有独立生命周期，产品上就会更稳定。

## 第三个关键点：它复用主线程 prompt cache，而不是重新来一遍

如果 `/btw` 只是简单 fork 一个 agent，其实仍然会很贵。

因为一个复杂代码库场景里，system prompt、user context、system context、消息前缀可能都很长。你要是为了问一句“小问题”重新把整段上下文打一遍，成本和时延都会很糟糕。

Claude Code 的巧妙之处在于，它专门做了一个 `CacheSafeParams`。

在 `utils/forkedAgent.ts` 里，这个结构明确说明：

- system prompt 要一致
- user context 要一致
- system context 要一致
- toolUseContext 要兼容
- forkContextMessages 要共享前缀

然后在 `query/stopHooks.ts` 里，每一轮主线程结束后，系统会把这组 cache-safe 参数快照保存下来。

源码注释写得非常直白：`/btw` 会读这个 snapshot。

也就是说，Claude Code 的想法不是“再构建一次近似上下文”，而是：

**尽量复用主线程上一次真正发给模型的、字节级一致的前缀。**

这不是实现细节，这是成本意识。

很多团队做 side task 时只想到“逻辑分叉”，Claude Code 连“缓存前缀不能变”都想到了。

## 第四个关键点：它为了 cache hit，甚至避免改 thinking config

`utils/sideQuestion.ts` 里有一段特别值得注意的注释：

不要覆盖 `thinkingConfig`，因为 thinking 是 API cache key 的一部分；如果和主线程配置不一致，会直接打穿 prompt cache。

这段话非常有代表性。

它说明 Claude Code 团队对 prompt cache 的理解不是停留在“能缓存最好”，而是已经进入到：

**缓存命中依赖哪些维度，哪些参数绝对不能动。**

换句话说，`/btw` 这个功能之所以“轻”，不是因为它做得少，而是因为它对“哪些东西不能变”理解得足够精确。

这类工程意识，在今天很多 Agent 产品里其实并不常见。

## 第五个关键点：/btw 被严格降权，只能单轮、不能用工具

如果你继续看 `runSideQuestion(...)`，会发现系统给 side question 加了非常严厉的约束：

- 所有工具都被拒绝
- `maxTurns = 1`
- `skipCacheWrite = true`

再加上那段 system reminder，大意就是：

- 这是一个 side question
- 你不能调用任何工具
- 你不能承诺去做动作
- 你只能基于已有上下文直接回答

这就把 `/btw` 的边界画得非常清楚了：

它是**上下文内问答**，不是一个新的执行代理。

这个边界为什么重要？

因为一旦 side question 允许调用工具，它就会从“便宜的附带问答”膨胀成“另一个完整 agent run”：

- 成本上升
- 风险上升
- 用户心智变乱

Claude Code 明显不希望 `/btw` 长成那样，所以它干脆从制度上切死。

## 第六个关键点：它连“提取答案”都针对 thinking 模式踩过坑

`utils/sideQuestion.ts` 里还有一段很工程化的处理。

作者专门解释说，旧版本曾经直接找第一个 assistant message，当模型启用了 adaptive thinking 时，第一条 assistant 往往只有 thinking block，没有 text block，于是系统就会误报：

> No response received

现在的新实现会把所有 assistant blocks flatten 之后，再去提取真正的 text。

这件事看似很小，但它体现了一个我很喜欢的工程风格：

**真正的好设计，不只是架构优雅，还愿意为现实中的脏边角补逻辑。**

因为一个 feature 能不能长期可用，往往不取决于主流程，而取决于这些“在大仓库、高上下文、打开 thinking 之后”才会出现的次生问题。

## 第七个关键点：/btw 甚至不值得写入新的 cache

`runSideQuestion(...)` 里有个设置：`skipCacheWrite: true`。

这个点很妙。

它等于在说：

- side question 会尽量吃主线程已有缓存
- 但 side question 自己产生的 suffix，未来大概率没人再复用

既然没人复用，就不要浪费成本去写新的 cache entry。

这背后是非常典型的系统优化思路：

**只为高复用前缀付缓存成本，不为一次性尾巴付缓存成本。**

很多缓存系统做着做着就会膨胀，原因就在这里：它们只知道“能缓存就缓存”，不知道“哪些缓存没有未来价值”。

Claude Code 在这种小功能里都把这个问题想明白了。

## /btw 真正厉害的地方，不是体验，而是边界感

看完这套实现，我觉得 `/btw` 最值得学的不是交互，而是它对能力边界的拿捏非常准：

**它共享上下文，但不共享控制权。**

side question 看到了主线程上下文，但不能去动工具、不能接管任务。

**它共享缓存，但不污染主线。**

它尽量复用主线程 prefix，但返回结果不会反向搅乱主对话。

**它共享思考环境，但不扩张生命周期。**

它只回答一次，不会无限长出新的 agent loop。

这三个边界立住之后，`/btw` 才会同时满足：

- 快
- 便宜
- 不乱

## 为什么这类能力会越来越重要

我自己越来越相信，未来成熟的 AI IDE / AI Agent 产品，一定不只是“一个主线程聊天框”。

它们会越来越像操作系统：

- 主线程负责主任务
- Sidecar 负责附带问答
- 后台任务负责总结、记忆、建议
- 守护进程负责权限和清理

Claude Code 的 `/btw`，其实就是这个方向上的一个非常典型的小样本。

它不是为了炫技而多开一个 agent，而是承认真实工作流里本来就存在很多**不值得打断主任务的支线问题**。

当产品愿意为这种“细碎但高频”的场景设计专门机制时，整个系统的可用性就会明显往前走一步。

## 最后

如果让我用一句话概括 `/btw` 的设计，我会说：

**它不是“顺便问一句”，而是把“顺便问一句”正式做成了一个有缓存意识、有权限边界、有生命周期约束的 sidecar agent。**

这就是为什么它看起来只是个小命令，背后却有一整套非常像样的工程思考。
