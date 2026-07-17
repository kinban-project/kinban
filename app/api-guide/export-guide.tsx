const API_BASE = "https://my-day-calendar.chita256.chatgpt.site";

export default function ExportGuide() {
  return (
    <section className="mcp-guide">
      <p className="eyebrow section-label">OPERATIONS EXPORT</p>
      <h2>運営向け一括取得</h2>
      <p>
        グループの代表管理者または管理者が、現在の運用情報をJSONで一括取得できます。
        取得専用で、データを変更する操作はありません。
      </p>
      <div className="endpoint-title">
        <code>GET /api/v1/groups/:groupId/export</code>
        <span>グループ運用情報のエクスポート</span>
      </div>
      <pre className="guide-code"><code>{`curl "${API_BASE}/api/v1/groups/group-id/export" \
  -H "Authorization: Bearer md_あなたのAPIキー"`}</code></pre>
      <p>
        グループ、メンバー、基本設定、勤務枠、希望、割り当て、勤務記録・休憩、お知らせ、既読状況、操作ログ、
        グループ予定、添付ファイルのメタ情報を含みます。添付ファイル本体は含みません。
      </p>
      <div className="guide-warning">
        <strong>取り扱いに注意</strong>
        <p>
          メンバーの希望・連絡内容・操作ログなどを含むため、バックアップ先はアクセス制限された場所に保存してください。
          APIキーには代表管理者または管理者の権限が反映されます。
        </p>
      </div>
    </section>
  );
}
