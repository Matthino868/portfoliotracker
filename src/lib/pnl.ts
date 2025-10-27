export type Tx = {
  assetSymbol: string;
  type: "BUY" | "SELL" | "TRANSFER_IN" | "TRANSFER_OUT" | "DEPOSIT" | "STAKING_REWARD";
  quantity: number; // positive
  pricePerUnit: number; // in USD
  fee?: number; // in USD
  timestamp: Date | string | number;
};

export type Lot = { qty: number; costPerUnit: number };

export type AssetPnL = {
	symbol: string;
	quantityHeld: number;
	avgCostBasisPerUnit: number;
	totalCostBasis: number; // for held quantity
	marketPrice: number;
	marketValue: number;
	unrealizedPnL: number;
	unrealizedPnLPercent: number;
	realizedPnL: number;
};

export type PortfolioSummary = {
	assets: AssetPnL[];
	totals: {
		marketValue: number;
		totalCostBasis: number;
		unrealizedPnL: number;
		realizedPnL: number;
	};
};

function round(n: number, d = 2) {
	const p = Math.pow(10, d);
	return Math.round(n * p) / p;
}

function fifoLots(transactions: Tx[]): { lots: Lot[]; realizedPnL: number } {
	const lots: Lot[] = [];
	let realized = 0;

	const txs = [...transactions].sort((a, b) => +new Date(a.timestamp) - +new Date(b.timestamp));
	for (const tx of txs) {
		const fee = tx.fee ?? 0;
    if (
      tx.type === "BUY" ||
      tx.type === "TRANSFER_IN" ||
      tx.type === "DEPOSIT" ||
      tx.type === "STAKING_REWARD"
    ) {
      const total = tx.quantity * tx.pricePerUnit + fee;
      const perUnit = total / tx.quantity;
      lots.push({ qty: tx.quantity, costPerUnit: perUnit });
    } else if (tx.type === "SELL" || tx.type === "TRANSFER_OUT") {
			let toSell = tx.quantity;
			let proceeds = tx.quantity * tx.pricePerUnit - fee; // reduce proceeds by fee
			while (toSell > 1e-12 && lots.length > 0) {
				const lot = lots[0];
				const use = Math.min(lot.qty, toSell);
				const cost = use * lot.costPerUnit;
				const pricePerUnitNet = proceeds / tx.quantity; // approximate allocation
				const realizedForThis = use * (pricePerUnitNet - lot.costPerUnit);
				realized += realizedForThis;
				lot.qty -= use;
				toSell -= use;
				if (lot.qty <= 1e-12) lots.shift();
			}
		}
	}
	return { lots, realizedPnL: round(realized, 2) };
}

export function computePortfolio(
	txs: Tx[],
	priceMap: Record<string, number>
): PortfolioSummary {
	const bySymbol = new Map<string, Tx[]>();
	for (const tx of txs) {
		if (!bySymbol.has(tx.assetSymbol)) bySymbol.set(tx.assetSymbol, []);
		bySymbol.get(tx.assetSymbol)!.push(tx);
	}

	const assets: AssetPnL[] = [];
	let totalMV = 0;
	let totalCost = 0;
	let totalUnreal = 0;
	let totalReal = 0;

	for (const [symbol, list] of bySymbol) {
		const { lots, realizedPnL } = fifoLots(list);
		const qty = lots.reduce((s, l) => s + l.qty, 0);
		const cost = lots.reduce((s, l) => s + l.qty * l.costPerUnit, 0);
		const avgCost = qty > 0 ? cost / qty : 0;
		const price = priceMap[symbol] ?? 0;
		const mv = qty * price;
		const unreal = mv - cost;
		const unrealPct = cost > 0 ? (unreal / cost) * 100 : 0;

		assets.push({
			symbol,
			quantityHeld: round(qty, 8),
			avgCostBasisPerUnit: round(avgCost, 2),
			totalCostBasis: round(cost, 2),
			marketPrice: round(price, 2),
			marketValue: round(mv, 2),
			unrealizedPnL: round(unreal, 2),
			unrealizedPnLPercent: round(unrealPct, 2),
			realizedPnL: round(realizedPnL, 2),
		});

		totalMV += mv;
		totalCost += cost;
		totalUnreal += unreal;
		totalReal += realizedPnL;
	}

	// sort by market value desc
	assets.sort((a, b) => b.marketValue - a.marketValue);

	return {
		assets,
		totals: {
			marketValue: round(totalMV, 2),
			totalCostBasis: round(totalCost, 2),
			unrealizedPnL: round(totalUnreal, 2),
			realizedPnL: round(totalReal, 2),
		},
	};
}
