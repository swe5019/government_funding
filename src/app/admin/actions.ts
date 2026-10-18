"use server";

import { refresh } from "next/cache";
import { applyDecision, findCompanyByTicker, linkRecipient, type Decision } from "@/lib/admin/matches";
import { requireAdmin } from "@/lib/admin/require-admin";

/**
 * Review actions. Each button sits in its own small form whose hidden field names the target:
 * "group" = roll-up group id, "recipient" = one recipient. Corrections read the "ticker" field.
 */

function target(form: FormData) {
  const group = form.get("group");
  const recipient = form.get("recipient");
  if (typeof group === "string" && group) return { groupId: group };
  if (typeof recipient === "string" && recipient) return { recipientIds: [recipient] };
  throw new Error("No match selected");
}

async function decide(form: FormData, decision: Decision) {
  const user = await requireAdmin();
  await applyDecision(target(form), decision, user);
  refresh();
}

export async function approveAction(form: FormData) {
  await decide(form, { kind: "approve" });
}

export async function rejectAction(form: FormData) {
  await decide(form, { kind: "reject" });
}

export async function reopenAction(form: FormData) {
  await decide(form, { kind: "reopen" });
}

export async function correctAction(form: FormData) {
  const user = await requireAdmin();
  const t = target(form);
  const company = await findCompanyByTicker(String(form.get("ticker") ?? ""));
  if (!company) throw new Error(`Unknown ticker "${form.get("ticker")}"`);
  await applyDecision(t, { kind: "correct", companyCik: company.cik }, user);
  refresh();
}

export async function bulkApproveAction(form: FormData) {
  const user = await requireAdmin();
  const groups = form.getAll("selected").filter((v): v is string => typeof v === "string" && !!v);
  for (const groupId of groups) await applyDecision({ groupId }, { kind: "approve" }, user);
  refresh();
}

export async function linkAction(form: FormData) {
  const user = await requireAdmin();
  const recipientId = String(form.get("recipient") ?? "");
  const company = await findCompanyByTicker(String(form.get("ticker") ?? ""));
  if (!recipientId || !company) throw new Error("Pick a recipient and a valid ticker");
  await linkRecipient(recipientId, company.cik, user);
  refresh();
}
