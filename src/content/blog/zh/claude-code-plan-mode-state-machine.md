---
title: "Claude Code 的 Plan Mode，不只是“先想后写”，而是一套权限状态机"
description: "很多人把 Plan Mode 理解成一个更爱先思考的 Prompt。但从源码看，Claude Code 真正做的是：把“规划”提升成一个可进入、可退出、可审批、可恢复的系统状态。"
pubDate: 2026-03-31
tags: ["Claude Code","Agent工程","Plan Mode","权限系统"]
heroImage: ../../../assets/weixin/claude-code-plan-mode-state-machine/cover.png
---

很多 AI Coding Agent 都会说一句类似的话：

> 遇到复杂任务，先做计划。

大多数时候，这句话只是一段 Prompt 风格。模型今天听了，明天忘了；上下文一压缩，所谓“计划阶段”也就跟着蒸发了。

但从这份 Claude Code 源码里，我看到的不是一个“提示词技巧”，而是一套**被系统正式承认的工作状态**。

它有明确的进入动作、退出动作、状态恢复逻辑、审批链路，甚至还和模型选择、权限剥离、多 Agent 协作绑在一起。换句话说，**Plan Mode 在 Claude Code 里不是修辞，而是 runtime。**

## 第一个关键点：进入 Plan Mode，不是说一句“我先想想”

源码里 `EnterPlanModeTool` 做的第一件事，不是生成计划，而是**改状态**。

在 `tools/EnterPlanModeTool/EnterPlanModeTool.ts` 里，进入 Plan Mode 时会：

1. 调用 `handlePlanModeTransition(...)`
2. 把 `toolPermissionContext.mode` 设置为 `plan`
3. 调用 `prepareContextForPlanMode(...)`

这意味着“计划”不是模型自我约束，而是平台层的显式切换。

更重要的是，这个 Tool 还是一个需要用户同意的 deferred tool。也就是说，Claude 不能悄悄把自己切到一个新的工作模式，它得先征得用户许可。

这是一个很微妙但很重要的产品判断：

**规划本身，也是一种权限。**

因为一旦进入规划态，系统对模型的期望、UI 展示、后续可执行动作，都会发生变化。Claude Code 把这一步做成显式切换，而不是隐式 Prompt，是很成熟的 Agent 产品思路。

## 第二个关键点：Plan Mode 的本质，是“读多写少”的受限执行态

`EnterPlanModeTool` 返回给模型的指令很直白：

- 深入探索代码库
- 理解现有模式
- 设计实现方案
- 需要时用 `AskUserQuestion`
- **不要写文件**

也就是说，Plan Mode 本质上不是“更聪明的聊天模式”，而是一个**受限能力模式**。系统明确要求模型在这段时间做只读探索和设计，不做真正的实现。

这在 Agent 设计里很关键。

因为“规划”和“执行”其实是两种完全不同的风险类型：

- 规划阶段的主要风险是理解错、设计偏
- 执行阶段的主要风险是写坏代码、跑错命令、扩大破坏面

把两者拆开之后，系统才有可能在规划阶段给模型更大的探索空间，同时在执行阶段恢复更细粒度的安全约束。

## 第三个关键点：它不是单向切换，而是可恢复的状态机

真正让我觉得 Claude Code 团队想得很深的，是 `prepareContextForPlanMode(...)` 和 `ExitPlanModeV2Tool.ts` 里的恢复逻辑。

进入 Plan Mode 时，系统会把当前模式存进 `prePlanMode`。退出时，再决定恢复到什么模式。

这件事听起来很普通，但它解决了一个典型 Agent 系统容易忽略的问题：

**“进入规划态之前，我原来是谁？”**

如果你之前处在：

- `default`
- `auto`
- `bypassPermissions`

那你退出计划态之后，应该回到的世界完全不同。

Claude Code 的处理不是一刀切，而是显式记住旧状态，再在退出时恢复。

这背后其实是一个很成熟的系统工程习惯：**凡是会跨阶段切模式的系统，都必须保留回滚上下文。**

在传统软件里，这像事务上下文；在编译器里，这像 phase state；在 Agent 里，这就是 mode restoration。

## 第四个关键点：Plan Mode 甚至会和 Auto Mode 发生“叠态”

更有意思的是，Claude Code 并没有把 Plan Mode 和 Auto Mode 设计成完全互斥。

`utils/permissions/permissionSetup.ts` 里有个非常值得注意的函数：`shouldPlanUseAutoMode()`。

它会综合判断：

- 用户有没有 opt in Auto Mode
- Auto Mode gate 是否打开
- `useAutoModeDuringPlan` 是否允许

如果满足条件，那么进入 `plan` 模式时，**auto mode 的 classifier 语义仍然可以继续生效**。

