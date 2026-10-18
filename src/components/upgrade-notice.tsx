import Link from "next/link";
import { plans } from "@/config/plans";

/** Inline call to action shown in place of a paid feature. */
export function UpgradeNotice({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-md border border-accent/40 bg-accent/5 p-4 text-sm">
      <div className="font-medium">{title}</div>
      {children && <div className="mt-1 text-muted">{children}</div>}
      <Link href="/pricing" className="mt-3 inline-block rounded-md bg-accent px-3 py-1.5 font-medium text-white hover:opacity-90">
        Try {plans.pro.name} free for {plans.pro.trialDays} days
      </Link>
    </div>
  );
}
