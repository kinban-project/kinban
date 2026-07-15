import { and, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { groupMembers, groups } from "../../../db/schema";

export async function getGroup(groupId: string) {
  const [group] = await getDb().select().from(groups).where(eq(groups.id, groupId)).limit(1);
  return group ?? null;
}

export async function getMembership(groupId: string, userEmail: string) {
  const [membership] = await getDb().select().from(groupMembers).where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userEmail, userEmail))).limit(1);
  return membership ?? null;
}

export async function requireGroupMembership(groupId: string, userEmail: string) {
  const membership = await getMembership(groupId, userEmail);
  if (!membership) throw new Error("GROUP_MEMBERSHIP_REQUIRED");
  return membership;
}

export async function canEditGroup(groupId: string, userEmail: string) {
  const membership = await getMembership(groupId, userEmail);
  return membership?.role === "owner" || membership?.role === "editor";
}

export function groupError(error: unknown) {
  if (error instanceof Error && error.message === "GROUP_MEMBERSHIP_REQUIRED") {
    return Response.json({ error: "このグループのメンバーではありません" }, { status: 403 });
  }
  return Response.json({ error: error instanceof Error ? error.message : "グループ処理に失敗しました" }, { status: 500 });
}
