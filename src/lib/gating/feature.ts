import { redirect } from "next/navigation";
import type { Entitlements } from "@/config/plans";
import type { Viewer } from "./viewer";

/** Boolean features that can be gated (data delay/history are handled by dataWindow). */
export type Feature = { [K in keyof Entitlements]: Entitlements[K] extends boolean ? K : never }[keyof Entitlements];

export const hasFeature = (viewer: Viewer, feature: Feature) => viewer.entitlements[feature];

/** For pages and actions that are paid-only: sign in first, then upgrade. */
export function requireFeature(viewer: Viewer, feature: Feature, returnTo: string): void {
  if (!viewer.user) redirect(`/signin?callbackUrl=${encodeURIComponent(returnTo)}`);
  if (!hasFeature(viewer, feature)) redirect(`/pricing?feature=${feature}`);
}
