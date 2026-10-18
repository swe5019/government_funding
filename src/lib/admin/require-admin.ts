import { notFound, redirect } from "next/navigation";
import { getViewer } from "@/lib/gating/viewer";
import type { Reviewer } from "./matches";

/**
 * Gate admin pages and Server Actions: signed-out visitors go to sign-in, signed-in
 * non-admins get a 404 (admin pages don't advertise themselves). Role comes from ADMIN_EMAILS.
 */
export async function requireAdmin(): Promise<Reviewer> {
  const viewer = await getViewer();
  if (!viewer.user) redirect("/signin?callbackUrl=/admin/matches");
  if (!viewer.isAdmin) notFound();
  return { id: viewer.user.id, email: viewer.user.email };
}
