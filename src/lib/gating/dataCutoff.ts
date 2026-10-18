import type { Entitlements } from "@/config/plans";

export interface DataWindow {
  /** Aggregate view to read: DELAYED for tiers with a publication delay. */
  view: "REALTIME" | "DELAYED";
  /** Transactions published after this instant are hidden (null = no delay). */
  availableBefore: Date | null;
  /** Earliest action date shown (null = all history). First of a month, so it lines up with monthly aggregates. */
  historyStart: Date | null;
}

/** Translate a plan's entitlements into the filters every award query must apply. */
export function dataWindow(e: Entitlements, now: Date = new Date()): DataWindow {
  const availableBefore = e.dataDelayDays > 0 ? new Date(now.getTime() - e.dataDelayDays * 86_400_000) : null;
  const historyStart =
    e.historyYears === null ? null : new Date(Date.UTC(now.getUTCFullYear() - e.historyYears, now.getUTCMonth(), 1));
  return { view: availableBefore ? "DELAYED" : "REALTIME", availableBefore, historyStart };
}
