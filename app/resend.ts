import { env } from "cloudflare:workers";

function setting(name: string) {
  return process.env[name] ?? (env as Record<string, string | undefined>)[name] ?? "";
}

export function invitationUrl(token: string) {
  const baseUrl = (setting("PUBLIC_APP_URL") || "http://localhost:3003").replace(/\/$/, "");
  return `${baseUrl}/auth/email?token=${encodeURIComponent(token)}`;
}

export async function sendInvitationEmail(input: { to: string; token: string; expiresAt: string }) {
  const apiKey = setting("RESEND_API_KEY");
  const from = setting("RESEND_FROM_EMAIL") || "KINBAN通知 <notification@send.kinban.jp>";
  if (!apiKey) return { sent: false as const, reason: "not_configured" as const };
  const link = invitationUrl(input.token);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [input.to],
      ...(setting("RESEND_REPLY_TO") ? { reply_to: setting("RESEND_REPLY_TO") } : {}),
      subject: "KINBANへの招待",
      text: `KINBANへの招待が届いています。\n\n${link}`,
      html: `<p>KINBANへの招待が届いています。</p><p><a href="${link}">KINBANを開始する</a></p><p>有効期限: ${input.expiresAt}</p>`,
    }),
  });
  if (!response.ok) throw new Error(`Resend ${response.status}: ${(await response.text()).slice(0, 400)}`);
  const result = await response.json() as { id?: string };
  return { sent: true as const, id: result.id ?? null };
}
