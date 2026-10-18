/** Emails granted the ADMIN role, from ADMIN_EMAILS (comma or whitespace separated, case-insensitive). */
export function adminEmails(raw = process.env.ADMIN_EMAILS ?? ""): Set<string> {
  return new Set(
    raw
      .split(/[\s,;]+/)
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e.includes("@")),
  );
}

export function isAdminEmail(email: string | null | undefined, raw?: string): boolean {
  return !!email && adminEmails(raw).has(email.trim().toLowerCase());
}