这说明团队并不是把模式设计成几个简单的单选项，而是把它们看成：

- `plan` 决定工作阶段
- `auto` 决定权限决策机制

也就是说，一个 session 可以处于“正在规划，但权限上仍由 classifier 托管”的复合状态。

这比“模式切换就是换一套 Prompt”高级太多了。因为它本质上是在区分：

- **workflow phase**
- **permission semantics**

很多 Agent 产品把这两件事混在一起，结果就是状态一复杂就全乱了。

## 第五个关键点：Plan Mode 的产物不是一段聊天记录，而是一份 plan file

Claude Code 的退出逻辑也不是“你把计划发给用户看看”，而是去读磁盘上的 plan file。

在 `ExitPlanModeV2Tool.ts` 里，退出 Plan Mode 时会：

1. 读取 `getPlanFilePath(...)`
2. 从磁盘拿 plan 内容
3. 必要时把用户编辑过的版本写回去
4. 再把这份 plan 用于审批、展示和后续执行

这一步很重要。因为它把“计划”从瞬时对话，变成了一个**稳定、可复用、可编辑、可追踪的工件**。

只要计划是文件，它就天然获得几个额外能力：

- 可被用户修改
- 可被恢复
- 可被验证
- 可被多 Agent 共享
- 可在上下文压缩后继续存在

这也是为什么源码里会专门处理：

- compact 之后继续附带 plan mode attachment
- 退出后提供 plan_mode_exit attachment
- 重新进入时重新加载 plan file

换句话说，Claude Code 不是让模型“记住计划”，而是让系统**持久化计划**。

## 第六个关键点：Plan Mode 还绑定了模型路由

`utils/model/model.ts` 里还有一个很有代表性的设计：

如果用户选的是 `opusplan`，那么系统会在 `permissionMode === 'plan'` 时切到 Opus，其它时候回到常规主模型。

这个设计很聪明。

因为它承认了一个现实：**规划和执行，不一定值得用同一档模型。**

规划阶段通常更需要：

- 更长程的结构思考
- 更强的方案比较
- 更稳的抽象能力

而执行阶段很多时候更像：

- 代码编辑
- 快速迭代
- 局部修修补补

所以 Claude Code 并没有只做“模式切换”，而是进一步做了**模式驱动的模型切换**。

这其实是非常值得国内 Agent 产品借鉴的一点：不要只在任务级别选模型，也可以在**阶段级别选模型**。

## 第七个关键点：多 Agent 场景下，Plan Mode 还能变成审批协议

如果你继续往下看，会发现 Plan Mode 不是只服务单 Agent。

在 teammate / swarm 场景里，源码支持 `planModeRequired`：

- 子 Agent 被创建时可以直接以 `permissionMode: 'plan'` 启动
- 子 Agent 退出计划态时，不是直接开干
- 而是把 plan 通过 mailbox 发给 `team-lead`
- 然后等待批准

也就是说，Plan Mode 在多 Agent 模式下已经不是“个人习惯”，而是一种**组织流程协议**。

这个设计的价值非常现实：

- 主 Agent 不必人工逐个盯子 Agent
- 子 Agent 不能直接跳过方案确认
- 团队可以把“先出方案、再批执行”变成统一规则

如果你把 Claude Code 想成“一个会写代码的聊天机器人”，你会觉得这些设计有点重。

但如果你把它想成“一个可编排的软件生产系统”，这些设计就非常合理。

## 我最认同的设计思想

看完整条链路之后，我觉得 Claude Code 的 Plan Mode 真正值得学的，不是它会生成计划，而是它把“规划”做成了**一等系统对象**。

具体来说，它做对了三件事：

**第一，把规划从 Prompt 提升成状态。**
不是说一句“先想再做”，而是明确进入 `plan`。

**第二，把规划从记忆提升成工件。**
不是“记住刚才讨论过什么”，而是把 plan 写成文件。

**第三，把规划从个人行为提升成流程。**
不是模型自己说“我准备好了”，而是走退出、审批、恢复、再执行的链路。

这三步叠起来，Plan Mode 才真正从“产品文案里的 feature”变成“工程上站得住的机制”。

## 最后

很多团队在做 AI Agent 时，都喜欢先追求“更自主”“更少打断”“更强自动化”。

但 Claude Code 这套源码给我的一个提醒是：

**真正成熟的自主，不是少状态，而是状态足够清晰。**

当一个系统能准确地区分：

- 我现在是在探索，还是在执行
- 我当前继承了哪些权限语义
- 我退出之后要恢复到哪里
- 我的计划是临时对话，还是稳定工件

它才配谈可靠的 Agent 工程。

所以我会把 Claude Code 的 Plan Mode 定义为：

**它不是一个“先想想”的模式，而是一套围绕规划阶段构建的权限状态机。**
