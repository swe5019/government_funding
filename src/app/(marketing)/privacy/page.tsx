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
      <p className="text-sm">
        You can delete your account at any time from your Account page. Deletion removes your account, watchlists, alert
        history and sign-in sessions and cancels any subscription; payment records are kept by our payment processor as the
        law requires.
      </p>
      <p className="text-sm">
        If you join the Pro waitlist we store your email address and your optional price answer, and use them only to tell you
        about Pro. We count visits with Vercel Web Analytics, which does not use cookies.
      </p>
      <p className="text-sm text-muted">Questions: {siteConfig.supportEmail}</p>
    </article>
  );
}
