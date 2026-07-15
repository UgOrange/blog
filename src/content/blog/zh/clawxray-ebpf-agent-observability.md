---
title: "用 eBPF 给 AI 编程 Agent 做透视：ClawXRay 的技术实现"
description: "当 Claude Code 在你的机器上执行 200 次 API 调用时，你知道它发了什么、花了多少 Token 吗？ClawXRay 用 eBPF 在内核层拦截 TLS 加密流量，让 AI Agent 的每一次 LLM 调用都无所遁形。"
pubDate: 2026-03-31
tags: ["AI安全","eBPF","Agent可观测性","LLM安全"]
heroImage: ../../../assets/weixin/clawxray-ebpf-agent-observability/cover.png
---

## 一个你可能没想过的问题

你用 Claude Code 写了一天代码，结束时 Dashboard 显示消耗了 50 万 Token。你用 Cursor 自动补全了一个下午，月底账单比预期多了三倍。

**你知道这些 Token 到底花在哪了吗？**

AI 编程 Agent 正在成为开发者的标配工具——Claude Code、Cursor、Copilot、Aider、Windsurf——但它们有一个共同特点：**和 LLM API 的通信是加密的，你看不到。** 你无法知道 Agent 每次给模型发了什么上下文、用了哪些工具、模型返回了什么、每次调用消耗了多少 Token。

这在个人使用场景下也许可以接受。但当你在企业环境中部署 AI Agent，在 Kubernetes 集群里跑自动化的 Coding Agent 工作流，情况就不一样了——**你需要知道这些 Agent 到底在干什么。**

这就是 ClawXRay 要解决的问题。

## 核心思路：eBPF + TLS 明文拦截

ClawXRay 的核心能力用一句话概括：**在内核层拦截 AI Agent 与 LLM API 之间的 TLS 加密通信，解析出完整的请求和响应内容，实时呈现。**

听起来像是网络抓包工具？不完全是。传统的网络分析工具（tcpdump、Wireshark）在 TLS 面前无能为力——它们只能看到加密后的密文。要解密 TLS 流量，你需要私钥或者 SSLKEYLOGFILE，这在生产环境中通常不可行。

ClawXRay 选择了一条不同的路：**不解密 TLS，而是在加密之前和解密之后拦截明文。**

```
应用层                     ClawXRay 拦截点
  │                              │
  ├─ 准备 HTTP 请求 ─────────────┤ ← 这里拿到明文请求
  │                              │
  ├─ 调用 SSL_write() ──────────►│ ← uprobe 拦截
  │                              │
  ├─ TLS 加密 ────────────────── │ （加密后的数据我们不关心）
  │                              │
  ├─ 内核 send() ──────────────► │
  │                              │
  │ ... 网络传输 ...              │
  │                              │
  ├─ 内核 recv() ◄──────────────  │
  │                              │
  ├─ TLS 解密 ────────────────── │
  │                              │
  ├─ SSL_read() 返回 ◄──────────│ ← uprobe 拦截
  │                              │
  └─ 应用层拿到明文响应 ─────────┤ ← 这里拿到明文响应
```

这个思路来自 eBPF 社区的经典方案，但 ClawXRay 在两个方向上做了创新：**一是同时处理 OpenSSL 和 Go 原生 TLS 两条路径，二是在拦截到数据后不仅仅记录，而是做 LLM 协议级别的深度解析。**

## 双路径 TLS 拦截：OpenSSL 和 Go TLS

为什么需要两条路径？因为 AI Agent 的运行时差异很大。

Node.js 写的 Agent（比如 Claude Code）走 OpenSSL 的 `SSL_read`/`SSL_write`。Go 写的 Agent 或后端服务则走 Go 标准库的 `crypto/tls`，它不调用 OpenSSL，而是自己实现了 TLS 协议。Python 的 Agent（比如 Aider）通常走 OpenSSL。

### OpenSSL 路径

通过 uprobe 挂载到 `libssl.so` 的 `SSL_read` 和 `SSL_write` 函数：

```c
// openssl_trace.bpf.c
SEC("uprobe/SSL_write")
int probe_ssl_write(struct pt_regs *ctx) {
    // 从寄存器中读取参数：SSL 连接、明文缓冲区、长度
    void *ssl = (void *)PT_REGS_PARM1(ctx);
    char *buf = (char *)PT_REGS_PARM2(ctx);
    int len = (int)PT_REGS_PARM3(ctx);

    // 读取明文数据并推送到 Ring Buffer
    // ...
}
```

这是经典的 eBPF TLS 拦截方式。但有一个实际问题：**容器环境中的 libssl 路径不一样。** 不同的容器镜像可能使用不同版本、不同路径的 OpenSSL。ClawXRay 通过 `/proc/PID/maps` 动态发现进程加载的 TLS 库，然后按需挂载 uprobe：

```go
// 解析 /proc/PID/maps 发现 TLS 库
tlsLibs, usesOpenSSL, usesBoringSSL, usesGnuTLS := extractTLSLibs(mapsData)

// 按需挂载 uprobe
for _, lib := range tlsLibs {
    hostLib := resolveHostLibPath(pid, lib)
    cl.AttachToOpenSSLLib(pid, hostLib)
}
```

