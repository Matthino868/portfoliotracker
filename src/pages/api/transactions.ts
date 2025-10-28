import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/crypto";
import { bitvavoRequest } from "@/lib/bitvavo";
import { z } from "zod";

const TxSchema = z.object({
  assetSymbol: z.string().transform((s) => s.toUpperCase()),
  type: z.enum(["BUY", "SELL", "TRANSFER_IN", "TRANSFER_OUT", "DEPOSIT", "STAKING_REWARD"]),
  quantity: z.number().positive(),
  pricePerUnit: z.number().nonnegative(),
  fee: z.number().nonnegative().optional().default(0),
  timestamp: z.string().or(z.date()),
  note: z.string().optional(),
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getServerSession(req, res, authOptions);
  if (!session?.user) return res.status(401).json({ error: "Unauthorized" });

  if (req.method === "GET") {
    const userId = (session.user as any).id as string;
    // Pull user-edited overrides and manual entries from DB
    const overrides = await prisma.transaction.findMany({
      where: { userId },
      orderBy: { timestamp: "asc" },
    });

    // Build map of overrides by externalId
    const byExternal = new Map<string, any>();
    for (const t of overrides) {
      if (t.externalId) byExternal.set(t.externalId, t);
    }

    // Try to fetch Bitvavo history and merge
    const conn = await prisma.exchangeConnection.findUnique({ where: { userId_provider: { userId, provider: "bitvavo" } } });
    let merged: any[] = [];
    if (conn) {
      try {
        const secret = decryptSecret(conn.secretEnc);
        // Build common filters; page is iterated to fetch all pages
        const params = new URLSearchParams();
        const { fromDate, toDate, maxItems, type } = req.query as any;
        if (fromDate) params.set("fromDate", String(fromDate));
        else params.set("fromDate", String(Date.now() - 1500 * 24 * 60 * 60 * 1000));
        if (toDate) params.set("toDate", String(toDate));
        else params.set("toDate", String(Date.now()));
        params.set("maxItems", String(maxItems || 100));
        if (type) params.set("type", String(type));

        type HistItem = {
          transactionId: string;
          executedAt: string;
          type: string;
          priceCurrency: string;
          priceAmount: string;
          sentCurrency: string;
          sentAmount: string;
          receivedCurrency: string;
          receivedAmount: string;
          feesCurrency?: string;
          feesAmount?: string;
        };
        // Fetch all pages
        let pageNum = 1;
        let totalPages = 1;
        const items: HistItem[] = [] as any;
        do {
          const qp = new URLSearchParams(params);
          qp.set("page", String(pageNum));
          const hist = await bitvavoRequest<{ items: HistItem[]; currentPage: number; totalPages: number; maxItems: number }>(
            conn.apiKey,
            secret,
            "GET",
            `/v2/account/history?${qp.toString()}`
          );
          items.push(...(hist.items ?? []));
          totalPages = Math.max(1, Number(hist.totalPages || 1));
          pageNum += 1;
        } while (pageNum <= totalPages);

        for (const h of items) {
          const extId = h.transactionId;
          const ov = byExternal.get(extId);
          if (ov && ov.userEdited) {
            merged.push(ov);
            continue;
          }

          // Map history item to transaction-like shape for UI (not persisted)
          const action = h.type?.toUpperCase();
          const isBuy = action === "BUY";
          const isSell = action === "SELL";
          const assetSymbol = (isBuy
            ? h.receivedCurrency
            : isSell
              ? h.sentCurrency
              : (h.receivedCurrency || h.sentCurrency)) as string;
          let quantity = isBuy
            ? Number(h.receivedAmount)
            : isSell
              ? Number(h.sentAmount)
              : Number(h.receivedAmount || h.sentAmount || 0);
          const pricePerUnit = h.priceAmount != null ? Number(h.priceAmount) : 0;
          const fee = Number(h.feesAmount || 0);
          const quoteCurrency = h.priceCurrency ?? "EUR";
          const timestamp = new Date(h.executedAt);

          // Normalize type to BUY/SELL/TRANSFER_IN/TRANSFER_OUT so holdings use all txs
          let normType: "BUY" | "SELL" | "TRANSFER_IN" | "TRANSFER_OUT" | "DEPOSIT" | "STAKING_REWARD";
          if (isBuy) normType = "BUY";
          else if (isSell) normType = "SELL";
          else {
            const t = (action || "").toLowerCase();
            if (t === "withdrawal") {
              normType = "TRANSFER_OUT";
              // For withdrawals, ensure quantity matches the asset leaving the wallet
              if (h.sentCurrency && h.sentAmount) {
                quantity = Number(h.sentAmount);
              }
            } else if (t === "withdrawal_cancelled") {
              // Skip canceled withdrawals
              continue;
            } else if (t === "deposit") {
              normType = "DEPOSIT";
              if (h.receivedAmount) quantity = Number(h.receivedAmount);
            } else if (t === "staking" || t === "fixed_staking") {
              normType = "STAKING_REWARD";
              if (h.receivedAmount) quantity = Number(h.receivedAmount);
            } else if (
              t === "affiliate" ||
              t === "distribution" ||
              t === "rebate" ||
              t === "loan" ||
              t === "manually_assigned_bitvavo" ||
              t === "external_transferred_funds"
            ) {
              normType = "TRANSFER_IN";
              // For airdrop-like credits, use received amount
              if (h.receivedAmount) quantity = Number(h.receivedAmount);
            } else if (t === "internal_transfer") {
              // Best-effort: consider it inbound if we see a received leg, else outbound
              if (h.receivedCurrency && h.receivedAmount) {
                normType = "TRANSFER_IN";
                quantity = Number(h.receivedAmount);
              } else {
                normType = "TRANSFER_OUT";
                if (h.sentAmount) quantity = Number(h.sentAmount);
              }
            } else {
              // Unknown types default to no-op; include as transfer_in for visibility with zero cost
              normType = "TRANSFER_IN";
            }
          }

          merged.push({
            id: `ext:${extId}`,
            externalId: extId,
            source: "bitvavo",
            userEdited: false,
            type: normType,
            assetSymbol,
            quantity,
            pricePerUnit,
            fee,
            quoteCurrency,
            timestamp,
            note: null,
          });
        }
      } catch (e) {
        // If remote fails, fall back to local only
        merged = [];
      }
    }

    // Include manual entries (no externalId) and overrides not present in remote list
    const manual = overrides.filter((t) => !t.externalId);
    const overrideNotInRemote = overrides.filter((t) => t.externalId && !merged.find((m) => m.externalId === t.externalId));

    let all = [...merged, ...overrideNotInRemote, ...manual];
    // If there is no active API connection, do not return user-edited transactions
    // (keep them persisted in DB, just omit from response)
    if (!conn) {
      all = all.filter((t) => !t.userEdited);
    }
    // Sort by timestamp desc for UI convenience
    all.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return res.json(all);
  }

  if (req.method === "POST") {
    const parse = TxSchema.safeParse(req.body);
    if (!parse.success) return res.status(400).json({ error: parse.error.flatten() });
    const data = parse.data;
    const created = await prisma.transaction.create({
      data: {
        userId: (session.user as any).id,
        assetSymbol: data.assetSymbol,
        type: data.type as any,
        quantity: data.quantity,
        pricePerUnit: data.pricePerUnit,
        fee: data.fee ?? 0,
        timestamp: new Date(data.timestamp as any),
        note: data.note,
        quoteCurrency: "EUR",
        source: "manual",
      },
    });
    return res.status(201).json(created);
  }

  if (req.method === "PUT") {
    const userId = (session.user as any).id as string;
    const { id, externalId, ...rest } = req.body ?? {};
    if (!id && !externalId) {
      return res.status(400).json({ error: "Missing id or externalId" });
    }
    // Allow editing selected fields
    const allowed: any = {};
    if (typeof rest.assetSymbol === "string") allowed.assetSymbol = String(rest.assetSymbol).toUpperCase();
    if (typeof rest.type === "string") allowed.type = rest.type;
    if (typeof rest.quantity === "number") allowed.quantity = rest.quantity;
    if (typeof rest.pricePerUnit === "number") allowed.pricePerUnit = rest.pricePerUnit;
    if (typeof rest.fee === "number") allowed.fee = rest.fee;
    if (typeof rest.quoteCurrency === "string") allowed.quoteCurrency = rest.quoteCurrency.toUpperCase();
    if (rest.timestamp) allowed.timestamp = new Date(rest.timestamp);
    if (typeof rest.note === "string" || rest.note === null) allowed.note = rest.note;

    if (id) {
      const existing = await prisma.transaction.findFirst({ where: { id, userId } });
      if (!existing) return res.status(404).json({ error: "Not found" });
      const updated = await prisma.transaction.update({
        where: { id },
        data: { ...allowed, userEdited: true },
      });
      return res.json(updated);
    } else {
      // Upsert override by externalId
      const existingByExt = await prisma.transaction.findFirst({ where: { userId, externalId } });
      if (existingByExt) {
        const updated = await prisma.transaction.update({
          where: { id: existingByExt.id },
          data: { ...allowed, userEdited: true },
        });
        return res.json(updated);
      }
      const created = await prisma.transaction.create({
        data: {
          userId,
          source: "bitvavo",
          externalId,
          userEdited: true,
          assetSymbol: allowed.assetSymbol ?? "",
          type: (allowed.type as any) ?? "BUY",
          quantity: allowed.quantity ?? 0,
          pricePerUnit: allowed.pricePerUnit ?? 0,
          fee: allowed.fee ?? 0,
          quoteCurrency: allowed.quoteCurrency ?? "EUR",
          timestamp: allowed.timestamp ?? new Date(),
          note: allowed.note,
        },
      });
      return res.status(201).json(created);
    }
  }

  if (req.method === "DELETE") {
    const userId = (session.user as any).id as string;
    const result = await prisma.transaction.deleteMany({ where: { userId } });
    return res.json({ ok: true, deleted: result.count });
  }

  res.setHeader("Allow", ["GET", "POST", "PUT", "DELETE"]);
  return res.status(405).end("Method Not Allowed");
}
