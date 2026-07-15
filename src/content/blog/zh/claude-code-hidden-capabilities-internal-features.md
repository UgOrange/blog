---
title: "解密 Claude Code：那些已经写进源码、却还没完全放开的隐藏能力"
description: "很多人以为 Claude Code 现在展示出来的能力，就是它全部的能力。但从最新源码看，真正有意思的地方在于：它已经埋好了大量内部功能和受限能力，只是通过 feature flag、权限策略、账号形态和构建目标，把它们层层锁住了。"
pubDate: 2026-03-31
tags: ["Claude Code","Agent工程","Feature Flag","内部功能"]
heroImage: ../../../assets/weixin/claude-code-hidden-capabilities-internal-features/cover.png
---

很多人看 Claude Code，会下意识把它理解成一个已经定型的产品：

- 现在能用什么，就是它会什么
- help 里没出现的功能，大概率就不存在
- 被官方公开讲过的能力，才算真正能力边界

但看完这份最新源码后，我的结论正好相反。

**Claude Code 现在最值得研究的，不是它已经公开了什么，而是它已经实现了多少“暂时不完全对外开放”的能力。**

这些能力有的已经有完整命令入口，只是被隐藏；
有的已经有完整运行链路，只是被 feature flag 卡住；
有的已经有工具和 UI，只是被账号形态、组织策略或者构建版本限制；
还有一些则更像“半公开的内部功能”——源码里能看到骨架，甚至能看到完整 prompt、调度逻辑和任务模型，但普通用户暂时碰不到。

这说明一件很重要的事：

**Claude Code 的演化方式，不是“功能想好了再写”，而是先把能力埋进 runtime，再通过 gating 慢慢放量。**

如果你在做 Agent 产品，这种设计思路很值得抄。

## 一、先说结论：Claude Code 的很多“隐藏能力”并不是彩蛋，而是受控发布机制

从源码结构看，Claude Code 对“功能是否对用户可见”并不是简单地开关一个菜单，而是至少拆成了四层：

1. **构建时裁剪**：`feature('...')`
2. **运行时灰度**：GrowthBook / Statsig flag
3. **账号/环境限制**：OAuth、订阅形态、是否 `claude.ai`
4. **组织策略限制**：policy allowlist

也就是说，Claude Code 并不是只有一个“公开版功能集”。

它实际上更像是一个**多层能力底座**：

- 一些能力存在于 ant/internal build
- 一些能力存在于 first-party web 形态
- 一些能力只对特定账号或订阅生效
- 一些能力即使技术上存在，也会被组织策略拦掉

这就解释了为什么你会在源码里看到很多“明明已经写完，但普通用户感知不到”的东西。

它们不是没做完，而是**被刻意限制在某个发布面里**。

## 二、最夸张的隐藏能力：/ultraplan 其实已经是“Claude Code on the Web + Opus + 远程执行”的高级工作流

如果让我选一个最能代表 Claude Code 内部野心的能力，我会选 `/ultraplan`。

在 `commands/ultraplan.tsx` 里，它不是一个普通的本地 slash command，而是一条非常完整的远程工作流：

- 启动 Claude Code on the web 会话
- 使用更强的模型做高级规划
- 异步轮询计划审批结果
- 用户可在 web 端批准计划
- 批准后可以直接在远端继续执行
- 最后把结果以 PR 或回传结果的形式落地

更关键的是，这个功能不是概念验证，而是已经有完整的产品语义：

- 有单独的 terms URL
- 有 session URL
- 有后台轮询
- 有状态机
- 有 stop / archive 逻辑
- 有“执行留在 web 端”与“传回本地”两条分支

这不是“模型帮你多想一步”，而是**把复杂规划外包给一个远端、更强模型、更长时运行的 agent 环境**。

而它为什么你现在大概率没在正式版本里明显见到？

因为它在命令定义里直接写了：只在特定构建目标里启用。`isEnabled: () => process.env.USER_TYPE === 'ant'` 这一类逻辑，已经把它和普通外部用户隔开了。

这透露出一个特别重要的产品判断：

**Claude Code 已经不满足于“单 session、本地 terminal、单模型”这套框架了。**

它在往“本地 IDE/CLI + 远程高算力 planning/execution plane”的方向长。

说白了，`/ultraplan` 背后不是一个命令，而是一条未来路线：

**把最重的规划和多 Agent 协作，迁移到 Claude Code on the Web。**

## 三、第二类隐藏能力：远程控制、远程会话、Web Setup，说明它在把 CLI 变成可远程接管的前端

另一组非常值得注意的能力，是跟 remote 有关的一整套命令和状态：

- `/remote-control`（`commands/bridge/index.ts`）
- `/session` / `remote` alias
- `/web-setup`（`commands/remote-setup/index.ts`）

这一组能力连起来看，就不是“方便扫码登录”这么简单了。

它背后其实在做三件事：

### 1. 让 terminal 会话可以被远程接管

`/remote-control` 这个命令的描述很直接：

> Connect this terminal for remote-control sessions

而且它不只是技术能力，还挂了组织策略判断：

