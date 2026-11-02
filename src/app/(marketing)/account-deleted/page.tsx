import type { Metadata } from "next";
import Link from "next/link";
import { siteConfig } from "@/config/site";

export const metadata: Metadata = { title: "Account deleted", robots: { index: false } };

export default function AccountDeletedPage() {
  return (
    <div className="mx-auto max-w-md space-y-4 py-16 text-center">
      <h1 className="text-2xl font-semibold">Your account has been deleted</h1>
      <p className="text-sm text-muted">
        We removed your account, watchlists, alerts and sign-in sessions. Any subscription was cancelled. Payment records
        are kept by our payment processor as required by law. Questions: {siteConfig.supportEmail}
      </p>
      <Link href="/" className="inline-block text-sm text-accent underline underline-offset-2">
        Go to the home page
      </Link>
    </div>
  );
}
