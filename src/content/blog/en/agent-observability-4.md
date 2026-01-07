---
title: 'Agent Observability Overview 4: From Data to Judgment'
description: This is the final article in the Agent Observability series, exploring how to go from data to judgment - cost attribution, behavioral baselines, anomaly detection, and making observability truly operational.
pubDate: 2025-12-31
tags: ["AI", "Agent", "Observability", "Cloud Native", "Cost Optimization"]
---

> This is the final article in the Agent Observability series. The previous three articles covered "why it's hard," "what to observe," and "how to collect." This article addresses the ultimate question: once you have the data, then what?

### From "Being Able to See" to "Being Able to Judge"

The purpose of observability has never been to "collect data," but to **make judgments**:

- Is this Agent's behavior normal?
- Was this cost worth it?
- What was the root cause of this task failure?
- Is this Agent trustworthy?

If data can't be transformed into judgments, then collecting more only accumulates "data debt."

This article discusses several key scenarios for going from data to judgment.

---

## 1. Cost Attribution: Where Did the Money Go?

LLMs are billed by token. When an Agent runs, token consumption can be staggering.

Real cases I've seen:
- A "smart customer service" Agent consumed thousands of dollars worth of tokens in a day
- A "code assistant" Agent, due to getting stuck in a loop, consumed a month's budget in minutes
- In multi-Agent collaboration scenarios, when the bill arrives, no one knows which Agent is responsible

### Why Is Cost Attribution Difficult?

On the surface, cost attribution seems simple: just tally each Agent's token consumption, right?

In practice, it's far from simple:

**Problem 1: Uneven Token Consumption**

The cost of one LLM call = Input Tokens × Unit Price + Output Tokens × Unit Price

But token consumption varies dramatically between calls:
- Simple Q&A: tens of tokens
- Conversation with context: thousands of tokens
- Long document analysis: tens of thousands of tokens

Just counting "number of calls" isn't enough; you must be precise to the token level.

**Problem 2: Cost Spans Multiple Stages**

The cost of one user task might be distributed across:
- Main Agent reasoning
- RAG retrieval calls (Embeddings cost money too)
- Intermediate reasoning in multi-Agent collaboration
- Failed retries

The user only sees "one task," but behind it might be a dozen LLM calls.

**Problem 3: Wasted Costs Are Hard to Identify**

The most painful is **wasted cost**—Agent did a lot of work, but ultimately produced no effective result.

For example:
- Agent got stuck in a tool call loop, repeatedly trying the same failed operation
- Agent's reasoning "went off track," spending lots of tokens discussing irrelevant topics
- Agent requested too much context but only used a small portion

### Cost Attribution in Practice

My approach in practice is **stage-based metering**:

```
Token consumption for one task =
  Input (user input)
+ Context (RAG retrieval / conversation history)
+ Reasoning (reasoning / CoT)
+ Tool_Output (tool returns)
+ Response (final response)
```

Metering each stage separately has benefits:

- **Accountability**: If Context stage tokens explode, it indicates RAG retrieval strategy issues
- **Optimization**: If Reasoning stage tokens are too high, it indicates Prompt design needs improvement
- **Alerting**: Set thresholds for each stage; alert if exceeded

A useful metric is **Token Efficiency Ratio**:

```
Token Efficiency Ratio = Effective Output Tokens / Total Consumed Tokens
```

If this ratio is very low, it means the Agent is "thinking" a lot but "producing" little—possibly spinning idle.

---

## 2. Behavioral Baselines and Anomaly Detection

In security scenarios, another core requirement is **anomaly detection**: has the Agent's behavior deviated from normal patterns?

### Why Traditional Anomaly Detection Doesn't Work Well for Agents?

Traditional service anomaly detection is usually based on **statistical metrics**:
- P99 latency suddenly increased → anomaly
- Error rate exceeded threshold → anomaly
- QPS suddenly dropped → anomaly

But Agent "anomalies" often don't show up in these metrics:
- An Agent might have normal latency, no errors, but made wrong decisions
- An Agent might execute successfully, but accessed data it shouldn't have
- An Agent might call "legitimate" tools, but the call sequence reveals malicious intent

Agent anomalies are **semantic-level anomalies**, not performance-level anomalies.

### Establishing Behavioral Baselines

My practice is to establish **multi-dimensional behavioral baselines** for each Agent:

**Dimension 1: Semantic Baseline**

Convert the Agent's historical Prompts and Responses to vectors through an Embedding model, calculate the "normal range" of vector distribution.

```
Normal state: Topics the Agent discusses cluster in a certain region in vector space
Anomaly signal: New interaction vectors suddenly deviate from this region
```

For example, a "code assistant" Agent normally discusses technical topics. If one day it starts frequently talking about "company finances" or "personnel information," the vector space will show significant "semantic drift."

**Dimension 2: Tool Call Baseline**

