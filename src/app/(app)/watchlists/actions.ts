"use server";

import { redirect } from "next/navigation";
import { getCompanyByTicker } from "@/lib/companies";
import { requireFeature } from "@/lib/gating/feature";
import { getViewer } from "@/lib/gating/viewer";
import {
  WatchlistError,
  addToWatchlist,
  createWatchlist,
  deleteWatchlist,
  removeFromWatchlist,
  setAlertThreshold,
} from "@/lib/watchlists";

/** Every action re-checks the session and the Pro entitlement; the lib re-checks ownership. */
async function proUser(returnTo: string): Promise<string> {
  const viewer = await getViewer();
  requireFeature(viewer, "watchlists", returnTo);
  return viewer.user!.id;
}

const str = (form: FormData, key: string) => String(form.get(key) ?? "").trim();

/** Errors are shown on the watchlists page (it renders ?error=); success reloads the clean page. */
async function run(returnTo: string, fn: (userId: string) => Promise<unknown>) {
  const userId = await proUser(returnTo);
  try {
    await fn(userId);
  } catch (e) {
    if (e instanceof WatchlistError) redirect(`/watchlists?error=${encodeURIComponent(e.message)}`);
    throw e;
  }
  redirect(returnTo);
}

export async function createWatchlistAction(form: FormData) {
  await run("/watchlists", (u) => createWatchlist(u, str(form, "name")));
}

export async function deleteWatchlistAction(form: FormData) {
  await run("/watchlists", (u) => deleteWatchlist(u, str(form, "watchlistId")));
}

export async function addByTickerAction(form: FormData) {
  await run("/watchlists", async (u) => {
    const company = await getCompanyByTicker(str(form, "ticker"));
    if (!company) throw new WatchlistError(`No company with ticker "${str(form, "ticker").toUpperCase()}".`);
    await addToWatchlist(u, str(form, "watchlistId") || null, company.cik);
  });
}

/** From the company page: add to the default watchlist. */
export async function watchCompanyAction(form: FormData) {
  const ticker = str(form, "ticker");
  await run(`/company/${encodeURIComponent(ticker)}`, async (u) => {
    const company = await getCompanyByTicker(ticker);
    if (!company) throw new WatchlistError("Unknown company.");
    await addToWatchlist(u, null, company.cik);
  });
}

export async function removeItemAction(form: FormData) {
  await run("/watchlists", (u) => removeFromWatchlist(u, str(form, "watchlistId"), str(form, "cik")));
}

/** Empty threshold = alerts off for that company. Accepts "1,000,000", "1m", "250k". */
export async function setThresholdAction(form: FormData) {
  await run("/watchlists", (u) => setAlertThreshold(u, str(form, "watchlistId"), str(form, "cik"), parseUsd(str(form, "threshold"))));
}

function parseUsd(raw: string): number | null {
  const s = raw.replace(/[$,\s]/g, "").toLowerCase();
  if (!s) return null;
  const m = /^(\d+(?:\.\d+)?)([kmb])?$/.exec(s);
  if (!m) throw new WatchlistError("Enter an amount like 1000000, 250k or 5m.");
  return Number(m[1]) * ({ k: 1e3, m: 1e6, b: 1e9 }[m[2] as "k" | "m" | "b"] ?? 1);
}
