import ExportGuide from "./export-guide";
const MCP_BASE = "https://my-day-calendar.chita256.chatgpt.site/api/mcp";
function Code({ children }: { children: string }) {
  return (
    <pre className="guide-code">
      <code>{children}</code>
    </pre>
  );
}
export default function McpGuide() {
  return (
    <>
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
        <li>個人用AIキー：グループごとに発行し、プロフィール・基本希望・本人のシフト・勤務申告を操作</li>
        <li>個人用AIキー：お知らせの確認・返信・管理者への連絡</li>
        <li>運営支援AIキー：メンバー管理・勤務枠作成・割当・公開・承認・全体通知</li>
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
      <div className="guide-warning">
        <strong>個人用AIキーと運営支援AIキー</strong>
        <p>
          個人用AIキーはグループごとに発行され、発行対象のグループと本人の操作に限定されます。管理者アカウントの本人用キーであっても、シフト作成・公開・割当・承認などは実行できません。運営支援AIを接続する場合は、グループの管理者が発行する運営支援AIキーを使用してください。
        </p>
      </div>
      <div className="guide-warning">
        <strong>Manager messages authorise assistant operations</strong>
        <p>
          The assistant uses its group-bound key for operational reads. For a direct task, the key owner is checked as the active manager and <code>sourceMessageId</code>/<code>claimId</code> may be omitted. When processing a member message, the current claimed message must still be supplied and its sender permissions are checked. Group settings decide which operations may be executed.
        </p>
      </div>
      <div className="guide-warning">
        <strong>運営支援AIは専用キーを使用してください</strong>
        <p>
          グループ管理者は <code>POST /api/groups/&lt;groupId&gt;/assistant/access</code> から、対象グループだけに制限された運営支援AIキーを発行できます。
          このキーでは、対象グループのメンバー情報・シフト・勤務記録などを運営支援のために参照できます。管理者がこのタスクへ直接指示する場合は、キー発行者の管理者権限とグループごとの実行許可を確認するため、管理者メッセージの <code>sourceMessageId</code> は不要です。メンバー問い合わせの処理中だけ、claimした管理者メッセージの <code>sourceMessageId</code> と <code>claimId</code> を指定します。
        </p>
      </div>
      <p className="guide-note">
        MCPの公開URL：<code>{MCP_BASE}</code>。ローカル開発時は{" "}
        <code>http://localhost:3001/mcp</code>（公開サイトは <code>/api/mcp</code>）{" "}
        です。ChatGPT側の接続設定や公開審査は別途必要で、エンドポイントを作っただけで左メニューのアプリに自動登録されるものではありません。
      </p>
    </section>
    <ExportGuide />
    </>
  );
}
