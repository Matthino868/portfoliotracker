import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/crypto";
import { bitvavoRequest } from "@/lib/bitvavo";

type BitvavoTrade = {
  id?: string; // trade id
  tradeId?: string; // some apis use tradeId
  orderId?: string;
  timestamp?: number | string;
  market?: string; // e.g., BTC-EUR
  amount?: string | number; // base amount
  price?: string | number; // price in quote per base
  side?: "buy" | "sell";
  fee?: string | number;
  feeCurrency?: string;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getServerSession(req, res, authOptions);
  if (!session?.user) return res.status(401).json({ error: "Unauthorized" });
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).end("Method Not Allowed");
  }

  const userId = (session.user as any).id as string;
  const conn = await prisma.exchangeConnection.findUnique({ where: { userId_provider: { userId, provider: "bitvavo" } } });
  if (!conn) return res.status(400).json({ error: "No Bitvavo connection configured" });

  try {
    const secret = decryptSecret(conn.secretEnc);
    const params = new URLSearchParams();
    console.log("Importing Bitvavo transactions", req.query);
    const { fromDate, toDate, page, maxItems, type } = req.query as any;
    // if (fromDate) params.set("fromDate", String(fromDate)); 
    params.set("fromDate", Date.now() - 1500 * 24 * 60 * 60 * 1000 + ""); // default to last 90 days
    params.set("toDate", Date.now() + ""); // max limit
    // if (toDate) params.set("toDate", String(toDate));
    if (page) params.set("page", String(page));
    // if (maxItems) params.set("maxItems", String(maxItems));
    if (type) params.set("type", String(type));
    // console.log("Importing Bitvavo transactions with params:", params.toString());
    const hist = await bitvavoRequest<any>(conn.apiKey, secret, "GET", `/v2/account/history?${params.toString()}`);
    // No DB writes: just return a quick summary so the UI can refresh via GET /api/transactions
    console.log("Imported Bitvavo transactions:", hist);
    return res.json({ ok: true, count: hist?.items?.length ?? 0, page: hist?.currentPage ?? 1, totalPages: hist?.totalPages ?? 1 });
  } catch (e: any) {
    return res.status(500).json({ error: e.message || "Failed to import Bitvavo transactions" });
  }
}
