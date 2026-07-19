type MemberRecord = {
  adminNote?: string | null;
  [key: string]: unknown;
};

/** Owners and editors may see administrative notes; regular members may not. */
export function canViewAdminNote(role: string | null | undefined) {
  return role === "owner" || role === "editor";
}

export function toPublicMember<T extends MemberRecord>(member: T, includeAdminNote: boolean) {
  const { adminNote, ...publicMember } = member;
  return includeAdminNote ? { ...publicMember, adminNote: adminNote ?? "" } : publicMember;
}
