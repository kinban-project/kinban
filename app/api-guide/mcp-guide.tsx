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
      <div className="guide-warning">
        <strong>Execution context is required for assistant group reads</strong>
        <p>
          Member chat responses include a short-lived <code>contextToken</code> bound to that member and message. Manager operations must first request <code>POST /api/groups/&lt;groupId&gt;/assistant/contexts</code>. MCP rejects group member, work record, announcement, dashboard, and assistant-message reads without a valid context. Member contexts cannot select another member and work records are returned without manager-only fields.
        </p>
      </div>
      <div className="guide-warning">
        <strong>運営支援AIは専用キーを使用してください</strong>
        <p>
          グループ管理者は <code>POST /api/groups/&lt;groupId&gt;/assistant/access</code> から、対象グループだけに制限された運営支援AIキーを発行できます。
          このキーでは、メンバー情報・シフト・勤務記録などの限定された読み取りと、アシスタント返信だけが利用できます。権限変更、承認、シフト公開などの管理操作は実行できません。
        </p>
        <p>
          アシスタント返信には、管理者が <code>POST /api/groups/&lt;groupId&gt;/assistant/confirmations</code> で発行した一回限りの <code>confirmationToken</code> が必要です。トークンは短時間で失効し、1回しか使用できません。
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
