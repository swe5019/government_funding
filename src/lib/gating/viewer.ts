import { connection } from "next/server";
import { plans, type Entitlements, type PlanKey } from "@/config/plans";

export interface Viewer {
  userId: string | null;
  plan: PlanKey;
  entitlements: Entitlements;
}

/**
 * The current visitor's plan. Until auth and billing land (Phase 4) everyone is on the free
 * tier; every data query already goes through this so gating needs no page changes later.
 */
export async function getViewer(): Promise<Viewer> {
  // Per-request: everything downstream (data windows, "now") is computed at request time.
  await connection();
  return { userId: null, plan: "free", entitlements: plans.free.entitlements };
}
