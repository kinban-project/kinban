# KINBAN MCP・画面相当テスト結果

実施日: 2026-08-02
対象: ローカルデモモード / `seed-group-store` / デモ時刻 2026-07-21 09:00 (Asia/Tokyo)

## 結論

- MCPサーバーは43ツールを公開しており、グループ・シフト・希望・勤怠・お知らせ・業務ガイド・ダッシュボードの主要導線を確認できた。
- シフトの一時作成、割当、割当検査、割当解除、下書き削除は一連で成功し、最後に一時データを削除した。
- 勤務記録の月次取得で、関連する休憩を一括取得するとD1/SQLiteのバインド変数上限に達する問題を確認した。`getMcpWorkRecords`を80件単位の分割取得に修正し、200件の取得が成功することを再確認した。
- 直接の運営支援AIキーによる管理者操作は、キー発行者の明示指示として扱われ、`confirm:false`でも内部で確認済みに補完される。画面の確認ダイアログとは異なる仕様で、これは仕様上の差分としてドキュメントに残すべき点。
- MCPの `get_shift_request_overview` は計画IDではなく受付期間IDを受け取る。受付期間IDを渡した場合は正常取得した。

## 公開ツール一覧

### 読み取り・検査

`get_demo_time`, `list_groups`, `get_profile`, `get_group_members`, `list_shift_plans`, `get_shift_plan`, `list_knowledge_pages`, `search_knowledge_pages`, `get_knowledge_page`, `check_shift_assignments`, `get_work_records`, `get_shift_planning_context`, `validate_shift_assignment_candidate`, `get_shift_request_overview`, `list_shift_assignment_scenarios`, `compare_shift_assignment_scenario`, `list_announcements`, `get_assistant_message_queue_summary`, `list_assistant_messages`, `list_shift_swap_requests`, `group_dashboard`

### シフト・割当・希望

`create_shift_plan`, `delete_draft_shift_plan`, `update_slot_counts`, `set_shift_assignments`, `clear_draft_assignments`, `create_shift_assignment_scenario`, `update_shift_assignment_scenario`, `delete_shift_assignment_scenario`, `publish_shift_assignment_scenario`

### 勤怠・メッセージ・通知

`submit_work_record`, `review_monthly_work`, `claim_next_assistant_message`, `reply_assistant_message`, `release_assistant_message`, `defer_assistant_message`, `complete_assistant_message`, `create_shift_swap_announcement_draft`, `respond_shift_swap_candidate`, `confirm_shift_swap`, `create_announcement`, `delete_announcement`, `send_member_message`

## 検証マトリクス

| 領域 | MCP確認 | 画面/API相当 | 結果 |
|---|---|---|---|
| デモ時刻 | `get_demo_time` | `/api/demo-clock` | 同じデモ日付・タイムゾーンを返す |
| グループ・権限 | `list_groups`, `get_group_members` | `/api/groups` | 代表管理者・管理者・メンバー・利用停止予備要員を取得 |
| シフト一覧 | `list_shift_plans`, `get_shift_plan` | `/api/shifts?groupId=...` | 4計画を取得。公開3件、下書き1件 |
| 勤務枠・割当状況 | `get_shift_planning_context`, `check_shift_assignments` | シフト割当画面相当 | 8月前半は120枠・割当0、検査は不足を返す |
| 希望受付 | `get_shift_request_overview` | シフト希望画面相当 | `seed-request-august-first`で10名分を取得 |
| 勤務記録 | `get_work_records` | `/api/groups/.../work-records` | MCPは200件、画面APIはページ単位100件。大量取得の休憩関連は修正後成功 |
| 業務ガイド | `list_knowledge_pages`, `search_knowledge_pages`, `get_knowledge_page` | 業務ガイド画面 | 公開ページ、本文、画像メタデータを取得 |
| お知らせ | `list_announcements` | お知らせ画面 | お知らせ、返信、既読状態を取得 |
| アシスタントキュー | `get_assistant_message_queue_summary`, `list_assistant_messages` | 管理者連絡画面相当 | pending/processing/review 0件、本文非包含設定を確認 |
| ダッシュボード | `group_dashboard` | `/api/groups/.../dashboard` | メンバー数、計画数、公開計画数、お知らせ数を取得 |
| シフト一時作成 | `create_shift_plan` | シフト作成画面 | 1枠の一時計画を作成 |
| 割当保存 | `set_shift_assignments` | シフト割当画面 | 1名を割当、version更新を確認 |
| 割当検査 | `check_shift_assignments` | シフト割当の警告表示 | 不足・希望・労務注意の集計を返す |
| 割当解除・削除 | `clear_draft_assignments`, `delete_draft_shift_plan` | 下書き編集・削除 | 一時計画を完全削除 |

## MCPと画面の扱いが異なる点

1. **直接運営支援AIキーの確認**
   - 直接キー操作は、管理者本人からの直接指示を受けた実行として扱う。
   - そのため、メッセージ処理経由のclaimや画面の確認ダイアログとは異なり、直接キーでは確認値を内部補完する。
   - メッセージ処理経由では、メッセージのclaim、権限、操作ごとの許可が必要。

2. **受付期間の識別子**
   - `get_shift_request_overview` は `planId`ではなく`periodId`を指定する。
   - `list_shift_plans`の`requestPeriodId`を次の呼び出しへ渡す必要がある。

3. **大量勤務記録**
   - 画面APIはページングされた結果を返す。
   - MCPは最大200件を返す。休憩の関連取得はD1の変数上限を避けるため80件単位で分割する。

## 未実施・今後の確認

- claimを伴うメッセージ処理の実運用シナリオは、未処理メッセージが存在しないため状態を変更せず未実施。
- 勤怠の承認・差戻し、公開操作、全体通知は実データを変更するため、今回は確認ガードと既存データの読み取りまでに限定。
- 直接キー操作の即時実行は安全上の重要仕様なので、運営支援AIの接続パックにも明記すると誤解が少ない。

## 検証後の状態

- ローカルDBは`npm run db:seed:local`で初期シードへ復元。
- 一時シフト・一時割当・一時シナリオは削除済み。
- 公開済み・受付中シフト、勤怠、お知らせはシード状態に戻っている。
