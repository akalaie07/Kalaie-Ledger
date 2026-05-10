const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://buchhaltung-kalaie.vercel.app";
const FROM_EMAIL = process.env.EMAIL_FROM_ADDRESS ?? "noreply@kalaie-ledger.com";
const FROM_NAME = process.env.EMAIL_FROM_NAME ?? "Buchhaltung Kalaie";

const ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  closer: "Closer",
  sales_partner: "Vertriebspartner",
};

export async function sendInviteEmail({
  to,
  role,
  token,
  orgName,
  invitedByName,
}: {
  to: string;
  role: string;
  token: string;
  orgName: string;
  invitedByName: string;
}): Promise<{ ok: boolean; error?: string }> {
  if (!process.env.BREVO_API_KEY) {
    return { ok: false, error: "BREVO_API_KEY nicht konfiguriert." };
  }

  const inviteUrl = `${APP_URL}/invite?token=${token}`;
  const roleLabel = ROLE_LABEL[role] ?? role;

  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": process.env.BREVO_API_KEY,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      sender: { name: FROM_NAME, email: FROM_EMAIL },
      to: [{ email: to }],
      subject: `Du wurdest zu ${orgName} eingeladen`,
      htmlContent: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: system-ui, sans-serif; background: #0a0a0a; color: #fafafa; margin: 0; padding: 40px 20px;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center">
        <table width="480" cellpadding="0" cellspacing="0" style="background: #1c1c1c; border-radius: 12px; border: 1px solid rgba(255,255,255,0.1); overflow: hidden;">
          <tr>
            <td style="padding: 32px 32px 24px;">
              <p style="font-size: 22px; font-weight: 600; margin: 0 0 8px;">Einladung erhalten</p>
              <p style="color: #888; font-size: 14px; margin: 0;">
                <strong style="color: #fafafa;">${invitedByName}</strong> hat dich eingeladen, der Organisation
                <strong style="color: #fafafa;">${orgName}</strong> als
                <strong style="color: #fafafa;">${roleLabel}</strong> beizutreten.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 32px 32px;">
              <a href="${inviteUrl}"
                style="display: inline-block; background: #fafafa; color: #0a0a0a; font-size: 14px; font-weight: 600; padding: 12px 24px; border-radius: 8px; text-decoration: none;">
                Einladung annehmen
              </a>
              <p style="color: #555; font-size: 12px; margin: 20px 0 0;">
                Link gültig für 14 Tage. Falls der Button nicht funktioniert:<br>
                <a href="${inviteUrl}" style="color: #888; word-break: break-all;">${inviteUrl}</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim(),
    }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    return { ok: false, error: (body as { message?: string }).message ?? "E-Mail konnte nicht gesendet werden." };
  }

  return { ok: true };
}
