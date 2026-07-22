# KINBAN 本番ユーザー・グループアクセス

## 方針

本番では ChatGPT などから得た本人情報を、KINBAN の `site_users` による招待・承認状態と組み合わせて利用可否を判定します。`LOCAL_MODE` と `x-dev-user-id` はローカル開発専用です。

## サイト利用者

`site_users` は次の状態を持ちます。

- `invited`: 招待済みだが未承認
- `active`: 業務データへアクセス可能
- `suspended`: 利用停止中

サイト管理者は `POST/PATCH /api/site/users` で招待、再有効化、停止、サイト管理者権限、グループ作成権限を管理できます。招待トークンはハッシュだけをDBへ保存し、発行時のレスポンスで一度だけ返します。メール配送は利用するデプロイ先のメール基盤を接続する拡張点です。

## グループ

新規グループは常に `private / invite_only` で作成されます。作成にはサイト利用者の `canCreateGroups`（サイト管理者は常に可）が必要で、作成者はグループ `owner` になります。

グループ管理者は `POST /api/groups/:id/invitations` で有効なサイト利用者を招待できます。招待を受けた本人は、まだグループメンバーでなくても同じエンドポイントへ `{ "action": "accept" }` を送って承認できます。取消は `DELETE /api/groups/:id/invitations` です。招待の作成・承認・取消は監査ログへ記録します。

`request_to_join` の公開参加は将来の設定用にスキーマだけ用意し、現在の初期状態では無効です。

## 認証プロバイダの拡張点

`auth_identities` には `google`、`microsoft`、`email_link`、`chatgpt` を保存できます。現在の実装では ChatGPT が提供する検証済み本人情報を `chatgpt` identity として紐付けます。Google/Microsoft の OIDC、メールワンタイムリンクの配送・state/PKCE・トークン検証は、実際のプロバイダ設定を追加する段階で実装します。

## 初回所有者

本番の初回所有者は Cloudflare Secret の `INITIAL_OWNER_EMAIL` で指定します。秘密値や本番メールアドレスは `.env.example` やリポジトリへ記録しません。復旧操作は常時利用できるバックドアにせず、明示依頼に基づく運用手順と監査ログで扱います。
