"use server";

import { redirect } from "next/navigation";
import { signOut } from "@/auth";
import { createCheckoutUrl, createPortalUrl } from "@/lib/billing/checkout";
import { getViewer } from "@/lib/gating/viewer";
import { joinWaitlist, waitlistInput } from "@/lib/waitlist";

export async function startCheckoutAction(form: FormData) {
  const interval = form.get("interval") === "annual" ? "annual" : "monthly";
  const viewer = await getViewer();
  if (!viewer.user) redirect(`/signin?callbackUrl=${encodeURIComponent("/pricing")}`);
  if (!viewer.user.acceptedDisclaimerAt) redirect(`/welcome?callbackUrl=${encodeURIComponent("/pricing")}`);
  if (viewer.plan !== "free") redirect("/account");
  redirect(await createCheckoutUrl(viewer.user, interval));
}

export async function manageBillingAction() {
  const viewer = await getViewer();
  if (!viewer.user) redirect("/signin?callbackUrl=/account");
  redirect(await createPortalUrl(viewer.user));
}

export async function signOutAction() {
  await signOut({ redirectTo: "/" });
}

export async function joinWaitlistAction(form: FormData) {
  // Bots fill every field; people never see this one.
  if (String(form.get("website") ?? "")) redirect("/pricing?waitlist=joined#waitlist");
  const viewer = await getViewer();
  const email = viewer.user?.email ?? String(form.get("email") ?? "");
  const price = String(form.get("price") ?? "");
  const source = String(form.get("source") ?? "pricing").toLowerCase().replace(/[^a-z0-9:_-]/g, "").slice(0, 60);
  const parsed = waitlistInput.safeParse({
    email,
    priceAnswer: price || null,
    source: source || "pricing",
    userId: viewer.user?.id ?? null,
  });
  if (!parsed.success) redirect("/pricing?waitlist=invalid#waitlist");
  await joinWaitlist(parsed.data);
  redirect("/pricing?waitlist=joined#waitlist");
}
