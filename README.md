# My Day

ChatGPTアカウントでログインして使える、個人向けのカレンダー・タスク管理アプリです。

予定の登録、編集、詳細表示、完了管理、削除に対応しています。タスクには画像やPDFなどのファイルを添付でき、添付ファイルはR2に保存します。

## 公開サイト

<https://my-day-calendar.chita256.chatgpt.site>

## 主な機能

- ChatGPTでログインしたユーザーごとの個人カレンダー
- 月間カレンダーと日別アジェンダ
- 予定の登録・編集・詳細表示・完了・削除
- 画像、PDF、Officeファイルなどの添付
- 1MBを超える画像のブラウザ側軽量化
- 添付ファイルの保存状況表示（目安10MB）
- 外部アプリやAIから利用できる認証付きAPI
- `/api-guide` のAPI仕様・利用例

## API

APIガイド：<https://my-day-calendar.chita256.chatgpt.site/api-guide>

APIキーはログイン後にAPIガイドから発行できます。発行したキーは、発行したユーザー自身の予定だけを操作できます。

現在のAPIエンドポイントは次のとおりです。

```text
GET    /api/v1/tasks
GET    /api/v1/tasks/:id
POST   /api/v1/tasks
PATCH  /api/v1/tasks/:id
DELETE /api/v1/tasks/:id
```

詳しい項目、認証方法、レスポンス、エラー、期間指定、ページング、curl例はAPIガイドを参照してください。

## 技術構成

- Next.js / React
- vinext
- Cloudflare Workers
- Cloudflare D1（予定・APIキー）
- Cloudflare R2（添付ファイル）
- Drizzle ORM
- Sites（公開・ホスティング）

## ローカル開発

必要環境：Node.js 22.13以上

```bash
npm install
npm run dev
```

ビルド確認：

```bash
npm run build
```

## 認証について

ブラウザ画面のログインはSitesのSign in with ChatGPTを利用します。ログイン済みユーザーの識別はサーバー側で行い、予定・添付ファイル・APIキーをユーザー単位で分離しています。

外部APIの利用には、画面で発行するBearer APIキーを使用します。APIキーの本体は保存せずハッシュ化して管理します。

## データベース

D1のスキーマは `db/schema.ts`、マイグレーションは `drizzle/` にあります。

```bash
npm run db:generate
```

## 補足

このリポジトリでは、アプリ本体に関係しない資料類を管理対象外にしています。`docs/`、`assets/`、`screenshots/` はローカルの別資料として扱い、GitHubには公開しません。
