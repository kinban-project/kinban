import Link from "next/link";
import { getChatGPTUser } from "../chatgpt-auth";
import ApiKeyPanel from "./api-key-panel";

export const dynamic = "force-dynamic";

export default async function ApiGuidePage() {
  const user = await getChatGPTUser();
  return <main className="guide-shell"><header className="guide-header"><Link href="/" className="guide-back">← My Day</Link><p className="eyebrow">DEVELOPER GUIDE</p><h1>My Day API</h1><p>予定をAIや外部アプリから扱うための、シンプルなAPIガイドです。</p></header><section className="guide-grid"><article className="guide-card"><p className="eyebrow">QUICK START</p><h2>1. APIキーを発行</h2>{user ? <ApiKeyPanel /> : <><p>APIを利用するにはChatGPTでログインしてください。</p><a className="primary-button guide-button" href="/signin-with-chatgpt?return_to=/api-guide">ChatGPTでログイン</a></>}<h2>2. タスク一覧を取得</h2><pre><code>{`curl "https://my-day-calendar.chita256.chatgpt.site/api/v1/tasks" -H "Authorization: Bearer md_あなたのAPIキー"`}</code></pre><h2>3. タスクを登録</h2><pre><code>{`curl -X POST "https://my-day-calendar.chita256.chatgpt.site/api/v1/tasks" -H "Authorization: Bearer md_あなたのAPIキー" -H "Content-Type: application/json" -d '{"title":"資料作成","date":"2026-07-18","startTime":"10:00","endTime":"11:00"}'`}</code></pre></article><aside className="guide-card guide-side"><p className="eyebrow">ENDPOINTS</p><h2>利用できる操作</h2><ul><li><code>GET /api/v1/tasks</code><span>予定一覧。from / toで期間指定</span></li><li><code>GET /api/v1/tasks/:id</code><span>予定の詳細</span></li><li><code>POST /api/v1/tasks</code><span>予定の登録</span></li><li><code>PATCH /api/v1/tasks/:id</code><span>予定の変更</span></li><li><code>DELETE /api/v1/tasks/:id</code><span>予定の削除</span></li></ul><div className="guide-note"><strong>認証について</strong><p>APIキーはログイン中のあなたの予定だけにアクセスできます。キーはパスワードと同じように扱い、URLや公開コードに直接書かないでください。</p></div></aside></section></main>;
}
