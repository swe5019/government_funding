import { timingSafeEqual } from "node:crypto";

/**
 * Interim admin protection until Phase 4 adds real accounts: HTTP Basic auth against
 * ADMIN_USERNAME / ADMIN_PASSWORD. With either unset, admin is disabled entirely.
 */

export function adminConfigured(): boolean {
  return Boolean(process.env.ADMIN_USERNAME && process.env.ADMIN_PASSWORD);
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  // Compare against itself on length mismatch so timing doesn't reveal the length.
  return ab.length === bb.length ? timingSafeEqual(ab, bb) : (timingSafeEqual(ab, ab), false);
}

/** Returns the admin username if the Authorization header is valid, else null. */
export function checkBasicAuth(header: string | null): string | null {
  if (!adminConfigured() || !header?.startsWith("Basic ")) return null;
  let decoded: string;
  try {
    decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
  } catch {
    return null;
  }
  const sep = decoded.indexOf(":");
  if (sep < 0) return null;
  const user = decoded.slice(0, sep);
  const pass = decoded.slice(sep + 1);
  const okUser = safeEqual(user, process.env.ADMIN_USERNAME!);
  const okPass = safeEqual(pass, process.env.ADMIN_PASSWORD!);
  return okUser && okPass ? user : null;
}