### Go TLS 路径

Go 的 TLS 拦截要复杂得多。Go 的 `crypto/tls.(*Conn).Read` 和 `Write` 不是 C 函数，不能简单地用 uprobe 挂载。

两个关键挑战：

**1. Goroutine 栈问题。** Go 使用分段栈/连续栈，goroutine 的栈可以被运行时移动。标准的 uretprobe 会在栈上插入 trampoline 地址，这和 Go 的栈管理机制冲突，**会导致程序崩溃**。

ClawXRay 的解决方案：**扫描目标函数的所有 RET 指令，在每个 RET 位置挂载普通 uprobe 而不是 uretprobe。**

```go
// 扫描函数中的所有 RET 指令
retOffsets := ScanRetInstructions(binaryPath, funcSymbol)
for _, offset := range retOffsets {
    // 在每个 RET 指令处挂载 uprobe
    attachUprobe(binaryPath, offset, probeHandler)
}
```

**2. 参数传递方式。** Go 函数的参数不在寄存器中（Go 1.17 之前），而在栈上。即使 Go 1.17+ 使用了寄存器传参，布局也和 C ABI 不同。ClawXRay 通过符号表解析 Go 二进制中的结构体偏移量，精确定位参数位置：

```c
// go_tls_trace.bpf.c
// 通过 goroutine ID + TGID 作为 key 关联函数入口和返回
struct tgid_goid_t {
    __u32 tgid;
    __s64 goid;
};
```

### 主动挂载 vs 被动检测

ClawXRay 实现了两种策略的结合：

- **主动挂载**：当新进程启动时（通过 tracepoint 捕获 exec 事件），立即检查是否是 Go 二进制或 OpenSSL 用户，主动挂载 uprobe
- **被动检测**：当发现未解密的 TLS 流量时（通过 TLS record 头部特征 `0x17 0x03`），回溯诊断进程的 TLS 库类型，动态挂载

```go
// 检测到 TLS 加密流量
isTLSEncrypted := (b[0] == 0x17 || b[0] == 0x16) &&
    b[1] == 0x03 && (b[2] >= 0x01 && b[2] <= 0x04)

if isTLSEncrypted {
    // 检查是否已有 uprobe → 跳过
    // 否则 → 诊断并动态挂载
    go c.diagnoseAndAttachTLS(pid, comm)
}
```

## LLM 协议深度解析

拿到明文 HTTP 数据只是第一步。ClawXRay 的真正价值在于：**它不仅知道这是一个 HTTP 请求，还知道这是一个发给 Claude 的、使用了 tool_use 的、包含 8000 Token 上下文的 LLM 调用。**

### 多格式自适应检测

LLM 的 API 格式至少有六种主流变体：

| Provider | 请求特征 | 响应特征 |
|----------|---------|---------|
| OpenAI | `{"messages":[], "model":""}` | `{"choices":[], "usage":{}}` |
| Anthropic | `{"messages":[], "max_tokens":N}` | `{"content":[], "stop_reason":""}` |
| Gemini | `{"contents":[], "generationConfig":{}}` | `{"candidates":[], "promptFeedback":{}}` |
| Ollama | `{"model":"", "prompt":""}` | `{"response":"", "context":[]}` |
| Cohere | `{"message":"", "chat_history":[]}` | `{"text":"", "generation_id":""}` |
| 通用兼容 | OpenAI 格式（大量第三方代理） | OpenAI 格式 |

ClawXRay 使用**多信号置信度累加**的检测策略，而不是简单的 if-else：

```go
// 每个检测信号贡献一个置信度分值
// 最终置信度 >= 0.5 判定为 LLM 调用

// 高置信度信号
"anthropic-version" header → +0.4
"/v1/chat/completions" path → +0.6
{"messages":[], "model":""} body → +0.4

// 中置信度信号
"Bearer" authorization → +0.1
"temperature" field → +0.05
"max_tokens" field → +0.05
```

这种设计的好处是能处理非标准部署：很多企业通过内部代理转发 LLM 请求，path 可能不是标准的 `/v1/chat/completions`，但请求体格式是 OpenAI 兼容的。多信号累加能在 path 不匹配时，通过 body 和 header 的组合仍然正确识别。

### 流式响应追踪

大部分 LLM 调用使用 Server-Sent Events（SSE）流式返回。一个请求对应数百个 `data:` 事件片段。ClawXRay 通过 **FD 级别的请求-响应关联** 解决了这个问题：

```go
// 请求发出时，记录到 tracker
llmRequestTracker[fmt.Sprintf("%d:%d", pid, fd)] = &LLMRequestContext{
    Host:     "api.anthropic.com",
    Provider: "Anthropic",
    Model:    "claude-sonnet-4-20250514",
    IsStreaming: true,
}

// 后续的 SSE 片段到达时，通过 PID:FD 关联回原始请求
// 不需要重新解析 HTTP headers，直接继承上下文
```

### MCP 协议解析

除了 LLM API，ClawXRay 还能识别 MCP（Model Context Protocol）调用。当 Agent 通过 MCP 调用工具时，ClawXRay 可以看到工具名称、参数和返回值：

