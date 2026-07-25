import { redirect } from "next/navigation";
import { isDemoModeServer } from "../demo-mode";
import DemoClockPanel from "./demo-clock-panel";

const scenarios = [
  {
    id: "store",
    name: "飲食店",
    description: "ホールと厨房を分けて、日中から深夜までのシフトを管理する例です。",
    detail: "sample-store",
    users: [
      ["tanaka", "店長", "代表管理者"],
      ["member01", "副店長", "管理者"],
      ["member02", "学生A", "メンバー"],
      ["member04", "主婦A", "メンバー"],
      ["member06", "フリーターA", "メンバー"],
    ],
  },
  {
    id: "nightclub",
    name: "ナイトクラブ",
    description: "A店スタッフとA店キャストを分け、深夜・延長・遅刻理由などを扱う例です。",
    detail: "nightclub",
    users: [
      ["night-manager", "店長", "代表管理者"],
      ["night-staff-a", "スタッフA", "メンバー"],
      ["night-cast-a", "キャストA", "メンバー"],
    ],
  },
  {
    id: "hospital",
    name: "病院",
    description: "医師・看護師・受付を分け、平日日中と休日夜間を管理する例です。",
    detail: "hospital",
    users: [
      ["hospital-director", "院長", "代表管理者"],
      ["hospital-doctor-senior", "ベテラン医師", "メンバー"],
      ["hospital-nurse-chief", "看護師長", "メンバー"],
      ["hospital-reception-a", "受付A", "メンバー"],
    ],
  },
] as const;

export default function DemoPage() {
  if (!isDemoModeServer()) redirect("/");

  return (
    <main className="shell demo-page">
      <header className="topbar demo-topbar">
        <a className="brand demo-brand" href="/">
          <img className="brand-mark" src="/kinban-mark.png" alt="" />
          <span>KINBAN <small className="brand-latin">DEMO</small></span>
        </a>
        <a className="ghost-button" href="/">ホームへ戻る</a>
      </header>
      <section className="demo-hero">
        <p className="eyebrow">DEMO MODE</p>
        <h1>KINBANをデモで試す</h1>
        <p>
          業種ごとのサンプルシナリオとユーザーを選んで、シフト作成・勤務希望・勤務申告などの画面を確認できます。
        </p>
        <div className="demo-disclaimer">
          <strong>体験版のサンプルデータです</strong>
          <span>表示名を選ぶと、そのユーザーとしてホーム画面を開けます。ユーザーは自由に切り替えできます。</span>
          <span>データは予告なくリセットされる場合があります。重要な情報は登録しないでください。</span>
        </div>
      </section>
      <DemoClockPanel />
      <div className="demo-scenario-list">
        {scenarios.map((scenario) => (
          <section className="demo-scenario" key={scenario.id}>
            <div className="demo-scenario-head">
              <div>
                <p className="eyebrow">SCENARIO</p>
                <h2>{scenario.name}</h2>
                <p>{scenario.description}</p>
              </div>
              <a className="text-link" href={`/demo-scenarios/${scenario.detail}.html`}>
                シナリオ詳細 →
              </a>
            </div>
            <div className="demo-user-grid">
              {scenario.users.map(([user, label, role]) => (
                <div className="demo-user-card" key={user}>
                  <span className="demo-user-avatar">{label.slice(0, 1)}</span>
                  <span className="demo-user-info">
                    <a className="demo-user-login" href={`/?user=${encodeURIComponent(user)}`}>
                      {label}
                    </a>
                    <small>{role}・このユーザーで開く</small>
                  </span>
                  <span className="demo-user-arrow" aria-hidden="true">→</span>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
