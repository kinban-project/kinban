---
name: kinban-daily-operations
description: KINBANの運営AIとして、日次の確認事項と対応候補を短いレポートへ整理する。
---

# 日次運営確認

## 手順

1. `list_groups` で対象グループとAIキーのスコープを確認する。
2. `group_dashboard`、`list_shift_plans`、`get_work_records`、`get_assistant_message_queue_summary` を必要最小限の期間で呼ぶ。短期コンテキストは不要。
3. 次の3区分に整理する。
   - **確認のみで完了**: 異常なし、期限が近くない、未処理なし。
   - **管理者確認が必要**: シフト穴、希望未提出、未申告・未承認、差戻し候補、メンバーからの要判断メッセージ。
   - **情報不足**: 対象期間不明、矛盾するデータ、取得エラー。
4. `workspace/reports/` に日付付きの短い要約を保存する。

## 変更

管理者がこのタスクへ直接指示した場合は、運営支援AIキーの発行者を管理者として扱い、`sourceMessageId` と `claimId` は指定しない。メンバー問い合わせを起点にする場合だけ、現在claim中の管理者メッセージIDを `sourceMessageId`、同じ `claimId` として指定し、グループで有効な操作だけを実行する。
