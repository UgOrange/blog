---
title: "Not Bound to Any Agent Framework: How We Built a Security Agent Platform with Dual-Contract Design"
description: "While everyone debates whether to choose LangChain or Claude Code, we took a different path — defining two universal contracts that allow any Coding Agent to serve as the platform's execution engine."
pubDate: 2026-03-30
tags: ["AI Security", "Agent Architecture", "Agent Platform", "Context Engineering"]
heroImage: ../../../assets/cover-runtime-agnostic-agent.png
---

## A Decision We Struggled With for a Long Time

When we kicked off the security agent platform project last year, the team faced a classic dilemma: **which Agent framework should we pick?**

LangChain has the largest ecosystem but is too heavy; AutoGen is great for multi-agent setups but complex to deploy; Claude Code has strong reasoning capabilities but locks you into Anthropic... every option has significant drawbacks. Worse still, this space evolves at breakneck speed — today's "best choice" could be outdated in three months.

In the end, we made a counterintuitive decision: **don't pick any.**

Instead of binding to any single Agent runtime, we defined a set of universal integration contracts that allow any compatible Coding Agent CLI — pi-mono, Codex CLI, Plandex, OpenCode, and others — to serve as the platform's execution engine.

We call this design the **Runtime-Agnostic Agent Platform**.

## Two Contracts, Decoupling Everything

The core idea is simple: only two agreements are needed between the platform and the Agent.

**Contract One: JSON-RPC Communication Protocol (Control Plane)**

The platform interacts with the Agent process via stdin/stdout JSON Lines. The platform sends commands (prompt, abort, set_model), and the Agent sends back events (agent_start, message_update, tool_execution, etc.).

```
Platform ──(stdin JSON)──> Agent CLI Process
Platform <──(stdout JSON)── Agent CLI Process
```

**Contract Two: MetaSkill HTTP Protocol (Capability Plane)**

The platform exposes capabilities to the Agent through a minimal RESTful API. There are only three endpoints:

- `GET /discover` — Discover available skills
- `GET /:name/schema` — Get parameter definitions
- `POST /invoke` — Execute a skill

**This HTTP protocol is completely independent of any Agent runtime.** No matter what internal mechanism the Agent uses to call tools — pi-mono's Extensions, Codex's Tools, OpenCode's MCP Server — as long as it can make HTTP requests, it can access all of the platform's skills.

Adding a new runtime only requires implementing the `AgentRuntime` interface and registering it in `init()`:

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

**One interface, two contracts — and the "which framework to choose" problem simply dissolves.**

## Why Security Scenarios Especially Need This Design

You might ask: any general-purpose Agent platform could be designed this way — why is it especially important for security?

Because security operations have three unique requirements:

**1. The Gap Between Data and Decisions**

The CrowdStrike 2024 report shows that simple cloud misconfigurations account for nearly 70% of all cloud security incidents. Data collection systems produce massive volumes of information, but turning that data into actionable security insights still requires extensive manual analysis.

Our platform includes a built-in seven-stage ETL pipeline that unifies multi-cloud security asset collection, CSPM risk detection, and autonomous Agent analysis. When the detection engine discovers a new risk, it can automatically launch an Agent for deep analysis — the Agent proactively calls `query_assets` to retrieve related assets, calls `get_security_groups` to get the full rule set, and then produces a comprehensive analysis with remediation recommendations.

**This isn't "alert → human reviews → action." It's "alert → Agent analyzes → delivers conclusions."**

**2. Sandbox Isolation Is a Must-Have, Not a Nice-to-Have**

Agents can call tools and execute code — in security scenarios, this is a double-edged sword. We run Agents in K8s Pods with strict isolation:

- Environment variable sanitization (all sensitive variables stripped; API keys passed only via CLI arguments)
- One-time Bearer Token per Session
- SkillID allowlist + AssetScope restrictions (Agents can only access authorized skills and data)
- Resource limits (hard caps on CPU/memory/timeout)

McKinsey's Agentic AI Security Deployment Playbook emphasizes that enterprise-grade Agent deployments must address authorization boundaries, traceability, and least privilege. This is exactly the core value of our platform's governance layer.

**3. Long-Term Memory Is a Game Changer**

Much of security operations knowledge accumulates across sessions — "the security group issue we fixed last week has recurred," "this IP range has been flagged five times in the past three months," "the team's agreed-upon compliance exemption rules."

