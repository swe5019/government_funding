import { mockProvider } from "./mock";
import type { MarketDataProvider } from "./types";

export type { DailyBar, MarketDataProvider } from "./types";

/**
 * The configured price provider, or null when none is configured. `MARKET_DATA_PROVIDER=mock`
 * is honored only outside production: simulated prices must never reach real users.
 * Add a licensed vendor by implementing MarketDataProvider and adding a case here.
 */
export function getProvider(env: Record<string, string | undefined> = process.env): MarketDataProvider | null {
  switch (env.MARKET_DATA_PROVIDER?.trim().toLowerCase()) {
    case undefined:
    case "":
      return null;
    case "mock":
      return env.NODE_ENV === "production" ? null : mockProvider;
    default:
      throw new Error(`Unknown MARKET_DATA_PROVIDER "${env.MARKET_DATA_PROVIDER}"`);
  }
}
