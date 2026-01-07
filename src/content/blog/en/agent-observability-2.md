---
title: 'Agent Observability Overview 2: How I Understand Agent Key Objects'
description: This is the second article in the Agent Observability series, exploring four core objects in the Agent world - Agent, Model Source, Tool, and Agent-to-Agent Link.
pubDate: 2025-12-17
tags: ["AI", "Agent", "Observability", "Cloud Native"]
---

> This is the second article in the Agent Observability series. In the previous article, we discussed why Agents make "visibility" harder. This article will cover: in the Agent world, what exactly should we observe?

### Starting from an Analogy

When doing observability for traditional microservices, we have a mature mental model:
- **Service** is the basic unit
- **Dependency** is the calling relationship between services
- **Trace** is all the services a request passes through

This model works because it accurately abstracts the core objects and relationships in microservice architecture.

So the question is: **In the Agent world, what are the core objects? What are the relationships between them?**

While working on Agent observability, I gradually formed my own understanding framework. This article shares that framework.

---

## 1. Four Core Objects in the Agent World

After a period of practice, I categorize the objects that need to be observed in the Agent world into four types:

### 1. Agent

This is the most core object.

But what is an Agent? From an observability perspective, my definition is: **A workload with autonomous reasoning capabilities that can actively initiate requests to LLMs and call external tools based on responses.**

Note several keywords:
- **Autonomous reasoning**: Not simple if-else logic, but probabilistic reasoning based on LLMs
- **Actively initiate**: Agents don't passively wait for requests; they actively "think" and "act"
- **Call tools**: An Agent's capability boundary depends on which tools it can call

From an operations perspective, an Agent is typically a long-running process (or Pod), characterized by:
- Frequent HTTPS requests to LLM services
- Simultaneous connections to multiple downstream services (databases, APIs, external tools)
- Traffic patterns are "long text" Request-Response

### 2. Model Source

The Agent's "brain" isn't local—it's in a remote LLM service. This service is the **Model Source**.

Model Sources can be divided into two categories:
- **Public cloud models**: OpenAI, Anthropic, Google Gemini, etc.
- **Self-hosted deployments**: Ollama, vLLM, TGI, and other self-built model services

Why are Model Sources important?

Because communication between Agents and Model Sources carries **the most core semantic information**:
- Prompt (what the Agent wants to do)
- Response (what the model suggests)
- Tool Calls (what the Agent decides to execute)

**If you can only observe one place, observe the traffic between Agent and Model Source.**

### 3. Tool

Tools are the carriers through which Agents produce actual effects.

Agents themselves can't directly change the world—they need to execute operations by calling tools. Tools an Agent might call include:

**Infrastructure tools**:
- Kubernetes API (kubectl)
- Cloud service CLIs (aws, gcloud)
- Container runtime commands

**Data tools**:
- Databases (PostgreSQL, Redis)
- Vector databases (Milvus, Pinecone)
- Object storage

**External APIs**:
- SaaS services like GitHub, Slack, Jira
- MCP (Model Context Protocol) servers

Tool calls are **the most error-prone part**. One wrong reasoning by an Agent could result in:
- Accidental data deletion
- Sensitive information leakage
- Execution of dangerous commands

### 4. Agent-to-Agent Link

In complex scenarios, Agents often don't work alone—multiple Agents collaborate to complete tasks.

For example:
- Planner Agent responsible for breaking down tasks
- Executor Agent responsible for specific operations
- Reviewer Agent responsible for checking results

The collaboration relationships between these Agents form **collaboration links**.

The observability challenge from collaboration links is: **A task's execution might span multiple Agents, each with its own reasoning process and tool calls. How do we link them together?**

---

## 2. Understanding Observability from "Assets and Links"

With the four types of objects above, we can understand observability from a different perspective.

Traditional microservice observability essentially does two things:
1. **Asset inventory**: What services exist in the system? What's each service's status?
2. **Trace tracking**: What services did a request pass through? What's the latency and status at each stage?

Agent observability can also be understood with this framework:

### Asset level: What Agents do I have? What do they depend on?

- What Agents are running in the cluster?
- Which Model Sources does each Agent connect to?
- Which tools can each Agent call?
- What collaboration relationships exist between Agents?

This is **static asset topology**, answering "what does the system look like."

### Link level: What did a task go through?

