import { headers } from "next/headers";
import { checkBasicAuth } from "./basic-auth";

/** Re-check auth inside Server Actions and pages (defense in depth beyond src/proxy.ts). */
export async function requireAdmin(): Promise<string> {
  const user = checkBasicAuth((await headers()).get("authorization"));
  if (!user) throw new Error("Unauthorized");
  return user;
}
