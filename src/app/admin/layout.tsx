import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin/require-admin";

export const metadata: Metadata = { title: "Admin", robots: { index: false, follow: false } };

/**
 * Admin blocks on the auth check before rendering any admin UI: non-admins get the not-found
 * page (noindex) and signed-out visitors are redirected to sign in. Once the root shell has
 * streamed the HTTP status stays 200, so security never relies on the status code. Pages and
 * actions re-check.
 */
export const instant = false;

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  await requireAdmin();
  return (
    <div className="space-y-6">
      <nav className="flex items-center gap-4 border-b border-line pb-3 text-sm">
        <span className="rounded bg-warn-bg px-2 py-0.5 text-xs font-semibold text-warn-fg">Admin</span>
        <Link href="/admin/matches" className="hover:underline">Ticker matches</Link>
        <Link href="/admin/matches?tab=unmatched" className="hover:underline">Unmatched</Link>
        <Link href="/admin/ingestion" className="hover:underline">Ingestion runs</Link>
      </nav>
      {children}
    </div>
  );
}
