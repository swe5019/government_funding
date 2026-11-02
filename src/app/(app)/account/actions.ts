"use server";

import { redirect } from "next/navigation";
import { signOut } from "@/auth";
import { DELETE_CONFIRMATION, deleteUserData } from "@/lib/account/delete";
import { billingConfigured, stripe } from "@/lib/billing/stripe";
import { getViewer } from "@/lib/gating/viewer";

export async function deleteAccountAction(form: FormData) {
  const viewer = await getViewer();
  if (!viewer.user) redirect("/signin?callbackUrl=/account");
  if (String(form.get("confirm") ?? "").trim() !== DELETE_CONFIRMATION) redirect("/account?delete=confirm");
  const { id, stripeCustomerId } = viewer.user;

  // Deleting the Stripe customer cancels any subscription immediately and removes saved cards.
  // Stripe keeps its invoices and payment records, as tax and accounting rules require.
  if (stripeCustomerId && billingConfigured()) {
    try {
      await stripe().customers.del(stripeCustomerId);
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code !== "resource_missing") {
        console.error("account deletion: Stripe customer delete failed", err);
        redirect("/account?delete=billing");
      }
    }
  }

  await signOut({ redirect: false });
  await deleteUserData(id);
  redirect("/account-deleted");
}