- What input did the Agent receive?
- What Prompt did the Agent send to the model?
- What suggestions did the model return?
- Which tools did the Agent call? What were the parameters? What were the results?
- If multi-Agent collaboration was involved, how did the task flow between Agents?

This is **dynamic execution trace**, answering "what happened during this task."

Combining both forms this picture:

```
┌─────────────────────────────────────────────────────────┐
│                    Asset Topology                        │
│  ┌─────────┐    A2L     ┌─────────┐                    │
│  │  Agent  │ ────────→ │  Model  │                    │
│  │         │            │  Source │                    │
│  └────┬────┘            └─────────┘                    │
│       │ A2T                                            │
│       ▼                                                │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐                │
│  │  Tool   │  │  Tool   │  │  Tool   │                │
│  │ (Infra) │  │ (Data)  │  │ (SaaS)  │                │
│  └─────────┘  └─────────┘  └─────────┘                │
│                                                        │
│       A2A (Agent-to-Agent)                            │
│  ┌─────────┐            ┌─────────┐                   │
│  │ Planner │ ────────→ │Executor │                   │
│  │  Agent  │            │  Agent  │                   │
│  └─────────┘            └─────────┘                   │
└─────────────────────────────────────────────────────────┘
```

Three types of links:
- **A2L (Agent-to-LLM)**: Reasoning requests between Agent and Model Source
- **A2T (Agent-to-Tool)**: Agent calling tools to produce actual effects
- **A2A (Agent-to-Agent)**: Task flow during multi-Agent collaboration

---

## 3. Insights from Existing Solutions

While building Agent observability, I referenced quite a few existing solutions. Without naming names, there are several common insights worth sharing:

### Insight 1: SDK Instrumentation vs. Non-invasive Collection

Most Agent observability solutions on the market use SDK instrumentation—introducing their SDK into your Agent code, which automatically reports call data.

Advantages of this approach:
- Simple to implement
- Can obtain application-layer semantic information (like Prompt, Tool Call parameters)

Disadvantages:
- Requires modifying business code
- Can only observe behaviors that are "willing to be observed"
- Difficult to cover all Agent frameworks

Another approach is **non-invasive collection**: intercepting data at the network layer or system call layer, no business code modification needed.

Advantages of this approach:
- Zero modification
- Can observe all behaviors, including those "not intended to be observed"
- More suitable for security audit scenarios

Disadvantages:
- Complex to implement
- Encrypted traffic requires additional handling
- Potential performance overhead

**My choice**: For production environment security observability, non-invasive collection is the better choice. SDK instrumentation is suitable for the development debugging phase.

### Insight 2: Focus on "Trace" or "Audit"

Different observability solutions have different emphases:

Some solutions focus on **debugging experience**—helping you understand the Agent's reasoning process, convenient for tuning Prompts and optimizing Tool calls. These solutions' data models resemble traditional Distributed Tracing.

Some solutions focus on **security audit**—helping you record all Agent behaviors, detecting anomalies and risks. These solutions' data models are more like Audit Logs.

The differences are reflected in:
- Trace cares about "latency," Audit cares about "completeness"
- Trace can sample, Audit must be complete
- Trace has short retention, Audit needs long-term storage

**My choice**: Both are needed, but in production, Audit takes priority over Trace.

### Insight 3: Data Models Must Enable "Correlation"

Regardless of the solution, a common challenge is: **how to correlate data from different sources**.

- Network traffic + process information
- K8s Audit Log + in-container behavior
- Agent reasoning process + tool call results

If this data is isolated, its value is greatly diminished.

**When designing data models, correlation capability should be the first priority.**

---

## Summary

Understanding the key objects in the Agent world is the foundation for building observability:

1. **Four core objects**: Agent, Model Source, Tool, Agent-to-Agent Link
2. **Two observation dimensions**: Asset topology (static) + Execution trace (dynamic)
3. **Three link types**: A2L, A2T, A2A

In the next article, I'll dive deep into the topic of "collection"—facing so many types of data, what methods should be used to collect? Code instrumentation, network proxy, runtime monitoring—what are the trade-offs for each?

---

*Previous: [Agent Observability Overview 1: Why Agents Make "Visibility" Harder](/en/blog/agent-observability-1)*

*Next: [Agent Observability Overview 3: Practical Choices for Collection and Reconstruction](/en/blog/agent-observability-3)*
