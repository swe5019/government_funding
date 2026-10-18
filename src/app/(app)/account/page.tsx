import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { plans } from "@/config/plans";
import { formatDate } from "@/lib/format";
import { getViewer } from "@/lib/gating/viewer";
import { manageBillingAction, signOutAction } from "../pricing/actions";

export const metadata: Metadata = { title: "Account", robots: { index: false } };

export default function AccountPage({ searchParams }: PageProps<"/account">) {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Account</h1>
      <Suspense fallback={<div className="h-40 animate-pulse rounded-md bg-line" />}>
        <Account searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

const STATUS: Record<string, string> = {
  trialing: "Free trial",
  active: "Active",
  past_due: "Payment failed — update your card to keep Pro",
  canceled: "Cancelled",
  incomplete: "Payment incomplete",
  incomplete_expired: "Expired",
  unpaid: "Unpaid",
  paused: "Paused",
};

async function Account({ searchParams }: { searchParams: PageProps<"/account">["searchParams"] }) {
  const [viewer, sp] = await Promise.all([getViewer(), searchParams]);
  if (!viewer.user) redirect("/signin?callbackUrl=/account");
  if (!viewer.user.acceptedDisclaimerAt) redirect("/welcome?callbackUrl=/account");
  const sub = viewer.subscription;
  const btn = "rounded-md border border-line px-4 py-2 text-sm hover:bg-bg";

  return (
    <>
      {sp.checkout === "success" && viewer.plan === "free" && (
        <p role="status" className="rounded-md bg-warn-bg px-3 py-2 text-sm text-warn-fg">
          Thanks! Your subscription is being activated; refresh in a few seconds.
        </p>
      )}
      <section className="space-y-1 rounded-md border border-line bg-surface p-4 text-sm">
        <div className="text-xs text-muted">Signed in as</div>
        <div className="font-medium">{viewer.user.email}</div>
      </section>

      <section className="space-y-3 rounded-md border border-line bg-surface p-4 text-sm">
        <div className="flex items-baseline justify-between">
          <div>
            <div className="text-xs text-muted">Plan</div>
            <div className="text-lg font-semibold">{plans[viewer.plan].name}</div>
          </div>
          {sub && <div className={sub.status === "past_due" ? "font-medium text-warn-fg" : "text-muted"}>{STATUS[sub.status] ?? sub.status}</div>}
        </div>
        {sub && viewer.plan !== "free" && (
          <ul className="space-y-1 text-muted">
            {sub.status === "trialing" && sub.trialEndsAt && (
              <li>
                Trial ends {formatDate(sub.trialEndsAt)}; you&rsquo;ll be billed {sub.interval === "year" ? "yearly" : "monthly"} after
                that unless you cancel.
              </li>
            )}
            {sub.status !== "trialing" && (
              <li>
                {sub.cancelAtPeriodEnd ? "Access ends" : "Renews"} {formatDate(sub.currentPeriodEnd)} ·{" "}
                {sub.interval === "year" ? "yearly" : "monthly"} billing
              </li>
            )}
            {sub.status === "trialing" && sub.cancelAtPeriodEnd && <li>Cancelled — Pro access stays until the trial ends.</li>}
          </ul>
        )}
        <div className="flex flex-wrap gap-2 pt-1">
          {viewer.user.stripeCustomerId && (
            <form action={manageBillingAction}>
              <button className={btn}>Manage billing</button>
            </form>
          )}
          {viewer.plan === "free" && (
            <Link href="/pricing" className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90">
              {viewer.user.trialUsedAt ? "Upgrade to Pro" : `Try Pro free for ${plans.pro.trialDays} days`}
            </Link>
          )}
        </div>
      </section>

      <form action={signOutAction}>
        <button className={btn}>Sign out</button>
      </form>
    </>
  );
}
