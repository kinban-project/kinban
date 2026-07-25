"use client";

import { useEffect, useMemo, useState } from "react";
import { localApiFetch } from "./local-api";

type Folder = { id: string; name: string; createdBy: string };
type Note = { id: string; folderId: string; authorEmail: string; authorName: string; targetDate: string; title: string; body: string; visibility: "group" | "managers" | "private"; canEdit: boolean };
type MemberOption = { email: string; name: string };
type Props = { groupId: string };

function today() { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" }).format(new Date()); }
function visibilityLabel(value: Note["visibility"]) { return value === "managers" ? "管理者のみ" : value === "private" ? "自分のみ" : "グループ共有"; }

export default function MemosPanel({ groupId }: Props) {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [role, setRole] = useState("member");
  const [selectedFolderId, setSelectedFolderId] = useState("");
  const [query, setQuery] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [selectedAuthorEmail, setSelectedAuthorEmail] = useState("");
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Note | null>(null);
  const [draft, setDraft] = useState({ folderId: "", targetDate: today(), title: "", body: "", visibility: "group" });
  const [folderName, setFolderName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canManageFolders = role === "owner" || role === "editor";

  async function load(overrides: { folderId?: string; authorEmail?: string } = {}) {
    const params = new URLSearchParams();
    const folderId = overrides.folderId ?? selectedFolderId;
    const authorEmail = overrides.authorEmail ?? selectedAuthorEmail;
    if (folderId) params.set("folderId", folderId);
    if (query.trim()) params.set("q", query.trim());
    if (dateFilter) params.set("date", dateFilter);
    if (authorEmail) params.set("authorEmail", authorEmail);
    const response = await localApiFetch(`/api/groups/${groupId}/memos?${params}`);
    if (!response.ok) { setError("業務メモを読み込めませんでした"); return; }
    const data = await response.json() as { folders: Folder[]; notes: Note[]; role: string; currentEmail?: string; members?: MemberOption[] };
    setFolders(data.folders);
    setNotes(data.notes);
    setRole(data.role);
    setMembers(data.members ?? []);
    if (!selectedAuthorEmail && data.currentEmail) setSelectedAuthorEmail(data.currentEmail);
    if (!selectedFolderId && data.folders[0]) {
      setSelectedFolderId(data.folders[0].id);
      if (!folderId) void load({ folderId: data.folders[0].id, authorEmail: authorEmail || data.currentEmail });
    }
  }

  useEffect(() => { void load(); }, [groupId]);

  function newNote() {
    const folder = folders.find((item) => item.id === selectedFolderId) ?? folders[0];
    const targetDate = today();
    setEditing(null);
    setEditorOpen(true);
    setDraft({ folderId: folder?.id ?? "", targetDate, title: folder?.name === "日報" ? `${targetDate} 日報` : "", body: "", visibility: "group" });
    setError(null);
  }

  function editNote(note: Note) {
    setEditing(note);
    setEditorOpen(true);
    setDraft({ folderId: note.folderId, targetDate: note.targetDate, title: note.title, body: note.body, visibility: note.visibility });
    setError(null);
  }

  async function saveNote() {
    if (!draft.title.trim()) { setError("タイトルを入力してください"); return; }
    setBusy(true); setError(null);
    const url = editing ? `/api/groups/${groupId}/memos/${editing.id}` : `/api/groups/${groupId}/memos`;
    const response = await localApiFetch(url, { method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(editing ? draft : { action: "create", ...draft }) });
    if (!response.ok) { const data = await response.json().catch(() => ({})) as { error?: string }; setError(data.error ?? "保存できませんでした"); setBusy(false); return; }
    setBusy(false); setEditing(null); setEditorOpen(false); await load();
  }

  async function deleteNote() {
    if (!editing || !window.confirm("この業務メモを削除しますか？")) return;
    setBusy(true);
    const response = await localApiFetch(`/api/groups/${groupId}/memos/${editing.id}`, { method: "DELETE" });
    if (!response.ok) setError("削除できませんでした"); else { setEditing(null); setEditorOpen(false); await load(); }
    setBusy(false);
  }

  async function createFolder() {
    if (!folderName.trim()) return;
    setBusy(true); setError(null);
    const response = await localApiFetch(`/api/groups/${groupId}/memos`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "folder", name: folderName }) });
    if (!response.ok) { const data = await response.json().catch(() => ({})) as { error?: string }; setError(data.error ?? "フォルダを作成できませんでした"); }
    else { setFolderName(""); await load(); }
    setBusy(false);
  }

  const currentFolderName = useMemo(() => folders.find((item) => item.id === selectedFolderId)?.name ?? "業務メモ", [folders, selectedFolderId]);

  return <div className="memos-panel">
    <div className="modal-head memos-head">
      <div><p className="eyebrow">WORK NOTES</p><h2>業務メモ</h2><p className="panel-copy">日報・申し送り・気づきをグループで整理できます。</p></div>
      <button className="primary-button" type="button" onClick={newNote}>新規メモ</button>
    </div>
    {error && <p className="form-error">{error}</p>}
    <div className="memos-toolbar">
      <select value={selectedFolderId} onChange={(event) => { const folderId = event.target.value; setSelectedFolderId(folderId); setEditing(null); void load({ folderId }); }} aria-label="フォルダ">
        {folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
      </select>
      {canManageFolders && <select className="memo-member-filter" value={selectedAuthorEmail || "self"} onChange={(event) => { const authorEmail = event.target.value; setSelectedAuthorEmail(authorEmail); void load({ authorEmail }); }} aria-label="確認するメンバー">
        <option value="self">確認するメンバー：自分</option>
        <option value="all">確認するメンバー：全員</option>
        {members.map((member) => <option key={member.email} value={member.email}>{`確認するメンバー：${member.name}`}</option>)}
      </select>}
      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="タイトル・本文を検索" />
      <input type="date" value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} aria-label="対象日で絞り込み" />
      <button className="ghost-button" type="button" onClick={() => void load()}>検索</button>
    </div>
    <div className="memos-layout">
      <aside className="memo-folders">
        <p className="eyebrow">FOLDERS</p>
        {folders.map((folder) => <button key={folder.id} className={`memo-folder-button${folder.id === selectedFolderId ? " selected" : ""}`} type="button" onClick={() => { setSelectedFolderId(folder.id); setEditing(null); void load({ folderId: folder.id }); }}>{folder.name}</button>)}
        {canManageFolders && <div className="memo-folder-create"><input value={folderName} onChange={(event) => setFolderName(event.target.value)} placeholder="新しいフォルダ" /><button className="ghost-button" type="button" disabled={busy} onClick={() => void createFolder()}>追加</button></div>}
      </aside>
      <section className="memo-list" aria-label={`${currentFolderName}のメモ`}>
        {notes.length === 0 && <div className="empty-state">メモはまだありません。新規メモから作成できます。</div>}
        {notes.map((note) => <button className="memo-card" type="button" key={note.id} onClick={() => note.canEdit && editNote(note)}>
          <span className="memo-card-title">{note.title}</span><span className="memo-card-meta">{note.targetDate || "日付なし"} ・ {note.authorName} ・ {visibilityLabel(note.visibility)}</span><span className="memo-card-body">{note.body || "本文なし"}</span>
        </button>)}
      </section>
    </div>
    {editorOpen && <div className="memo-editor"><div className="memo-editor-head"><strong>{editing ? "業務メモを編集" : "新しい業務メモ"}</strong><button className="ghost-button" type="button" onClick={() => { setEditing(null); setEditorOpen(false); }}>閉じる</button></div><MemoForm draft={draft} folders={folders} setDraft={setDraft} /><div className="memo-editor-actions"><button className="primary-button" type="button" disabled={busy} onClick={() => void saveNote()}>保存</button>{editing && <button className="danger-button" type="button" disabled={busy} onClick={() => void deleteNote()}>削除</button>}</div></div>}
    {!editorOpen && <div className="memo-hint">メモを選択すると内容を編集できます。管理者はグループ内のメモを確認できます。</div>}
  </div>;
}

function MemoForm({ draft, folders, setDraft }: { draft: { folderId: string; targetDate: string; title: string; body: string; visibility: string }; folders: Folder[]; setDraft: (value: { folderId: string; targetDate: string; title: string; body: string; visibility: string }) => void }) {
  return <div className="memo-form"><label>フォルダ<select value={draft.folderId} onChange={(event) => setDraft({ ...draft, folderId: event.target.value })}>{folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select></label><label>対象日<input type="date" value={draft.targetDate} onChange={(event) => setDraft({ ...draft, targetDate: event.target.value })} /></label><label>タイトル<input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label><label>公開範囲<select value={draft.visibility} onChange={(event) => setDraft({ ...draft, visibility: event.target.value })}><option value="group">グループ共有</option><option value="managers">管理者のみ</option><option value="private">自分のみ</option></select></label><label className="memo-body-label">本文<textarea rows={8} value={draft.body} onChange={(event) => setDraft({ ...draft, body: event.target.value })} /></label></div>;
}
