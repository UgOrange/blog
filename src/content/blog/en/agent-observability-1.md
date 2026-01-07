---
title: 'Agent Observability Overview 1: Why Agents Make "Visibility" Harder'
description: This is the first article in the Agent Observability series, exploring the core challenges of observability in the Agent era - uncertainty, semantic gaps, and data silos.
pubDate: 2025-12-10
tags: ["AI", "Agent", "Observability", "Cloud Native"]
---

> This is the first article in the Agent Observability series. In this series, I'll share my thoughts and practices in building AI Agent observability systems.

### Starting from a Real Confusion

Recently, an AI Agent from our team had issues in production—it "completed" the task assigned by the user, but the result was completely wrong.

When we tried to review this problem, we found ourselves in a strange predicament: we could see which APIs the Agent called, how many tokens it consumed, and even the latency distribution across the entire request chain. But we **couldn't answer the most basic question: why did it make that wrong decision?**

This made me realize that observability in the Agent era might be completely different from what we're familiar with.

---

## 1. Agent Uncertainty and Dynamic Paths

Traditional microservice observability is built on an implicit assumption: **service behavior is deterministic**.

Given the same input, a service will follow the same code path, call the same downstream services, and return the same result. Even with branching logic, these branches are enumerable—they're all written in code.

But Agents break this assumption.

An Agent is essentially a loop system with an LLM as its core reasoning engine:

```
Perception → Planning → Action → Feedback → Re-planning...
```

Every "planning" step in this loop is the result of probabilistic reasoning. **With the same input, executing at different times, the Agent might choose completely different tools and take completely different paths.**

For example: when you ask an Agent to "analyze the code quality of this project," it might:
- First run: read the README first, then scan the directory structure, finally check a few core files
- Second run: directly run a lint tool, then analyze the output
- Third run: first look for existing CI configuration, then check targeted areas

Which path is "correct"? Hard to say. But the problem is—**you can't predict which path it will choose**.

This uncertainty means:
- Traditional call traces become unpredictable
- Alert rules based on fixed topology become ineffective
- Performance baselines are hard to establish (is latency fluctuation normal or abnormal when each execution path is different?)

---

## 2. The Split Between "What Was Done" and "Why It Was Done"

This is the most core pain point I encountered while working on Agent observability: **traditional monitoring can only answer "What," but Agents require us to answer "Why."**

Let me illustrate with a specific scenario.

Suppose an Agent executed this operation:

```
DELETE /api/v1/resources/12345
```

From an APM perspective, this is just an HTTP request. You can see:
- Request method: DELETE
- Target URL: /api/v1/resources/12345
- Response status: 200
- Latency: 150ms

But you **cannot know**:
- Why did the Agent decide to delete this resource?
- Was it executing the user's explicit instruction, or making an "autonomous judgment" based on some reasoning?
- Did it consider other options but ultimately chose deletion?
- Is this delete operation expected?

What's trickier is that the Agent's decision process (Chain of Thought) and its actual actions (Tool Calls) are **disconnected**.

- CoT is the Agent's "inner monologue," usually only existing in the LLM's response, not captured by traditional monitoring systems
- Tool calls are the Agent's "external actions," capturable by APM, but lacking semantic context

This disconnect leads to an awkward situation: **when an Agent has issues, we can see "what it did," but can't understand "why it did it."**

---

## 3. The Blind Spots Traditional Monitoring Most Easily Overlooks

Based on the analysis above, I've summarized three blind spots that traditional monitoring most easily overlooks:

### Blind Spot 1: Misalignment Between Audit Logs and Runtime Behavior

Take the Kubernetes environment as an example.

Suppose an Agent enters a Pod via `kubectl exec` to execute commands. K8s Audit Log will record:
- Who initiated the exec request
- What was the target Pod
- Request time

But Audit Log **won't record** what commands were actually executed inside the container.

On the other hand, if you monitor syscalls on the node with eBPF, you can see:
- `rm -rf /data/*` was executed inside the container
- The PID of the executing process
- Execution time

But you **don't know** who initiated this command—because the Linux kernel isn't aware of Kubernetes' identity system.

**Audit knows "who," runtime knows "what was done," but there's no correlation between them.**

### Blind Spot 2: Network Layer Only Sees "Connections," Not "Intent"

Traditional network security tools (firewalls, CNI policies) work at the IP layer. They can see:
- Pod A connected to Pod B
- Traffic size
- Protocol type

But they **cannot understand**:
- What Prompt the Agent sent
- What the tool call parameters were
- Whether the Agent is executing dangerous operations

What's worse, many Agent communications with external LLMs are HTTPS encrypted. Even if you mirror the traffic, you only see encrypted byte streams.

### Blind Spot 3: APM Focuses on "Performance," Not "Semantics"

The core metrics of APM tools are:
- Latency
- Throughput
- Error Rate

These metrics are useful for understanding "whether the system is healthy," but almost useless for understanding "whether the Agent is working correctly."

An Agent can:
- Have low latency → but make wrong decisions
- Have no errors → but execute dangerous operations
- Have high throughput → but be stuck in a meaningless loop

**Performance health ≠ Behavioral correctness.**

This is the fundamental difference between Agent observability and traditional observability.

---

## Summary

Agents make "visibility" harder for fundamental reasons:

1. **Uncertainty**: Agent execution paths are probabilistic, unpredictable and non-enumerable
2. **Semantic gap**: Traditional monitoring can only answer "what was done," not "why it was done"
3. **Data silos**: Audit, runtime, network, and APM operate independently, lacking correlation

In the next article, I'll share how I understand the "key objects" in the Agent world—including Agents themselves, model sources, tools, and the collaboration links between them.

Only by first figuring out "what to observe" can we answer "how to observe."

---

*Next: [Agent Observability Overview 2: How I Understand Agent Key Objects](/en/blog/agent-observability-2)*
