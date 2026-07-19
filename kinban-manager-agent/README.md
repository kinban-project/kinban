# KINBAN 運営支援AIテンプレート

このフォルダは、店舗・企業ごとの **運営支援AI** を管理者PCで動かすための正本テンプレートです。実行時はこのリポジトリの外へコピーし、KINBAN本体の開発用フォルダとは分けて開いてください。

運営支援AIが行うのは、状況確認、候補作成、要確認事項の整理です。シフト公開、勤怠承認・差戻し、月次承認、権限変更などの確定操作は、必ず人が確認してから行います。

## できること

- 希望締切、未提出、未処理メッセージ、勤怠異常候補の日次確認
- 希望枠、今回コメント、勤務条件を踏まえたシフト案と警告の作成
- 日次・月次勤怠の未処理、差戻し候補の整理
- KINBANアシスタントへのメンバー問い合わせに対する回答案の作成

実データの正本は常に KINBAN です。`workspace/` のメモやログを正本として扱ってはいけません。

## 初期化

PowerShellで、KINBANリポジトリ内のこのテンプレートから実行用フォルダを作成します。実行先はリポジトリ外にしてください。

```powershell
cd D:\coconara\codexhelp\kinban-manager-agent
.\scripts\bootstrap.ps1 -Destination "D:\kinban-manager-agent\サンプル店"
```

作成先では、次の順番で設定します。

1. `.env.example` を `.env` にコピーする。
2. KINBANの対象グループの管理者画面で「運営支援AIキー」を発行し、`.env` の `KINBAN_ASSISTANT_API_KEY` へ入力する。
3. 対象グループIDとMCP URLを `.env` に入力する。
4. `config/agent-config.example.json` を `config/agent-config.json` にコピーし、表示名や運用担当者名だけを設定する。
5. 読み取り専用の接続確認を実行する。

```powershell
.\scripts\verify-connection.ps1
```

接続確認はMCPの `list_groups` だけを呼びます。予定、勤怠、メッセージ、シフトを変更しません。

## Codex / ChatGPT Work での開始方法

実行用フォルダを独立したプロジェクトとして開き、最初に `AGENTS.md`、対象の `runbooks/`、実施する `skills/` を読ませます。例えば次のように依頼します。

> `AGENTS.md` と `skills/kinban-daily-operations/SKILL.md` を読んで、KINBANの変更を行わずに日次確認レポートを `workspace/reports/` に作成してください。確認が必要な操作は候補として分けてください。

MCP設定では、`.env` の `KINBAN_MCP_URL` をHTTP MCPサーバーURL、`KINBAN_ASSISTANT_API_KEY` を Bearer 認証のAI専用キーとして登録します。個人用APIキーは使用しません。

- 公開KINBAN: `https://<your-site>/api/mcp`
- ローカル開発: `http://localhost:3001/mcp`

## コンテキストの使い分け

### 運営コンテキスト

シフト案、全メンバーの希望、勤怠一覧などを読むときは、グループ管理者がKINBANの「運営コンテキスト発行」から発行した短期トークンを、その回の作業だけに渡します。`.env`、ログ、Git、スケジューラ設定へ保存してはいけません。

### メンバーコンテキスト

`claim_next_assistant_message` が返すコンテキストは、そのメッセージを送った本人専用です。他メンバーの情報や下書きシフトを読むために使ったり、運営コンテキストへ切り替えたりしてはいけません。

## 更新

KINBAN本体を更新した後、テンプレートの更新を実行用フォルダへ取り込む場合は次を実行します。

```powershell
cd D:\coconara\codexhelp\kinban-manager-agent
.\scripts\bootstrap.ps1 -Destination "D:\kinban-manager-agent\サンプル店" -Update
```

`-Update` は `.env`、`workspace/`、`runbooks/local/` を保持します。更新時には、作成・更新・変更なしのファイル一覧が表示されます。組織固有の判断基準は `runbooks/local/` に置き、テンプレート側の `runbooks/defaults/` は直接編集しないでください。

## フォルダの役割

| 場所 | 用途 |
| --- | --- |
| `AGENTS.md` | 常に守る役割・安全境界 |
| `skills/` | 繰り返し実行する業務手順 |
| `runbooks/defaults/` | テンプレート標準の判断基準。更新対象 |
| `runbooks/local/` | 店舗・企業ごとの判断基準。更新時も保持 |
| `jobs/` | 定期確認の入力・出力・失敗時の扱い |
| `config/` | 秘密値を含まない設定例 |
| `workspace/` | 実行結果、要確認事項、ローカル一時状態。Git管理外 |

## ここに入れてはいけないもの

- 実APIキー、運営コンテキスト、確認トークン
- メンバーの個人情報、メッセージ本文、勤怠明細のコピー
- 自動公開・自動承認を行うジョブ
- KINBAN本体のソースコード変更やデプロイ手順
