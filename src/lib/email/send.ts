import { Resend } from "resend";

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
}

let client: Resend | undefined;

/**
 * Send transactional email through Resend. Without RESEND_API_KEY outside production, the
 * message is printed to the server console instead (local development).
 */
export async function sendEmail(msg: EmailMessage): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    if (process.env.NODE_ENV === "production") throw new Error("RESEND_API_KEY is not set");
    console.log(`\n[email:dev] to=${msg.to} subject="${msg.subject}"\n${msg.text}\n`);
    return;
  }
  const from = process.env.EMAIL_FROM;
  if (!from) throw new Error("EMAIL_FROM is not set");
  client ??= new Resend(key);
  const { error } = await client.emails.send({ from, to: msg.to, subject: msg.subject, html: msg.html, text: msg.text, headers: msg.headers });
  if (error) throw new Error(`Resend: ${error.message}`);
}

export const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
