---
title: "X-Raying AI Coding Agents with eBPF: How ClawXRay Works"
description: "When Claude Code makes 200 API calls on your machine, do you know what it sent or how many tokens it burned? ClawXRay uses eBPF to intercept TLS-encrypted traffic at the kernel level, making every LLM call from AI Agents fully transparent."
pubDate: 2026-03-31
tags: ["AI Security","eBPF","Agent Observability","LLM Security"]
heroImage: ../../../assets/weixin/clawxray-ebpf-agent-observability/cover.png
---

## A Question You Probably Haven't Asked

You spent a whole day coding with Claude Code, and at the end the dashboard shows 500,000 tokens consumed. You used Cursor's auto-complete all afternoon, and the bill at the end of the month was three times what you expected.

**Do you actually know where those tokens went?**

AI coding agents are becoming standard tools for developers—Claude Code, Cursor, Copilot, Aider, Windsurf—but they all share one trait: **their communication with LLM APIs is encrypted, and you can't see it.** You have no way of knowing what context the Agent sent to the model each time, which tools were used, what the model returned, or how many tokens each call consumed.

This might be acceptable for personal use. But when you deploy AI Agents in an enterprise environment, running automated Coding Agent workflows in a Kubernetes cluster, things are different—**you need to know what these Agents are actually doing.**

That's the problem ClawXRay solves.

## Core Approach: eBPF + TLS Plaintext Interception

ClawXRay's core capability in one sentence: **intercept TLS-encrypted communication between AI Agents and LLM APIs at the kernel level, parse the complete request and response content, and present it in real time.**

Sounds like a network packet capture tool? Not quite. Traditional network analysis tools (tcpdump, Wireshark) are powerless against TLS—they can only see encrypted ciphertext. To decrypt TLS traffic, you need private keys or an SSLKEYLOGFILE, which is usually impractical in production environments.

ClawXRay takes a different path: **instead of decrypting TLS, it intercepts the plaintext before encryption and after decryption.**

```
Application Layer              ClawXRay Interception Point
  │                              │
  ├─ Prepare HTTP request ───────┤ ← Plaintext request captured here
  │                              │
  ├─ Call SSL_write() ──────────►│ ← uprobe intercept
  │                              │
  ├─ TLS encryption ──────────── │ (encrypted data — we don't care)
  │                              │
  ├─ Kernel send() ────────────► │
  │                              │
  │ ... network transit ...      │
  │                              │
  ├─ Kernel recv() ◄──────────── │
  │                              │
  ├─ TLS decryption ──────────── │
  │                              │
  ├─ SSL_read() returns ◄───────│ ← uprobe intercept
  │                              │
  └─ Application gets plaintext ─┤ ← Plaintext response captured here
```

This approach comes from a classic eBPF community technique, but ClawXRay innovates in two ways: **first, it handles both OpenSSL and Go's native TLS paths simultaneously; second, after intercepting the data, it doesn't just log it—it performs deep parsing at the LLM protocol level.**

## Dual-Path TLS Interception: OpenSSL and Go TLS

Why two paths? Because AI Agent runtimes vary widely.

Node.js-based Agents (like Claude Code) use OpenSSL's `SSL_read`/`SSL_write`. Go-based Agents or backend services use Go's standard library `crypto/tls`, which doesn't call OpenSSL but implements the TLS protocol itself. Python-based Agents (like Aider) typically use OpenSSL.

### OpenSSL Path

Attach uprobes to the `SSL_read` and `SSL_write` functions in `libssl.so`:

```c
// openssl_trace.bpf.c
SEC("uprobe/SSL_write")
int probe_ssl_write(struct pt_regs *ctx) {
    // Read parameters from registers: SSL connection, plaintext buffer, length
    void *ssl = (void *)PT_REGS_PARM1(ctx);
    char *buf = (char *)PT_REGS_PARM2(ctx);
    int len = (int)PT_REGS_PARM3(ctx);

    // Read plaintext data and push to Ring Buffer
    // ...
}
```

This is the classic eBPF TLS interception approach. But there's a practical issue: **the libssl path varies across containers.** Different container images may use different versions and paths for OpenSSL. ClawXRay dynamically discovers the TLS library loaded by a process through `/proc/PID/maps`, then attaches uprobes on demand:

```go
// Parse /proc/PID/maps to discover TLS libraries
tlsLibs, usesOpenSSL, usesBoringSSL, usesGnuTLS := extractTLSLibs(mapsData)

// Attach uprobes on demand
for _, lib := range tlsLibs {
    hostLib := resolveHostLibPath(pid, lib)
    cl.AttachToOpenSSLLib(pid, hostLib)
}
```

### Go TLS Path

