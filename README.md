# 勤番 KINBAN

シフトと勤怠を、ひとつに。

KINBANは、グループ単位のシフト希望、勤務枠の作成・割当・公開、打刻、勤務申告、承認、連絡をまとめて扱うWebアプリです。小規模な店舗やチームでの運用を想定した、セルフホスト型の試作プロジェクトです。

## 試す

- 公開デモ: <https://kinban-demo.chita256.chatgpt.site/>
- 利用ガイド: <https://working-buffet-fe0.notion.site/KINBAN-3b4a879cdbf081208738d71375768045>

公開デモはサンプルデータ用です。予告なく初期化されることがあり、実在の個人情報や機密情報は入力しないでください。

## 主な機能

- グループ作成・参加・メンバー管理
- 勤務希望の受付とコメント
- 担当・必要人数を指定した勤務枠の作成
- 希望・担当可能範囲・労務ルールを考慮したシフト割当
- 割当案の保存、比較、公開
- 打刻、勤務申告、日次・月次承認
- お知らせ、個別連絡、業務メモ、業務ガイド
- ダッシュボード、操作ログ、カレンダー表示
- API / MCPによる外部連携（利用環境で設定が必要）
- VAPID設定時のWeb Push通知

AIエージェント連携は任意機能です。AIの提案や自動処理は、管理者が内容を確認して運用する前提です。

## 技術構成

- Next.js / React / TypeScript
- vinext / Vite
- Cloudflare Workers
- Cloudflare D1
- Drizzle ORM

## ローカル開発

Node.js 22.13以降を使用します。

```bash
npm ci
npm run db:migrate:local
npm run db:seed:local
npm run dev -- --port 3003
```

ビルドとテスト：

```bash
npm run build
npm test
```

ローカル環境では、デモ用のクエリで利用者を切り替えられます。

```text
http://localhost:3003/?user=member02
```

本番相当の認証、メール送信、Web Push、外部AI連携には環境変数やシークレットの設定が必要です。値は `.env.local` またはデプロイ先のシークレットへ設定し、Gitへコミットしないでください。

## API・MCP

APIとMCPの利用方法は、起動後のAPIガイドと各環境の運用資料を確認してください。APIキーを利用する場合は、画面から発行したキーをBearerトークンとして送信します。キーの実体は保存時にハッシュ化されます。

MCPや外部エージェントからの書き込みは、接続先の認証・権限・確認手順を設定したうえで、管理者が結果を確認して運用してください。

## Web Push

通知を使う環境では、VAPID鍵を一度だけ生成し、公開鍵・秘密鍵ともGitへ入れずにデプロイ環境のシークレットへ設定します。

```bash
npm run push:generate-vapid
```

設定する値は `VAPID_SUBJECT`、`VAPID_PUBLIC_KEY`、`VAPID_PRIVATE_KEY` です。

## データと運用上の注意

- D1のスキーマは `db/schema.ts`、マイグレーションは `drizzle/` にあります。
- 公開デモのデータは検証用で、永続性や機密性を保証しません。
- 本プロジェクトは試作・alpha段階です。給与計算、法令適合、バックアップ、個人情報保護、監査要件を自動的に保証するものではありません。
- 実運用では、権限、バックアップ、復旧手順、通知先、法令上の要件を導入者が確認してください。

## ライセンスと問い合わせ

コードは [Apache License 2.0](LICENSE) で提供します。ロゴや名称の扱いはコードライセンスとは別に確認してください。

脆弱性の報告は、公開Issueではなく [SECURITY.md](SECURITY.md) の手順を利用してください。一般的な質問や連絡先は `info@kinban.jp` です。

## 開発への参加

変更提案やバグ報告については [CONTRIBUTING.md](CONTRIBUTING.md) を確認してください。
