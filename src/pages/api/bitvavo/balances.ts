import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/crypto";
import { bitvavoRequest, type BitvavoBalance } from "@/lib/bitvavo";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  console.log("Bitvavo balances request received");
  const session = await getServerSession(req, res, authOptions);
  if (!session?.user) return res.status(401).json({ error: "Unauthorized" });
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).end("Method Not Allowed");
  }
  const userId = (session.user as any).id as string;
  const conn = await prisma.exchangeConnection.findUnique({ where: { userId_provider: { userId, provider: "bitvavo" } } });
  if (!conn) return res.status(400).json({ error: "No Bitvavo connection configured" });
  
  try {
    const secret = decryptSecret(conn.secretEnc);
    console.log("conn.apiKey:", conn.apiKey);
    console.log("conn.apiSecret:", secret);
    const balances = await bitvavoRequest<BitvavoBalance[]>(conn.apiKey, secret, "GET", "/v2/balance");
    console.log("Fetched Bitvavo balances:", balances);
    return res.json({ balances });
  } catch (e: any) {
    return res.status(500).json({ error: e.message || "Failed to fetch balances" });
  }
}