Track the Agent's tool call patterns:
- Commonly used tool set
- Frequency distribution of tool calls
- Sequence patterns of tool calls (modeled with Markov chains)

Anomaly signals include:
- Calling a tool never used before
- Abnormal call frequency (suddenly high-frequency calls to a certain tool)
- Abnormal call sequences (rare tool combinations appear)

**Dimension 3: Resource Consumption Baseline**

Track the Agent's resource consumption patterns:
- Token consumption rate
- API call frequency
- Task completion time

Anomaly signals include:
- Token consumption suddenly spikes (possibly stuck in a loop)
- Task duration abnormally extended (possibly under attack or encountering issues)

### Comprehensive Risk Scoring

Multiple dimensions of anomaly signals need to be synthesized. I use a weighted scoring model:

```
Risk Score = α × Semantic Drift Score
           + β × Tool Call Anomaly Score
           + γ × Resource Consumption Anomaly Score
           + δ × High-Risk Operation Weight
```

Where `High-Risk Operation Weight` is hardcoded rules for specific dangerous behaviors. For example:
- Executing `rm -rf` → directly raises risk score
- Accessing credential files → directly raises risk score
- Sending large amounts of data externally → directly raises risk score

Based on risk score, set tiered responses:
- Low risk (0-30): Log, incorporate into long-term profiling
- Medium risk (30-70): Trigger manual review
- High risk (70-100): Automatically isolate Agent, trigger alert

---

## 3. From Observability to Operability

The ultimate goal of observability isn't "seeing system state clearly," but **making the system operable**.

What does "operable" mean? My understanding is: **being able to make decisions based on data and form closed loops**.

### Loop 1: Debugging Loop

When an Agent has issues, quickly locate the root cause:

```
Anomaly alert → View execution trace → Locate specific step → Analyze reasoning process → Discover Prompt issue → Modify Prompt → Verify fix
```

This loop requires:
- Complete execution trace tracking
- Queryable Prompt and Response
- Ability to "replay" historical tasks

### Loop 2: Cost Loop

When costs exceed expectations, quickly find the cause and optimize:

```
Cost alert → Break down to Agent/task/stage → Discover RAG retrieval returning too much → Optimize retrieval strategy → Costs decrease
```

This loop requires:
- Fine-grained cost attribution
- Correlation between cost and business metrics (cost per unit of output)
- Before/after optimization comparison analysis

### Loop 3: Security Loop

When anomalies are detected, quickly respond and harden:

```
Anomaly detection → Assess risk level → Automatic/manual handling → Post-incident analysis → Update baseline/policy → Prevent similar issues
```

This loop requires:
- Real-time anomaly detection capability
- Automated handling measures (isolation, blocking)
- Dynamic baseline update mechanism

### The Key to Operability: Data → Insight → Action

Connecting these three loops, we see a common pattern:

```
Data collection → Data processing → Insight generation → Decision support → Action execution → Feedback learning
```

The value of an observability system is reflected in every link of this chain:
- **Data collection**: Content from previous articles
- **Data processing**: Correlation, aggregation, noise reduction
- **Insight generation**: Baseline comparison, anomaly detection, attribution analysis
- **Decision support**: Risk assessment, optimization recommendations
- **Action execution**: Alerting, blocking, approval
- **Feedback learning**: Baseline updates, policy optimization

**Only by completing this loop can observability truly become "operable."**

---

## Series Summary

With this, the Agent Observability series comes to a close. Let's review the core points from the four articles:

**Article 1: Why Agents Make "Visibility" Harder**
- Agent execution paths are probabilistic, unpredictable
- Traditional monitoring can only answer "what was done," not "why"
- Audit, runtime, and network operate independently, lacking correlation

**Article 2: How I Understand Agent Key Objects**
- Four core objects: Agent, Model Source, Tool, Agent-to-Agent Link
- Two observation dimensions: Asset topology (static) + Execution trace (dynamic)
- Three link types: A2L, A2T, A2A

**Article 3: Practical Choices for Collection and Reconstruction**
- Three collection paradigms: SDK instrumentation, network proxy, runtime observation
- Misalignment between audit and runtime needs correlation mechanisms to bridge
- Reconstructability > Full collection

**Article 4: From Data to Judgment**
- Cost attribution requires stage-based metering and efficiency analysis
- Anomaly detection requires multi-dimensional behavioral baselines
- The goal of observability is "operability," requiring closed loops

---

Observability in the Agent era is indeed more complex than the traditional microservices era. But the good news is many fundamental principles are transferable—they just need adaptation for Agent characteristics.

I hope this series provides some inspiration for those working on Agent observability. If you have different thoughts or practical experiences, I welcome the exchange.

---

*Previous: [Agent Observability Overview 3: Practical Choices for Collection and Reconstruction](/en/blog/agent-observability-3)*
