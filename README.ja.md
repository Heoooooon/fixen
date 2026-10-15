# fixen

**手元の LLM で、英語 (もちろん他の言語も) をコマンドラインから添削。**

[![npm](https://img.shields.io/npm/v/fixen-cli)](https://www.npmjs.com/package/fixen-cli)
[![CI](https://github.com/Heoooooon/fixen/actions/workflows/ci.yml/badge.svg)](https://github.com/Heoooooon/fixen/actions/workflows/ci.yml)
[![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
![node](https://img.shields.io/badge/node-%E2%89%A518-brightgreen)
![deps](https://img.shields.io/badge/dependencies-0-orange)

[English](README.md) | [简体中文](README.zh-CN.md) | **日本語** | [한국어](README.ko.md)

<p align="center">
  <img src="docs/assets/demo.gif" alt="fixen 0.2.0 の実機録画。ターミナルでは fixen --polish が修正箇所を一覧し、直した英文と韓国語の文を表示します。TextEdit では選択した文が Control-Option-Command-F でその場で書き換わります。" width="860">
</p>

<p align="center"><sub>fixen 0.2.0 の実際の録画（モデルの待ち時間はカット） · <a href="docs/assets/demo.mp4">MP4 版</a></sub></p>

## クイックスタート

```sh
npm install -g fixen-cli    # `fixen` コマンドをインストール (Node.js ≥ 18)
fixen doctor                # バックエンド、保存先、クリップボード、通知をチェック
```

さっそく試してみましょう。

```sh
fixen "I has a apple"                                 # → I have an apple.
fixen -e -l Korean "She go to school yesterday"       # 修正の解説も韓国語で表示
fixen -t Japanese "私は昨日学校に行きたです"            # 英語に限らず、どの言語でも添削
```

[バックエンド](#バックエンドを選ぶ)が最低 1 つ必要です。ターミナルで `claude`、`codex`、`gjc`、`gemini`、`ollama` のどれかが動くなら、準備はもう完了しています。

## 3 つの使い方

### 1. ターミナルで

```sh
fixen "your english sentence"       # ワンショット
echo "your sentence" | fixen        # stdin / パイプ
fixen --polish "draft message"      # 人に送るメッセージを整える: 差分を表示してクリップボードへコピー
```

### 2. macOS のどこでも: グローバルホットキー

```sh
fixen hotkey
```

Slack、メール、ブラウザのテキストエリアなど、どのアプリでもテキストを選択して **⌃⌥⌘F** を押すと、添削後のテキストで **選択範囲がその場で置き換わります**。[詳細](#グローバルホットキー-macos)

### 3. AI チャットの中で: 自動添削

```sh
fixen install
```

これで、AI チャット CLI からの普段の返答の最後に、*あなた* が入力した文の添削が付くようになります。

```console
$ gjc -p "hey what is capital of france? my dream is go to paris someday"
The capital of France is Paris. ...

> **fixen** · My dream is **to** go to Paris someday.
> ↳ '가다'는 to부정사로 — go → to go
```

[詳細](#チャットモード-ai-cli-の中で添削)

## バックエンドを選ぶ

自動検出の順序は `claude` → `codex` → `gjc` → `gemini` → `ollama` → `api` (API キーが設定されている場合) です。明示的に選ぶなら `-b` を使います。

| バックエンド | 必要なもの | 向いているケース |
| -------- | ------------- | --------- |
| `claude` | Claude Code にサインイン済み (`claude -p`) | すでに Claude を契約している |
| `codex`  | OpenAI Codex CLI にサインイン済み (`codex exec`、`-m` 対応) | すでに ChatGPT / Codex を使っている |
| `gjc`    | GJC がインストール済み (`gjc -p --no-tools`、モデル選択可) | すでに GJC を使っている |
| `gemini` | Gemini CLI にサインイン済み (`gemini -p`) | 無料枠のクラウドモデルを使いたい |
| `ollama` | ローカルモデル (`ollama run <model>`) | ローカル・オフラインで動かしたい |
| `api`    | OpenAI 互換の `/chat/completions` 向けに `FIXEN_API_KEY` (+ `FIXEN_API_URL`、`FIXEN_MODEL`) | DeepSeek、Groq、OpenRouter、OpenAI、または自前のサーバー |
| `openai` | OpenAI `/responses` 向けに `FIXEN_API_KEY` と `-m` | `gpt-5.6-pro` などの推論モデル |
| `-c`     | プロンプトを読んで回答を出力するコマンドなら何でも | 上記以外すべて |

[バックエンドの詳細](#バックエンド)

## fixen を選ぶ理由

- **手持ちのモデルをそのまま使える、依存ゼロ。** 小さな CLI 1 つ (`node_modules` なし) が、添削用プロンプトをマシン上にあるツールへパイプで渡すだけ。アカウント登録は不要、API キーも使いたいときだけ、ベンダーロックインもありません。
- **作業しながら学べる。** チャットモードなら、入力したメッセージがそのまま無料のミニレッスンに。単語カードアプリを開く必要すらありません。
- **どの言語でも添削でき、変更はきれいに元に戻せる。** デフォルトは英語ですが、`-t` で日本語、フランス語、ドイツ語など何でも添削できます。`fixen uninstall` を実行すれば、変更したファイルはすべて元の状態にそのまま戻ります。

## プライバシー

- テキストが送られるのは **あなたが選んだバックエンドだけ** です。fixen は独自のサーバーを持たないので、ほかの場所に送られることはありません。
- 履歴は **手元のマシンに** 残ります (`~/.config/fixen/history.jsonl`、パーミッション `0600`)。`FIXEN_NO_HISTORY=1` で無効化でき、サイドカーの結果を残したくない場合は `FIXEN_SIDECAR_NO_STORE=1` を設定します。
- ダッシュボードから保存した API キーは `~/.config/fixen/credentials.json` (`0600`) に置かれ、`config.json` には書き込まれません。`openai` バックエンドは `store: false` を送信します。

## リファレンス

<details>
<summary><b>コマンドとオプション一覧</b></summary>

### コマンド

```sh
fixen "your english sentence"       # ワンショット
echo "your sentence" | fixen        # stdin / パイプ
fixen                               # 対話モード (1 行ずつ入力、Ctrl+D で終了)
fixen -e "sentence"                 # 修正内容の解説も表示
fixen -e -l Korean "sentence"       # 解説を韓国語で表示
fixen -t Japanese "日本語の文"        # 英語に限らず、どの言語でも添削
fixen -t Auto "안되는거 같아"         # 英語か韓国語かを自動判定
fixen --polish "draft message"      # 人に送るメッセージを整える: 差分を表示してクリップボードへコピー
fixen --notify -e "sentence"        # デスクトップ通知で添削結果を表示
fixen --last                        # 直近の通知の添削結果を表示
fixen doctor                        # バックエンド、保存先、クリップボード、通知をチェック
fixen --ask "why was this changed?" # その添削について質問
fixen --clear                       # 保存された添削結果を削除
fixen -- <words>                    # 以降の語をオプションとして解釈しない
```

サイドカーの操作は明示的な `--` オプションで指定するので、`fixen ask me tomorrow` や `fixen notify the team` のような普通の文は、そのまま添削対象の文として扱われます。

英語はあくまでデフォルトです。`-t/--target` (または `FIXEN_TARGET`、設定ファイルの `"target"`) で添削する言語を切り替えられます。たとえば `fixen -t French -e -l Korean "..."` なら、フランス語を添削して修正内容を韓国語で解説します。`-t Auto` を指定すると英語か韓国語かを自動判定し、履歴には `Auto` ではなく判定された言語が記録されます。

### オプション

| オプション | 意味 |
| ------ | ------- |
| `-b, --backend <name>` | `claude` \| `codex` \| `gjc` \| `gemini` \| `ollama` \| `api` \| `openai` (デフォルト: 自動検出、または設定ファイル / `FIXEN_BACKEND`) |
| `-c, --command <tmpl>` | カスタムシェルコマンド。`{prompt}` はプロンプトに展開され、ない場合はプロンプトが stdin にパイプされる |
| `-e, --explain` | 修正内容の解説も表示 (設定: `"explain": true`) |
| `--no-explain` | 設定で有効になっていても解説を表示しない |
| `-l, --lang <lang>` | 解説の言語 (デフォルト: English。例: Korean) |
| `-t, --target <lang>` | 添削する言語 (デフォルト: English。`Auto` = 英語または韓国語) |
| `-m, --model <model>` | claude/codex/gemini/ollama/api/openai バックエンドで使うモデル |
| `-r, --reasoning <e>` | (openai) 推論の強度: `none\|minimal\|low\|medium\|high` |
| `-f, --file <path>` | (install) 行を追加する指示ファイルを追加で指定 |
| `--notify` | 渡したテキストをサイドカーで添削して通知 |
| `--json` | (notify) 添削結果を 1 つの JSON オブジェクトとして出力 |
| `--polish` | 添削して変更点を表示し、クリップボードへコピー |
| `--gui` | 履歴ダッシュボードを 127.0.0.1 で配信して開く |
| `--port <n>` | (gui) 使用するポート (デフォルト 5177、0 = 空いているポートをランダムに選ぶ) |
| `--hook` | prompt-submit フックの JSON からサイドカーのジョブを登録 |
| `--last` | 期限切れでない最新のサイドカー添削結果を表示 |
| `--copy` | 最新の添削済みの文をクリップボードへコピー |
| `--ask` | 最新のサイドカー添削結果について質問 |
| `--clear` | 最新のサイドカー添削結果を削除 |
| `--check` | (update) バージョンを表示するだけ。古ければ終了コード 1 |
| `-h, --help` | ヘルプを表示 |
| `-v, --version` | バージョンを表示 |

**対応プラットフォーム:** macOS と Linux は完全対応です。Windows では `ollama` と `api` バックエンドはネイティブで動きますが、AI CLI 系のバックエンドと `-c/--command` は POSIX シェルが必要なので、WSL 上で fixen を実行してください。

</details>

<details>
<summary><b>アップデート</b></summary>

### アップデート

```sh
fixen update            # パッケージを更新し、新しいバージョンでルールを書き直す
fixen update --check    # バージョンを比較するだけ (古ければ終了コード 1)。スクリプトから使っても安全
```

`npm install -g fixen-cli@latest` で置き換わるのはバイナリだけです。`RULE.md` や各 CLI に追加した 1 行は、それを書き込んだバージョンの文面のまま残ります。`fixen update` はこの両方をまとめて行います。インストール先のパスからパッケージマネージャー (npm、pnpm、yarn、bun。`FIXEN_UPDATE_CMD` で上書き可) を判定して更新し、続けて *新しい* バイナリで `install` を再実行するので、ルールが新しいコードと揃います。`git`/`npm link` のチェックアウトは上書きしません。その場合はコピーの場所を表示し、ルールだけを更新します。

</details>

<details>
<summary><b>チャットモード: AI CLI の中で添削</b></summary>

### チャットモード: AI CLI の中で添削

`fixen install` は完全なルールを `~/.config/fixen/RULE.md` に **一度だけ** 書き出し、インストール済みの AI CLI を検出して、それぞれのグローバル指示ファイルに **マーカー付きの 1 行** だけを追加します。中身は、ルールの短縮版とルールファイルへの参照です。以降、普段のチャットの最後はこうなります。

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

Kubernetes について質問しながら、ついでに英語も上達します。

**claude、codex、gjc、gemini、qwen、opencode、windsurf、goose、crush、cline** のグローバル指示ファイルの場所は最初から把握していて、実際に存在するものだけに手を加えます。それ以外のツールを使っている場合は、指示ファイルを直接指定してください (マニフェストで管理されるので、`uninstall` でまとめて片付きます)。

```sh
fixen install -f ~/.someai/INSTRUCTIONS.md
```

出しゃばらないための工夫:

- 反応するのは *あなた自身が書いた文* に誤りがあるときだけです。正しい文、貼り付けたコード、ログ、引用には手を出しません。
- `fixen install -t Japanese` を実行すると日本語が添削対象になり、`-e -l Korean` を付けると修正理由が韓国語で 1 行表示されます (`fixen install -t English -e -l Korean`)。
- 既存の CLAUDE.md/AGENTS.md の内容には触れません。追加するのはマーカーで囲んだ 1 行、削除するのもその 1 行だけです。Claude Code ではネイティブの `@~/.config/fixen/RULE.md` インポートを使うので、完全なルールが自動で展開されます。
- `fixen uninstall` で痕跡 (参照の行、ルールファイル、ホットキー) をすべて削除できます。`fixen status` で有効になっている場所を確認できます。`install` は何度実行しても同じ結果になり、古い形式のインストールもその場で更新します。[`fixen update`](#アップデート) なら、バージョンアップのたびにこれを代わりにやってくれます。
- `install` は渡されたフラグと設定からルールを再生成します。そのため `fixen install -t Japanese -e` の後に素の `fixen install` を実行すると、デフォルトに戻ります。フラグを毎回打つ代わりに、`"target"`、`"lang"`、`"explain"` を `config.json` に書いておきましょう。
- 反映されるのは新しいチャットセッションからです。

</details>

<details>
<summary><b>サイドカーによる即時通知</b></summary>

### サイドカーによる即時通知

フッターは続けて質問するときの文脈として便利ですが、メインのエージェントの応答が完了するまで表示されません。サイドカーは同じ学習ループをプロンプト送信の時点で独立して回すので、時間のかかるコーディング作業があっても添削は遅れません。

```text
prompt submitted
├─ AI agent → normal work → footer when the reply finishes
└─ fixen sidecar → correction result
   ├─ Senpi → compact native `fixen` row after the agent settles
   └─ other tools → desktop notification as soon as it is ready
```

コマンドを直接使うこともできます。

```sh
fixen --notify -e -l Korean "why this doesn't works?"
fixen --notify --json "why this doesn't works?"   # 連携向けの構造化出力
fixen --last
fixen --copy
fixen --ask "왜 work로 고쳤어?"
fixen --clear
```

`--notify` はバックエンドを呼ぶ前に、自動生成された文脈、コード、ログ、引用、URL、API キーなどのシークレットを代入している行を除外します。すでに自然な文なら通知は出ません。保存されるのは添削対象として選ばれた元の抜粋そのものだけで、チャットのプロンプト全体は保存されません。保存先は非公開の `~/.config/fixen/last-correction.json` です。記録は 24 時間で期限切れになり、新しい結果が出るたびに前のものを置き換えます。`--last` で表示、`--ask` でその最小限の添削結果と質問を設定済みのバックエンドに送信、`--clear` ですぐに削除できます。`FIXEN_SIDECAR_NO_STORE=1` を設定すると新しい結果は保存されません。以前に保存された添削結果はそのまま残ります。

Senpi がインストールされていれば、`fixen install` はネイティブの入力拡張もインストールします。プロンプト送信時に同じサイドカーを起動し、メインのエージェントが落ち着いた後に、テーマに合わせたコンパクトな行をトランスクリプトに 1 行追加します。

```text
fixen Is Fixen okay? · Natural question order
```

ラベル、添削後の文、最初の理由はそれぞれ別のセマンティックカラーで表示されるので、Senpi の組み込みツールの行と同じ感覚で見分けられます。行を展開すると、元のテキストと追加の理由が表示されます。この行は TUI 専用のセッションエントリで、モデルのコンテキストには一切追加されません。

prompt-submit フックを持つ AI ツールでは、フックのコマンドを次のように設定します。

```sh
fixen --hook -e -l Korean
```

ツールはイベントの JSON を stdin で渡します。`fixen --hook` はドキュメント化されたプロンプトのフィールドか Kiro の `USER_PROMPT` を受け付け、不正な形式や 64 KiB を超えるイベントはチャットを止めずに破棄し、フィルター済みの非公開ジョブを登録してすぐに終了します。切り離されたワーカーのタイムアウトはデフォルトで 8 秒、リトライはしないので、メインのエージェントの実行を引き延ばすことはありません。1〜600 秒の範囲外の値は 8 秒に戻ります。Kiro では、このコマンドで **UserPromptSubmit → command** の Agent Hook を作成してください。

ハイブリッドモードにするなら、フッターのルールは別のエージェントフックとして残しておきます。こうすると、会話の中に添削が残って自然に続けて質問でき、通知はそれとは別に届きます。既存の CLI 連携は引き続き `fixen install` が使えます。Kiro の steering には、生成されるルールの出力先を明示的に指定できます。

```sh
fixen install -e -l Korean -f .kiro/steering/fixen.md
```

デスクトップ通知では、まず実際の修正 (`its → it's`)、次に添削後の文、最後に理由が表示されます。`FIXEN_NOTIFY_DISABLE=1` で表示せずに保存だけを行い、`FIXEN_CORRECTION_TTL` で記録の保存期間 (最大 7 日) を、`FIXEN_SIDECAR_TIMEOUT` でワーカーの期限を変更できます。

通知の配信には、`PATH` 上にあれば `terminal-notifier` (`brew install terminal-notifier`) を使い、なければ macOS 標準の通知に、Linux では `notify-send` にフォールバックします。terminal-notifier は必須ではありませんが、入れる価値はあります。バナーがグループ化されて新しい添削が前のカードを置き換えるので積み重ならず、**バナーをクリックすると添削後の文がクリップボードにコピーされ**、`FIXEN_NOTIFY_ICON` で好きな画像に差し替えられ、`FIXEN_NOTIFY_IGNORE_DND=1` でおやすみモード中でもバナーを表示できます。ターミナルからは `fixen --copy` で同じコピーができます。

> **macOS ではバナーが表示されなくてもエラーが返らないことがあります。** バナーは送信元のアプリ (**terminal-notifier**、または `osascript` へのフォールバック時は **スクリプトエディタ**) に紐づき、fixen 自身には紐づきません。そのアプリが **システム設定 → 通知** でオフになっていたり、集中モードが有効だったりすると、macOS はバナーを破棄したうえで成功を返すため、fixen には検知できません。集中モードについては `FIXEN_NOTIFY_IGNORE_DND=1` で対処できます。どちらにしても添削結果は保存されるので、表示されなかったバナーの内容は `fixen --last` で確認できます。

</details>

<details>
<summary><b>履歴ダッシュボード (GUI)</b></summary>

### 履歴ダッシュボード (GUI)

ワンショット、stdin、対話モード、polish、保存されたサイドカーの実行による添削結果は、非公開の履歴ファイル (`~/.config/fixen/history.jsonl`、`0600`) に追記されます。1 件あたりの上限は 64 KiB、履歴は最新の 500 件または 8 MiB までを保持します。複数の fixen プロセスが同時に動いても更新は順番に処理されるので、互いに上書きすることはありません。サイドカー以外の履歴を無効にするには `FIXEN_NO_HISTORY=1`、サイドカーの結果を残さないようにするには `FIXEN_SIDECAR_NO_STORE=1` を設定します。`fixen --gui` を使うと、このファイルがローカルの学習ダッシュボードになります。

```sh
fixen --gui              # 127.0.0.1:5177 で配信してブラウザを開く
fixen --gui --port 0     # 空いているポートをランダムに選ぶ
FIXEN_GUI_NO_OPEN=1 fixen --gui   # ブラウザを開かずに起動
```

ページは依存ゼロの HTML ファイル 1 つで、`127.0.0.1` でのみ配信されます。起動のたびに推測不能な URL トークンが生成され、すべての API リクエストでそのトークンの提示が必須なので、無関係な Web ページが履歴を読んだり書き換えたりすることはできません。英語/韓国語の手動添削ボックス (`Cmd/Ctrl+Enter` で送信)、バックエンド/モデル/推論強度のセレクター、そしてタイムラインを備えています。タイムラインでは単語単位の差分ハイライト、各修正の理由、添削後の文のワンクリックコピー、添削ごとのフォローアップ質問 (`--ask` と同じく設定済みのバックエンド経由)、削除/全消去の操作が使えます。

バックエンドのセレクターでは、インストール済みで利用可能な GJC、Claude Code、Codex、Gemini、Ollama を自動検出して選択できます。OpenAI 互換のプロバイダーは、ベース URL、モデル ID、API キーで設定でき、DeepSeek、Groq、OpenRouter、OpenAI のプリセットも用意しています。API キーは `config.json` には入れず、`~/.config/fixen/credentials.json` にパーミッション `0600` でローカル保存されます。

</details>

<details>
<summary><b>グローバルホットキー (macOS)</b></summary>

### グローバルホットキー (macOS)

```sh
fixen hotkey
```

**「Fix with fixen」クイックアクション** (`~/Library/Services`) をインストールし、**⌃⌥⌘F** に割り当てます。Slack、メール、ブラウザのテキストエリアなど、どのアプリでもテキストを選択してショートカットを押すと、添削後のテキストで **選択範囲がその場で置き換わります**。置き換えは macOS のサービス機能そのもの (標準の変換メニューと同じ仕組み) が行うので、fixen にアクセシビリティの権限は不要で、キー入力をシミュレートすることもありません。サービスが設定済みのバックエンドの応答を待つ時間は、最大 45 秒です。右クリック → サービス メニューからも添削できます。

- ショートカットの変更: システム設定 → キーボード → キーボードショートカット → サービス → テキスト → Fix with fixen
- `FIXEN_HOTKEY_NO_REGISTER=1 fixen hotkey` なら、ショートカット設定に触れずにサービスだけをインストールします。
- `fixen uninstall` で、他のものと一緒にクイックアクションも削除されます。
- サービスがテキストを置き換える前に、macOS がアプリごとに一度だけ確認を求めます。この最初の確認は想定どおりの動作です。
- サービスメニューの **Fix with fixen** にショートカットが表示されない場合 (macOS 26 で確認)、上記のキーボードショートカット設定で ⌃⌥⌘F を一度割り当ててください。

</details>

<details>
<summary><b>バックエンド: カスタムコマンド、API、OpenAI 推論モデル</b></summary>

### バックエンド

自動検出の順序は `claude` → `codex` → `gjc` → `gemini` → `ollama` → `api` (API キーが設定されている場合) です。明示的に選ぶなら `-b` を使います。

| バックエンド | 使うもの                                        |
| -------- | ------------------------------------------- |
| `claude` | `claude -p` (Claude Code)                   |
| `codex`  | `codex exec` (OpenAI Codex CLI)             |
| `gjc`    | `gjc -p --no-tools` (GJC のモデルを選択可) |
| `gemini` | `gemini -p` (Gemini CLI)                    |
| `ollama` | `ollama run <model>`。ローカル、オフライン (`fixen -b ollama -m llama3.1 "he dont know nothing"`) |
| `api`    | OpenAI 互換の任意の `/chat/completions`   |
| `openai` | OpenAI `/responses`。推論モデル       |

#### カスタムコマンド

プロンプトを読んで回答を出力するものなら、何でも使えます。

```sh
fixen -c 'my-llm --quiet {prompt}' "its a beautiful day"   # {prompt} → 安全にクォートされたプロンプト
fixen -c 'my-llm --stdin'          "its a beautiful day"   # {prompt} なし → プロンプトを stdin にパイプ
```

#### API バックエンド

```sh
export FIXEN_API_KEY=sk-...
export FIXEN_API_URL=https://api.openai.com/v1   # または任意の OpenAI 互換サーバー
export FIXEN_MODEL=gpt-4o-mini
fixen -b api "sentence"
```

#### OpenAI 推論モデル (gpt-5.6-pro)

`pro` 系のモデルは OpenAI の `/responses` エンドポイントでしか提供されず、`/chat/completions` が受け付けるサンプリングパラメーターも拒否するため、専用のバックエンドを用意しています。

```sh
export FIXEN_API_KEY=sk-...
fixen -b openai -m gpt-5.6-pro "its a beautiful day"
fixen -b openai -m gpt-5.6-pro -r high --polish "sorry for late reply"
```

`-m` は必須です。pro 系は mini 系よりはるかに高額なので、fixen が勝手に選ぶことはありません。`-r/--reasoning` (`none|minimal|low|medium|high`) は任意で、指定しなければモデル自身のデフォルトに任せます。リクエストは `store: false` 付きで送るので、文章が OpenAI のダッシュボードに残ることはありません。

推論モデルは回答の前に考えるため、このバックエンドはデフォルトで 600 秒待ちます (`FIXEN_API_TIMEOUT` で上書き可)。ワンショット、`--polish`、ホットキー、ダッシュボードならこれで問題ありません。ただしチャットのサイドカー (`--hook` / `--notify`) は、引き続き `FIXEN_SIDECAR_TIMEOUT` 秒 (デフォルト 8、最大 600) でワーカーを打ち切ります。サイドカーで pro モデルを使う前に、この値を引き上げておきましょう。

</details>

<details>
<summary><b>設定と環境変数</b></summary>

### 設定

デフォルト値は `~/.config/fixen/config.json` に置きます。

```json
{ "backend": "claude", "model": null, "reasoning": null, "command": null, "lang": "Korean", "target": "English", "explain": true }
```

環境変数は設定ファイルより優先され、CLI フラグはすべてに優先します (`--no-explain` を付ければ、設定で有効にした `explain` をその 1 回だけ無効にできます)。バックエンドの呼び出しに失敗した場合は 1 回だけリトライします。`FIXEN_RETRIES` で調整でき、0 にするとリトライしません。切り離された通知ワーカーは、検証済みの `FIXEN_SIDECAR_TIMEOUT` (デフォルト 8 秒、最大 600) からバックエンドと API の両方の期限を設定し、期限を過ぎると POSIX プロセスグループ全体を終了させます。

| 変数 | 意味 |
| -------- | ------- |
| `FIXEN_BACKEND` | デフォルトのバックエンド名 |
| `FIXEN_BACKEND_CMD` | デフォルトのカスタムコマンドのテンプレート |
| `FIXEN_TARGET` | デフォルトの添削対象の言語 |
| `FIXEN_LANG` | デフォルトの解説の言語 |
| `FIXEN_EXPLAIN` | `1`/`true` でデフォルトで解説を表示 |
| `FIXEN_MODEL` | デフォルトのモデル (codex/ollama/api/openai) |
| `FIXEN_REASONING` | `openai` バックエンドのデフォルトの推論強度 |
| `FIXEN_API_URL` | OpenAI 互換のベース URL (デフォルト: `api.openai.com/v1`) |
| `FIXEN_API_KEY` | `api` と `openai` バックエンドの API キー |
| `FIXEN_API_TIMEOUT` | HTTP バックエンドがあきらめるまでの秒数 (デフォルト 120、openai は 600、0 = 無制限) |
| `FIXEN_BACKEND_TIMEOUT` | CLI/カスタムバックエンドがあきらめるまでの秒数 (デフォルト 0 = 無制限) |
| `FIXEN_RETRIES` | バックエンド失敗ごとのリトライ回数 (デフォルト 1、0 = リトライしない) |
| `FIXEN_SIDECAR_TIMEOUT` | 切り離されたワーカーのタイムアウト。1〜600 秒 (デフォルト 8) |
| `FIXEN_CORRECTION_TTL` | 保存した添削結果の有効期間 (秒。デフォルト 86400、最大 604800) |
| `FIXEN_SIDECAR_NO_STORE` | `1`/`true` で添削結果を残さずに通知だけ行う |
| `FIXEN_NO_HISTORY` | `1`/`true` でワンショット、stdin、対話モード、polish の実行を履歴に残さない |
| `FIXEN_NOTIFY_DISABLE` | `1`/`true` でデスクトップ通知を出さずにサイドカーの結果を保存 |
| `FIXEN_NOTIFY_ICON` | 通知ツール自身のアイコンの代わりに表示する画像のパス |
| `FIXEN_NOTIFY_IGNORE_DND` | `1`/`true` でおやすみモード中でもバナーを表示 |
| `FIXEN_GUI_NO_OPEN` | `1`/`true` でブラウザを開かずに `--gui` を起動 |
| `FIXEN_HOTKEY_NO_REGISTER` | `1`/`true` でデフォルトの ⌃⌥⌘F ショートカットの割り当てをスキップ |
| `FIXEN_REGISTRY` | `update` で使う npm レジストリ (デフォルト: registry.npmjs.org) |
| `FIXEN_UPDATE_CMD` | カスタムの更新コマンド。`{spec}` → `fixen-cli@<checked-version>` を含める必要あり |
| `FIXEN_DEBUG` | `1` で予期しないエラー時にスタックトレースを出力 |

</details>

## ライセンス

[MIT](LICENSE)