Intercepting Go's TLS is significantly more complex. Go's `crypto/tls.(*Conn).Read` and `Write` are not C functions and can't simply be hooked with uprobes.

Two key challenges:

**1. Goroutine stack issues.** Go uses segmented/contiguous stacks, and a goroutine's stack can be relocated by the runtime. Standard uretprobes insert a trampoline address on the stack, which conflicts with Go's stack management—**causing the program to crash.**

ClawXRay's solution: **scan all RET instructions in the target function and attach regular uprobes at each RET location instead of using uretprobes.**

```go
// Scan all RET instructions in the function
retOffsets := ScanRetInstructions(binaryPath, funcSymbol)
for _, offset := range retOffsets {
    // Attach a uprobe at each RET instruction
    attachUprobe(binaryPath, offset, probeHandler)
}
```

**2. Argument passing conventions.** Go function arguments are not in registers (before Go 1.17) but on the stack. Even with Go 1.17+ register-based calling, the layout differs from the C ABI. ClawXRay resolves struct offsets from the Go binary's symbol table to precisely locate argument positions:

```c
// go_tls_trace.bpf.c
// Use goroutine ID + TGID as key to correlate function entry and return
struct tgid_goid_t {
    __u32 tgid;
    __s64 goid;
};
```

### Proactive Attachment vs. Passive Detection

ClawXRay combines two strategies:

- **Proactive attachment**: When a new process starts (captured via tracepoint exec events), it immediately checks whether it's a Go binary or an OpenSSL user and proactively attaches uprobes
- **Passive detection**: When unencrypted TLS traffic is detected (by recognizing TLS record header signatures `0x17 0x03`), it retroactively diagnoses the process's TLS library type and dynamically attaches

```go
// Detected TLS encrypted traffic
isTLSEncrypted := (b[0] == 0x17 || b[0] == 0x16) &&
    b[1] == 0x03 && (b[2] >= 0x01 && b[2] <= 0x04)

if isTLSEncrypted {
    // Check if uprobe already attached → skip
    // Otherwise → diagnose and dynamically attach
    go c.diagnoseAndAttachTLS(pid, comm)
}
```

## Deep LLM Protocol Parsing

Capturing plaintext HTTP data is only the first step. ClawXRay's real value lies in this: **it doesn't just know this is an HTTP request—it knows this is an LLM call to Claude, using tool_use, with an 8,000-token context.**

### Multi-Format Adaptive Detection

LLM APIs come in at least six major format variants:

| Provider | Request Signature | Response Signature |
|----------|---------|---------|
| OpenAI | `{"messages":[], "model":""}` | `{"choices":[], "usage":{}}` |
| Anthropic | `{"messages":[], "max_tokens":N}` | `{"content":[], "stop_reason":""}` |
| Gemini | `{"contents":[], "generationConfig":{}}` | `{"candidates":[], "promptFeedback":{}}` |
| Ollama | `{"model":"", "prompt":""}` | `{"response":"", "context":[]}` |
| Cohere | `{"message":"", "chat_history":[]}` | `{"text":"", "generation_id":""}` |
| Generic Compatible | OpenAI format (many third-party proxies) | OpenAI format |

ClawXRay uses a **multi-signal confidence accumulation** detection strategy instead of simple if-else logic:

```go
// Each detection signal contributes a confidence score
// Final confidence >= 0.5 classified as an LLM call

// High-confidence signals
"anthropic-version" header → +0.4
"/v1/chat/completions" path → +0.6
{"messages":[], "model":""} body → +0.4

// Medium-confidence signals
"Bearer" authorization → +0.1
"temperature" field → +0.05
"max_tokens" field → +0.05
```

The advantage of this design is handling non-standard deployments: many enterprises route LLM requests through internal proxies where the path may not be the standard `/v1/chat/completions`, but the request body is OpenAI-compatible. Multi-signal accumulation can still correctly identify the call through the combination of body and headers even when the path doesn't match.

### Streaming Response Tracking

Most LLM calls use Server-Sent Events (SSE) for streaming responses. A single request maps to hundreds of `data:` event fragments. ClawXRay solves this through **FD-level request-response correlation**:

```go
// When a request is sent, record it in the tracker
llmRequestTracker[fmt.Sprintf("%d:%d", pid, fd)] = &LLMRequestContext{
    Host:     "api.anthropic.com",
    Provider: "Anthropic",
    Model:    "claude-sonnet-4-20250514",
    IsStreaming: true,
}

// When subsequent SSE fragments arrive, correlate back to the original request via PID:FD
// No need to re-parse HTTP headers — context is inherited directly
```

### MCP Protocol Parsing

Beyond LLM APIs, ClawXRay can also identify MCP (Model Context Protocol) calls. When an Agent invokes tools via MCP, ClawXRay can see the tool name, parameters, and return values:

