export function localApiFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  if (process.env.NEXT_PUBLIC_LOCAL_MODE !== "true") return fetch(input, init);
  const headers = new Headers(init.headers);
  const params = new URLSearchParams(typeof window === "undefined" ? "" : window.location.search);
  const userId = (typeof window !== "undefined" && window.localStorage.getItem("myday-dev-user")) || params.get("user") || process.env.NEXT_PUBLIC_LOCAL_USER_ID || "tanaka";
  headers.set("x-dev-user-id", userId);
  return fetch(input, { ...init, headers });
}

export function getLocalUserId() {
  if (typeof window === "undefined") return process.env.NEXT_PUBLIC_LOCAL_USER_ID || "tanaka";
  const params = new URLSearchParams(window.location.search);
  return window.localStorage.getItem("myday-dev-user") || params.get("user") || process.env.NEXT_PUBLIC_LOCAL_USER_ID || "tanaka";
}

export function setLocalUserId(userId: string) {
  if (typeof window !== "undefined") window.localStorage.setItem("myday-dev-user", userId);
}
