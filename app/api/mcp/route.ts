// Sitesの公開ルーティングでは /mcp が予約パスとして扱われる場合があるため、
// 公開API用の互換入口として同じMCPハンドラを /api/mcp にも提供する。
export { POST, dynamic } from "../../mcp/route";
