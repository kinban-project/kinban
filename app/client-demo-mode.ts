/** Client-safe demo mode detection. Never import server-only bindings here. */
export function isDemoModeClient(): boolean {
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") return true;
  if (typeof window === "undefined") return false;
  return window.location.hostname === "kinban-demo.chita256.chatgpt.site";
}
