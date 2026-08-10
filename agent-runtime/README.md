# KINBAN Agent Runtime（第1段階）

KINBAN MCPへ接続する、ローカル限定のPython/FastAPIランタイムです。業務データは保持せず、KINBANのMCPを正本として利用します。`agent-runtime`をローカルで起動すると、`/`に簡易UI、`/api/chat`に実行API、`/health`に状態確認APIを提供します。

## 起動

```powershell
cd agent-runtime
Copy-Item .env.example .env
# .env に OPENAI_API_KEY と KINBAN_API_KEY を設定
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r python-backend\requirements.txt
uvicorn main:app --app-dir python-backend --reload --port 8000
```

`KINBAN_API_KEY`には対象グループに発行された運営支援AIキーを設定します。第1段階では固定キー・ローカル運用です。委任トークンやグループ単位の有効化は第2段階で扱います。

## 利用量と概算コスト

実行ごとに、実行日時・利用者区分・モデル・成否・処理時間・トークン量・`pricingProfileId`をKINBANの`agent_usage_records`へ保存します。初期プロファイルは`gpt-5.6-luna`、為替換算は160円/USDです。

`pricing_profiles.json`が単価設定の正本です。入力・出力単価が未設定の場合も実行記録は保存されますが、概算コストは空欄になります。単価を設定して再実行すると、設定されたプロファイルで概算できます。

## セキュリティ境界

- APIキーとOpenAIキーは`.env`などの無視対象ローカル設定だけに置きます。
- エージェントからKINBANのDB、画面、ファイルを直接操作しません。
- KINBAN側でグループ所属、キーのスコープ、アシスタントの有効状態を検証します。
- 第1段階では運営支援AIキーを持つローカル実行環境を前提とします。
