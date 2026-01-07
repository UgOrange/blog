---
title: 'Agent Observability Overview 3: Practical Choices for Collection and Reconstruction'
description: This is the third article in the Agent Observability series, exploring three paradigms of data collection, the misalignment between audit and runtime, and the design principle that reconstructability is better than full collection.
pubDate: 2025-12-24
tags: ["AI", "Agent", "Observability", "Cloud Native", "eBPF"]
---

> This is the third article in the Agent Observability series. In the previous two articles, we discussed "why it's hard" and "what to observe." This article addresses the most practical question: how do we collect the data?

### Ideals Are Beautiful, Reality Is Harsh

If we ignore all constraints, ideal Agent observability should look like this:

- Complete records of every LLM call's Prompt and Response
- Complete records of every tool call's input, output, and duration
- Complete records of the Agent's Chain of Thought
- Real-time correlation of all data, forming a complete execution picture

But in reality, we face:

- The Agent might be a third-party framework—code can't be modified
- LLM traffic is HTTPS encrypted—packet capture shows nothing
- Tool calls are scattered across various protocols (HTTP, gRPC, SQL, pipes)
- Different data sources have inconsistent timestamp and ID systems

This article discusses what practical choices we can make under these constraints.

---

## 1. Trade-offs of Three Collection Paradigms

From a technical implementation perspective, Agent data collection roughly falls into three paradigms:

### Paradigm 1: Code Instrumentation (SDK Instrumentation)

**Principle**: Introduce an SDK into the Agent code that automatically reports data at key positions (LLM calls, tool calls).

**Typical scenario**:
```python
from agent_observability import trace

@trace
def call_llm(prompt):
    response = openai.chat.completions.create(...)
    return response

@trace
def call_tool(tool_name, params):
    result = tools[tool_name].execute(params)
    return result
```

**Advantages**:
- Can obtain the richest context (variable values, call stacks, custom tags)
- Deepest understanding of application-layer semantics
- Mature community ecosystem (LangSmith, Langfuse, etc.)

**Disadvantages**:
- **Highly invasive**: Requires modifying business code
- **Limited coverage**: Can only instrument code you can modify
- **Trust issues**: Agent can selectively report, bypassing monitoring

**Use case**: Development debugging phase for self-built Agents

### Paradigm 2: Network Proxy

**Principle**: Deploy a proxy between the Agent and external services to intercept and parse traffic.

**Typical scenarios**:
- Add an Envoy Sidecar in front of the Agent Pod
- Deploy a transparent proxy to decrypt HTTPS traffic
- Use an API Gateway to intercept LLM calls

**Advantages**:
- **No code changes**: Transparent to business
- **Centralized control**: One proxy point can cover all Agents
- **Controllable policies**: Can do rate limiting, auditing, interception at the proxy layer

**Disadvantages**:
- **Performance overhead**: Additional network hops + TLS termination
- **Single point of failure**: If the proxy goes down, Agents are disconnected
- **Protocol limitations**: Can only handle network traffic; in-process calls are invisible

**Use case**: Scenarios requiring centralized control of LLM egress traffic

### Paradigm 3: Runtime Observation

**Principle**: Collect data at the operating system level (kernel or runtime) without modifying any application code.

**Typical technologies**:
- eBPF: Mount probes at the kernel level to capture system calls
- uprobes: Collect data at user-space function entry/exit
- ptrace: Trace process behavior

**Advantages**:
- **Zero invasion**: No business code changes needed
- **Full coverage**: All behaviors can be observed, including those "not intended to be observed"
- **Cannot be bypassed**: Collected at kernel level, applications cannot evade

**Disadvantages**:
- **Complex implementation**: Requires deep understanding of kernel mechanisms
- **Performance sensitive**: Improper use can affect system stability
- **Semantic loss**: Kernel only sees byte streams; application-layer semantics need reconstruction

**Use case**: Security auditing and anomaly detection in production environments

### My Choice: Layered Combination

In actual work, I found **there's no silver bullet**. Best practice is a layered combination:

| Layer | Collection Method | Collection Content |
|-------|-------------------|-------------------|
| Application | SDK instrumentation (optional) | Prompt/Response semantics, custom tags |
| Network | Traffic parsing | A2L, A2T HTTP/gRPC/SQL traffic |
| System | eBPF | Process creation, file read/write, network connections |

Three-layer data is correlated through Trace ID or time windows to form a complete view.

---

## 2. Misalignment Between Audit Logs and Runtime Behavior

In Kubernetes environments, there's a particularly tricky problem: **audit logs and runtime behavior are disconnected**.

### Typical Scenario: kubectl exec

Suppose an Agent enters a Pod via `kubectl exec` to execute commands:

```bash
kubectl exec -it my-pod -- bash
# After entering the container
rm -rf /data/important/*
```

From K8s Audit Log's perspective, you can see:

```json
{
  "verb": "create",
  "resource": "pods/exec",
  "user": "system:serviceaccount:default:agent-sa",
  "objectRef": {
    "name": "my-pod",
    "namespace": "production"
  },
  "requestReceivedTimestamp": "2024-01-15T10:30:00Z"
}
```

