import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { googleEnabled } from "@/auth";
import { DISCLAIMER, siteConfig } from "@/config/site";
import { safeCallbackUrl } from "@/lib/auth/redirect";
import { emailSignInAction, googleSignInAction } from "./actions";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

const ERRORS: Record<string, string> = {
  disclaimer: "Please confirm you understand this is not investment advice.",
  email: "Enter a valid email address.",
  Verification: "That sign-in link has expired or was already used. Request a new one.",
  EmailSignin: "We couldn't send a sign-in link. If you requested several, wait 15 minutes and try again.",
  OAuthAccountNotLinked: "This email is already registered with a different sign-in method. Use the email link instead.",
};

export default function SignInPage({ searchParams }: PageProps<"/signin">) {
  return (
    <div className="mx-auto max-w-md space-y-6 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Sign in to {siteConfig.name}</h1>
      <Suspense>
        <SignInForms searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function SignInForms({ searchParams }: { searchParams: PageProps<"/signin">["searchParams"] }) {
  const sp = await searchParams;
  const callbackUrl = safeCallbackUrl(sp.callbackUrl);
  const error = typeof sp.error === "string" ? (ERRORS[sp.error] ?? "Sign-in failed. Please try again.") : null;
  const disclaimer = (
    <label className="flex items-start gap-2 text-sm">
      <input type="checkbox" name="disclaimer" required className="mt-1" />
      <span>
        I understand {siteConfig.name} is <strong>informational only and not investment advice</strong>.{" "}
        <Link href="/disclaimer" className="underline" target="_blank">
          Read the disclaimer
        </Link>
        .
      </span>
    </label>
  );

  return (
    <>
      {error && (
        <p role="alert" className="rounded-md bg-warn-bg px-3 py-2 text-sm text-warn-fg">
          {error}
        </p>
      )}
      <form action={emailSignInAction} className="space-y-3 rounded-md border border-line bg-surface p-4">
        <input type="hidden" name="callbackUrl" value={callbackUrl} />
        <label htmlFor="email" className="block text-sm font-medium">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm"
          placeholder="you@example.com"
        />
        {disclaimer}
        <button className="w-full rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90">
          Email me a sign-in link
        </button>
      </form>
      {googleEnabled && (
        <form action={googleSignInAction} className="space-y-3 rounded-md border border-line bg-surface p-4">
          <input type="hidden" name="callbackUrl" value={callbackUrl} />
          {disclaimer}
          <button className="w-full rounded-md border border-line px-4 py-2 text-sm font-medium hover:bg-bg">
            Continue with Google
          </button>
        </form>
      )}
      <p className="text-xs text-muted">{DISCLAIMER}</p>
      <p className="text-xs text-muted">
        By signing in you agree to the <Link href="/terms" className="underline">Terms</Link> and{" "}
        <Link href="/privacy" className="underline">Privacy Policy</Link>.
      </p>
    </>
  );
}
