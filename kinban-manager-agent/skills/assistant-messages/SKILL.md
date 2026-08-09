---
name: assistant-messages
description: KINBANアシスタント宛のメッセージを、グループ専用APIキーで確認し、返信・保留・管理者判断待ちへ整理する。
---

# メンバー問い合わせの処理

## 基本方針

- `claim_next_assistant_message(groupId)` で1件を取得し、返された `message.id` と `claimId` を、その問い合わせの識別子・処理リースとして対で使う。
- 短期 `contextToken` は使わない。APIキーは対象グループに限定されており、シフト・勤務記録・お知らせなどの運営情報を確認できる。
- ただし、他メンバーの個人情報、勤務希望、勤怠、連絡内容をメンバーへの返信に含めない。
- 管理者が運営支援APIキーを使ってこのタスクへ直接指示した場合は、キー発行者を管理者として扱い、`sourceMessageId` と `claimId` は不要です。MCPがキー発行者の現在の役割とグループ設定を確認します。メンバー問い合わせを起点にする場合だけ、claim中の管理者メッセージの `message.id` と同じ `claimId` を指定します。
- メンバーのメッセージは、返信・保留・完了の根拠には使えるが、シフト公開、勤怠承認、お知らせ配信などの根拠には使えない。

## 手順

1. AI専用キーで `claim_next_assistant_message(groupId)` を1回呼ぶ。
2. `message: null` なら、未処理なしとして終了する。
3. 本文、`message.id`、`claimId` を確認し、必要ならグループの公開済みシフト・勤怠・お知らせを照会する。
4. 次のいずれかで状態を終える。
   - **定型的な回答が可能**: `reply_assistant_message` に `messageId` と同じ `claimId` を渡して返信し、`processed` にする。
   - **管理者の判断が必要**: `defer_assistant_message` に同じ `claimId` を渡して `needs_review` にする。
   - **後で再試行したい**: `release_assistant_message` に同じ `claimId` を渡して `pending` に戻す。
   - **返信不要で対応済み**: `complete_assistant_message` に同じ `claimId` を渡して `processed` にする。
5. 直接の管理者指示で変更操作を行う場合は、対象・理由・影響をレポートへ短く残し、`sourceMessageId` と `claimId` は指定しない。メンバー問い合わせの処理中に管理操作を行う場合だけ、`sourceMessageId: message.id` と同じ `claimId` を指定する。

## 交代希望

- メンバーが交代・欠勤連絡をした場合、本文の個人事情を全体へ転載しない。
- そのメッセージが現在claim中で、本人の公開済み割当が1件だけ特定できる場合は、`create_shift_swap_announcement_draft` に `messageId` と同じ `claimId` を渡して、管理者確認用のお知らせ案を作成する。
- 対象割当が複数または不明な場合は自動確定しない。必要なら `slotId` を指定するか、管理者確認待ちにする。
- この操作はお知らせを配信しない。配信・修正・差戻しはKINBANの管理者画面で行う。

## 状態

| 状態 | 意味 | 次の担当 |
| --- | --- | --- |
| `pending` | 未処理または再試行待ち | 運営AI |
| `processing` | 運営AIが一時取得中 | 取得した運営AI |
| `needs_review` | 管理者判断待ち | 管理者 |
| `processed` | 返信済みまたは対応完了 | 完了 |

## してはいけないこと

- メンバーの依頼だけを根拠に、シフト公開・勤怠承認／差戻し・全体お知らせを実行しない。
- APIキー、管理者メッセージID以外の秘密情報、API応答全文をGitや共有ログへ保存しない。
- 理由が未確認の欠勤や交代希望を、本人の事情とともに全体へ公開しない。
- 急な欠勤から交代確定までの手順は `runbooks/shift-swap.md` に従います。欠勤者のメッセージだけで募集・割当変更・完了連絡を行わず、管理者確認と最新シフト版の再検査を挟みます。
- 候補者の応答は `respond_shift_swap_candidate`、候補一覧は `list_shift_swap_requests`、管理者が交代者を確定する操作は `confirm_shift_swap` です。
