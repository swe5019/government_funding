"use server";

import { redirect } from "next/navigation";
import { safeCallbackUrl } from "@/lib/auth/redirect";
import { prisma } from "@/lib/db";
import { getViewer } from "@/lib/gating/viewer";

export async function acceptDisclaimerAction(form: FormData) {
  const callbackUrl = safeCallbackUrl(form.get("callbackUrl"));
  const viewer = await getViewer();
  if (!viewer.user) redirect("/signin");
  if (form.get("disclaimer") !== "on") redirect(`/welcome?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  await prisma.user.update({ where: { id: viewer.user.id }, data: { acceptedDisclaimerAt: new Date() } });
  redirect(callbackUrl);
}
