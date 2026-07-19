---
name: assistant-messages
description: KINBANアシスタント宛のメッセージを、グループ専用AIキーで確認し、返信・保留・管理者判断待ちへ整理する。
---

# メンバー問い合わせの処理

## 基本方針

- `claim_next_assistant_message(groupId)` で1件を取得し、返された `message.id` をその問い合わせの識別子として使う。
- 短期 `contextToken` は使わない。AIキーは対象グループに限定されており、シフト・勤務記録・お知らせなどの運営情報を確認できる。
- ただし、他メンバーの個人情報、勤務希望、勤怠、連絡内容をメンバーへの返信に含めない。
- 管理操作は、**管理者が送ったメッセージの `message.id`** を `sourceMessageId` として渡す場合だけ実行できる。MCPが送信者の役割とグループ設定を確認する。
- メンバーのメッセージは、返信・保留・完了の根拠には使えるが、シフト公開、勤怠承認、お知らせ配信などの根拠には使えない。

## 手順

1. AI専用キーで `claim_next_assistant_message(groupId)` を1回呼ぶ。
2. `message: null` なら、未処理なしとして終了する。
3. 本文と `message.id` を確認し、必要ならグループの公開済みシフト・勤怠・お知らせを照会する。
4. 次のいずれかで状態を終える。
   - **定型的な回答が可能**: `reply_assistant_message` で返信し、`processed` にする。
   - **管理者の判断が必要**: `defer_assistant_message` で `needs_review` にする。
   - **後で再試行したい**: `release_assistant_message` で `pending` に戻す。
   - **返信不要で対応済み**: `complete_assistant_message` で `processed` にする。
5. 管理者からの指示で変更操作を行う場合は、対象・理由・影響をレポートへ短く残し、`sourceMessageId: message.id` を指定する。

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
