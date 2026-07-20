# 勤番 KINBAN

シフト、勤怠管理をひとつに。

勤番（KINBAN）は、グループごとのシフト作成・割り当て・公開と、メンバーの勤務申告・管理者の承認をまとめて扱うWebアプリです。

## 公開サイト

- https://my-day-calendar.chita256.chatgpt.site/

デモ用サイトのため、予告なく終了する場合があります。登録情報の永続性や機密性は保証されません。

## 主な機能

- ChatGPTアカウントを使ったログイン
- グループ作成・参加申請・メンバー管理
- グループごとのニックネームと基本勤務希望
- 担当・人数を指定した勤務枠の作成と調整
- シフト希望の受付
- シフトへのメンバー割り当てと不足枠の可視化
- シフト公開・変更履歴・操作ログ
- お知らせ、既読状況、返信
- 勤務状態の打刻（勤務開始・休憩・勤務終了）
- 日次の勤務申告と承認
- 月次申告・月次承認・差し戻し
- 予定・勤務記録の個人カレンダー表示
- 外部アプリ向けAPIとAPIガイド
- 標準Web Pushによる緊急連絡・確認通知（VAPID設定時）

## 技術構成

- Next.js / React
- vinext
- Cloudflare Workers
- Cloudflare D1
- Drizzle ORM
- OpenAI Sites

## ローカル開発

Node.js 22.13以降を使用します。

```bash
npm install
npm run dev -- --port 3003
```

ビルド確認：

```bash
npm run build
```

## Web Push

通知を使う環境では、VAPID鍵を一度だけ生成し、公開鍵・秘密鍵ともGitへ入れずにデプロイ環境のシークレットへ設定します。

```bash
npm run push:generate-vapid
```

設定する値は `VAPID_SUBJECT`、`VAPID_PUBLIC_KEY`、`VAPID_PRIVATE_KEY` です。利用者はグループの基本設定から端末ごとに通知を有効化・テスト・解除できます。iPhoneではホーム画面へ追加したWebアプリから有効化します。

## ローカルモード

ローカル開発では、クエリの `user` パラメータを使ってテストユーザーを切り替えられます。

```text
http://localhost:3003/?user=member01
```

ローカル用DBのシードは、プロジェクトのスクリプトとDrizzleの定義を確認して実行してください。

## API

APIガイド：

- https://my-day-calendar.chita256.chatgpt.site/api-guide

予定・タスクAPIの主なエンドポイント：

```text
GET    /api/v1/tasks
GET    /api/v1/tasks/:id
POST   /api/v1/tasks
PATCH  /api/v1/tasks/:id
DELETE /api/v1/tasks/:id
```

APIキーは画面から発行し、Bearerトークンとして使用します。キーの実体はハッシュ化して保存します。

## データと注意事項

- D1のスキーマは `db/schema.ts`、マイグレーションは `drizzle/` にあります。
- 個人予定やグループの運用データはD1に保存します。
- ローカルの `.env`、`dist/`、一時ファイル、個人用資料はGitに含めません。
- 本リポジトリは試作・デモ用途を前提としています。本番運用ではバックアップ、権限、個人情報保護、監査要件を別途確認してください。

## ライセンス

ライセンスは準備中です。再利用・商用利用を行う場合は、リポジトリのライセンス表記を確認してください。
