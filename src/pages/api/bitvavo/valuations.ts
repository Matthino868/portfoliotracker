import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/crypto";
import { bitvavoRequest, type BitvavoBalance } from "@/lib/bitvavo";

type Valuation = {
  symbol: string;
  available: number;
  inOrder: number;
  priceEUR: number; // last price in EUR
  change24h: number; // last - open
  change24hPct: number; // percent
  valueAvailableEUR: number;
  valueInOrderEUR: number;
  valueTotalEUR: number;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	const session = await getServerSession(req, res, authOptions);
	if (!session?.user) return res.status(401).json({ error: "Unauthorized" });
	if (req.method !== "GET") {
		res.setHeader("Allow", ["GET"]);
		return res.status(405).end("Method Not Allowed");
	}
	const userId = (session.user as any).id as string;
  const conn = await prisma.exchangeConnection.findUnique({ where: { userId_provider: { userId, provider: "bitvavo" } } });
  const timeframe = String((req.query.timeframe as string) || "1d").toLowerCase();
	if (!conn) return res.status(400).json({ error: "No Bitvavo connection configured" });
	try {
		const secret = decryptSecret(conn.secretEnc);
		const balances = await bitvavoRequest<BitvavoBalance[]>(conn.apiKey, secret, "GET", "/v2/balance");
		const nonZero = balances.filter((b) => parseFloat(b.available) > 0 || parseFloat(b.inOrder) > 0);
		const symbols = Array.from(new Set(nonZero.map((b) => b.symbol)));

		type Ticker24h = { market: string; open: string; last: string };
		const tickers = await bitvavoRequest<Ticker24h[]>(conn.apiKey, secret, "GET", "/v2/ticker/24h");
		const tickerMap = new Map<string, Ticker24h>();
		for (const t of tickers) tickerMap.set(t.market, t);

		const valuations: Valuation[] = nonZero.map((b) => {
			const available = parseFloat(b.available) || 0;
			const inOrder = parseFloat(b.inOrder) || 0;
      let price = 0;
      let change = 0;
      let changePct = 0;
			if (b.symbol === "EUR") {
				price = 1;
			} else {
				const market = `${b.symbol}-EUR`;
				const t = tickerMap.get(market);
				if (t) {
					const last = parseFloat(t.last) || 0;
					const open = parseFloat(t.open) || 0;
					price = last;
					change = last - open;
					changePct = open > 0 ? (change / open) * 100 : 0;
				}
			}
      const valueAvailable = available * price;
      const valueInOrder = inOrder * price;
      const valueTotal = (available + inOrder) * price;
      return {
        symbol: b.symbol,
        available,
        inOrder,
        priceEUR: round(price, 6),
        change24h: round(change, 6),
        change24hPct: round(changePct, 2),
        valueAvailableEUR: round(valueAvailable, 2),
        valueInOrderEUR: round(valueInOrder, 2),
        valueTotalEUR: round(valueTotal, 2),
      };
    });

		valuations.sort((a, b) => b.valueTotalEUR - a.valueTotalEUR);
    const totals = valuations.reduce(
      (acc, v) => {
        acc.valueAvailableEUR += v.valueAvailableEUR;
        acc.valueInOrderEUR += v.valueInOrderEUR;
        acc.valueTotalEUR += v.valueTotalEUR;
        return acc;
      },
      { valueAvailableEUR: 0, valueInOrderEUR: 0, valueTotalEUR: 0 }
    );

    return res.json({
      valuations,
      totals: {
        valueAvailableEUR: round(totals.valueAvailableEUR, 2),
        valueInOrderEUR: round(totals.valueInOrderEUR, 2),
        valueTotalEUR: round(totals.valueTotalEUR, 2),
      },
      timeframe,
    });
	} catch (e: any) {
		return res.status(500).json({ error: e.message || "Failed to fetch valuations" });
	}
}

function round(n: number, d = 2) {
	const p = Math.pow(10, d);
	return Math.round(n * p) / p;
}
