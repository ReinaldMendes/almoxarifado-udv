import { Router } from "express";
import { createHash } from "node:crypto";
import { z } from "zod";
import { wrap, parse } from "../lib/http";
import { prisma } from "../lib/prisma";
import { env } from "../config/env";
import { conflict, notFound } from "../lib/errors";
import { applyMovement } from "../lib/stock";
import { nextProtocol, dayStamp } from "../lib/protocol";
import { publicLookupLimiter, publicReadLimiter, publicReturnLimiter, publicWithdrawLimiter } from "../middleware/rateLimit";

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

// ---------- Devolução informada pela pessoa ----------
// NÃO altera estoque. Fica "aguardando conferência" até a administração confirmar.
const norm = (v: string) => v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const NOT_FOUND_MSG = "Não encontramos uma retirada com esse protocolo e nome. Confira os dados.";

const returnSchema = z.object({
  protocol: z.string().trim().toUpperCase().regex(/^RET-\d{8}-\d{4,}$/, "Protocolo inválido. Ex.: RET-20260930-0001"),
  personName: z.string().trim().min(3, "Informe o nome completo").max(120),
  quantity: z.coerce.number().int().min(1, "Informe ao menos 1").max(100000).optional(),
  damaged: z.boolean().default(false),
  note: z.string().trim().max(300).optional().nullable().transform((v) => (v ? v : null)),
});

publicRouter.post(
  "/returns",
  publicReturnLimiter,
  wrap(async (req, res) => {
    const body = parse(returnSchema, req.body);
    const ipRaw = req.ip ?? "";
    const requesterIpHash = ipRaw ? createHash("sha256").update(`${env.IP_HASH_SALT}:${ipRaw}`).digest("hex") : null;

    const w = await prisma.withdrawal.findUnique({
      where: { protocol: body.protocol },
      include: { items: { where: { requiresReturn: true }, include: { item: { select: { name: true, unit: true } }, claims: { where: { status: "PENDENTE" } } } } },
    });
    // mesma resposta para "protocolo inexistente" e "nome não confere": não revela dados de terceiros
    if (!w || norm(w.personName) !== norm(body.personName) || w.status === "CANCELADO") throw notFound(NOT_FOUND_MSG);

    const target = w.items.find((i) => i.quantity - i.returnedQuantity > 0);
    if (!target) throw conflict("Esta retirada não possui itens pendentes de devolução.", "NOTHING_TO_RETURN");
    if (target.claims.length > 0) throw conflict("Já existe uma devolução aguardando conferência para esta retirada.", "ALREADY_CLAIMED");

    const outstanding = target.quantity - target.returnedQuantity;
    const quantity = body.quantity ?? outstanding;
    if (quantity > outstanding) throw conflict(`Quantidade maior que a pendente. Restam ${outstanding} para devolver.`, "INVALID_QUANTITY");

    await prisma.returnClaim.create({
      data: { withdrawalItemId: target.id, quantity, declaredCondition: body.damaged ? "DEVOLVIDO_COM_AVARIA" : "DEVOLVIDO_BOM_ESTADO", note: body.note, requesterIpHash },
    });
    res.status(201).json({ data: { protocol: w.protocol, itemName: target.item.name, unit: target.item.unit, quantity, damaged: body.damaged } });
  }),
);

// Preenche o protocolo a partir do nome. Só responde para nome COMPLETO (nome + sobrenome),
// devolve o mínimo (protocolo, item, data) e sempre 200 — sem distinguir "nome inexistente" de "sem pendências".
publicRouter.get(
  "/returns/lookup",
  publicLookupLimiter,
  wrap(async (req, res) => {
    const name = typeof req.query.name === "string" ? norm(req.query.name.slice(0, 120)) : "";
    const words = name.split(" ").filter((w) => w.length >= 2);
    if (words.length < 2 || name.length < 6) return res.json({ data: [] });

    const open = await prisma.withdrawal.findMany({
      where: { status: "AGUARDANDO_DEVOLUCAO" },
      orderBy: { withdrawnAt: "desc" },
      take: 1000,
      select: { protocol: true, personName: true, withdrawnAt: true, items: { where: { requiresReturn: true }, select: { quantity: true, returnedQuantity: true, item: { select: { name: true, unit: true } }, claims: { where: { status: "PENDENTE" }, select: { id: true } } } } },
    });
    const data = open
      .filter((w) => norm(w.personName) === name)
      .flatMap((w) => w.items.filter((i) => i.quantity - i.returnedQuantity > 0).map((i) => ({
        protocol: w.protocol,
        itemName: i.item.name,
        unit: i.item.unit,
        outstanding: i.quantity - i.returnedQuantity,
        withdrawnAt: w.withdrawnAt,
        alreadyClaimed: i.claims.length > 0,
      })))
      .slice(0, 5);
    res.json({ data });
  }),
);
