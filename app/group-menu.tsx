"use client";

import { useState } from "react";

type Group = { groupId: string; name?: string; role: string };

type Props = {
  groups: Group[];
  onApplications: () => void;
  onBasic: (groupId: string) => void;
  onRequests: (groupId: string) => void;
  onRoster: (groupId: string) => void;
  onShiftBuilder: (groupId: string) => void;
  onMembers: (groupId: string) => void;
};

function DisabledButton({ children }: { children: React.ReactNode }) {
  return <button className="group-menu-button disabled" type="button" disabled>{children}</button>;
}

export default function GroupMenu({ groups, onApplications, onBasic, onRequests, onRoster, onShiftBuilder, onMembers }: Props) {
  const [openManagement, setOpenManagement] = useState<string | null>(null);
  return <nav className="group-menu" aria-label="グループメニュー">
    <div className="group-menu-global"><button className="group-menu-application" type="button" onClick={onApplications}>グループ申請</button></div>
    {groups.map((group) => {
      const manager = group.role === "owner" || group.role === "editor";
      return <div className="group-menu-row" key={group.groupId}><strong className="group-menu-name">{group.name ?? group.groupId}</strong><div className="group-menu-actions"><button className="group-menu-button" type="button" onClick={() => onBasic(group.groupId)}>基本設定</button><button className="group-menu-button emphasis" type="button" onClick={() => onRequests(group.groupId)}>シフト希望（受付中）</button><button className="group-menu-button" type="button" onClick={() => onRoster(group.groupId)}>現在のシフト</button><DisabledButton>お知らせ</DisabledButton>{manager && <><div className="admin-inline"><button className="group-menu-button admin" type="button" onClick={() => onShiftBuilder(group.groupId)}>シフト作成</button><button className="group-menu-button admin" type="button" onClick={() => onRequests(group.groupId)}>希望受付</button><button className="group-menu-button admin" type="button" onClick={() => onMembers(group.groupId)}>メンバー管理</button><DisabledButton>お知らせ作成</DisabledButton><DisabledButton>確認状況</DisabledButton><DisabledButton>ダッシュボード</DisabledButton></div><div className="admin-compact"><button className="group-menu-button admin" type="button" onClick={() => setOpenManagement(openManagement === group.groupId ? null : group.groupId)}>管理 ▾</button>{openManagement === group.groupId && <div className="admin-popover"><button onClick={() => onShiftBuilder(group.groupId)}>シフト作成</button><button onClick={() => onRequests(group.groupId)}>希望受付</button><button onClick={() => onMembers(group.groupId)}>メンバー管理</button><DisabledButton>お知らせ作成</DisabledButton><DisabledButton>確認状況</DisabledButton><DisabledButton>ダッシュボード</DisabledButton></div>}</div></>}</div></div>;
    })}
  </nav>;
}
