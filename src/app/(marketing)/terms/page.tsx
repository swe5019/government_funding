import type { Metadata } from "next";
import { siteConfig } from "@/config/site";

export const metadata: Metadata = { title: "Terms of Service" };

// PLACEHOLDER — replace with counsel-reviewed text before launch.
export default function TermsPage() {
  return (
    <article className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold">Terms of Service</h1>
      <p className="rounded-md bg-warn-bg p-3 text-sm text-warn-fg">
        Placeholder. This page will be replaced with the final Terms of Service before {siteConfig.name} launches.
      </p>
      <p className="text-sm text-muted">Questions: {siteConfig.supportEmail}</p>
    </article>
  );
}
