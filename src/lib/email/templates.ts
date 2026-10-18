import { DISCLAIMER, siteConfig } from "@/config/site";
import { escapeHtml, type EmailMessage } from "./send";

/** Plain, client-safe layout shared by all emails. */
export function layout(title: string, bodyHtml: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f7f8fa;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#111827">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px">
<table role="presentation" width="100%" style="max-width:520px;background:#fff;border:1px solid #e3e6eb;border-radius:8px">
<tr><td style="padding:24px">
<div style="font-weight:600;font-size:16px;margin-bottom:16px">${escapeHtml(siteConfig.name)}</div>
<h1 style="font-size:20px;margin:0 0 12px">${escapeHtml(title)}</h1>
${bodyHtml}
<p style="font-size:12px;color:#5b6474;margin-top:24px;border-top:1px solid #e3e6eb;padding-top:12px">${escapeHtml(DISCLAIMER)}</p>
</td></tr></table></td></tr></table></body></html>`;
}

export function magicLinkEmail(to: string, url: string): EmailMessage {
  const host = new URL(url).host;
  return {
    to,
    subject: `Sign in to ${siteConfig.name}`,
    html: layout(
      "Your sign-in link",
      `<p>Click the button to sign in to ${escapeHtml(siteConfig.name)}. The link expires in 15 minutes and works once.</p>
<p style="margin:20px 0"><a href="${escapeHtml(url)}" style="background:#1f5fbf;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;display:inline-block">Sign in</a></p>
<p style="font-size:13px;color:#5b6474">If you didn't request this, you can ignore this email. Requested for ${escapeHtml(host)}.</p>`,
    ),
    text: `Sign in to ${siteConfig.name}:\n${url}\n\nThe link expires in 15 minutes. If you didn't request it, ignore this email.\n\n${DISCLAIMER}`,
  };
}
