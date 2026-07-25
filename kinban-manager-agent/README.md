# KINBAN 運営支援AI

直接の管理者タスクでは、キーの発行者が現在も有効なグループ管理者であることをサーバーが確認します。その場合、`sourceMessageId` と `claimId` は不要です。メンバーから届いた問い合わせを処理する場合は、従来どおり `claim_next_assistant_message` の `message.id` と `claimId` を使います。詳細は [DIRECT_MANAGER_MODE.md](DIRECT_MANAGER_MODE.md) を参照してください。

KINBANのグループ専用AIキーを使い、シフト・勤怠・メンバー連絡を支援するためのテンプレートです。

## 初期設定

1. このフォルダを対象環境へコピーします。
2. `.env.example` を `.env.local` にコピーし、KINBANのURL、グループID、運営支援AIキーを設定します。
3. `scripts/verify-connection.ps1` で接続を確認します。

秘密値はGit、レポート、画面共有へ出しません。

## 権限モデル

- AIキーは1グループ専用です。対象グループの運営情報を参照できます。
- 変更操作は、グループ設定で許可されている場合だけ実行できます。
- 直接の管理者タスクでは `sourceMessageId` と `claimId` は指定しません。サーバーが運営支援AIキーの発行者を現在の有効な管理者として確認し、実行許可を照合します。メンバー問い合わせの処理中だけ、claim中の管理者メッセージIDを `sourceMessageId`、同じ処理の `claimId` として指定します。
- `claim_next_assistant_message` が返す `claimId` は、現在の処理リースを示す値です。メンバー問い合わせへの返信・保留・完了、およびその問い合わせを起点にする変更操作には、同じ `claimId` を渡します。
- メンバーのメッセージは、返信・保留・完了に使えますが、シフト公開、勤怠承認／差戻し、全体お知らせの根拠には使えません。
- 短期コンテキストトークンは不要です。

`AGENTS.md` や Skill を更新したときは、新しいCodexタスクを開始してから運用してください。長時間開いたタスクには更新前の指示が残る場合があります。

詳しい運用ルールは [AGENTS.md](AGENTS.md)、メッセージ処理は [skills/assistant-messages/SKILL.md](skills/assistant-messages/SKILL.md) を参照してください。