We bind a persistent Memory system to each Agent. Memory is loaded at startup, read/written during execution, and automatically synced on termination. Memories are ranked by `Importance × Recency` and support three sources: explicit user input, Agent self-extraction, and system-derived entries.

**By the tenth time the same CSPM analysis Agent handles a security group issue, it has already "remembered" the conclusions and team preferences from the previous nine. This is a capability leap that stateless LLM calls simply cannot achieve.**

## Context Engineering: Treating Context Management Like Memory Management

An Agent's context window is finite. When a tool returns a 50KB asset list, stuffing it directly into the context burns through the token budget fast.

Our approach is to **treat context management like OS memory management**:

**Virtual File System (VFS)**: Large tool execution results are stored in the database, and only a summary + file_id is returned to the LLM. When the LLM needs detailed data, it reads it on demand via the `read_context` tool with pagination.

**Tiered Memory**:
- **L1 Short-term**: Full content (recent conversation turns)
- **L2 Working**: File references (tool results stored in VFS, only summaries retained)
- **L3 Archive**: Summaries only (older conversations compressed to key information)

**Smart Compression**: Recent content is kept in full, old tool calls are folded, and oversized messages are truncated. The optimal context is assembled within the token budget.

**Formatting Strategies**: Different tools' results are processed by different formatters. Asset query results get table summaries, security group rules get structured lists, and log data gets key-line extraction. Results exceeding the threshold are automatically routed to VFS.

This system enables Agents to efficiently handle large-scale security data within a limited context window, without a single query "blowing up" the entire conversation.

## How It Differs from Industry Approaches

| Dimension | Traditional SOAR | Pure Agent Frameworks | Our Approach |
|-----------|-----------------|----------------------|--------------|
| Orchestration | Predefined Playbooks | Build your own | Agent autonomous reasoning + platform governance |
| Data Foundation | External integration | Depends on externals | Built-in ETL + dynamic tables |
| Runtime Isolation | Limited | In-process | K8s Pod container-level |
| Runtime | Fixed | Framework-bound | Pluggable (dual-contract) |
| Long-term Memory | None | No built-in | Memory system |

Omdia's Agentic SOC report points out that incremental improvements to traditional SOAR have hit a plateau, and the Agentic model represents a fundamental shift in SecOps from rule-driven to reasoning-driven.

## Lessons from Practice

After several months of practice, here are some lessons worth sharing:

**1. Agents aren't omnipotent, but Agents + structured data are.** Asking an LLM to analyze security issues on its own yields correct but generic advice. But when an Agent can query specific asset configurations, historical alert records, and security group rules, its analysis quality jumps by an order of magnitude. The data pipeline is the amplifier of Agent capability.

**2. MetaSkill's "ask before you use" pattern turned out surprisingly well.** When an Agent calls `execute_skill` without parameters, it gets back the Schema. This lets the Agent "read the manual before operating," significantly reducing tool call error rates.

**3. Memory needs a decay mechanism.** In early versions, memory only grew and never shrank. After a few weeks, the Agent's system prompt was stuffed with historical memories, which actually degraded reasoning quality for current tasks. After introducing `LastUsedAt` time decay, the memory system finally became practical.

**4. Runtime pluggability isn't just a theoretical advantage.** We actually switch runtimes in production based on task type — deep security analysis uses models with stronger reasoning, while simple asset queries use lightweight runtimes. Different AgentDefinitions are configured with different RuntimeTypes. This is a real-world benefit of the dual-contract design.

## Final Thoughts

When everyone is debating "choose A or choose B," perhaps the right question is "can we avoid choosing at all?"

Through two simple contracts — JSON-RPC control plane + MetaSkill capability plane — we turned "Agent framework selection" from a one-time high-stakes decision into a runtime configuration that can be switched at any time.

The core value of a security agent platform isn't about which Agent framework it uses, but rather: can the data pipeline provide high-quality security context, can the governance layer enforce execution safety boundaries, and can the memory system make the Agent smarter over time.

**Frameworks become obsolete. Contracts don't.**

---

> This article is based on engineering practices from the Security Agent Manager (SAM) project. If you're also exploring the intersection of AI and security operations, follow Guardrails AI — we'll continue sharing our thoughts and practices in this space.
