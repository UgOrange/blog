---
title: "如何评价 Cyber Defense Benchmark：从任务定义、基准设计到模型结果"
description: "《Cyber Defense Benchmark: Agentic Threat Hunting Evaluation for LLMs in SecOps》最有价值的地方，不是给出一个‘模型整体很差’的结论，而是把 threat hunting 明确建模为一种开放式、证据驱动、预算受限的序列决策任务。只有把论文的问题设定、benchmark 的数据与环境设计、以及各模型的失败模式放在一起看，才能理解它真正证明了什么：当前 frontier models 的主要短板，并不只是安全知识不足，而是无法稳定地把知识转化为高收益检索、精确归因与提交策略。"
pubDate: 2026-04-23
tags: ["LLM","Threat Hunting","SecOps","Cyber Defense Benchmark","Benchmark","AI 安全"]
heroImage: ../../../assets/weixin/cyber-defense-benchmark-threat-hunting-analysis/cover.png
---

论文 [Cyber Defense Benchmark: Agentic Threat Hunting Evaluation for LLMs in SecOps](https://arxiv.org/abs/2604.19533) 讨论的是一个非常具体但又非常关键的问题：**当前大语言模型是否具备在安全运营场景中执行开放式 threat hunting 的能力。**

这里的重点不是“能否回答安全问题”，也不是“能否解释一段日志”，而是更接近真实 SOC 工作流的任务：在没有分步提示、没有预切分窗口、没有现成调查路径的条件下，仅凭原始日志和有限工具，主动构造检索策略，逐步发现恶意事件，并提交精确的恶意时间戳。

这篇论文值得认真读，不是因为它又给出了一组模型排行榜，而是因为它把一个经常被泛化讨论的能力——“LLM 做安全运营”——拆成了可评价的任务结构。只有顺着论文自身的逻辑，先看它在问什么，再看 benchmark 是怎么搭的，最后看模型是怎么失败的，才能判断这篇工作到底证明了什么。

## 一、论文真正要回答的问题是什么

作者在引言中区分了 threat hunting 与常见安全 benchmark 的根本差异。已有安全 benchmark 大致分成三类：

- 测安全知识与推理的问答型 benchmark；
- 把日志分析拆成预定义问题的 guided benchmark；
- 更偏 offensive security 的 CTF / pentest benchmark。

这些 benchmark 并不是没有价值，但它们都回避了 threat hunting 最困难的一步：**问题并不是事先给定的，分析师必须自己在原始证据空间中形成假设，并不断修正检索策略。**

因此，论文要测的其实不是“模型懂不懂 ATT&CK”或“会不会解释 IOC”，而是下面这组更底层的能力：

1. 能否在极少先验提示下自主形成 hunt hypothesis；
2. 能否在海量、低信号密度的原始日志中执行有效检索；
3. 能否在有限查询预算下不断提高恶意证据密度；
4. 能否将观察到的线索稳定地转化为精确归因与提交动作。

换句话说，这篇论文把 threat hunting 视为一种 `open-ended, evidence-driven, budget-constrained sequential decision problem`。这个建模选择，决定了它和很多安全 benchmark 的区别：它不是在测“答题”，而是在测“搜索”。

## 二、benchmark 是如何设计出来的

如果只读摘要，这篇论文最显眼的结论当然是“所有模型都失败了”。但从研究设计角度看，真正值得细读的是 benchmark 本身的构造方式。它的设计可以拆成五层：任务定义、环境接口、数据来源、campaign simulation、评分与实验协议。

### 1. 任务定义：把 threat hunting 形式化为部分可观测的序列问题

论文把每一个 hunt episode 定义为一个部分可观测的顺序决策任务。

- 底层真实状态，是整个日志数据库以及哪些记录对应恶意事件；
- agent 能看到的，只是对话历史、上一条查询和返回结果；
- 每一轮 agent 可以执行 SQL 查询，或者提交一组它认为恶意的时间戳；
- episode 在三种情况下结束：全部找对、查询预算耗尽、或 agent 主动放弃。

这个设定的关键点有两个。

第一，它不是把日志切成若干局部片段让模型分类，而是让模型面对完整数据库。第二，它要求最终提交的是精确时间戳，而不是自然语言解释。这就把任务从“语言理解”推进到了“证据检索 + 精确归因”。

### 2. 环境设计：极简工具接口，刻意放大核心能力要求

作者实现了一个 Gymnasium 风格的环境。agent 的行动空间本质上是结构化的三选一：

- `run_sql`
- `submit_flags`
- `give_up`

其中真正的信息获取方式只有 SQL。环境故意没有额外 retrieval augmentation、没有向量检索、没有工具链协作，也没有现成 detector 结果供 agent 做 pivot。

数据库层面，论文使用的是一个内存中的 SQLite 表：

- 单表 `logs`
- 覆盖 `505` 个文本字段
- 补充 `raw_json`
- 对热字段建立索引
- 单次查询结果最多只返回 `10` 行，但会报告完整命中总数

这一设计非常有针对性。作者显然不想测“带很多脚手架的复合系统”，而是想测一种更纯粹的能力：**模型是否能把对安全语义的理解，转化为高收益的查询行为。**

也正因为如此，这个 benchmark 对 agent 的要求不是“会不会看日志”，而是“会不会写对下一条 SQL”。

### 3. 数据来源：使用真实攻击记录，而不是纯合成日志

benchmark 的基础数据来自 OTRF 的 `Security-Datasets (Mordor)`。论文总共纳入：

- `106` 个 attacker procedures
- `86` 个 MITRE ATT&CK sub-techniques
- `12` 个 ATT&CK tactics
- `774,218` 条原始日志记录
- `23,268` 个 malicious event flags

这比很多 purely synthetic benchmark 更有现实感，因为数据来自真实攻击 procedure 的记录，而不是只靠规则程序生成的“长得像日志的文本”。

但作者也清楚，直接拿公开数据集来跑 benchmark 会有一个很大的问题：模型可能不是学会了攻击模式，而是记住了固定的 IP、主机名、用户名或 GUID。为了解决这个问题，论文进一步引入了 campaign simulator。

### 4. campaign simulation：这是 benchmark 设计里最重要的一步

论文并没有把 106 个 procedures 原样当成 106 道题，而是通过模拟器把它们重新组织成多阶段 intrusion campaigns。这里包含几个核心设计：

#### (a) kill-chain templates

作者定义了多种链路模板，例如短链、中链、长链，并通过语义标签约束 procedure 的可组合顺序。这使得每个 campaign 不再是孤立技巧的简单拼接，而更接近真实的多阶段入侵过程。

#### (b) deterministic mutation

每个 campaign 都会进行系统性扰动，包括：

- 时间整体平移；
- IP、主机名、用户名、域名、SID 替换；
- GUID 重新匿名化；
- ground-truth flag 同步平移。

这一步的意义非常大：它让模型无法通过记忆公开数据集中的字面模式来投机取巧，从而迫使 benchmark 更接近“模式泛化”而非“样本记忆”。

#### (c) seed selection

论文在大量种子上搜索，并用 greedy set cover 选出 `26` 个 campaign seeds，使得最终评测覆盖 `105/106` 个 procedures。这个步骤说明作者并不是随便抽样，而是在努力提高 MITRE 覆盖与评测代表性。

整体看，campaign simulation 是这个 benchmark 最扎实的部分之一。它既提升了难度，也提升了外部效度，因为现实中的威胁狩猎本来就不是在静态、熟悉、未变形的事件流中进行的。

### 5. ground truth 与 scoring：强调精确归因，而不是模糊猜测

论文的 ground truth 来自两层：

- 先用 Chainsaw + Sigma rules 提取基线 detections；
- 再通过 consequence enrichment，把与恶意动作相邻且因果相关的事件纳入 flag 集合。

对于最终 threat hunting 任务，评分对象统一为 `malicious_event_timestamp`。

评分上，论文采用两类核心指标：

- `n_flags_in_submitted`：最终被正确提交的恶意时间戳数量，这是主指标；
- `n_flags_in_query`：曾经出现在查询结果中的 flag 数量，可视为 agent 观测到恶意证据的上界。

这两个指标的区分非常关键。因为它允许作者把“没搜到”和“搜到了但没提交”分开分析，从而把失败模式拆得更细。

此外，论文还定义了一个 operational passing bar：

> 每个 ATT&CK tactic 至少达到 `50% recall`

作者把它解释为无人监督 SOC deployment 的最低门槛。这个门槛当然可以讨论，但它至少提供了一个比“平均 recall”更接近实际部署要求的标准：只在少数 tactics 上表现不错，并不能说明系统足够可靠。

## 三、这个 benchmark 的设计优点和局限分别是什么

从研究方法角度看，我认为这篇论文的 benchmark 设计至少有三点明显优点。

### 1. 它真正测到了开放式 threat hunting，而不是伪装成 hunting 的问答任务

很多安全 benchmark 之所以看起来分数很高，是因为问题已经被人类切好了。Cyber Defense Benchmark 则明确保留了 hypothesis formation 这一步，这使它更接近真正的分析工作。

### 2. 它通过实体扰动与 campaign simulation 压低了“记忆数据集”的风险

这一点对安全 benchmark 很关键。如果不做实体替换，模型很可能只是记住“某个固定主机 + 某个固定 EventID 组合经常有问题”。这篇论文在这方面做得相对严谨。

### 3. 它把观察与提交分开计量，帮助分析失败机制

`n_flags_in_query` 与 `n_flags_in_submitted` 的区分，让论文不只是在报低分，而是在定位低分到底来自检索失败、归因失败，还是提交策略失败。

但与此同时，这个 benchmark 也有明确局限。

### 1. ground truth 并非完全独立于检测规则与模型本身

Sigma-rule-derived detections 再加上 LLM consequence enrichment，会把一部分 evaluator bias 带进 annotation pipeline。这不意味着 benchmark 无效，但意味着它并不是“绝对客观真值”，而更像一个高质量、但仍然有建模假设的近似真值体系。

### 2. 工具环境被故意极简化，因此更像能力下界

真实 SOC 工作流通常并不只有 SQL，也会结合 alerts、规则、知识库、上下文系统和团队协作。这个 benchmark 测到的是“零样本、极少工具支持”的 hunt 能力下界，而不是完整产品系统上限。

### 3. 当前只覆盖 Windows 遥测

论文也明确承认，Linux、CloudTrail、网络流量等重要工作负载尚未覆盖。因此，这个 benchmark 更适合被理解为 Windows defender telemetry 上的一个重要切面，而不是对全部 SecOps 任务的最终结论。

### 4. 多数模型只做单 rollout，方差仍值得注意

作者自己在 limitations 中提到，高方差模型需要多 rollout 才更稳妥。因此，具体名次的细微差异未必稳健；不过，“所有模型都远低于 operational bar”这一总体判断仍然很强。

## 四、模型结果应该如何解读

论文评估了五个模型：`Claude Opus 4.6`、`GPT-5`、`Gemini 3.1 Pro`、`Kimi K2.5` 和 `Gemini 3 Flash`。主结果如下：

| Model | 正确提交 flags 均值 | 提交率 | 查询中出现 flags 均值 | 平均成本 |
|---|---:|---:|---:|---:|
| Claude Opus 4.6 | 115.9 ± 11.1 | 3.82% | 156.1 | $17.89 |
| GPT-5 | 42.5 ± 19.5 | 1.52% | 52.5 | $0.74 |
| Gemini 3.1 Pro | 38.9 ± 28.4 | 1.36% | 70.4 | $1.42 |
| Kimi K2.5 | 29.1 ± 22.2 | 1.05% | 36.0 | $1.25 |
| Gemini 3 Flash | 28.2 ± 14.8 | 0.98% | 38.6 | $0.10 |

如果只看表格，最直接的结论当然是：**没有一个模型接近可部署水平。**

但更有价值的是进一步拆解这些结果到底说明了什么。

### 1. Claude Opus 4.6 领先，但领先幅度并不改变结论

Claude Opus 4.6 在所有模型里表现最好，这一点在主表、tactic recall 和作者的 qualitative traces 中都比较一致。但它的平均提交率也只有 `3.82%`，距离 passing bar 非常遥远。

这说明当前 frontier model 之间确实存在强弱差异，但这些差异更多是“在失败中谁失败得更少”，而不是“谁已经足够接近可部署”。

### 2. `n_flags_in_query` 与 `n_flags_in_submitted` 的差距揭示了 attribution gap

论文里最值得注意的一个现象，是所有模型都存在“看到得比提交得多”的情况。以 Claude 为例，平均看到 `156.1` 个 flag，但只提交 `115.9` 个。

这意味着模型的主要问题并不完全是“搜不到”。它还包括：

- 看到了某些恶意证据，但没有形成足够稳定的归因；
- 不知道何时该提交、提交哪些；
- 在长对话中无法可靠维护证据状态。

这就是作者所说的 `attribution gap`。从 agent 角度看，这比单纯 recall 低更值得警惕，因为它说明模型即使部分接触到了正确信号，也不能保证把这些信号转化成行动。

### 3. tactic-level recall 表明模型依赖少数高频启发式

论文的 tactic-level 分析显示，Claude 在 `Defense Evasion`、`Persistence`、`Execution`、`Command & Control`、`Privilege Escalation` 上相对较强，而 `Credential Access`、`Initial Access`、`Lateral Movement` 则明显薄弱。GPT-5 甚至在 `Initial Access` 与 `Lateral Movement` 上出现完全盲区。

这个结果说明模型并不是平均地“不懂 hunting”，而是高度依赖少数相对通用、可关键词化的启发式，例如：

- 编码 PowerShell
- 可疑命令行
- 注册表持久化
- 常见代理执行模式

一旦进入需要更专门检测工程经验的 tactic，例如 Kerberoasting、域复制相关模式、横向移动链路，模型就很难自主生成合适查询。

因此，论文并不是在证明“模型完全不会安全分析”，而是在证明：

**当前模型在开放式 threat hunting 上高度依赖有限的通用 heuristic，缺乏稳定的 tactic-specific query generation 能力。**

### 4. 所有模型都没有完成任何一次完整 hunt

这一点是论文结论中最强的一部分：没有任何 run 找全所有 flags。

终止方式主要是：

- `GAVE_UP`
- `TRUNCATED`（查询预算耗尽）
- `ERROR`

也就是说，模型失败并不是以“基本完成，只差一点”的形式出现，而是在任务结构层面就无法维持长期搜索。换句话说，它们不是在最后阶段犯错，而是从中途就已经丧失了继续有效推进的能力。

这使得论文的结论比一般 benchmark 更强：它测到的不是局部精度问题，而是一个**任务级失败**。

## 五、论文如何解释这些失败

作者在讨论部分给出了三个主要原因，我认为都成立，而且彼此是互相支撑的。

### 1. search-space intractability

日志量级、10 行返回上限和 50 次查询预算共同构成了一个高压缩率信息检索问题。想靠广度优先扫描是几乎不可能完成任务的，必须构造高收益查询。

### 2. attribution gap

即便模型已经在查询结果中接触到正确证据，它也常常不能稳定地把这些证据转成提交结果。这暴露出状态追踪、证据管理和提交策略上的弱点。

### 3. tactic blind spots

某些 tactic 所需的 detector intuition 非常具体。模型没有显式训练去形成这些专门查询，因此在开放环境里不会自发生成。

我认为这三点可以进一步概括成一个更一般的判断：

> 当前 frontier models 在 SecOps 中最欠缺的，并不是安全知识库存，而是将知识压缩为高收益检索策略，并将局部观察闭环成精确提交的能力。

也就是说，论文揭示的是一种 `knowledge-to-policy gap`，而不仅仅是 `knowledge gap`。

## 六、这篇论文最终证明了什么，又没有证明什么

综合来看，我认为这篇论文最终证明了三件事。

### 它证明了什么

1. 当前 frontier models 在开放式、证据驱动的 threat hunting 任务上表现显著不足；
2. 这种不足主要体现在搜索、归因和提交闭环，而不只是安全知识问答；
3. 仅靠在安全 Q&A benchmark 上的高分，不能推出模型具备无人监督的 SOC hunting 能力。

### 它没有证明什么

1. 它没有证明“LLM 在 SecOps 中整体没有价值”；
2. 它没有证明“带更多工具和工作流脚手架的系统也一定失败”；
3. 它没有证明“模型在所有防守任务上都同样薄弱”。

更准确的说法应该是：

**这篇论文把一个经常被过度乐观讨论的问题拉回了可检验的层面：如果 threat hunting 被理解为开放式证据搜索与精确归因，那么当前模型距离无人监督部署还有相当明显的差距。**

## 写在最后

我认为这篇论文最有价值的地方，并不是“把所有模型都打低分”，而是把 threat hunting 这个原本容易被营销语言模糊化的能力，拆成了可以逐层分析的 benchmark 结构：

- 任务是否开放；
- 检索是否受预算约束；
- 数据是否来自真实攻击记录；
- 评估是否要求精确归因；
- 失败究竟发生在观察、归因还是提交阶段。

从这个意义上说，Cyber Defense Benchmark 的核心贡献不是证明“模型还不够聪明”，而是更准确地指出：

**当前模型在安全运营里的主要短板，不是不会说安全语言，而是不会在高不确定性、低信号密度的环境中，把知识稳定转成行动。**

这也是我认为评价这篇论文时最重要的一点：它不只是给出了一组结果，更给出了一种更严格的提问方式。对于未来所有“AI for SecOps”的讨论，这种提问方式本身就是它最有价值的研究产出。

## 参考文献

- [Cyber Defense Benchmark: Agentic Threat Hunting Evaluation for LLMs in SecOps](https://arxiv.org/abs/2604.19533)
- OTRF Security-Datasets (Mordor)
- SigmaHQ
- WithSecureLabs Chainsaw
- MITRE ATT&CK
