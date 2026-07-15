---
title: "你的「龙虾」安全吗？Axios 遭供应链投毒，植入远控木马"
description: "都在关心龙虾能不能吃，程序员的「龙虾」也出事了——npm 上每周 6000 万下载的 axios 被劫持，恶意版本植入跨平台远控木马。本文分析攻击原理并提供自查命令。"
pubDate: 2026-03-31
tags: ["供应链安全","npm","安全事件"]
heroImage: ../../../assets/weixin/axios-npm-supply-chain-attack/cover.png
---

> 都在关心龙虾能不能吃，程序员的「龙虾」也出事了。

## 又是供应链攻击

2026 年 3 月 31 日凌晨，npm 上每周超 6000 万下载的 HTTP 客户端库 **axios** 遭遇供应链投毒。

攻击者劫持了首席维护者 `jasonsaayman` 的 npm 账号，将注册邮箱改为 `ifstap@proton.me`，手动发布了两个恶意版本：

- **axios@1.14.1**（1.x 主线）
- **axios@0.30.4**（0.x 遗留分支）

恶意版本在 npm 上存活了约 **2-3 小时**后被下架。安全版本为 `1.14.0` 和 `0.30.3`。

axios 协作者 DigitalBrainJS 发现后第一时间在 GitHub 发布告警，并通过一个巧妙的方法确认了被盗账号：他 pin 了一个 issue，观察是谁 unpin 了它，从而锁定操作来自 `jasonsaayman` 的凭证。

## 攻击原理

整个攻击链分 5 步：**账号劫持 → 依赖注入 → 混淆投递 → 远控植入 → 自毁灭迹**。

### 1. 依赖注入

攻击者在 `package.json` 中加了一个依赖：

```json
"plain-crypto-js": "^4.2.1"
```

这个包从未被 axios 源码 import 或 require，唯一作用是在 `npm install` 时触发 `postinstall` 钩子执行 `setup.js`。

正常的 axios 1.x 通过 GitHub Actions + OIDC 可信发布，而恶意版本是手动发布的——没有 OIDC 绑定、没有 `gitHead`、没有对应的 GitHub commit。这是一个关键的取证线索。

### 2. 双层混淆 Dropper

`setup.js` 用了两层混淆：

- **第一层**：XOR 密码，密钥 `"OrDeR_7077"`，公式 `charCode XOR key[(7*r*r) % 10] XOR 333`
- **第二层**：逆序 → `_` 替换 `=` → Base64 解码 → 过第一层

解码后暴露 `child_process`、`os`、`fs`，以及 C2 地址 `http://sfrclak.com:8000/`。

### 3. 跨平台远控载荷

根据 `os.platform()` 投递不同载荷：

**macOS**：AppleScript 静默执行，下载 RAT 到 `/Library/Caches/com.apple.act.mond`，伪装成系统进程。

**Windows**：复制 PowerShell 为 `%PROGRAMDATA%\wt.exe`（伪装 Windows Terminal），VBScript → 隐藏 CMD → PowerShell 多层跳板，`-ExecutionPolicy Bypass -WindowStyle Hidden`。

**Linux**：`execSync` 下载 Python RAT 到 `/tmp/ld.py`，`nohup` 后台运行。

C2 通信 POST body 设为 `packages.npm.org/product0|1|2`，伪装成 npm 注册表流量。

### 4. 自毁灭迹

载荷投递后，dropper 自动执行三步清理：

1. `fs.unlink(__filename)` 删除自身
2. 删除含 `postinstall` 的 `package.json`
3. 将预置的 `package.md` 重命名为 `package.json`（版本 4.2.0，无脚本）

所以感染后检查 `node_modules/plain-crypto-js/package.json` 看到的是干净的，但**目录的存在本身就是感染证据**。

### 5. 持久化

StepSecurity 实测：`npm install` 开始 **1.1 秒**后，第一次 C2 连接就已建立。恶意进程通过 `nohup` 脱管到 PID 1，安装进程退出后仍持续运行。

### 前置准备

攻击者提前 18 小时用 `nrwise` 账号发布了干净的 `plain-crypto-js@4.2.0`，建立发布历史绕过扫描器告警。攻击在 UTC 深夜发动，利用维护团队的响应空窗。

## 自查方法

**检查是否用了恶意版本**：

```bash
npm ls axios | grep -E "1\.14\.1|0\.30\.4"
```

**检查 lockfile**：

```bash
grep -E "axios.*1\.14\.1|axios.*0\.30\.4" package-lock.json yarn.lock pnpm-lock.yaml 2>/dev/null
```

**检查恶意依赖残留**：

```bash
ls node_modules/plain-crypto-js 2>/dev/null
```

这个目录存在就说明 dropper 执行过，即使里面的 package.json 看起来是干净的。

**检查 RAT 文件**：

```bash
# macOS
ls /Library/Caches/com.apple.act.mond
# Linux
ls /tmp/ld.py
```

Windows 用 PowerShell 检查 `Test-Path "$env:PROGRAMDATA\wt.exe"`。

**检查 C2 连接**：

```bash
netstat -an | grep 142.11.206.73
```

如果发现了 RAT 文件，不要手动清理。系统视为沦陷，从安全镜像重建，轮换所有凭证（npm token、SSH 密钥、云服务密钥、CI/CD Secrets）。

## IOC 汇总

| 类型 | 值 |
|------|-----|
| 恶意包 | `axios@1.14.1`、`axios@0.30.4`、`plain-crypto-js@4.2.1` |
| C2 域名 | `sfrclak.com` |
| C2 IP | `142.11.206.73` |
| C2 URL | `http://sfrclak.com:8000/6202033` |
| macOS 文件 | `/Library/Caches/com.apple.act.mond` |
| Windows 文件 | `%PROGRAMDATA%\wt.exe`、`%TEMP%\6202033.vbs` |
| Linux 文件 | `/tmp/ld.py` |

## 防护建议

- 锁定安全版本 `axios@1.14.0` 或 `0.30.3`
- CI/CD 使用 `npm ci --ignore-scripts`
- npm 账号启用 2FA
- lockfile 锁定依赖，不自动升级 minor
- 关键包启用 OIDC 可信发布

---

**参考来源**：
- StepSecurity: Axios Compromised on npm — Malicious Versions Drop Remote Access Trojan
- GitHub Issue axios/axios#10604
