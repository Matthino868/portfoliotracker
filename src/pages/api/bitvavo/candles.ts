import type { NextApiRequest, NextApiResponse } from "next";
import { bitvavoPublicRequest } from "@/lib/bitvavo";
import { Console } from "console";

// Proxy Bitvavo public candles endpoint
// Query: market=BTC-EUR&interval=1d&start=ms&end=ms
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).end("Method Not Allowed");
  }
  const market = String(req.query.market || "").toUpperCase();
  const interval = String(req.query.interval || "1d");
  const start = String(req.query.start || "");
  const end = String(req.query.end || "");
  if (!market) return res.status(400).json({ error: "Missing market (e.g., BTC-EUR)" });
  try {
    const qp = new URLSearchParams();
    qp.set("market", market);
    qp.set("interval", interval);
    if (start) qp.set("start", start);
    if (end) qp.set("end", end);
    console.log("Bitvavo candles request:", qp.toString());
    // Bitvavo returns [timestamp, open, high, low, close, volume] rows
    const data = await bitvavoPublicRequest<any>(`/v2/${market}/candles?${qp.toString()}`);
    console.log("Bitvavo candles response:", data);
    return res.json(data);
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "Failed to fetch candles" });
  }
}

