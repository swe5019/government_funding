"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { DISCLAIMER_COOKIE, signIn } from "@/auth";
import { safeCallbackUrl } from "@/lib/auth/redirect";

/**
 * The disclaimer must be acknowledged at sign-up. The cookie carries the acknowledgment
 * through the magic-link / OAuth round trip; the createUser event records it.
 */
async function acknowledge(form: FormData, callbackUrl: string) {
  if (form.get("disclaimer") !== "on") {
    redirect(`/signin?error=disclaimer&callbackUrl=${encodeURIComponent(callbackUrl)}`);
  }
  (await cookies()).set(DISCLAIMER_COOKIE, "1", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24, path: "/" });
}

export async function emailSignInAction(form: FormData) {
  const callbackUrl = safeCallbackUrl(form.get("callbackUrl"));
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    redirect(`/signin?error=email&callbackUrl=${encodeURIComponent(callbackUrl)}`);
  }
  await acknowledge(form, callbackUrl);
  // redirect:false keeps navigation on our own page instead of bouncing through /api/auth.
  await signIn("resend", { email, redirectTo: callbackUrl, redirect: false });
  redirect("/signin/check-email");
}

export async function googleSignInAction(form: FormData) {
  const callbackUrl = safeCallbackUrl(form.get("callbackUrl"));
  await acknowledge(form, callbackUrl);
  await signIn("google", { redirectTo: callbackUrl });
}
