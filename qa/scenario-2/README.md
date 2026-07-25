# シナリオテスト2

店長を起点に、KINBANの運用をAPI・MCP中心で通し確認するためのテストです。

## 対象フロー

1. seed済みグループと運営支援AIの接続確認
2. 管理者が新しいシフトを作成
3. 希望受付を開始
4. メンバーが勤務希望を保存
5. MCPで希望を読み取り、割当警告を確認
6. MCPで割当下書きを保存して公開
7. 公開シフトがカレンダーへ反映されることを確認
8. メンバーが打刻・休憩・終了・申告
9. 管理者が日次承認
10. MCPでお知らせを作成
11. メッセージキューの状態を確認

## 実行

```powershell
npm run db:seed:local
$env:QA_BASE_URL = "http://localhost:3003"
node qa/scenario-2/scenario-2.mjs
npm run db:seed:local
```

最後のseed再投入で、テスト中に作成した計画・申告・お知らせをローカルseed状態へ戻します。

運営支援AIキーは `kinban-manager-agent/.env.local` から読み取ります。キー自体はレポートへ出力しません。

