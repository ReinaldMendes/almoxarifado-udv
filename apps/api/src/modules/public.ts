import { Router } from "express";
import { createHash } from "node:crypto";
import { z } from "zod";
import { wrap, parse } from "../lib/http";
import { prisma } from "../lib/prisma";
import { env } from "../config/env";
import { conflict, notFound } from "../lib/errors";
import { applyMovement } from "../lib/stock";
import { nextProtocol, dayStamp } from "../lib/protocol";
import { publicReadLimiter, publicWithdrawLimiter } from "../middleware/rateLimit";

export const publicRouter = Router();

/** Somente o mínimo necessário para retirar: sem código interno, local, mínimo, categoria ou histórico. */
publicRouter.get(
  "/items",
  publicReadLimiter,
  wrap(async (req, res) => {
    const q = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 60) : "";
    const items = await prisma.item.findMany({
      where: {
        active: true,
        allowPublicWithdraw: true,
        currentStock: { gt: 0 },
        category: { active: true },
        ...(q ? { name: { contains: q, mode: "insensitive" } } : {}),
      },
      orderBy: { name: "asc" },
      take: 200,
      select: { id: true, name: true, unit: true, currentStock: true, requiresReturn: true },
    });
    res.json({ data: items.map((i) => ({ id: i.id, name: i.name, unit: i.unit, available: i.currentStock, requiresReturn: i.requiresReturn })) });
  }),
);

const withdrawSchema = z.object({
  personName: z
    .string()
    .trim()
    .min(3, "Informe o nome completo")
    .max(120)
    .regex(/^[\p{L}][\p{L}\s.'´`-]*$/u, "Use apenas letras no nome")
    .transform((v) => v.replace(/\s+/g, " ")),
  withdrawnAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida"),
  itemId: z.string().min(1, "Selecione o item"),
  quantity: z.coerce.number().int("Quantidade inválida").min(1, "Informe ao menos 1").max(100000),
});

publicRouter.post(
  "/withdrawals",
  publicWithdrawLimiter,
  wrap(async (req, res) => {
    const body = parse(withdrawSchema, req.body);

    // data da retirada: hoje ou até 7 dias atrás (fuso de Brasília); nunca futura
    const today = dayStamp();
    const chosen = body.withdrawnAt.replaceAll("-", "");
    const minDay = dayStamp(new Date(Date.now() - 7 * 24 * 3600 * 1000));
    if (chosen > today) throw conflict("A data da retirada não pode ser futura.", "INVALID_DATE");
    if (chosen < minDay) throw conflict("A data da retirada é muito antiga. Informe uma data recente.", "INVALID_DATE");

    const ipRaw = req.ip ?? "";
    const requesterIpHash = ipRaw ? createHash("sha256").update(`${env.IP_HASH_SALT}:${ipRaw}`).digest("hex") : null;

    const result = await prisma.$transaction(async (tx) => {
      const item = await tx.item.findFirst({ where: { id: body.itemId, active: true, allowPublicWithdraw: true, category: { active: true } } });
      if (!item) throw notFound("Item indisponível para retirada.");

      const protocol = await nextProtocol(tx, "RET");
      const withdrawal = await tx.withdrawal.create({
        data: {
          protocol,
          personName: body.personName,
          withdrawnAt: new Date(`${body.withdrawnAt}T12:00:00-03:00`),
          status: item.requiresReturn ? "AGUARDANDO_DEVOLUCAO" : "RETIRADO",
          requesterIpHash,
          items: { create: { itemId: item.id, quantity: body.quantity, requiresReturn: item.requiresReturn } },
        },
      });
      // reduz o estoque de forma atômica; lança 409 se não houver saldo
      await applyMovement(tx, {
        itemId: item.id,
        type: "SAIDA",
        quantity: body.quantity,
        personName: body.personName,
        origin: "Retirada pública",
        protocol,
        withdrawalId: withdrawal.id,
      });
      return { protocol, itemName: item.name, unit: item.unit, quantity: body.quantity, requiresReturn: item.requiresReturn, withdrawnAt: body.withdrawnAt, personName: body.personName };
    });

    res.status(201).json({ data: result });
  }),
);
