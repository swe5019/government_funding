import Link from "next/link";
import { plans } from "@/config/plans";
import { billingConfigured } from "@/lib/billing/stripe";

/** Inline call to action shown in place of a paid feature. `source` records which feature drew the interest. */
export function UpgradeNotice({ title, source, children }: { title: string; source?: string; children?: React.ReactNode }) {
  const onSale = billingConfigured();
  return (
    <div className="rounded-md border border-accent/40 bg-accent/5 p-4 text-sm">
      <div className="font-medium">{title}</div>
      {children && <div className="mt-1 text-muted">{children}</div>}
      <Link
        href={onSale ? "/pricing" : `/pricing?from=${encodeURIComponent(source ?? "feature")}#waitlist`}
        className="mt-3 inline-block rounded-md bg-accent px-3 py-1.5 font-medium text-white hover:opacity-90"
      >
        {onSale ? `Try ${plans.pro.name} free for ${plans.pro.trialDays} days` : `Join the ${plans.pro.name} waitlist`}
      </Link>
    </div>
  );
}
