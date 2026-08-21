# 公開デモ構築・復旧手順

公開デモを新しい環境へ構築するとき、または「ビルドは成功したがメニューが表示されない」ときに使う手順です。
この文書は、現在のKINBANリポジトリにある設定・マイグレーション・初期化APIを正本として整理しています。

## 1. 環境を混ぜない

| 環境 | データベース | 主な設定 | データ操作 |
| --- | --- | --- | --- |
| ローカル開発 | WranglerのローカルD1 | `DEMO_MODE=true`、`NEXT_PUBLIC_DEMO_MODE=true`（デモ確認時） | `npm run db:migrate:local` → `npm run db:seed:local` |
| 公開デモ | デモ専用のリモートD1 | `DEMO_MODE=true`、`NEXT_PUBLIC_DEMO_MODE=true` | サイト管理画面の「デモデータを初期化」 |
| 本番 | 本番専用のリモートD1 | `DEMO_MODE=false`、`NEXT_PUBLIC_DEMO_MODE=false` | seed・デモ初期化・全削除は禁止 |

現行版では、簡易ユーザー切り替えとデモ日時は `DEMO_MODE` 系の設定で判定します。公開Sites/Workersに `LOCAL_MODE` を設定してはいけません。古い環境に残っている場合も、公開デモでは有効にしないでください。

`DEMO_DEFAULT_USER_ID` と `NEXT_PUBLIC_DEMO_DEFAULT_USER_ID` はデモ時の初期ユーザーです。通常は `tanaka` とします。`?user=member02` のような切り替えはデモモードだけで使います。

## 2. 新しい公開デモを作る

### 2-1. ソースと依存関係を準備する

Node.js 22.13.0以上を用意し、リポジトリのルートで実行します。

```bash
npm ci
npm run build
npm test
```

### 2-2. D1とR2を用意する

公開デモ専用のD1とR2を作成し、デプロイ設定の `DB` と `FILES` のバインディングへ接続します。既存の本番D1/R2をデモへ流用しません。

Cloudflare Workers相当の環境では、対象D1へマイグレーションを適用します。

```bash
npx wrangler d1 migrations apply DB --remote --config wrangler.production.jsonc
```

デプロイ先の管理画面から実行する場合も、先にマイグレーション完了を確認してからアプリを公開します。D1を作成しただけではテーブルもデータも入りません。

### 2-3. デモ用環境変数を設定する

デプロイ先の環境変数・シークレットへ、少なくとも次を設定します。

```text
DEMO_MODE=true
NEXT_PUBLIC_DEMO_MODE=true
DEMO_DEFAULT_USER_ID=tanaka
NEXT_PUBLIC_DEMO_DEFAULT_USER_ID=tanaka
PUBLIC_APP_URL=https://公開デモのURL
```

Google OAuth、Resend、VAPID、AIランタイムなどは使う機能を有効にする場合だけ設定します。秘密値はGit、README、接続パック、Issueコメントへ書きません。

本番用の次の設定をデモへそのままコピーしないでください。

- `INITIAL_OWNER_EMAIL` / `INITIAL_SETUP_SECRET`
- 本番用Google OAuthのリダイレクトURI
- 本番用のResend、VAPID、AIランタイムの秘密値

### 2-4. 初期データを入れる

マイグレーションとseedは別工程です。マイグレーションだけでは、グループ・メンバー・シフト・デモ日時は作成されません。

ローカルD1の初期化は次のコマンドです。

```bash
npm run db:migrate:local
npm run db:seed:local
```

`scripts/seed-local.sql` と `npm run db:seed:local` はローカルD1用です。公開リモートD1へこのSQLを直接流し込む一発コマンドは、現在の正式な運用手順としては未整備です。公開デモでは、デプロイ後にサイト管理者でログインし、サイト管理画面の「デモデータを初期化」を使ってください。

初期化には次の条件があります。

1. `DEMO_MODE=true` のデモ環境であること。
2. サイト管理者として認証されていること。
3. 確認欄へ `デモデータを初期化` と入力すること。

この操作は登録した勤怠、メッセージ、割当、業務メモなどを削除し、`scripts/seed-local.sql` 相当の初期状態へ戻します。実行前に必要な検証データを保存してください。

## 3. 初期表示の確認

デプロイ直後は、次の順で確認します。

### 3-1. DBの最低限の確認

