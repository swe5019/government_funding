export interface DailyBar {
  /** YYYY-MM-DD (exchange trading day) */
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * Stock price source. Implementations wrap a licensed vendor; respect its redistribution
 * terms (store only what the license allows, show attribution if required).
 */
export interface MarketDataProvider {
  /** Stored on each PriceBar so data from different vendors is never mixed silently. */
  name: string;
  /** True for generated data. The UI must label it and production must never use it. */
  isSimulated: boolean;
  getDailyBars(ticker: string, from: string, to: string): Promise<DailyBar[]>;
}
