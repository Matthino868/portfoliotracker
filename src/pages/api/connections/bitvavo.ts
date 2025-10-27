import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { encryptSecret } from "@/lib/crypto";
import { z } from "zod";

const BodySchema = z.object({
  apiKey: z.string().min(10),
  apiSecret: z.string().min(10),
  label: z.string().optional(),
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getServerSession(req, res, authOptions);
  if (!session?.user) return res.status(401).json({ error: "Unauthorized" });
  const userId = (session.user as any).id as string;

  if (req.method === "GET") {
    const conn = await prisma.exchangeConnection.findUnique({ where: { userId_provider: { userId, provider: "bitvavo" } }, select: { id: true, provider: true, label: true, createdAt: true, updatedAt: true } });
    return res.json({ connected: !!conn, connection: conn });
  }

  if (req.method === "POST") {
    const parsed = BodySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const { apiKey, apiSecret, label } = parsed.data;
    const secretEnc = encryptSecret(apiSecret);
    const saved = await prisma.exchangeConnection.upsert({
      where: { userId_provider: { userId, provider: "bitvavo" } },
      update: { apiKey, secretEnc, label },
      create: { userId, provider: "bitvavo", apiKey, secretEnc, label },
      select: { id: true, provider: true, label: true },
    });
    return res.status(201).json({ ok: true, connection: saved });
  }

  res.setHeader("Allow", ["GET", "POST"]);
  return res.status(405).end("Method Not Allowed");
}

