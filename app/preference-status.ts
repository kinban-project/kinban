export const preferenceStatuses = [
  "want",
  "possible",
  "off",
  "unavailable",
] as const;

export type PreferenceStatus = (typeof preferenceStatuses)[number];

export function isPreferenceStatus(value: unknown): value is PreferenceStatus {
  return typeof value === "string" && preferenceStatuses.includes(value as PreferenceStatus);
}
