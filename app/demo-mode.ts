import { env } from "cloudflare:workers";

/** Server-side demo mode flag. Demo mode intentionally bypasses site auth. */
export function isDemoModeServer(): boolean {
  return (
    process.env.DEMO_MODE === "true" ||
    (env as { DEMO_MODE?: string }).DEMO_MODE === "true"
  );
}

/** Client-side demo mode flag, embedded at build time. */
export function isDemoModeClient(): boolean {
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") return true;
  if (typeof window === "undefined") return false;
  return window.location.hostname === "demo.kinban.jp";
}