- 先过 build-time feature gate
- 再过 `isBridgeEnabled()`
- 再过 `allow_remote_control` policy

这说明在 Claude Code 设计里，“远程接管本地 terminal”不是彩蛋，而是一个被认真治理的正式能力。

### 2. 让会话天然具备 session URL / QR code 这种跨端属性

`/session` 命令只有在 remote mode 下出现，功能是展示 remote session URL 和二维码。

这意味着 Claude Code 的会话模型已经不是“只活在当前 terminal 里”。

它已经在往一种更像云端会话对象的方向演化：

- 可以从本地进入
- 可以在 web 端继续看
- 可以通过二维码接续
- 可以跨设备接管

### 3. 把“Claude Code on the Web”当成正式的能力扩展平面

`/web-setup` 这个命令还额外挂了 GitHub 账号连接和 `allow_remote_sessions` policy。

这说明 Claude Code 并不是简单做了个 companion web UI。

它更像是在建一个第二执行面：

- 本地 CLI 负责即时交互和高频控制
- Web 负责远程运行、会话续接、长任务和 richer workflow

换句话说，**CLI 只是入口，真正的 product surface 已经开始扩展到 web。**

## 四、第三类隐藏能力：Voice Mode 不是简单的“还没开放”，而是被账号形态硬限制

`/voice` 这条线也很有意思。

在 `commands/voice/index.ts` 和 `voice/voiceModeEnabled.ts` 里，你能看到它不是一个简单的实验功能，而是一套已经比较完整的能力判断逻辑：

- 要有 build-time `VOICE_MODE`
- 要没有被 kill switch `tengu_amber_quartz_disabled` 关掉
- 要有 Anthropic OAuth token
- 而且必须是 `claude.ai` 形态

源码里甚至写得很明白：

**Voice mode 用的是 `claude.ai` 的 voice stream endpoint，不支持 API key、Bedrock、Vertex、Foundry。**

这很关键。

它说明 Claude Code 的某些能力限制，不是因为“产品还没想好”，而是因为**底层依赖的是 first-party 平台能力，而不是通用 API 能力**。

这类能力天然就会出现“同一个 Claude Code，不同账号形态能力完全不同”的情况。

这背后是很典型的平台产品思路：

- 通用能力尽量走统一 agent runtime
- 高级体验能力绑定 first-party account / endpoint

所以 Voice Mode 这件事，真正值得看的不是“它开没开”，而是：

**Claude Code 已经开始把一部分能力绑定到平台账户体系，而不是纯 CLI 软件本身。**

## 五、第四类隐藏能力：很多命令其实已经存在，但 help 不会告诉你

源码里还有一类很有意思的东西：**命令本身已经存在，但被 `isHidden: true` 明确藏起来。**

比较典型的有：

- `rate-limit-options`：源码注释直接写了“Hidden from help - only used internally”
- `output-style`：已经被废弃，要求用 `/config` 替代，但命令还留着
- `heapdump`：直接把 JS heap dump 到桌面，明显是诊断/内部支持向功能
- `thinkback-play`：作为 `think-back` 工作流的内部播放命令，不对用户公开展示
- `session`：只有进入 remote mode 才会显示

这类命令很值得注意，因为它们体现的是一种成熟 CLI 产品的演进策略：

**先把内部操作本身做成标准命令，再决定是否放进 help、是否对普通用户暴露。**

这样做的好处是：

- 内部流程不用额外维护一套特殊入口
- 自动化、测试、调试都统一走 command system
- 真要对外开放时，只要调整 gate 和 help 可见性

也就是说，Claude Code 的“隐藏命令”不是乱七八糟的后门，而更像是它的**内部 API surface**。

## 六、第五类隐藏能力：有些命令甚至只剩“stub”，说明功能位已经预留好了

更有意思的是，源码里还有一批命令连实现都不打算在当前构建里带上，直接变成 stub：

- `share`
- `autofix-pr`
- `ctx_viz`
- `teleport`
- `good-claude`
- `issue`
- `mock-limits`
- `reset-limits`
- `backfill-sessions`
- `debug-tool-call`

这些文件基本都长这样：

- `isEnabled: () => false`
- `isHidden: true`
- `name: 'stub'`

这特别像什么？

像一个产品团队已经把命令空间、调用约定和模块位置都规划好了，但当前构建不打算真正交付这些能力，于是用 stub 占位。

这种做法的意义不在于“现在能不能用”，而在于它暴露了**内部 roadmap 的轮廓**。

比如从这些名字你大概就能猜到一些方向：

- `autofix-pr`：自动修 PR / review issue
- `ctx_viz`：上下文可视化
- `teleport`：跨环境/跨端转移任务
- `share`：会话或结果分享
- `reset-limits` / `mock-limits`：额度和限流测试工具
- `debug-tool-call`：工具调用调试

这意味着 Claude Code 的内部版本很可能已经长期在把“命令空间”当成未来产品路线图的一部分来维护。

## 七、第六类隐藏能力：不是命令被藏，而是工具已经长出来了

