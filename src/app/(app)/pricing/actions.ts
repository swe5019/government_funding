"use server";

import { redirect } from "next/navigation";
import { signOut } from "@/auth";
import { createCheckoutUrl, createPortalUrl } from "@/lib/billing/checkout";
import { getViewer } from "@/lib/gating/viewer";

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
