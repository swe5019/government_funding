import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { DISCLAIMER } from "@/config/site";
import { safeCallbackUrl } from "@/lib/auth/redirect";
import { getViewer } from "@/lib/gating/viewer";
import { acceptDisclaimerAction } from "./actions";

export const metadata: Metadata = { title: "Before you continue", robots: { index: false } };

/** Fallback acknowledgment for accounts created without it (e.g. the checkbox cookie was lost). */
export default function WelcomePage({ searchParams }: PageProps<"/welcome">) {
  return (
    <div className="mx-auto max-w-md space-y-4 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Before you continue</h1>
      <Suspense>
        <Welcome searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Welcome({ searchParams }: { searchParams: PageProps<"/welcome">["searchParams"] }) {
  const sp = await searchParams;
  const callbackUrl = safeCallbackUrl(sp.callbackUrl);
  const viewer = await getViewer();
  if (!viewer.user) redirect(`/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  if (viewer.user.acceptedDisclaimerAt) redirect(callbackUrl);
  return (
    <form action={acceptDisclaimerAction} className="space-y-4 rounded-md border border-line bg-surface p-4">
      <input type="hidden" name="callbackUrl" value={callbackUrl} />
      <p className="text-sm">{DISCLAIMER}</p>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="disclaimer" required className="mt-1" />
        <span>I understand this service is informational only and not investment advice.</span>
      </label>
      <button className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90">Continue</button>
    </form>
  );
}
