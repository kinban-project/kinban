---
name: kinban-daily-operations
description: KINBANの日次運営確認とメッセージ処理を行う
---

# KINBAN日次運営

## 基本手順

1. `list_groups` で対象グループとAPIキーの範囲を確認する。
2. `get_demo_time` を呼び出し、対象グループの基準日時を取得する。
3. デモモードでは、`currentAt`、`today`、`month`、`timezone` を業務上の唯一の日時コンテキストとして使う。「今日」「明日」「次の営業日」「締切」などを端末の実日時から推測しない。
4. `group_dashboard`、`list_shift_plans`、`get_work_records`、`get_assistant_message_queue_summary` で対象期間の状態を確認する。
5. 不足、未申告、差戻し、未処理メッセージを分けて報告し、更新前に対象・版番号・権限を確認する。

## 日時の扱い

- デモグループでは必ず `get_demo_time` の日時を基準にする。
- 日付を含む作成・公開・受付開始・勤怠操作では、取得した `today` と `timezone` を利用する。
- 実時間を使うのは、監査ログ、claim、lease、再試行期限などの技術的な有効期限に限る。
- 相対日付が曖昧な場合は、実行前に絶対日付へ変換して確認する。

## メッセージ処理

- メンバーからの問い合わせは `claim_next_assistant_message` で取得し、必要な場合だけ `sourceMessageId` と `claimId` を指定して返信・更新する。
- 管理者の直接指示は、グループAPIキーの所有者権限と対象グループを確認して処理する。
- 要確認に移った内容は勝手に公開・割当変更せず、理由と候補を報告する。