```go
// 检测 MCP JSON-RPC 2.0 调用
mcpMethods := []string{
    "tools/call",
    "tools/list",
    "resources/read",
    "initialize",
}
```

这意味着你不仅能看到 Agent 和 LLM 之间的对话，还能看到 Agent 调用了哪些工具、执行了什么操作。

## Agent 自动发现与进程树追踪

ClawXRay 不需要你告诉它「请监控 Claude Code 进程」。它会**自动发现**正在运行的 AI Agent 并追踪其完整的进程树。

发现策略按优先级排列：

1. **进程名匹配**：`claude`、`cursor`、`aider`、`codex`、`copilot`、`windsurf`
2. **命令行模式匹配**：`@anthropic`、`claude-code`、Python 调用 aider
3. **环境变量推断**：读取 `/proc/PID/environ`，检测 `ANTHROPIC_API_KEY`、`GITHUB_COPILOT`
4. **LLM 端点反向推断**：看到 `api.anthropic.com` 的请求 → 推断为 Claude Code

```go
// 建立 PID → Agent Session 的映射
// 包括所有子进程
sessions  map[uint32]*AgentSession   // rootPID → session
pidToRoot map[uint32]uint32          // anyPID → rootPID
```

这个进程树追踪是关键设计。Claude Code 运行时会 fork 出大量子进程（bash、git、node 等），这些子进程的网络流量也需要关联回 Claude Code 的 session。ClawXRay 通过 tracepoint 捕获 fork/exec/exit 事件，维护一棵实时的进程树，任何 PID 的流量都能追溯到所属的 Agent session。

## Kubernetes 原生支持

ClawXRay 以 DaemonSet 方式部署到 K8s 集群，自动处理容器场景的挑战：

**PID 命名空间映射**：容器内的 PID 和宿主机 PID 不同。ClawXRay 通过 `/proc/PID/root` 前缀访问容器内的文件系统，通过 cgroup 信息关联 Pod 和容器。

**内核级 PID 过滤**：在大规模集群中，eBPF 事件量巨大。ClawXRay 在 BPF map 中维护 PID 白名单，在内核层就过滤掉不相关的事件，避免用户态的处理压力。

**Pod 元数据富化**：每个事件自动附带 Pod 名称、命名空间、容器 ID 等 K8s 元数据。

```yaml
# DaemonSet 部署
containers:
  - name: clawxray
    securityContext:
      privileged: true  # eBPF 需要特权
    volumeMounts:
      - name: bpf
        mountPath: /sys/fs/bpf
      - name: proc
        mountPath: /proc
        readOnly: true
```

## 实际能看到什么

部署 ClawXRay 后，打开 Web Dashboard，你能实时看到：

- **每一次 LLM API 调用**：哪个 Agent 发起、发给哪个 Provider、用的什么模型
- **完整的请求/响应内容**：System Prompt、用户消息、工具调用、模型返回
- **Token 使用量**：从 API 响应中提取 `usage` 字段，精确到 prompt_tokens/completion_tokens
- **MCP 工具调用**：Agent 调用了什么工具、传了什么参数、返回了什么
- **进程执行记录**：Agent 执行了哪些 shell 命令，stdout/stderr 输出了什么
- **时序关联**：将以上信息按时间线串联，重建 Agent 的完整行为链

## 安全视角：为什么这件事重要

从安全角度看，ClawXRay 的价值在于让 AI Agent 的行为变得**可审计**。

**Prompt Injection 检测**：如果一个 RAG Agent 的请求中突然出现 `"ignore previous instructions"`，ClawXRay 能在网络层看到这个异常。

**数据泄露防护**：如果 Agent 把敏感数据（API Key、内部文档）发送到了 LLM API，ClawXRay 能记录完整的请求内容，供事后审计。

**成本监控**：每个 Agent session 的 Token 消耗可以精确追踪，避免意外的 API 费用。

**合规审计**：在金融、医疗等受监管行业，AI Agent 的所有输入输出可能需要完整记录。ClawXRay 提供了一种无侵入的审计方案。

## 我们的思考

ClawXRay 代表了一个新兴的技术方向：**AI Agent 可观测性**。

当我们谈论传统应用的可观测性时，有成熟的方法论——Metrics、Logs、Traces 三大支柱。但 AI Agent 引入了新的维度：LLM 调用不是普通的 RPC，它的输入输出是自然语言，它的行为不是预定义的，它的成本和延迟高度依赖上下文。

**传统 APM 工具没有为这些场景设计。** 它们能告诉你一个 HTTP 请求耗时 2 秒，但不能告诉你这个请求是一个包含 50000 Token 上下文的 LLM 调用，模型返回了一段代码，Agent 随后执行了 `rm -rf` 命令。

ClawXRay 通过 eBPF 在最底层切入，绕过了「Agent 框架各异」「SDK 各异」「协议各异」的问题——**不管你用什么 Agent 框架、什么编程语言、什么 LLM Provider，只要你的流量经过 TLS，我们就能看到。**

这是 eBPF 的独特优势：一次部署，全栈可见。

---
