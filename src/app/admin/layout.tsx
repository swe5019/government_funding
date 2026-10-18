import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin/require-admin";

export const metadata: Metadata = { title: "Admin", robots: { index: false, follow: false } };

/**
 * Admin blocks on the auth check before rendering anything, so non-admins get a real 404
 * and signed-out visitors a real redirect (not a streamed one). Pages and actions re-check.
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