```go
// Detect MCP JSON-RPC 2.0 calls
mcpMethods := []string{
    "tools/call",
    "tools/list",
    "resources/read",
    "initialize",
}
```

This means you can see not only the conversation between the Agent and the LLM, but also which tools the Agent called and what actions it performed.

## Automatic Agent Discovery and Process Tree Tracking

ClawXRay doesn't require you to say "please monitor the Claude Code process." It **automatically discovers** running AI Agents and tracks their complete process trees.

Discovery strategies in order of priority:

1. **Process name matching**: `claude`, `cursor`, `aider`, `codex`, `copilot`, `windsurf`
2. **Command-line pattern matching**: `@anthropic`, `claude-code`, Python invocations of aider
3. **Environment variable inference**: Read `/proc/PID/environ`, check for `ANTHROPIC_API_KEY`, `GITHUB_COPILOT`
4. **LLM endpoint reverse inference**: Seeing requests to `api.anthropic.com` → infer it's Claude Code

```go
// Build PID → Agent Session mapping
// Including all child processes
sessions  map[uint32]*AgentSession   // rootPID → session
pidToRoot map[uint32]uint32          // anyPID → rootPID
```

This process tree tracking is a critical design element. When Claude Code runs, it forks numerous child processes (bash, git, node, etc.), and network traffic from these child processes also needs to be correlated back to the Claude Code session. ClawXRay captures fork/exec/exit events via tracepoints, maintaining a real-time process tree so that traffic from any PID can be traced back to its owning Agent session.

## Kubernetes-Native Support

ClawXRay deploys as a DaemonSet in K8s clusters, automatically handling container-specific challenges:

**PID namespace mapping**: PIDs inside containers differ from host PIDs. ClawXRay accesses the container's filesystem through the `/proc/PID/root` prefix and correlates Pods and containers via cgroup information.

**Kernel-level PID filtering**: In large-scale clusters, eBPF event volume is enormous. ClawXRay maintains a PID allowlist in BPF maps, filtering out irrelevant events at the kernel level to avoid processing pressure in userspace.

**Pod metadata enrichment**: Every event is automatically annotated with Pod name, namespace, container ID, and other K8s metadata.

```yaml
# DaemonSet deployment
containers:
  - name: clawxray
    securityContext:
      privileged: true  # eBPF requires privileged mode
    volumeMounts:
      - name: bpf
        mountPath: /sys/fs/bpf
      - name: proc
        mountPath: /proc
        readOnly: true
```

## What You Actually See

After deploying ClawXRay and opening the Web Dashboard, you can see in real time:

- **Every LLM API call**: Which Agent initiated it, which Provider it targeted, which model was used
- **Complete request/response content**: System Prompts, user messages, tool calls, model responses
- **Token usage**: Extracted from the API response's `usage` field, broken down into prompt_tokens/completion_tokens
- **MCP tool calls**: Which tools the Agent called, what parameters were passed, what was returned
- **Process execution records**: Which shell commands the Agent executed, what stdout/stderr produced
- **Temporal correlation**: All of the above linked on a timeline, reconstructing the Agent's complete behavior chain

## The Security Perspective: Why This Matters

From a security standpoint, ClawXRay's value lies in making AI Agent behavior **auditable**.

**Prompt Injection detection**: If a RAG Agent's request suddenly contains `"ignore previous instructions"`, ClawXRay can see this anomaly at the network level.

**Data exfiltration prevention**: If an Agent sends sensitive data (API keys, internal documents) to an LLM API, ClawXRay records the complete request content for post-incident auditing.

**Cost monitoring**: Token consumption per Agent session can be tracked precisely, preventing unexpected API bills.

**Compliance auditing**: In regulated industries like finance and healthcare, all AI Agent inputs and outputs may need to be fully recorded. ClawXRay provides a non-invasive auditing solution.

## Our Perspective

ClawXRay represents an emerging technical direction: **AI Agent Observability.**

When we talk about observability for traditional applications, there's a mature methodology—the three pillars of Metrics, Logs, and Traces. But AI Agents introduce new dimensions: LLM calls are not ordinary RPCs; their inputs and outputs are natural language, their behavior is not predefined, and their cost and latency are highly context-dependent.

**Traditional APM tools were not designed for these scenarios.** They can tell you an HTTP request took 2 seconds, but they can't tell you that this request was an LLM call with a 50,000-token context, that the model returned a block of code, and that the Agent then executed an `rm -rf` command.

ClawXRay cuts in at the lowest level via eBPF, bypassing the problems of "every Agent framework is different," "every SDK is different," and "every protocol is different"—**no matter what Agent framework, programming language, or LLM Provider you use, as long as your traffic goes through TLS, we can see it.**

This is eBPF's unique advantage: deploy once, see everything.

---
