import { env } from "cloudflare:workers";
import { serializeCookie } from "../../../site-sessions";

export const dynamic = "force-dynamic";

function configured(name: string) {
  return process.env[name] ?? (env as Record<string, string | undefined>)[name];
}

function base64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

async function challenge(verifier: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64Url(new Uint8Array(digest));
}

export async function GET(request: Request) {
  const clientId = configured("GOOGLE_CLIENT_ID");
  const redirectUri = configured("GOOGLE_REDIRECT_URI");
  if (!clientId || !redirectUri) return Response.json({ error: "Google OAuthの環境変数が未設定です" }, { status: 503 });

  const url = new URL(request.url);
  const requestedReturnTo = url.searchParams.get("return_to") ?? "/";
  const returnTo = requestedReturnTo.startsWith("/") && !requestedReturnTo.startsWith("//") ? requestedReturnTo : "/";
  const state = base64Url(crypto.getRandomValues(new Uint8Array(32)));
  const verifier = base64Url(crypto.getRandomValues(new Uint8Array(48)));
  const auth = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  auth.searchParams.set("client_id", clientId);
  auth.searchParams.set("redirect_uri", redirectUri);
  auth.searchParams.set("response_type", "code");
  auth.searchParams.set("scope", "openid email profile");
  auth.searchParams.set("state", state);
  auth.searchParams.set("code_challenge", await challenge(verifier));
  auth.searchParams.set("code_challenge_method", "S256");
  auth.searchParams.set("prompt", "select_account");

  const secure = new URL(redirectUri).protocol === "https:";
  const responseHeaders = new Headers({ Location: auth.toString() });
  responseHeaders.append("Set-Cookie", serializeCookie("kinban_oauth_state", state, { httpOnly: true, secure, sameSite: "Lax", path: "/auth/google", maxAge: 600 }));
  responseHeaders.append("Set-Cookie", serializeCookie("kinban_oauth_verifier", verifier, { httpOnly: true, secure, sameSite: "Lax", path: "/auth/google", maxAge: 600 }));
  responseHeaders.append("Set-Cookie", serializeCookie("kinban_oauth_return_to", returnTo, { httpOnly: true, secure, sameSite: "Lax", path: "/auth/google", maxAge: 600 }));
  return new Response(null, { status: 302, headers: responseHeaders });
}
