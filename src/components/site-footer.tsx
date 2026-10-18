import Link from "next/link";
import { DISCLAIMER, siteConfig } from "@/config/site";

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-line bg-surface">
      <div className="mx-auto max-w-6xl space-y-3 px-4 py-6 text-xs text-muted">
        <p role="note">
          <strong className="text-fg">Disclaimer:</strong> {DISCLAIMER}
        </p>
        <p>
          Data: <a className="underline" href="https://www.usaspending.gov" rel="noopener noreferrer" target="_blank">USAspending.gov</a>{" "}
          (U.S. Department of the Treasury). {siteConfig.name} is not affiliated with any government agency.
        </p>
        <nav className="flex gap-4">
          <Link href="/disclaimer" className="underline">Disclaimer</Link>
          <Link href="/privacy" className="underline">Privacy</Link>
          <Link href="/terms" className="underline">Terms</Link>
        </nav>
      </div>
    </footer>
  );
}
