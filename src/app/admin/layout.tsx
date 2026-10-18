import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Admin", robots: { index: false, follow: false } };

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
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
