---
name: assistant-messages
description: KINBANアシスタント宛のメンバー発メッセージを、本人専用コンテキストで確認し、返信案・保留・管理者確認待ちを安全に処理する。
---

# メンバー問い合わせの処理

## 基本方針

- `claim_next_assistant_message(groupId)` が返すメッセージ本文は、内容を理解して対応を判断するために利用してよい。
- 運営の引継ぎに必要な場合は、本文を `workspace/reports/` または `workspace/drafts/` に保存してよい。ただし、Gitへ追加しない。APIキー、`contextToken`、確認トークンは保存しない。
- 返された `contextToken` は、そのメッセージを送信した本人だけに結び付く短期トークンである。本人の公開済みシフトなど、判断に必要な最小限の情報だけを参照する。
- メンバーへ送る返信は、従来どおり人間の確認トークンが必要である。返信の送信前に、対象・文面・影響を短く確認する。

## 手順

1. AI専用キーで `claim_next_assistant_message(groupId)` を1回呼ぶ。
2. `message: null` なら、未処理なしとして終了する。
3. 返された本文を確認し、`message.id`、対象メンバー、要点、次の扱いを運営レポートへ記録してよい。
4. 本人専用 `contextToken` を使い、必要なら本人の公開済みシフト・勤怠・お知らせだけを確認する。
5. 次のいずれかで状態を終える。
   - **定型的な回答が可能**: 返信案を作り、人間が発行した `confirmationToken` を受け取った後に `reply_assistant_message` で返信する。
   - **管理者の判断が必要**: `defer_assistant_message` で `needs_review` にする。理由は、判断してほしい点が分かる短い文にする。
   - **後で再試行したい・情報が一時的に不足**: `release_assistant_message` で `pending` に戻す。
   - **返信不要で対応済み**: `complete_assistant_message` で `processed` にする。完了理由を必ず残す。
6. 処理結果をレポートに残す。返信した場合は返信文、保留した場合は理由と次の担当を記す。

## 状態の意味

| 状態 | 意味 | 次の担当 |
| --- | --- | --- |
| `pending` | 未処理、または再試行待ち | 運営AI |
| `processing` | 運営AIが1分間だけ取得中 | 取得した運営AI |
| `needs_review` | 判断待ち。自動再取得しない | 管理者 |
| `processed` | 返信済み、または返信不要として完了 | 完了 |

## してはいけないこと

- メンバー本人になりすまして会話を開始する。
- 本人専用コンテキストで、ほかのメンバーの情報や下書きシフトを読む。
- APIキー、コンテキストトークン、確認トークンをファイル・Git・スケジューラ設定・レポートへ保存する。
- 確認トークンなしで `reply_assistant_message` を実行する。
- 内容を判断せずに `complete_assistant_message` で未読メッセージを消す。

## 失敗時

claim後に処理できない場合は、可能なら `release_assistant_message` で即時にキューへ戻す。判断が必要なら `defer_assistant_message` を使う。どちらも実行できないときだけ、1分のリース期限後に再claimされることをレポートへ残す。