ローカルD1では、次の確認を行います。公開D1では、同じ確認をリモートの対象D1へ読み取り専用で行います。

```sql
SELECT count(*) AS site_users FROM site_users;
SELECT count(*) AS groups FROM groups;
SELECT count(*) AS group_members FROM group_members;
SELECT count(*) AS demo_clocks FROM demo_clocks;
```

デモseed後の期待値は「0件ではないこと」です。特定の件数を固定値として判定せず、seedの変更に合わせて必要な代表データも確認します。

### 3-2. 画面とユーザー

1. 公開デモのルートURLを開く。
2. `?user=tanaka` を付けて店長の初期画面を開く。
3. グループ名とメニューが表示されることを確認する。
4. 必要に応じて `?user=member02` などでデモユーザーを切り替える。
5. シフト一覧、勤務希望、業務ガイドを1件ずつ開く。

本番環境では `?user=...` によるユーザー切り替えを使いません。ログイン済みの本人と、DB上の所属・権限で表示を確認します。

### 3-3. ロゴと静的ファイル

ロゴが欠ける場合は、次を確認します。

- `public/kinban-mark.png` がデプロイ対象に含まれている。
- `app/layout.tsx` と `public/manifest.webmanifest` の参照先が一致している。
- 古いデプロイや保存版を表示していない。
- `dist/client` とデプロイアーカイブに静的ファイルが含まれている。

静的ファイルだけを後からD1へ入れることはできません。ソースとビルド成果物を確認して、アプリを再デプロイします。

## 4. 「カレンダーは表示されるがメニューが空」の切り分け

次の順に確認します。

1. **環境変数**：`DEMO_MODE` と `NEXT_PUBLIC_DEMO_MODE` が両方 `true` か。公開デモへ `LOCAL_MODE` が入っていないか。
2. **D1バインディング**：アプリが初期化したD1ではなく、空の別D1を参照していないか。
3. **マイグレーション**：必要なテーブルがあるか。D1作成直後は必ず適用する。
4. **seed**：`site_users`、`groups`、`group_members` が0件でないか。
5. **ログイン対象**：`?user=tanaka` のユーザーが `site_users` に存在し、対象グループの `group_members` に所属しているか。
6. **グループ機能設定**：対象グループのメニュー機能が無効になっていないか。
7. **デモ日時**：`demo_clocks` が空の場合は既定のデモ日時になります。日付が想定外ならseedまたはデモ時計を確認する。
8. **ブラウザ状態**：強制再読み込み、別ユーザーの `localStorage`、古い保存版のキャッシュを確認する。
9. **API**：ブラウザのNetworkで `/api/groups` の応答を確認する。403なら認証・所属、500ならサーバーログとD1バインディングを確認する。

カレンダーの枠だけ表示されても、グループ取得が失敗している場合があります。「HTMLが返った」「ビルドが成功した」だけでは初期化完了とは判断しません。

## 5. 本番でしてはいけないこと

本番環境では次を行いません。

- `DEMO_MODE=true`、`NEXT_PUBLIC_DEMO_MODE=true`、`LOCAL_MODE=true` の設定。
- `?user=...` による簡易ユーザー切り替え。
- `scripts/seed-local.sql` の投入。
- デモデータ初期化APIの有効化・実行。
- 確認なしのD1全削除、R2全削除、全テーブル再作成。
- 本番D1を公開デモと共有すること。

本番の更新は、バックアップ、マイグレーション、段階確認、ロールバック方法を確認してから実施します。初期管理者の作成は `INITIAL_OWNER_EMAIL` と `INITIAL_SETUP_SECRET` をデプロイ先のシークレットとして設定し、初回セットアップAPIを使います。値をソースへ保存しません。

## 6. 復旧チェックリスト

- [ ] デプロイ先URLと対象D1/R2を記録した
- [ ] `DEMO_MODE` 系の値を環境に合わせた
- [ ] D1マイグレーションを適用した
- [ ] seedまたはデモ初期化を実行した
- [ ] `site_users` / `groups` / `group_members` / `demo_clocks` を確認した
- [ ] `?user=tanaka` でグループメニューを確認した
- [ ] シフト一覧・勤務希望・業務ガイドを確認した
- [ ] ロゴと静的ファイルを確認した
- [ ] 本番環境でデモ設定・seed・全削除をしていない
