export type AssignmentProposalStatus = "candidate" | "published" | "superseded";

export type AssignmentProposalMeta = {
  proposalStatus: AssignmentProposalStatus;
  publishedAt?: string;
  publishedBy?: string;
  baseSlotIds?: string[];
  baseSlotSignature?: AssignmentProposalSlot[];
};

export type AssignmentProposalSlot = {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  requiredCount: number;
  role: string;
};

export function proposalSlotSignature(slots: Array<AssignmentProposalSlot>): AssignmentProposalSlot[] {
  return slots.map((slot) => ({
    id: slot.id,
    date: slot.date,
    startTime: slot.startTime,
    endTime: slot.endTime,
    requiredCount: Number(slot.requiredCount),
    role: slot.role ?? "",
  })).sort((a, b) => a.id.localeCompare(b.id));
}

export function proposalMatchesSlots(meta: AssignmentProposalMeta, slots: Array<AssignmentProposalSlot>): boolean {
  if (!meta.baseSlotSignature) return true;
  return JSON.stringify(meta.baseSlotSignature) === JSON.stringify(proposalSlotSignature(slots));
}

export function proposalMeta(value: unknown): AssignmentProposalMeta {
  const input = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const status = input.proposalStatus;
  return {
    proposalStatus: status === "published" || status === "superseded" ? status : "candidate",
    ...(typeof input.publishedAt === "string" ? { publishedAt: input.publishedAt } : {}),
    ...(typeof input.publishedBy === "string" ? { publishedBy: input.publishedBy } : {}),
    ...(Array.isArray(input.baseSlotIds) ? { baseSlotIds: input.baseSlotIds.filter((item): item is string => typeof item === "string") } : {}),
    ...(Array.isArray(input.baseSlotSignature) ? { baseSlotSignature: proposalSlotSignature(input.baseSlotSignature.filter((item): item is AssignmentProposalSlot => Boolean(item && typeof item === "object" && typeof item.id === "string" && typeof item.date === "string" && typeof item.startTime === "string" && typeof item.endTime === "string" && typeof item.role === "string"))) } : {}),
  };
}

export function proposalSettings(settings: unknown, meta: Partial<AssignmentProposalMeta> = {}) {
  const base = settings && typeof settings === "object" && !Array.isArray(settings)
    ? settings as Record<string, unknown>
    : {};
  const current = proposalMeta(base);
  return {
    ...base,
    proposalStatus: meta.proposalStatus ?? current.proposalStatus,
    ...(meta.publishedAt !== undefined ? { publishedAt: meta.publishedAt } : current.publishedAt ? { publishedAt: current.publishedAt } : {}),
    ...(meta.publishedBy !== undefined ? { publishedBy: meta.publishedBy } : current.publishedBy ? { publishedBy: current.publishedBy } : {}),
    ...(meta.baseSlotIds !== undefined ? { baseSlotIds: meta.baseSlotIds } : current.baseSlotIds ? { baseSlotIds: current.baseSlotIds } : {}),
    ...(meta.baseSlotSignature !== undefined ? { baseSlotSignature: meta.baseSlotSignature } : current.baseSlotSignature ? { baseSlotSignature: current.baseSlotSignature } : {}),
  };
}
