# 問題・改善候補

アプリ本体は変更していない。優先度は業務影響で判定した。

| ID | 重要度 | 領域 | 問題 | 主な証拠 |
|---|---|---|---|---|
| F-001 | High | 権限 | 一般メンバーが評価用`adminNote`を閲覧できる。APIは本人分、MCPはグループ全員分を返す | `api-scenarios.jsonl`, `mcp-summary.json` |
| F-002 | High | 勤務希望 | 締切日を過ぎても受付状態がopenのままで希望保存できる | `boundary-summary.json` |
| F-003 | High | 打刻 | 未来日の割当シフトへ今すぐ出勤できる。勤務日との時間窓チェックがない | `api-scenarios.jsonl` |
| F-004 | High | 打刻競合 | 同一利用者の同時出勤20件中19件が作成された。逐次二重送信だけを防いでいる | `load-summary.json` |
| F-005 | High | 月次締め | 日次が`unsubmitted`のままでも月次提出・管理者承認でき、勤務記録が閉じられる | `boundary-summary.json` |
| F-006 | High | シフト競合 | owner/editorの同時更新が両方200。競合通知なしで後の保存が先の割当を上書き | `concurrency-summary.json` |
| F-007 | High | MCP希望 | MCPは`available/limited/unavailable`、画面/APIは`want/possible/off/unavailable`。`want`を成功扱いで黙って破棄 | `mcp-summary.json` |
| F-008 | High | MCP希望 | MCPの希望保存は`shift_request_submissions`を作らず、管理画面上は未提出になる | `mcp-summary.json` |
| F-009 | High | MCP公開 | MCPでシフト公開してもカレンダーイベントを作らず、Browser/APIカレンダーへ出ない | `mcp-summary.json` |
| F-010 | High | 100人運用 | 100人×248枠で24,800チェックボックスを一括描画。割当作業が現実的でなく、巨大DOMの取得も失敗 | `browser-100-members-248-slots-assignment.png` |
| F-011 | High | 100人運用 | メンバー管理が100人を17,340pxの縦一覧で表示し、検索・絞込・ページ分割がない | `browser-100-members.png` |
| F-012 | High | 10店舗運用 | 10グループ全ての操作ボタンが常時展開され、初期表示でグループ別データ取得も多発する | `browser-10-groups-menu.png` |
| F-013 | Medium | 長期データ | 4,800勤怠を一括返却し最大3.63MB、最大1.90秒。ページ分割がなく履歴増加で悪化する | `load-summary.json` |
| F-014 | Medium | 月次表示 | 負の時間差が`-140時間-30分`のように表示される | `browser-monthly-summary.png` |
| F-015 | Medium | MCP互換 | MCPは15分スロットを受理するが、画面/APIの作成選択肢は30/60/120分 | `mcp-summary.json` |
| F-016 | Medium | MCP業務 | MCPに打刻・日次申告・月次締めのツールがなく、MCPだけで業務シナリオを完結できない | `mcp-summary.json` |
| F-017 | Medium | MCP監査 | MCPの作成・公開操作が監査ログへ記録されない | `mcp-summary.json` |
| F-018 | Low | 操作性 | 一部の全画面モーダルに明示的な閉じるボタンがなく、背景クリックに依存 | Browser確認 |

## 推奨する修正順

1. `F-001`, `F-004`, `F-003`, `F-005`, `F-006`：情報漏えい・勤怠不整合・上書き消失を止める。
2. `F-002`, `F-007`～`F-009`：Browser/API/MCPの業務状態を一致させる。
3. `F-010`～`F-013`：100人・10グループを想定するなら、検索、ページ分割、遅延読込、割当UIの再設計を行う。
4. 表示・監査・細部互換を修正する。

## 修正案の方向性

- 出勤中レコードにはDBの一意制約またはトランザクションを設ける。未来・過去シフトの打刻許容窓も業務設定として検証する。
- シフト更新に版番号を持たせ、保存時に版が古ければ409と差分確認を返す。
- 月次提出前に対象月の全勤務が日次承認済みかをサーバー側で検査する。
- `adminNote`は管理者用DTOにのみ含め、MCPを含む一般メンバー向け応答から除外する。
- MCPはAPIと同じサービス層・enum・公開時副作用・監査処理を共有する。
- 大規模画面は検索・ページ分割・仮想スクロールを採用し、シフト割当は人×全枠チェック表ではなく日/役割単位の作業へ分割する。
