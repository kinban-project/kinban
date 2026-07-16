const MCP_BASE = "https://my-day-calendar.chita256.chatgpt.site/mcp";
function Code({ children }: { children: string }) {
  return (
    <pre className="guide-code">
      <code>{children}</code>
    </pre>
  );
}
export default function McpGuide() {
  return (
    <section className="mcp-guide">
      <p className="eyebrow section-label">MCP</p>
      <h2>AIエージェント向けMCP</h2>
      <p>
        My
        Dayには、画面操作に対応する読み書き用のMCP形式エンドポイントも用意しています。MCP自体がAIを呼び出すものではなく、接続したAIが予定・グループ・シフトを操作するための窓口です。
      </p>
      <div className="endpoint-title">
        <code>POST /mcp</code>
        <span>JSON-RPC形式</span>
      </div>
      <p>
        認証は通常のAPIと同じAPIキーです。キーをAIや外部サービスの指示文に貼り付けず、接続設定の秘密情報欄にだけ保存してください。
      </p>
      <Code>{`Authorization: Bearer md_あなたのAPIキー\nContent-Type: application/json`}</Code>
      <h3>初回接続</h3>
      <Code>{`{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{}}}`}</Code>
      <h3>利用できる操作</h3>
      <ul>
        <li>個人予定：一覧・登録・変更・削除</li>
        <li>グループ：一覧・メンバー・ニックネーム・基本希望</li>
        <li>勤務枠：一覧・作成・下書き調整・下書き削除</li>
        <li>シフト希望：本人分の取得・保存</li>
          <li>シフト割当：担当割り当て・保存・公開</li>
        <li>お知らせ：一覧・既読・作成・返信</li>
          <li>ダッシュボード：人数・シフト・公開状況・お知らせ件数</li>
      </ul>
      <h3>ツール呼び出し例</h3>
      <Code>{`{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"list_shift_plans","arguments":{"groupId":"group-id"}}}`}</Code>
      <div className="guide-warning">
        <strong>確認が必要な操作</strong>
        <p>
          変更・削除・勤務枠作成・希望保存・担当割り当て・公開・お知らせ作成は、AIが勝手に実行しないよう{" "}
          <code>confirm: true</code>{" "}
          が必要です。まず対象と変更内容を読み取り、利用者が確認してから同じ操作を実行する運用にしてください。
        </p>
      </div>
      <p className="guide-note">
        MCPの公開URL：<code>{MCP_BASE}</code>。ローカル開発時は{" "}
        <code>http://localhost:3001/mcp</code>{" "}
        です。ChatGPT側の接続設定や公開審査は別途必要で、エンドポイントを作っただけで左メニューのアプリに自動登録されるものではありません。
      </p>
    </section>
  );
}
