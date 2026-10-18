import Link from "next/link";
import { Suspense } from "react";
import { UserMenu } from "@/components/user-menu";
import { siteConfig } from "@/config/site";

export function SiteHeader() {
  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          {siteConfig.name}
        </Link>
        <nav className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2 text-sm text-muted">
          <Link href="/search" className="hover:text-fg">
            Search
          </Link>
          <Link href="/programs" className="hover:text-fg">
            Programs
          </Link>
          <Link href="/feed" className="hover:text-fg">
            New awards
          </Link>
          <Link href="/screener" className="hover:text-fg">
            Screener
          </Link>
          <Suspense fallback={<span className="inline-block h-7 w-16" aria-hidden />}>
            <UserMenu />
          </Suspense>
        </nav>
      </div>
    </header>
  );
}
