import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("Google OAuth uses PKCE and a callback session cookie", () => {
  const start = fs.readFileSync("app/auth/google/start/route.ts", "utf8");
  const callback = fs.readFileSync("app/auth/google/callback/route.ts", "utf8");
  const auth = fs.readFileSync("app/chatgpt-auth.ts", "utf8");
  assert.match(start, /code_challenge_method/);
  assert.match(start, /kinban_oauth_state/);
  assert.match(callback, /state !== expectedState/);
  assert.match(callback, /issueSiteSession/);
  assert.match(callback, /SITE_SESSION_COOKIE/);
  assert.match(auth, /getSiteSession/);
});
