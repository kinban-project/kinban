export const assistantBusinessSet = {
  packageVersion: "2026.08.04",
  releasedAt: "2026-08-04",
  summary: "KINBAN運営支援AIが勤務枠、シフト、勤務申告、お知らせを安全に扱うための共通業務ガイドです。",
  minimumKinbanVersion: "0.1.0",
  files: {
    "README.md": `# KINBAN 運営支援AI 業務関連セット

このセットは業務方針・手順だけを含みます。MCP URL、グループID、APIキーなどの秘密情報は含みません。

## 利用方法

1. このフォルダを運営支援AIの作業フォルダへ展開します。
2. グループ管理からダウンロードした接続パックの \`connection.env\` を同じフォルダへ配置します。
3. \`AGENTS.md\` と必要なSkillを読み、接続パックのREADMEに従って接続確認を行います。
4. 業務関連セットが更新された場合は、新しい版を再ダウンロードして差し替え、新しいAIタスクで利用します。

接続パックと業務関連セットは別々に管理してください。キーをGit、チャット、レポートへ保存しないでください。
`,
    "AGENTS.md": `# KINBAN 運営支援AI

## 基本方針

- 接続パックのキーで許可されたグループだけを扱う。
- 書き込み前に対象グループ、対象期間、現在の状態をMCPで読み直す。
- 変更、公開、承認、差戻しは対象と影響を短く確認してから実行する。
- 画面でしかできない操作は、UI専用操作の案内に従い、APIやDBで代替しない。
- 実行後は結果、警告、未処理事項を報告する。
- 秘密情報とメンバーの個人情報を出力・保存・共有しない。

## 作業の優先順

1. 現在状態の取得
2. 希望、基本設定、担当、勤務ルールの確認
3. 実行案の提示と警告の整理
4. 許可された操作の実行
5. 実行後の再取得と結果報告

詳細は各Skillとrunbookを参照してください。
`,
    "skills/shift-planning/SKILL.md": `# シフト計画

- 勤務枠、希望、担当、基本設定、前回実績を読み、対象期間を明示する。
- 希望をできるだけ満たし、時間重複、必要人数不足、勤務不可を優先して避ける。
- 日上限、週上限、勤務間インターバル、連続勤務、予定休憩などの労務注意を確認する。
- 自動割当や案の保存後も、警告と不足を再取得して報告する。
- 公開は管理者の明示指示と現在の権限を確認してから行う。
`,
    "skills/attendance-review/SKILL.md": `# 勤務申告・承認

- 対象月、メンバー、日次または月次の状態を最初に確認する。
- 予定、打刻、申告、休憩、備考、差分を比較する。
- 未申告、シフト外、時間差、備考不足を整理し、本人確認が必要なものを明示する。
- 承認や差戻しは対象を限定し、差戻し理由を具体的に残す。
- 月次承認済みの記録はロック状態を尊重し、解除が必要なら管理者へ確認する。
`,
    "skills/assistant-messages/SKILL.md": `# メンバー連絡

- メッセージの送信者、対象グループ、未処理状態を確認する。
- 個別連絡と全体のお知らせを混同しない。
- 返信や対応済み更新の結果を確認し、個人情報を他のメンバーへ公開しない。
`,
    "skills/kinban-daily-operations/SKILL.md": `# 日次運用

- 未処理メッセージ、希望受付、公開予定、勤務申告、承認待ちを順に確認する。
- 変更がなければ変更なしと報告し、問題がある場合は対象と理由を列挙する。
- 画面操作が必要な作業はrunbooks/ui-only-operations.mdに従う。
`,
    "runbooks/defaults/shift-allocation-policy.md": `# シフト割当の標準方針

希望と勤務不可を確認し、必要人数を満たしながら重複と労務注意を減らします。案は保存、適用、公開を別の状態として扱います。
`,
    "runbooks/defaults/attendance-review-policy.md": `# 勤務承認の標準方針

申告時間、打刻、予定、休憩、備考を比較します。差戻しには理由を残し、承認後の変更は再申請と再承認が必要です。
`,
    "runbooks/defaults/member-communication-policy.md": `# メンバー連絡の標準方針

個別連絡は対象者を明示し、全体連絡はお知らせを使います。緊急性、返信要否、対応済み状態を記録します。
`,
    "runbooks/defaults/escalation-policy.md": `# エスカレーションの標準方針

権限不足、仕様判断、個人情報、労務上の判断が必要な場合は、処理を進めず管理者へ確認します。
`,
    "runbooks/ui-only-operations.md": `# UI専用操作

MCPにない操作は画面で行います。対象画面、対象グループ、入力値、保存結果を確認し、HTTP、DB、Git、デプロイで代替しません。
`,
    "runbooks/shift-plan-request-period.md": `# シフト希望受付期間

対象グループ、対象期間、受付期限、現在の状態を確認します。受付開始・終了は管理者の明示指示と画面またはMCPの結果を確認してから報告します。
`,
    "runbooks/shift-swap.md": `# シフト変更・交代

変更対象、本人の希望、現在の公開状態、必要人数を確認します。公開済みの変更は影響を明示し、必要なら対象者への連絡と再確認を行います。
`,
    "runbooks/local/README.md": `# 店舗固有ルール

店舗固有の手順はこのフォルダへ追加します。共通セットを更新してもローカルルールを上書きしないでください。
`,
  },
} as const;

export function buildAssistantBusinessSetFiles() {
  return {
    ...assistantBusinessSet.files,
    "manifest.json": JSON.stringify({
      packageVersion: assistantBusinessSet.packageVersion,
      releasedAt: assistantBusinessSet.releasedAt,
      summary: assistantBusinessSet.summary,
      minimumKinbanVersion: assistantBusinessSet.minimumKinbanVersion,
      files: Object.keys(assistantBusinessSet.files),
    }, null, 2) + "\n",
  };
}
