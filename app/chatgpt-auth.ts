import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { env } from "cloudflare:workers";
import { ensureSiteAccess } from "./site-access";
import { getSiteSession, readCookie, SITE_SESSION_COOKIE } from "./site-sessions";

export type ChatGPTUser = {
  displayName: string;
  email: string;
  fullName: string | null;
};

const USER_EMAIL_HEADER = "oai-authenticated-user-email";
const USER_FULL_NAME_HEADER = "oai-authenticated-user-full-name";
const USER_FULL_NAME_ENCODING_HEADER =
  "oai-authenticated-user-full-name-encoding";
const PERCENT_ENCODED_UTF8 = "percent-encoded-utf-8";
const SIGN_IN_PATH = "/signin-with-chatgpt";
const SIGN_OUT_PATH = "/signout-with-chatgpt";
const CALLBACK_PATH = "/callback";

export async function getChatGPTIdentity(): Promise<ChatGPTUser | null> {
  const requestHeaders = await headers();
  const localMode = process.env.LOCAL_MODE === "true" || (env as { LOCAL_MODE?: string }).LOCAL_MODE === "true";
  if (localMode) {
    const localId = requestHeaders.get("x-dev-user-id") || process.env.LOCAL_USER_ID || (env as { LOCAL_USER_ID?: string }).LOCAL_USER_ID || "local-user";
    const email = localId.includes("@") ? localId : `${localId}@local.test`;
    return { displayName: localId, email, fullName: localId };
  }

  const sessionToken = readCookie(requestHeaders.get("cookie"), SITE_SESSION_COOKIE);
  const session = sessionToken ? await getSiteSession(sessionToken) : null;
  if (session) {
    return { displayName: session.displayName || session.userEmail, email: session.userEmail, fullName: session.displayName || null };
  }
  const email = requestHeaders.get(USER_EMAIL_HEADER);
  if (!email) return null;

  const encodedFullName = requestHeaders.get(USER_FULL_NAME_HEADER);
  const fullName =
    encodedFullName &&
    requestHeaders.get(USER_FULL_NAME_ENCODING_HEADER) === PERCENT_ENCODED_UTF8
      ? safeDecodeURIComponent(encodedFullName)
      : null;

  const identity = {
    displayName: fullName ?? email,
    email,
    fullName,
  };
  return identity;
}

export async function getChatGPTUser(): Promise<ChatGPTUser | null> {
  const identity = await getChatGPTIdentity();
  if (!identity) return null;
  const localMode = process.env.LOCAL_MODE === "true" || (env as { LOCAL_MODE?: string }).LOCAL_MODE === "true";
  if (localMode) return identity;
  const siteUser = await ensureSiteAccess(identity);
  return siteUser ? identity : null;
}

export async function requireChatGPTUser(
  returnTo: string,
): Promise<ChatGPTUser> {
  const user = await getChatGPTUser();
  if (user) return user;

  redirect(chatGPTSignInPath(returnTo));
}

export function chatGPTSignInPath(returnTo: string): string {
  const safeReturnTo = safeRelativeReturnPath(returnTo);
  return `${SIGN_IN_PATH}?return_to=${encodeURIComponent(safeReturnTo)}`;
}

export function chatGPTSignOutPath(returnTo = "/"): string {
  const safeReturnTo = safeRelativeReturnPath(returnTo);
  return `${SIGN_OUT_PATH}?return_to=${encodeURIComponent(safeReturnTo)}`;
}

function safeRelativeReturnPath(value: string): string {
  if (!value.startsWith("/") || value.startsWith("//")) return "/";

  let url: URL;
  try {
    url = new URL(value, "https://app.local");
  } catch {
    return "/";
  }
  if (url.origin !== "https://app.local") return "/";
  if (isReservedAuthPath(url.pathname)) return "/";

  return `${url.pathname}${url.search}${url.hash}`;
}

function isReservedAuthPath(pathname: string): boolean {
  return (
    pathname === SIGN_IN_PATH ||
    pathname === SIGN_OUT_PATH ||
    pathname === CALLBACK_PATH
  );
}

function safeDecodeURIComponent(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}
