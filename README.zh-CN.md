# fixen

**在命令行里修正你的英文（或任何语言），直接用你手头已有的 LLM。**

[![npm](https://img.shields.io/npm/v/fixen-cli)](https://www.npmjs.com/package/fixen-cli)
[![CI](https://github.com/Heoooooon/fixen/actions/workflows/ci.yml/badge.svg)](https://github.com/Heoooooon/fixen/actions/workflows/ci.yml)
[![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
![node](https://img.shields.io/badge/node-%E2%89%A518-brightgreen)
![deps](https://img.shields.io/badge/dependencies-0-orange)

[English](README.md) | **简体中文** | [日本語](README.ja.md) | [한국어](README.ko.md)

<p align="center">
  <img src="docs/assets/demo.gif" alt="fixen 0.2.0 实机录屏：终端里 fixen --polish 列出每处修改，并输出改好的英文和韩文句子；在 TextEdit 里选中一句话，按下 Control-Option-Command-F 后原地替换成改好的句子。" width="860">
</p>

<p align="center"><sub>fixen 0.2.0 实机录制（已剪掉等待模型的时间） · <a href="docs/assets/demo.mp4">MP4 版</a></sub></p>

## 快速开始

```sh
npm install -g fixen-cli    # 安装 `fixen` 命令（Node.js ≥ 18）
fixen doctor                # 检查后端、存储、剪贴板和通知
```

然后试一下：

```sh
fixen "I has a apple"                                 # → I have an apple.
fixen -e -l Korean "She go to school yesterday"       # 同时用韩语解释改了哪里
fixen -t Japanese "私は昨日学校に行きたです"            # 不止英文，任何语言都能改
```

至少需要一个[后端](#选择后端)。只要你能在终端里运行 `claude`、`codex`、`gjc`、`gemini` 或 `ollama`，就已经准备好了。

## 三种用法

### 1. 在终端里

```sh
fixen "your english sentence"       # 一次性纠错
echo "your sentence" | fixen        # stdin / 管道
fixen --polish "draft message"      # 润色要发给别人的消息：显示改动，并复制到剪贴板
```

### 2. macOS 任意位置：全局快捷键

```sh
fixen hotkey
```

在任意应用里选中文字（Slack、Mail、浏览器里的输入框都行），按下 **⌃⌥⌘F**，改好的文字会**直接替换选中内容**。[详细说明](#全局快捷键-macos)

### 3. 在 AI 对话里：自动纠错

```sh
fixen install
```

之后，你的 AI 对话 CLI 每次正常回复的末尾，都会附上对*你*所输入内容的纠正：

```console
$ gjc -p "hey what is capital of france? my dream is go to paris someday"
The capital of France is Paris. ...

> **fixen** · My dream is **to** go to Paris someday.
> ↳ '가다'는 to부정사로 — go → to go
```

[详细说明](#聊天模式在-ai-cli-中自动纠错)

## 选择后端

按以下顺序自动检测：`claude` → `codex` → `gjc` → `gemini` → `ollama` → `api`（需设置 API key）。也可以用 `-b` 明确指定。

| 后端  | 需要什么 | 适合场景 |
| -------- | ------------- | --------- |
| `claude` | 已登录 Claude Code（`claude -p`） | 你已经在付费用 Claude |
| `codex`  | 已登录 OpenAI Codex CLI（`codex exec`；支持 `-m`） | 你已经在用 ChatGPT / Codex |
| `gjc`    | 已安装 GJC（`gjc -p --no-tools`，可选模型） | 你已经在用 GJC |
| `gemini` | 已登录 Gemini CLI（`gemini -p`） | 想用有免费额度的云端模型 |
| `ollama` | 一个本地模型（`ollama run <model>`） | 想在本地离线运行 |
| `api`    | `FIXEN_API_KEY`（+ `FIXEN_API_URL`、`FIXEN_MODEL`），适用于任何 OpenAI 兼容的 `/chat/completions` | DeepSeek、Groq、OpenRouter、OpenAI 或你自己的服务器 |
| `openai` | `FIXEN_API_KEY` 加 `-m`，走 OpenAI `/responses` | `gpt-5.6-pro` 这类推理模型 |
| `-c`     | 任何读入 prompt 并输出回答的命令 | 其他所有情况 |

[后端详细说明](#后端)

## 为什么选 fixen

- **用你已有的模型，零依赖。** 一个小巧的 CLI（没有 `node_modules`），把纠错 prompt 交给你机器上现成的模型。不用注册账号，API key 也只在你需要时才用，不会被某家厂商绑定。
- **边干活边学习。** 聊天模式会把你输入的每条消息都变成一节免费的小课，不用打开任何背单词应用。
- **支持任何语言，可完全还原。** 默认纠正英文，用 `-t` 可以纠正日语、法语、德语等任意语言；`fixen uninstall` 会把改动过的每个文件原样恢复。

## 隐私

- 你的文字**只会发给你选定的后端**。fixen 没有自己的服务器，所以文字不会被发到别处。
- 历史记录**只保存在你本机**（`~/.config/fixen/history.jsonl`，权限 `0600`）。设置 `FIXEN_NO_HISTORY=1` 可关闭；设置 `FIXEN_SIDECAR_NO_STORE=1` 可不保存 sidecar 的结果。
- 在面板里保存的 API key 存放在 `~/.config/fixen/credentials.json`（`0600`），绝不会写进 `config.json`。`openai` 后端会发送 `store: false`。

## 参考

<details>
<summary><b>全部命令和选项</b></summary>

### 命令

```sh
fixen "your english sentence"       # 一次性纠错
echo "your sentence" | fixen        # stdin / 管道
fixen                               # 交互模式（逐行输入，Ctrl+D 退出）
fixen -e "sentence"                 # 同时解释改了哪里
fixen -e -l Korean "sentence"       # 用韩语解释
fixen -t Japanese "日本語の文"        # 不止英文，任何语言都能改
fixen -t Auto "안되는거 같아"         # 自动识别英文或韩文
fixen --polish "draft message"      # 润色要发给别人的消息：显示改动，并复制到剪贴板
fixen --notify -e "sentence"        # 纠错结果以桌面通知显示
fixen --last                        # 显示最近一次通知中的纠正
fixen doctor                        # 检查后端、存储、剪贴板和通知
fixen --ask "why was this changed?" # 针对那次纠正提问
fixen --clear                       # 删除已保存的纠正
fixen -- <words>                    # 后面的词一律不当作选项解析
```

sidecar 相关操作都用显式的 `--` 选项，所以像 `fixen ask me tomorrow`、`fixen notify the team` 这样的普通文字，仍然会被当作要纠正的句子。

英文只是默认值。`-t/--target`（或 `FIXEN_TARGET`，或配置里的 `"target"`）可以切换要纠正的语言。比如 `fixen -t French -e -l Korean "..."` 会纠正法语，并用韩语解释改动。用 `-t Auto` 可以自动识别英文或韩文；历史记录里保存的是识别出的语言，而不是 `Auto`。

### 选项

| 选项 | 含义 |
| ------ | ------- |
| `-b, --backend <name>` | `claude` \| `codex` \| `gjc` \| `gemini` \| `ollama` \| `api` \| `openai`（默认：自动检测，或取配置 / `FIXEN_BACKEND`） |
| `-c, --command <tmpl>` | 自定义 shell 命令；`{prompt}` 会展开为 prompt，没有的话 prompt 通过 stdin 传入 |
| `-e, --explain` | 同时解释改了哪里（配置：`"explain": true`） |
| `--no-explain` | 不解释，即使配置里开启了也不解释 |
| `-l, --lang <lang>` | 解释所用的语言（默认：English；例如 Korean） |
| `-t, --target <lang>` | 要纠正的语言（默认：English；`Auto` = 英文或韩文） |
| `-m, --model <model>` | claude/codex/gemini/ollama/api/openai 后端使用的模型 |
| `-r, --reasoning <e>` | （openai）推理强度：`none\|minimal\|low\|medium\|high` |
| `-f, --file <path>` | （install）额外写入那一行的指令文件 |
| `--notify` | 用 sidecar 纠正传入的文字并发送通知 |
| `--json` | （notify）以单个 JSON 对象输出纠正结果 |
| `--polish` | 纠正、显示改动，并复制到剪贴板 |
| `--gui` | 在 127.0.0.1 上启动历史面板并打开 |
| `--port <n>` | （gui）绑定的端口（默认 5177；0 = 随机空闲端口） |
| `--hook` | 根据 prompt-submit 钩子传入的 JSON，将一个 sidecar 任务加入队列 |
| `--last` | 显示最近一次未过期的 sidecar 纠正 |
| `--copy` | 把最近一次纠正后的句子复制到剪贴板 |
| `--ask` | 针对最近一次 sidecar 纠正提问 |
| `--clear` | 删除最近一次 sidecar 纠正 |
| `--check` | （update）只报告版本；有新版时以 1 退出 |
| `-h, --help` | 显示帮助 |
| `-v, --version` | 显示版本 |

**平台：** 完整支持 macOS 和 Linux。在 Windows 上，`ollama` 和 `api` 后端可以原生运行，但 AI CLI 类后端和 `-c/--command` 需要 POSIX shell，请在 WSL 下运行 fixen。

</details>

<details>
<summary><b>更新</b></summary>

### 更新

```sh
fixen update            # 升级包，然后用新版本重写规则
fixen update --check    # 只比较版本（有新版时以 1 退出），可放心用在脚本里
```

`npm install -g fixen-cli@latest` 只会替换可执行文件：`RULE.md` 和各个 CLI 里的那一行，仍保留写入它们的那个版本的措辞。`fixen update` 两件事都会做。它会根据安装路径识别你的包管理器（npm、pnpm、yarn、bun；可用 `FIXEN_UPDATE_CMD` 覆盖），完成升级后，再用*新*的可执行文件重新运行 `install`，让规则和新代码保持一致。通过 `git` 检出或通过 `npm link` 链接的本地副本不会被覆盖：它只会告诉你副本在哪里，并且只刷新规则。

</details>

<details>
<summary><b>聊天模式：在 AI CLI 中自动纠错</b></summary>

### 聊天模式：在 AI CLI 中自动纠错

`fixen install` 会把完整规则**一次性**写入 `~/.config/fixen/RULE.md`，检测已安装了哪些 AI CLI，然后在每个 CLI 的全局指令里只加**一行带标记的内容**：规则的精简版，加上指向规则文件的引用。之后，你的日常对话末尾就会变成这样：

```console
$ fixen install
rule  ~/.config/fixen/RULE.md
ok    claude: ~/.claude/CLAUDE.md  (one line added)
ok    codex:  ~/.codex/AGENTS.md   (one line added)
ok    gjc:    ~/.gjc/agent/AGENTS.md (one line added)

$ gjc -p "hey what is capital of france? my dream is go to paris someday"
The capital of France is Paris. ...

> **fixen** · My dream is **to** go to Paris someday.
> ↳ '가다'는 to부정사로 — go → to go
```

问的是 Kubernetes，顺便把英文也练好了。

内置了 **claude、codex、gjc、gemini、qwen、opencode、windsurf、goose、crush 和 cline** 的全局指令文件路径，只会修改实际已安装工具的指令文件。用的是别的工具？直接指定它的指令文件就行（会记录在清单里，`uninstall` 时也会一并清理）：

```sh
fixen install -f ~/.someai/INSTRUCTIONS.md
```

一些让它不打扰你的细节：

- 只在*你自己*写的内容有错时才触发。正确的句子、粘贴的代码、日志和引用都不会被修改。
- `fixen install -t Japanese` 改为检查日语；`-e -l Korean` 会附上一行韩语说明原因（`fixen install -t English -e -l Korean`）。
- 你原有的 CLAUDE.md/AGENTS.md 内容不会被修改：装的时候加一行带标记的内容，卸的时候删掉这一行。对 Claude Code，这一行用的是原生的 `@~/.config/fixen/RULE.md` 导入，完整规则会自动内联进去。
- `fixen uninstall` 会清除所有痕迹（引用行、规则文件和快捷键）；`fixen status` 显示它在哪些地方生效。重复运行 `install` 是幂等的，还会就地升级旧式安装；每次版本升级后，[`fixen update`](#更新) 会帮你自动做这件事。
- `install` 会根据当前看到的参数和配置重新生成规则，所以在 `fixen install -t Japanese -e` 之后再跑一次不带参数的 `fixen install`，会回到默认设置。与其每次重输参数，不如把 `"target"`、`"lang"` 和 `"explain"` 写进 `config.json`。
- 对新的对话会话生效。

</details>

<details>
<summary><b>即时 sidecar 通知</b></summary>

### 即时 sidecar 通知

回复末尾的纠正方便你继续追问，但要等主 agent 回复完才会出现。sidecar 会在提交 prompt 时独立跑同一套学习流程，所以即使编码任务很慢，纠正也不会被拖延：

```text
prompt submitted
├─ AI agent → normal work → footer when the reply finishes
└─ fixen sidecar → correction result
   ├─ Senpi → compact native `fixen` row after the agent settles
   └─ other tools → desktop notification as soon as it is ready
```

也可以直接使用这些命令：

```sh
fixen --notify -e -l Korean "why this doesn't works?"
fixen --notify --json "why this doesn't works?"   # 结构化输出，方便集成
fixen --last
fixen --copy
fixen --ask "왜 work로 고쳤어?"
fixen --clear
```

`--notify` 在调用后端之前，会先过滤掉生成的上下文、代码、日志、引用、URL 和常见的密钥赋值。本来就很自然的文字不会触发通知。保存到私有文件 `~/.config/fixen/last-correction.json` 的，只有被选中纠正的那段原文，而不是完整的对话 prompt。这条记录 24 小时后过期，每次新结果都会覆盖上一次。`--last` 会显示它，`--ask` 会把这条最小化的纠正连同你的问题发给配置好的后端，`--clear` 会立即删除它。设置 `FIXEN_SIDECAR_NO_STORE=1` 可以不保存新结果；之前已保存的纠正不受影响。

如果装了 Senpi，`fixen install` 还会安装一个原生输入扩展。它在提交 prompt 时启动同一个 sidecar，等主 agent 结束后，在对话记录里加一行紧凑、跟随主题配色的结果：

```text
fixen Is Fixen okay? · Natural question order
```

标签、纠正后的句子和第一条原因使用不同的语义颜色，看起来和 Senpi 内置的工具行一样好认。展开这一行可以看到原文和其余原因。这一行只是 TUI 里的会话条目，永远不会加入模型上下文。

如果 AI 工具支持 prompt-submit 钩子，把钩子命令配置成：

```sh
fixen --hook -e -l Korean
```

工具会通过 stdin 传入事件 JSON。`fixen --hook` 接受文档中定义的 prompt 字段或 Kiro 的 `USER_PROMPT`，对格式错误或超过 64 KiB 的事件直接拒绝，不会阻塞对话；然后排入一个经过过滤的私有任务，并立即退出。分离出的 worker 默认超时 8 秒，不重试，所以绝不会拖长主 agent 的运行；超出 1 到 600 秒范围的值会回退为 8 秒。在 Kiro 上，用这个命令创建一个 **UserPromptSubmit → command** 类型的 Agent Hook 即可。

如果想用混合模式，把末尾纠正的规则作为单独的 agent hook 保留下来。这样纠正会留在对话里，方便自然地追问，通知则独立送达。已有的 CLI 集成仍然可以用 `fixen install`；对于 Kiro steering，可以明确指定生成规则的目标位置：

```sh
fixen install -e -l Korean -f .kiro/steering/fixen.md
```

桌面通知最先显示实际改动（`its → it's`），然后是纠正后的句子，最后是原因。`FIXEN_NOTIFY_DISABLE=1` 只保存不显示，`FIXEN_CORRECTION_TTL` 修改记录的有效期（最长七天），`FIXEN_SIDECAR_TIMEOUT` 修改 worker 的截止时间。

通知优先通过 `PATH` 上的 `terminal-notifier` 发送（`brew install terminal-notifier`），没有的话回退到 macOS 内置通知，Linux 上则用 `notify-send`。terminal-notifier 是可选的，但值得装：横幅会分组，新纠正会替换上一张卡片而不是层层堆叠，**点击横幅就会把纠正后的句子复制到剪贴板**，`FIXEN_NOTIFY_ICON` 可以换成你自己的图片，`FIXEN_NOTIFY_IGNORE_DND=1` 可以在勿扰模式下照样显示横幅。在终端里用 `fixen --copy` 也能做同样的复制。

> **macOS 横幅失败时不会报错。** 横幅归属于发出它的那个应用，即 **terminal-notifier**，或在回退到 `osascript` 时归属于 **Script Editor**，而不是 fixen 本身。如果在 **System Settings → Notifications**（系统设置 → 通知）里关掉了那个应用，或者开着某个专注模式，macOS 会直接丢掉横幅，却依然返回成功；fixen 没法察觉这种情况。`FIXEN_NOTIFY_IGNORE_DND=1` 能解决专注模式的问题；无论哪种情况，纠正都已经保存了，所以 `fixen --last` 能告诉你那条没出现的横幅本来要说什么。

</details>

<details>
<summary><b>历史面板 (GUI)</b></summary>

### 历史面板 (GUI)

一次性纠错、stdin、交互模式、polish，以及被保存的 sidecar 运行结果，都会追加到一个私有历史文件里（`~/.config/fixen/history.jsonl`，`0600`）。每条记录最多 64 KiB，历史最多保留最新的 500 条或 8 MiB。多个 fixen 进程同时运行时会串行写入，不会互相覆盖。设置 `FIXEN_NO_HISTORY=1` 可关闭 sidecar 以外的历史记录，设置 `FIXEN_SIDECAR_NO_STORE=1` 可不保存 sidecar 结果。`fixen --gui` 会把这个文件变成一个本地学习面板：

```sh
fixen --gui              # 在 127.0.0.1:5177 上启动并打开浏览器
fixen --gui --port 0     # 随机选一个空闲端口
FIXEN_GUI_NO_OPEN=1 fixen --gui   # 启动但不打开浏览器
```

页面是一个零依赖的 HTML 文件，只在 `127.0.0.1` 上提供服务。每次启动都会生成一个无法猜到的 URL token，所有 API 请求都必须带上它，防止无关网页读取或篡改历史。页面包括：手动输入英文/韩文的纠错框（按 `Cmd/Ctrl+Enter` 提交），后端/模型/推理强度选择器，以及一条时间线。时间线支持词级 diff 高亮、每处改动的原因、一键复制纠正后的句子、针对每条纠正的追问（像 `--ask` 一样走你配置的后端），还有删除/清空操作。

后端选择器会检测并复用已登录的 GJC、Claude Code、Codex、Gemini 和 Ollama。OpenAI 兼容的服务商可以填写 base URL、模型 ID 和 API key 来配置；内置了 DeepSeek、Groq、OpenRouter 和 OpenAI 的预设。API key 不会写进 `config.json`，而是以 `0600` 权限保存在本地的 `~/.config/fixen/credentials.json`。

</details>

<details>
<summary><b>全局快捷键 (macOS)</b></summary>

### 全局快捷键 (macOS)

```sh
fixen hotkey
```

这会安装一个 **"Fix with fixen" 快速操作**（`~/Library/Services`），并绑定 **⌃⌥⌘F**：在任意应用里选中文字（Slack、Mail、浏览器里的输入框都行），按下快捷键，改好的文字会**直接替换选中内容**。替换由 macOS 服务本身完成（和内置的 Transformations 菜单是同一套机制），所以 fixen 不需要辅助功能权限，也从不模拟按键。服务会用你配置的后端运行，最长 45 秒；也可以通过右键 → 服务菜单来纠错。

- 修改快捷键：System Settings → Keyboard → Keyboard Shortcuts → Services → Text → Fix with fixen（系统设置 → 键盘 → 键盘快捷键 → 服务 → 文本 → Fix with fixen）。
- `FIXEN_HOTKEY_NO_REGISTER=1 fixen hotkey` 只安装服务，不改动你的快捷键设置。
- `fixen uninstall` 会连同其他内容一起删除这个快速操作。
- 服务第一次在某个应用里替换文字前，macOS 会询问一次，这是正常的。
- 如果服务菜单里的 **Fix with fixen** 没有显示快捷键（在 macOS 26 上遇到过），就按上面的路径在键盘快捷键里手动设一次 ⌃⌥⌘F。

</details>

<details>
<summary><b>后端：自定义命令、API、OpenAI 推理模型</b></summary>

### 后端

按以下顺序自动检测：`claude` → `codex` → `gjc` → `gemini` → `ollama` → `api`（需设置 API key）。也可以用 `-b` 明确指定：

| 后端  | 调用方式                                        |
| -------- | ------------------------------------------- |
| `claude` | `claude -p`（Claude Code）                   |
| `codex`  | `codex exec`（OpenAI Codex CLI）             |
| `gjc`    | `gjc -p --no-tools`，可选 GJC 模型 |
| `gemini` | `gemini -p`（Gemini CLI）                    |
| `ollama` | `ollama run <model>`，本地离线运行（`fixen -b ollama -m llama3.1 "he dont know nothing"`） |
| `api`    | 任何 OpenAI 兼容的 `/chat/completions`   |
| `openai` | OpenAI `/responses`，用于推理模型       |

#### 自定义命令

任何读入 prompt 并输出回答的程序都可以：

```sh
fixen -c 'my-llm --quiet {prompt}' "its a beautiful day"   # {prompt} → 替换为 prompt，已安全转义
fixen -c 'my-llm --stdin'          "its a beautiful day"   # 没有 {prompt} → prompt 通过 stdin 传入
```

#### API 后端

```sh
export FIXEN_API_KEY=sk-...
export FIXEN_API_URL=https://api.openai.com/v1   # 或任何 OpenAI 兼容的服务器
export FIXEN_MODEL=gpt-4o-mini
fixen -b api "sentence"
```

#### OpenAI 推理模型 (gpt-5.6-pro)

`pro` 档位的模型只能通过 OpenAI 的 `/responses` 端点调用，并且不接受 `/chat/completions` 用的采样参数，所以单独做了一个后端：

```sh
export FIXEN_API_KEY=sk-...
fixen -b openai -m gpt-5.6-pro "its a beautiful day"
fixen -b openai -m gpt-5.6-pro -r high --polish "sorry for late reply"
```

`-m` 是必填的。pro 档位比 mini 贵得多，所以 fixen 绝不会替你选它。`-r/--reasoning`（`none|minimal|low|medium|high`）是可选的，不设置时用模型自己的默认值。请求会带上 `store: false`，你的文字不会保留在 OpenAI 后台里。

推理模型会先思考再回答，所以这个后端默认等待 600 秒（可用 `FIXEN_API_TIMEOUT` 覆盖）。这对一次性纠错、`--polish`、快捷键和面板来说没问题。但聊天 sidecar（`--hook` / `--notify`）仍会在 `FIXEN_SIDECAR_TIMEOUT` 秒后中止 worker（默认 8 秒，最多 600 秒），所以让 sidecar 用 pro 模型之前，先把这个值调大。

</details>

<details>
<summary><b>配置和环境变量</b></summary>

### 配置

默认配置放在 `~/.config/fixen/config.json`：

```json
{ "backend": "claude", "model": null, "reasoning": null, "command": null, "lang": "Korean", "target": "English", "explain": true }
```

环境变量会覆盖配置，CLI 参数优先级最高（`--no-explain` 可以在单次运行中关掉配置里开启的 `explain`）。后端调用失败会重试一次；可用 `FIXEN_RETRIES` 调整（设为 0 关闭重试）。分离出的通知 worker 会根据经过校验的 `FIXEN_SIDECAR_TIMEOUT`（默认 8 秒，最多 600 秒）同时设置后端和 API 的截止时间，到期后终止整个 POSIX 进程组。

| 变量 | 含义 |
| -------- | ------- |
| `FIXEN_BACKEND` | 默认后端名 |
| `FIXEN_BACKEND_CMD` | 默认自定义命令模板 |
| `FIXEN_TARGET` | 默认要纠正的语言 |
| `FIXEN_LANG` | 默认的解释语言 |
| `FIXEN_EXPLAIN` | `1`/`true` 表示默认附带解释 |
| `FIXEN_MODEL` | 默认模型（codex/ollama/api/openai） |
| `FIXEN_REASONING` | `openai` 后端的默认推理强度 |
| `FIXEN_API_URL` | OpenAI 兼容的 base URL（默认：`api.openai.com/v1`） |
| `FIXEN_API_KEY` | `api` 和 `openai` 后端使用的 API key |
| `FIXEN_API_TIMEOUT` | HTTP 后端的超时秒数（默认 120；openai 为 600；0 = 永不超时） |
| `FIXEN_BACKEND_TIMEOUT` | CLI/自定义后端的超时秒数（默认 0 = 永不超时） |
| `FIXEN_RETRIES` | 每次后端失败后的重试次数（默认 1；0 = 不重试） |
| `FIXEN_SIDECAR_TIMEOUT` | 分离 worker 的超时，1 到 600 秒（默认 8） |
| `FIXEN_CORRECTION_TTL` | 已保存纠正的有效期，单位秒（默认 86400；最大 604800） |
| `FIXEN_SIDECAR_NO_STORE` | `1`/`true` 表示只通知、不保存纠正 |
| `FIXEN_NO_HISTORY` | `1`/`true` 表示一次性、stdin、交互和 polish 运行不写入历史 |
| `FIXEN_NOTIFY_DISABLE` | `1`/`true` 表示保存 sidecar 结果但不弹桌面通知 |
| `FIXEN_NOTIFY_ICON` | 用这张图片代替通知程序自带的图标 |
| `FIXEN_NOTIFY_IGNORE_DND` | `1`/`true` 表示勿扰模式下也显示横幅 |
| `FIXEN_GUI_NO_OPEN` | `1`/`true` 表示启动 `--gui` 时不打开浏览器 |
| `FIXEN_HOTKEY_NO_REGISTER` | `1`/`true` 表示不绑定默认的 ⌃⌥⌘F 快捷键 |
| `FIXEN_REGISTRY` | `update` 使用的 npm registry（默认：registry.npmjs.org） |
| `FIXEN_UPDATE_CMD` | 自定义升级命令；必须包含 `{spec}` → `fixen-cli@<checked-version>` |
| `FIXEN_DEBUG` | 设为 `1` 时，遇到意外错误会打印堆栈 |

</details>

## 许可证

[MIT](LICENSE)