The audit log tells you: **who** at **what time** initiated an exec request to **which Pod**.

But the audit log **won't tell you** what commands were executed inside the container—because exec establishes an interactive session, and subsequent commands are streamed via SPDY/WebSocket, which aren't within the audit log's recording scope.

On the other side, if you monitor the `execve` system call on the node with eBPF, you can see:

```json
{
  "syscall": "execve",
  "pid": 12345,
  "ppid": 12340,
  "comm": "rm",
  "args": ["-rf", "/data/important/*"],
  "container_id": "abc123",
  "timestamp": "2024-01-15T10:30:05Z"
}
```

Runtime monitoring tells you: **which process** at **what time** executed **what command**.

But runtime monitoring **doesn't know** who initiated this command—because the Linux kernel isn't aware of Kubernetes' identity system.

### The Cost of This Misalignment

Both sides' data is correct, but **not being able to correlate them means half the value is lost**:

- Security team sees Audit Log saying "someone exec'd into a Pod" but doesn't know what specifically was done, unable to assess risk
- Ops team sees eBPF saying "someone executed rm -rf" but doesn't know who, unable to assign responsibility

### How to Fix This Misalignment?

This is a problem I spent a lot of time researching. The core idea is **building correlation bridges**:

**Solution A: Time Window + Namespace Matching**

```
If:
  - Audit Log records Pod P received exec request at time T1
  - eBPF records container C (belonging to Pod P) had new process creation at time T2
  - T2 - T1 < threshold (e.g., 2 seconds)
  - New process is a direct child of shim process (exec characteristic)
Then:
  - Correlation successful, tag eBPF event with User label
```

This is a **heuristic correlation** that works in most scenarios.

**Solution B: Admission Webhook Injects Trace ID**

Intercept exec requests through K8s Admission Webhook, automatically modify the command:

```bash
# Original command
kubectl exec -it my-pod -- bash

# After Webhook modification
kubectl exec -it my-pod -- /bin/sh -c "export TRACE_ID=xxx; bash"
```

This way, all processes subsequently started in the container can inherit the `TRACE_ID` environment variable, which eBPF collection can also capture.

This solution is more precise, but has a **Shell dependency**—if the container doesn't have `/bin/sh`, it will fail.

---

## 3. Why "Reconstructability" Is More Important Than "Full Collection"

When designing collection solutions, I made a detour: initially pursuing "full collection"—collecting as much data as possible, the more complete the better.

Later I found this was a trap.

### Problems with Full Collection

**Problem 1: Data Volume Explosion**

An active Agent might generate per minute:
- 10+ LLM calls, each Prompt + Response might be thousands of tokens
- 50+ tool calls, each with input and output
- Hundreds of system calls

If all stored, one Agent might produce GB-level data per day. A few dozen Agents means tens of GBs.

**Problem 2: Too Much Noise**

Not all data is valuable. Large amounts of "normal" data drowns out "abnormal" data. When you actually need to troubleshoot, you can't find the key information.

**Problem 3: Privacy and Compliance**

Prompts and Responses might contain sensitive information (user data, API Keys, internal system information). Full storage brings privacy compliance risks.

### "Reconstructability" Is a Better Goal

My current design principle is: **Don't pursue storing all data; instead ensure key scenarios can be reconstructed when needed.**

Specifically:

**Principle 1: Layered Sampling**

- **Full collection of metadata**: Time, type, duration, status code for each call—this data is small, can be fully collected
- **Smart sampling of content**: Only collect summaries or head/tail portions of Prompt/Response content
- **Full collection on anomaly**: When anomalies are detected (errors, timeouts, sensitive operations), trigger full collection

**Principle 2: Correlation > Completeness**

Rather than storing complete content of every call, ensure:
- Every call has a unique ID
- IDs can correlate across systems (K8s Audit, eBPF, network traffic)
- Correlation relationships are persisted

This way, when deep analysis is needed, you can trace back to original systems for details via ID (like replaying requests, querying original logs).

**Principle 3: Reconstructable > Recordable**

Often, rather than recording "what the Agent did," it's better to ensure you can **reconstruct the Agent's decision context**:
- What was the System Prompt at the time?
- What was the conversation history at the time?
- What was the available tool list at the time?

With these, even without recording every step's detailed process, you can understand the Agent's behavior through **replay**.

---

## Summary

Collection is the foundation of observability, but collection solution choices must be based on real constraints:

1. **Three paradigms each have their use cases**: SDK instrumentation suits development debugging, network proxy suits centralized control, runtime observation suits security auditing
2. **Misalignment between audit and runtime is a real pain point**: Need to design correlation mechanisms to bridge the gap
3. **Reconstructability > Full collection**: The goal isn't storing all data, but ensuring key scenarios can be reconstructed

The next article is the last in this series. We'll discuss: after having the data, how do we go from data to judgment? Cost attribution, anomaly detection, behavioral baselines—how does "observability" become "operability"?

---

*Previous: [Agent Observability Overview 2: How I Understand Agent Key Objects](/en/blog/agent-observability-2)*

*Next: [Agent Observability Overview 4: From Data to Judgment](/en/blog/agent-observability-4)*
