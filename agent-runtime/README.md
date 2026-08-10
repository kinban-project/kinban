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

恒久的な `KINBAN_API_KEY` は互換用に残しています。通常はKINBANの管理者画面から、対象グループ・用途・有効期限が付いた短期トークンを発行し、`.env` の `KINBAN_DELEGATION_TOKEN` に設定します。

短期トークンは `POST /api/groups/{groupId}/assistant/context` で発行します。発行者のグループ権限をもとにスコープが決まり、用途は `agent-runtime` に固定されます。期限は5〜15分で、期限切れ・失効済み・無効化されたアシスタントはMCP側で拒否されます。

`KINBAN_DELEGATION_TOKEN` が設定されている場合は `KINBAN_API_KEY` より優先されます。トークンはGitやログへ保存しないでください。

## 利用量

実行日時、利用者区分、モデル、成功・失敗、トークン量、`pricingProfileId`、概算コストをKINBANの `agent_usage_records` に保存します。単価は `pricing_profiles.json` で更新できます。初期プロファイルは `gpt-5.6-luna`、160円/USDです。

## セキュリティ

- APIキーとOpenAIキーは `.env` などのローカル設定だけに置きます。
- 短期トークンは対象グループ・用途・期限・スコープを毎回サーバー側で検証します。
- `confirm: true` は明示的な実行意思を示すだけで、権限を拡大しません。
- 接続パックやチャット本文をGit、Issue、共有ログへ貼り付けないでください。
