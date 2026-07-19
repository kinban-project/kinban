# KINBAN 運営支援AI

KINBANのグループ専用AIキーを使い、シフト・勤怠・メンバー連絡を支援するためのテンプレートです。

## 初期設定

1. このフォルダを対象環境へコピーします。
2. `.env.example` を `.env.local` にコピーし、KINBANのURL、グループID、運営支援AIキーを設定します。
3. `scripts/verify-connection.ps1` で接続を確認します。

秘密値はGit、レポート、画面共有へ出しません。

## 権限モデル

- AIキーは1グループ専用です。対象グループの運営情報を参照できます。
- 変更操作は、グループ設定で許可されている場合だけ実行できます。
- 変更操作には、現在claim中の管理者メッセージIDを `sourceMessageId`、同じ処理の `claimId` として指定します。サーバーが送信者の役割、処理リース、実行許可を照合します。
- `claim_next_assistant_message` が返す `claimId` は、現在の処理リースを示す値です。返信・保留・完了、および管理者指示による変更操作には、同じ `claimId` を渡します。
- メンバーのメッセージは、返信・保留・完了に使えますが、シフト公開、勤怠承認／差戻し、全体お知らせの根拠には使えません。
- 短期コンテキストトークンは不要です。

`AGENTS.md` や Skill を更新したときは、新しいCodexタスクを開始してから運用してください。長時間開いたタスクには更新前の指示が残る場合があります。

詳しい運用ルールは [AGENTS.md](AGENTS.md)、メッセージ処理は [skills/assistant-messages/SKILL.md](skills/assistant-messages/SKILL.md) を参照してください。