如果你只盯着 slash command，会低估 Claude Code 已经长出来的内部能力。

因为更深一层的东西，其实在 tool 层。

例如在 `tools/` 目录里，你能看到一批很“系统级”的工具：

- `TeamCreateTool`
- `TaskCreateTool` / `TaskUpdateTool` / `TaskGetTool`
- `ScheduleCronTool`
- `EnterPlanModeTool` / `ExitPlanModeTool`
- `SendMessageTool`

这说明 Claude Code 的内部世界，已经不是“模型 + Bash + 文件读写”这么简单。

它已经长成了一套真正的 agent runtime：

- 可以建 task list
- 可以建多 agent team
- 可以发消息给别的 agent
- 可以进入/退出 plan 状态
- 可以调度 cron 任务

而且这些工具并不是全都给最终用户直接显式暴露。

例如 `TaskCreateTool`、`TeamCreateTool` 这种东西，更像是**agent 的内部操作系统接口**。

用户未必需要直接知道它们，但 Claude Code 自己已经在用它们组织更复杂的工作流。

这点非常关键。

因为这意味着 Claude Code 正在从一个“会调用 shell 的助手”，变成一个有：

- 状态
- 任务
- 队友
- 调度器
- 权限系统

的真正 Agent 平台。

## 八、第七类隐藏能力：自动记忆、团队记忆、Cron 调度，都不是临时想法，而是长期系统能力

看 `memdir/memdir.ts` 和 `tools/ScheduleCronTool/prompt.ts`，你会发现另一个非常强的信号：

Claude Code 已经不是把“记忆”和“定时任务”当附加插件，而是在把它们系统化。

### 1. Auto memory / team memory 已经是正式机制

源码里可以看到：

- auto memory 可以被设置、环境变量、feature gate 控制
- team memory 建立在 auto memory 之上
- prompt 里甚至会指导模型怎么搜索历史记忆
- 某些模式下会维护 daily log / unified memory prompt

这不是“RAG 小补丁”，而是在认真做**长期上下文基础设施**。

### 2. Cron 调度已经是明确的 agent trigger 能力

`ScheduleCronTool` 背后对应的其实是一套 scheduler 系统。

而且它还区分：

- session-only cron
- durable cron
- `.claude/scheduled_tasks.json` 持久化
- recurring / one-shot 任务
- 自动 jitter 和过期策略

这说明 Claude Code 已经在产品层认真考虑：

**Agent 不一定只在你打字时工作，它也可以在未来某个时刻被重新唤起。**

这一步一旦彻底放开，产品形态会立刻变化。

因为它不再只是“交互式 coding assistant”，而会变成一个真正的**持续运行型 agent**。

## 九、最值得学的设计点：Claude Code 不是简单把功能藏起来，而是在做“可控发布架构”

如果把这些隐藏能力放在一起看，你会发现 Claude Code 真正厉害的，不是藏了多少彩蛋，而是它的发布方式非常工程化。

它并不是：

- 功能做完了，手动决定上不上菜单

而是：

- 先把功能做成 command / tool / state machine
- 再通过 build flag 裁剪
- 再通过 feature gate 灰度
- 再通过 account type 判断
- 再通过 org policy 限制
- 最后再决定 help 是否展示

这其实是一套很成熟的 Agent 产品能力治理模型。

因为 Agent 功能的风险，比普通软件大得多：

- 可能牵涉写文件
- 可能牵涉远程执行
- 可能牵涉 OAuth 和组织数据
- 可能牵涉长任务和自动调度
- 可能牵涉多 Agent 协作

这种情况下，最危险的做法就是：

**功能要么全开，要么全关。**

Claude Code 选择的是另一条路：

**先把系统能力完整建出来，再用层层 gate 管理“谁、在什么环境里、以什么方式”能触发它。**

这会让产品演进非常平滑。

## 十、最后的判断：Claude Code 公开展现出来的，只是它当前“愿意让你看见”的那一层

所以如果你问我，这份源码最有意思的点是什么？

不是 `/btw` 很妙，也不是 Plan Mode 做得像状态机，也不只是 Auto Mode 有分类器。

而是你会发现：

**Claude Code 现在对外呈现出来的能力边界，和它内部已经长出来的能力边界，并不是一回事。**

它内部已经明显存在这些方向：

- 更强的远程规划与执行（`/ultraplan`）
- CLI 与 web 的双执行面
- 远程控制与会话接续
- 账号绑定的高级体验能力（如 voice）
- 隐藏命令与内部操作面
- 多 Agent 团队与任务系统
- 自动记忆与团队记忆
- 定时调度与持续运行 agent

从产品视角看，这意味着 Claude Code 不是一个“完成态工具”。

它更像是一个**正在逐步解锁能力层的 Agent OS**。

真正值得关注的问题，不再是：

> Claude Code 今天能做什么？

而是：

> 它已经把哪些能力写进了 runtime，只是在等一个合适的发布窗口？

这两者的差别，非常大。

而且很可能会决定未来一年 Agent 产品竞争的核心分水岭。
