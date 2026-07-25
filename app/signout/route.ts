import { headers } from "next/headers";
import { revokeSiteSession, readCookie, serializeCookie, SITE_SESSION_COOKIE } from "../site-sessions";

export async function GET(request: Request) {
  const requestHeaders = await headers();
  const token = readCookie(requestHeaders.get("cookie"), SITE_SESSION_COOKIE);
  if (token) await revokeSiteSession(token);
  const url = new URL(request.url);
  const responseHeaders = new Headers({ Location: new URL("/", url.origin).toString() });
  responseHeaders.append("Set-Cookie", serializeCookie(SITE_SESSION_COOKIE, "", { httpOnly: true, secure: url.protocol === "https:", sameSite: "Lax", path: "/", maxAge: 0 }));
  return new Response(null, { status: 302, headers: responseHeaders });
}
