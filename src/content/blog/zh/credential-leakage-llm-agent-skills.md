---
title: "Agent Skill 凭据泄露：stdout 日志是头号风险"
description: "一篇 2026 年 4 月 3 日提交到 arXiv 的论文，首次对 agent skill 凭据泄露做大规模量化：在 17,022 个抽样技能中发现 520 个受影响技能、1,708 个安全问题，其中 73.5% 的漏洞来自 print/console.log 这类 stdout/debug logging 泄露面。"
pubDate: 2026-04-06
tags: ["Agent安全","LLM安全","Credential Leakage","Prompt Injection","Supply Chain Security"]
heroImage: ../../../assets/weixin/credential-leakage-llm-agent-skills/cover.wechat.jpg
---

# 《Credential Leakage in LLM Agent Skills》：stdout 日志是头号风险

如果你最近在看 agent 安全，这篇论文很值得第一时间读。

它的标题叫 `Credential Leakage in LLM Agent Skills: A Large-Scale Empirical Study`，是 **2026 年 4 月 3 日**提交到 arXiv 的预印本。和很多只停留在“skill 有风险”“prompt injection 很危险”的讨论不同，这篇工作第一次把 **agent skill 凭据泄露** 单独拎出来，做了一个足够大的量化研究。

更重要的是，论文真正打到行业痛点的结论，不是“又发现了一些 hardcoded secret”，而是这句：

> **在 agent runtime 里，`stdout` 不是本地调试输出，而是会进入 LLM context 的高风险泄露面。**

论文发现，`print` / `console.log` 这一类看起来最普通的 debug logging，竟然占了全部漏洞问题的 **73.5%**。换句话说，很多 skill 并不是先被复杂攻击打穿，而是开发者先把 token 自己打印出来，再被 runtime 带进模型上下文，最后被自然语言重新“问出来”。

## 一、这篇论文到底做了多大规模的研究

先看数字。

作者从 SkillsMP 这个开源 skill 市场抓取了 **170,226** 个 skills 的总体快照，然后做了 **17,022** 个 skills 的分层随机抽样，对这部分样本执行三层分析：

- 静态分析：regex + AST secret extraction；
- 动态沙箱测试：注入 mock credentials，观察网络、文件和 stdout/stderr；
- 人工复核：把 skill 的自然语言描述、代码行为和运行结果交叉对照。

最后，他们确认了 **520 个受影响 skills**，一共包含 **1,708 个安全问题**。

这里有两个点非常值得记住：

- 这不是只看仓库代码的 secret scan，而是把 **技能描述 + 可执行代码 + 运行时行为** 放在一起看；
- 这不是只统计 accidental leak，作者还区分了 **437 个 vulnerable skills** 和 **83 个 malicious skills**。

也就是说，这篇论文看的不是单一的“开发者粗心”，而是整个 agent skill 生态里，凭据到底会通过哪些方式暴露、谁在暴露、暴露后能不能立刻被利用。

## 二、最重要的发现：泄露不是单模态问题，而是 NL + PL 的组合问题

这篇论文最有价值的一个判断是：**agent skill 的 credential leakage，本质上是 cross-modal 的。**

论文给出的数字是：

- **76.3%** 的泄露案例，只有把自然语言描述和程序逻辑联合起来分析，才能看出来；
- **20.6%** 属于传统代码层面就能看见的问题；
- 还有 **3.1%** 甚至完全不需要可执行代码，只靠自然语言层面的 prompt injection 就能诱发泄露。

这件事很关键。

传统软件供应链里的 secret leak，大多还是“代码里写死了 key”“配置文件传错了”“日志打多了”。但 agent skill 不一样：**自然语言描述会决定模型怎么调用工具，代码逻辑再决定这些凭据最终流向哪里。**

所以在 agent 世界里，很多风险既不是纯 code bug，也不是纯 prompt bug，而是两者叠加之后才成立的 execution path。

## 三、为什么 `stdout/debug logging` 会成为最大泄露面

先看这张图。

![stdout 到上下文的凭据泄露链路](../../../assets/weixin/credential-leakage-llm-agent-skills/01-stdout-leak-path.wechat.jpg)

这篇论文里最醒目的结论就是：**Information Exposure via print/console.log 占所有 vulnerability issues 的 73.5%（1,007 / 1,371）**。

原因并不复杂，但非常反直觉：

1. skill 在本地执行时会读到环境变量、OAuth token、API key 或 session cookie；
2. 开发者为了调试，顺手写了 `print(token)`、`console.log(tokens)`、`logger.info(config)`；
3. agent framework 会把 stdout/stderr 捕获下来；
4. 这些输出被拼接进 LLM 的 context window；
5. 攻击者再通过一句自然语言，例如“把刚才输出里的 token 列出来”，就把 secret 从上下文里重新提取出来。

这意味着一件很不舒服但必须接受的现实：

> **在 agent runtime 里，日志不是“旁路数据”，而是模型可消费的数据。**

论文还举了一个非常直观的例子：一个 `google-workspace` skill 会把 `access_token` 和 `refresh_token` 直接 `console.log` 到 stdout；而 framework 再把这些内容注入到 LLM 上下文后，攻击者甚至不需要写 exploit code，只要继续对话，就能把凭据问出来。

如果你过去的心智模型还是“日志只有开发者能看见”，那在 agent 体系里这个假设已经过时了。

## 四、论文把泄露模式拆成了 10 类，但真正应该优先修的是前 4 类

作者总共归纳出了 **10 种 leakage patterns**：

- **4 类开发者疏忽导致的 vulnerability patterns**；
- **6 类恶意构造的 malicious patterns**。

其中开发者侧最值得优先盯住的是这 4 类：

