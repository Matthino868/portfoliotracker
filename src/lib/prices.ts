export type PriceMap = Record<string, number>; // symbol -> price in quote currency (USD)

export interface PriceService {
  getPrices(symbols: string[], quote?: string): Promise<PriceMap>;
}

export class MockPriceService implements PriceService {
  constructor(private readonly prices: PriceMap = { BTC: 60000, ETH: 3000, SOL: 150 }) {}
  async getPrices(symbols: string[], _quote = "USD"): Promise<PriceMap> {
    const out: PriceMap = {};
    for (const s of symbols) out[s] = this.prices[s] ?? 0;
    return out;
  }
}

