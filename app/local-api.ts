export function localApiFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  if (process.env.NEXT_PUBLIC_DEMO_MODE !== "true") return fetch(input, init);
  const headers = new Headers(init.headers);
  const params = new URLSearchParams(typeof window === "undefined" ? "" : window.location.search);
  const userId = params.get("user") || (typeof window !== "undefined" && window.localStorage.getItem("kinban-demo-user")) || process.env.NEXT_PUBLIC_DEMO_DEFAULT_USER_ID || "tanaka";
  headers.set("x-demo-user-id", userId);
  return fetch(input, { ...init, headers });
}

export function getLocalUserId() {
  if (typeof window === "undefined") return process.env.NEXT_PUBLIC_DEMO_DEFAULT_USER_ID || "tanaka";
  const params = new URLSearchParams(window.location.search);
  return params.get("user") || window.localStorage.getItem("kinban-demo-user") || process.env.NEXT_PUBLIC_DEMO_DEFAULT_USER_ID || "tanaka";
}

export function setLocalUserId(userId: string) {
  if (typeof window !== "undefined") window.localStorage.setItem("kinban-demo-user", userId);
}
