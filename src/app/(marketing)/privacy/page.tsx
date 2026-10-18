import type { Metadata } from "next";
import { siteConfig } from "@/config/site";

export const metadata: Metadata = { title: "Privacy Policy" };

// PLACEHOLDER — replace with counsel-reviewed text before launch.
export default function PrivacyPage() {
  return (
    <article className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold">Privacy Policy</h1>
      <p className="rounded-md bg-warn-bg p-3 text-sm text-warn-fg">
        Placeholder. This page will be replaced with the final Privacy Policy before {siteConfig.name} launches.
      </p>
      <p className="text-sm text-muted">Questions: {siteConfig.supportEmail}</p>
    </article>
  );
}