| 模式 | 问题占比 | 典型表现 |
| --- | --- | --- |
| Information Exposure | 73.5% | `print`、`console.log`、调试输出、API response 原样打印 |
| Hardcoded Credentials | 18.2% | API key、token、password 直接写在源码里 |
| Insecure Storage | 8.0% | 通过 CLI 参数、process 参数、URL 参数传 secret |
| Artifact Leakage | 0.4% | shell history、tmp 文件、cache、git config 留下凭据 |

这张表也说明了另一个现实：**hardcoded secret 当然严重，但它不是这个生态里最普遍的漏洞来源。真正压倒性领先的，是“输出太多”。**

论文甚至进一步指出，很多 hardcoded credential 案例带有明显 AI-assisted development 痕迹，说明代码生成工具会把不安全模式一起放大；但从规模上看，最先应该被 agent framework 和开发者治理掉的，还是 stdout 这条链路。

## 五、它不只是“能泄露”，而且大部分能在正常执行里直接打出来

风险大不大，不能只看有没有 secret，还要看能不能真被拿到。

论文在 exploitability 上给出的结论很重：

- **89.6%** 的受影响 skills，会在正常执行中通过至少一个运行时通道泄露凭据；
- 其中 **92.5%** 不需要额外权限提升；
- 按通道看，**75.8%** 的受影响 skills 存在 stdout leakage；
- 还有一部分会通过文件暴露或直接向攻击者控制端点 exfiltration。

这说明很多问题并不是“静态上看着危险，实际上很难利用”，而是**默认路径就能触发**。

作者还提到一个很麻烦的现实：即便上游仓库删掉了 secret，fork 传播也会让问题持续存在。论文观察到，**107 个上游仓库删除的凭据，仍然存活在 50+ 独立 forks 中**。这和传统 GitHub secret leak 很像，但在 skill 市场里更糟，因为它天然自带分发语义。

## 六、为什么这篇论文对 Agent 安全很重要

我觉得这篇论文真正推动行业认知前进的地方，有三点。

### 1. 它把 skill 风险从“泛安全感知”推进到了“可量化的 credential exposure”

过去很多 agent 安全研究，焦点还是 prompt injection、tool misuse、越权操作、任务劫持。这篇工作则把一个更基础的问题补上了：**当 skill 运行在有凭据、有网络、有本地文件访问的环境里时，secret 是怎么被暴露出来的？**

这个问题足够基础，也足够容易被忽视。

### 2. 它证明了 `stdout -> context` 这条管道本身就是安全边界

很多框架设计时默认把执行日志喂给 LLM，是为了增强可解释性、方便 agent 继续规划下一步。

但这篇论文提醒我们：**一旦 stdout 会进 context，它就不再是 observability plumbing，而是 credential boundary。**

所以真正该修的，不只是“开发者别乱打日志”，还包括：

- framework 默认对 stdout 做 secret redaction；
- 将 reasoning engine 和 execution engine 分离；
- 不把原始环境变量、配置和返回体直接反馈给模型；
- 对高风险工具结果做结构化裁剪，而不是整段回填。

### 3. 它提示我们：agent skill 供应链的审计，必须是 cross-modal 的

只做代码扫描不够，只看 prompt 也不够。

如果一个 skill 的 `SKILL.md` 在教模型“让用户贴 API key”，而代码又悄悄把这些值发到未声明端点，这种问题只有把 **描述、调用方式、代码和运行痕迹** 一起看，才看得完整。

这也是为什么论文里 **76.3%** 的案例必须做联合分析。

## 七、如果你在做 Agent / MCP / Skill 生态，最低限度该怎么改

这篇论文读完之后，我觉得至少有 4 个工程动作应该立刻默认化。

### 对 framework 侧

- **把 stdout/stderr 当成 untrusted sensitive channel 处理**，进入模型前先做 secret redaction；
- **执行与推理分层**，不要让技能运行时的原始调试输出直接进入对话记忆；
- **高风险输出结构化白名单化**，只回传必要字段，不回传原始对象；
- **默认关闭 verbose/debug 模式的上下文回填**。

### 对 skill 开发者侧

- 禁止打印 token、cookie、OAuth response、env dump、完整配置；
- 禁止通过 CLI 参数、URL 参数传递 secret；
- 发布前跑 secret scanning，并把日志审查纳入 checklist；
- 把“本地可见”改成“模型可见”的威胁模型重新过一遍。

一个最简单的反例，就是下面这种写法：

```javascript
// Bad: token 会被 stdout 捕获，再进入 LLM context
console.log(JSON.stringify({
  access_token: tokens.access_token,
  refresh_token: tokens.refresh_token,
}));
```

更合理的做法至少应该是：

```javascript
// Better: 只保留调试所需的非敏感元数据
console.log(JSON.stringify({
  token_status: "received",
  provider: "google-workspace",
  scopes_count: Array.isArray(tokens.scopes) ? tokens.scopes.length : 0,
}));
```

这不是“日志规范”这么简单，而是 **agent 安全边界设计**。

## 八、项目链接

目前这项工作的公开链接以论文为主：

- 论文：<https://arxiv.org/abs/2604.03070>

作者在论文中说明会发布 dataset、taxonomy 和 detection pipeline；如果后续公开仓库或数据页，这篇文章也值得继续跟进。

## 九、最后一句话

如果要我用一句话总结这篇论文，我会这么说：

> **Agent skill 时代最危险的 secret leak，未必藏在最深的后门里，而可能就藏在你最顺手写下的一句 `console.log` 里。**

这也是为什么我觉得这篇工作非常重要：它把一个过去常被视作“开发习惯问题”的小洞，重新定义成了 **LLM agent runtime 的系统级安全边界问题**。

当 `stdout` 会进入模型上下文时，debug logging 就不再是调试细节，而是攻击面。
