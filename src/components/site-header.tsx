import Link from "next/link";
import { siteConfig } from "@/config/site";

export function SiteHeader() {
  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          {siteConfig.name}
        </Link>
        <nav className="flex items-center gap-5 text-sm text-muted">
          <Link href="/search" className="hover:text-fg">
            Search
          </Link>
        </nav>
      </div>
    </header>
  );
}
