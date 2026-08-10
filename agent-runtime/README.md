# KINBAN Agent Runtime

KINBAN MCPに接続するローカル用の運営支援AIランタイムです。業務データをローカルへ複製せず、KINBANのMCPを正本として利用します。

## 起動

```powershell
cd agent-runtime
Copy-Item .env.example .env
# .env に OPENAI_API_KEY と接続先を設定
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r python-backend\requirements.txt
uvicorn main:app --app-dir python-backend --reload --port 8000
```

## KINBAN認証

恒久的な `KINBAN_API_KEY` は互換用に残しています。KINBAN画面から本人用AIアシストを起動すると、KINBANが現在のメンバー・グループに限定した短期トークンを発行し、ブラウザの一時メッセージでこのランタイムへ渡します。トークンはURL、localStorage、会話本文、`.env`へ保存しません。

短期トークンは `POST /api/groups/{groupId}/assistant/context` で発行します。発行者のグループ権限をもとにスコープが決まり、用途は `agent-runtime` に固定されます。期限は5〜15分で、期限切れ・失効済み・無効化されたアシスタントはMCP側で拒否されます。

`KINBAN_DELEGATION_TOKEN` が設定されている場合は `KINBAN_API_KEY` より優先されます。トークンはGitやログへ保存しないでください。

### 本人用AIアシストの画面連携

KINBAN側に `KINBAN_AGENT_RUNTIME_URL=http://localhost:8000` を設定すると、グループメニューに「AIアシスト」が表示されます。ボタンからランタイムを開くと、ランタイムは一時トークンをMCPで検証し、メモリ内セッションとHttpOnly Cookieを作成します。セッションは最大15分で、期限切れ・失効・メンバーの利用停止・アシスタント停止はMCP側で拒否されます。

ランタイム未設定の環境ではボタンを実行できません。本人用AIアシストではシフト希望、公開済みシフト、打刻・勤務申告、管理者への連絡、公開済み業務ガイドだけを扱い、シフト作成・割当・公開・勤務承認や他メンバーの情報は扱いません。

## 利用量

実行日時、利用者区分、モデル、成功・失敗、トークン量、`pricingProfileId`、概算コストをKINBANの `agent_usage_records` に保存します。単価は `pricing_profiles.json` で更新できます。初期プロファイルは `gpt-5.6-luna`、160円/USDです。

## セキュリティ

- APIキーとOpenAIキーは `.env` などのローカル設定だけに置きます。
- 短期トークンは対象グループ・用途・期限・スコープを毎回サーバー側で検証します。
- `confirm: true` は明示的な実行意思を示すだけで、権限を拡大しません。
- 接続パックやチャット本文をGit、Issue、共有ログへ貼り付けないでください。
