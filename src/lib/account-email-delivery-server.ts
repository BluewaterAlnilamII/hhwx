import "server-only";
import { ApiRouteError } from "@/lib/api-contracts";

const sender = { Email: "accounts@mail.hhwx.org", Name: "HHWX Accounts" };

export function accountEmailDeliveryConfig(): { inboxUrl: string } | { apiKey: string } {
  const inboxUrl = process.env.AUTH_EMAIL_TEST_INBOX_URL;
  if (inboxUrl) {
    const inbox = new URL(inboxUrl);
    const auth = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || "");
    const internalAuth = new URL(process.env.SUPABASE_URL || auth.href);
    const local = (url: URL) => url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname) && !url.username && !url.password;
    if (process.env.NODE_ENV === "production" || !local(inbox) || !local(auth) || !local(internalAuth)) {
      throw new Error("The test inbox requires a nonproduction, entirely local Auth environment");
    }
    return { inboxUrl: inbox.origin };
  }
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new ApiRouteError(503, "ACCOUNT_EMAIL_NOT_CONFIGURED", "邮箱变更邮件服务尚未配置");
  return { apiKey };
}

export async function sendNewAccountEmailCode(
  config: ReturnType<typeof accountEmailDeliveryConfig>, email: string, code: string, signal: AbortSignal,
): Promise<void> {
  const subject = "HHWX 更换邮箱：验证新邮箱 / Email change: verify new email";
  const text = `更换登录邮箱 / Change your email\n\n请输入以下验证码，验证新邮箱并完成登录邮箱更换\nEnter this code on HHWX to verify your new email and finish changing your email\n\n${code}\n\n验证码 1 小时内有效 / Valid for 1 hour\n\n请勿向他人透露验证码。如非本人操作，请忽略此邮件。\nDo not share this code. If you did not request it, ignore this email.`;
  const html = `<!doctype html>
<html lang="zh-CN" dir="ltr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>更换登录邮箱 / Change your email</title>
<style>
@media screen and (max-width:600px) {
  .outer { padding:16px 8px !important; }
  .content { padding:24px 20px !important; }
}
@media (prefers-color-scheme:dark) {
  .canvas { background-color:#121c26 !important; }
  .panel { background-color:#1c2936 !important; border-color:#415568 !important; }
  .code { background-color:#283947 !important; color:#e9f0f5 !important; }
  .text { color:#e9f0f5 !important; }
  .muted { color:#a9bdca !important; }
  .brand { color:#80b3cc !important; }
}
</style>
</head>
<body class="canvas" style="margin:0;padding:0;background-color:#faf8f4">
<table role="presentation" lang="zh-CN" dir="ltr" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#faf8f4" class="canvas" style="background-color:#faf8f4">
<tr><td align="center" class="outer" style="padding:32px 16px">
<!--[if mso]><table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#fcfcfc" class="panel" style="max-width:560px;background-color:#fcfcfc;border:1px solid #dddcd5">
<tr><td class="content text" style="padding:32px;color:#0f172a;font-family:'PingFang SC','Hiragino Sans GB','Microsoft YaHei','Noto Sans CJK SC','Segoe UI',Arial,sans-serif;text-align:left">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="table-layout:fixed">
<tr><td align="left" class="brand" style="font-family:'PingFang SC','Hiragino Sans GB','Microsoft YaHei','Noto Sans CJK SC','Segoe UI',Arial,sans-serif;padding:0 0 20px;color:#006699;font-size:14px;mso-line-height-rule:exactly;line-height:20px;font-weight:bold">HHWX Accounts</td></tr>
<tr><td align="left" style="font-family:'PingFang SC','Hiragino Sans GB','Microsoft YaHei','Noto Sans CJK SC','Segoe UI',Arial,sans-serif;"><h1 class="text" style="font-family:'PingFang SC','Hiragino Sans GB','Microsoft YaHei','Noto Sans CJK SC','Segoe UI',Arial,sans-serif;margin:0;color:#0f172a;font-size:24px;mso-line-height-rule:exactly;line-height:32px;font-weight:bold">更换登录邮箱</h1></td></tr>
<tr><td align="left" lang="en" class="muted" style="font-family:'PingFang SC','Hiragino Sans GB','Microsoft YaHei','Noto Sans CJK SC','Segoe UI',Arial,sans-serif;padding:4px 0 20px;color:#475569;font-size:16px;mso-line-height-rule:exactly;line-height:24px">Change your email</td></tr>
<tr><td align="left" class="text" style="font-family:'PingFang SC','Hiragino Sans GB','Microsoft YaHei','Noto Sans CJK SC','Segoe UI',Arial,sans-serif;padding:0 0 0;color:#0f172a;font-size:16px;mso-line-height-rule:exactly;line-height:24px">请输入以下验证码，验证新邮箱并完成登录邮箱更换</td></tr>
<tr><td align="left" lang="en" class="muted" style="font-family:'PingFang SC','Hiragino Sans GB','Microsoft YaHei','Noto Sans CJK SC','Segoe UI',Arial,sans-serif;padding:4px 0 0;color:#475569;font-size:16px;mso-line-height-rule:exactly;line-height:24px">Enter this code on HHWX to verify your new email and finish changing your email</td></tr>
<tr><td style="padding-top:24px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td bgcolor="#faf8f4" align="center" dir="ltr" class="code" style="padding:16px 8px;background-color:#faf8f4;color:#0f172a;font-family:Consolas,'Courier New',monospace;font-size:32px;mso-line-height-rule:exactly;line-height:40px;font-weight:bold;letter-spacing:2px;white-space:nowrap">${code}</td></tr>
</table>
</td></tr>
<tr><td align="left" class="muted" style="font-family:'PingFang SC','Hiragino Sans GB','Microsoft YaHei','Noto Sans CJK SC','Segoe UI',Arial,sans-serif;padding:12px 0 0;color:#475569;font-size:14px;mso-line-height-rule:exactly;line-height:22px">验证码 1 小时内有效 <span lang="en">/ Valid for 1 hour</span></td></tr>
<tr><td align="left" class="muted" style="font-family:'PingFang SC','Hiragino Sans GB','Microsoft YaHei','Noto Sans CJK SC','Segoe UI',Arial,sans-serif;padding:24px 0 0;color:#475569;font-size:14px;mso-line-height-rule:exactly;line-height:22px">请勿向他人透露验证码。如非本人操作，请忽略此邮件。</td></tr>
<tr><td align="left" lang="en" class="muted" style="font-family:'PingFang SC','Hiragino Sans GB','Microsoft YaHei','Noto Sans CJK SC','Segoe UI',Arial,sans-serif;padding:4px 0 0;color:#475569;font-size:14px;mso-line-height-rule:exactly;line-height:22px">Do not share this code. If you did not request it, ignore this email.</td></tr>
</table>
</td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr>
</table>
</body>
</html>`;
  const local = "inboxUrl" in config;
  const response = await fetch(local ? `${config.inboxUrl}/api/v1/send` : "https://api.resend.com/emails", {
    method: "POST", signal, redirect: "error",
    headers: { "Content-Type": "application/json", ...(!local ? { Authorization: `Bearer ${config.apiKey}` } : {}) },
    body: JSON.stringify(local
      ? { From: sender, To: [{ Email: email }], Subject: subject, Text: text, HTML: html }
      : { from: `${sender.Name} <${sender.Email}>`, to: [email], subject, text, html }),
  });
  if (!response.ok) throw new ApiRouteError(502, "ACCOUNT_EMAIL_SEND_FAILED", "新邮箱验证码发送失败，请稍后重新申请");
}
