import { env } from "cloudflare:workers";
import { ensureProviderAccess } from "../../../site-access";
import { issueSiteSession, readCookie, serializeCookie, SITE_SESSION_COOKIE } from "../../../site-sessions";

export const dynamic = "force-dynamic";

function configured(name: string) {
  return process.env[name] ?? (env as Record<string, string | undefined>)[name];
}

function fail(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const params = url.searchParams;
  if (params.get("error")) return fail(`Googleログインがキャンセルされました: ${params.get("error")}`);
  const code = params.get("code");
  const state = params.get("state");
  const requestCookie = request.headers.get("cookie");
  const expectedState = readCookie(requestCookie, "kinban_oauth_state");
  const verifier = readCookie(requestCookie, "kinban_oauth_verifier");
  if (!code || !state || !expectedState || state !== expectedState || !verifier) return fail("Google OAuthのstate検証に失敗しました");

  const clientId = configured("GOOGLE_CLIENT_ID");
  const clientSecret = configured("GOOGLE_CLIENT_SECRET");
  const redirectUri = configured("GOOGLE_REDIRECT_URI");
  if (!clientId || !clientSecret || !redirectUri) return fail("Google OAuthの環境変数が未設定です", 503);

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: "authorization_code", code_verifier: verifier }),
  });
  if (!tokenResponse.ok) return fail("Googleからアクセストークンを取得できませんでした", 502);
  const tokens = await tokenResponse.json() as { access_token?: string };
  if (!tokens.access_token) return fail("Googleのアクセストークンがありません", 502);

  const profileResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { authorization: `Bearer ${tokens.access_token}` } });
  if (!profileResponse.ok) return fail("Googleの本人情報を取得できませんでした", 502);
  const profile = await profileResponse.json() as { sub?: string; email?: string; email_verified?: boolean; name?: string };
  const email = profile.email?.trim().toLowerCase();
  if (!profile.sub || !email || profile.email_verified !== true) return fail("Googleの確認済みメールアドレスが必要です", 403);

  const siteUser = await ensureProviderAccess({ email, displayName: profile.name?.trim() || email, provider: "google", providerSubject: profile.sub });
  if (!siteUser) return fail("招待・承認済みの利用者ではありません", 403);
  const session = await issueSiteSession(siteUser.id);
  const returnTo = readCookie(requestCookie, "kinban_oauth_return_to") || "/";
  const responseHeaders = new Headers({ Location: new URL(returnTo, url.origin).toString() });
  const secure = url.protocol === "https:";
  responseHeaders.append("Set-Cookie", serializeCookie(SITE_SESSION_COOKIE, session.token, { httpOnly: true, secure, sameSite: "Lax", path: "/", maxAge: 60 * 60 * 24 * 30 }));
  for (const name of ["kinban_oauth_state", "kinban_oauth_verifier", "kinban_oauth_return_to"]) responseHeaders.append("Set-Cookie", serializeCookie(name, "", { httpOnly: true, secure, sameSite: "Lax", path: "/auth/google", maxAge: 0 }));
  return new Response(null, { status: 302, headers: responseHeaders });
}
