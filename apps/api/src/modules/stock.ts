import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { wrap, parse, pageParams } from "../lib/http";
import { prisma } from "../lib/prisma";
import { audit } from "../lib/audit";
import { notFound } from "../lib/errors";
import { applyMovement } from "../lib/stock";
import { nextProtocol } from "../lib/protocol";
import { canWrite, me } from "../middleware/auth";

export const stockRouter = Router();
export const movementsRouter = Router();

const text = (max: number) => z.string().trim().max(max).optional().nullable().transform((v) => (v ? v : null));

const entrySchema = z.object({
  itemId: z.string().min(1, "Selecione o item"),
  quantity: z.coerce.number().int().min(1, "Informe uma quantidade maior que zero").max(1_000_000),
  origin: text(120),
  reference: text(120),
  note: text(500),
});

stockRouter.post(
  "/entries",
  canWrite,
  wrap(async (req, res) => {
    const user = me(req);
    const body = parse(entrySchema, req.body);
    const data = await prisma.$transaction(async (tx) => {
      const item = await tx.item.findUnique({ where: { id: body.itemId } });
      if (!item) throw notFound("Item não encontrado.");
      const protocol = await nextProtocol(tx, "ENT");
      const mov = await applyMovement(tx, { ...body, type: "ENTRADA", userId: user.id, protocol });
      await audit(tx, { userId: user.id, action: "ENTRADA_ESTOQUE", entity: "StockMovement", entityId: mov.id, data: { item: item.name, quantity: body.quantity, protocol } });
      return mov;
    });
    res.status(201).json({ data });
  }),
);

// AJUSTE = nova contagem (define o saldo); PERDA/AVARIA = baixa por quantidade
const adjustSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("AJUSTE"),
    itemId: z.string().min(1),
    newStock: z.coerce.number().int().min(0, "Saldo inválido"),
    note: z.string().trim().min(3, "Explique o motivo do ajuste").max(500),
  }),
  z.object({
    type: z.enum(["PERDA", "AVARIA"]),
    itemId: z.string().min(1),
    quantity: z.coerce.number().int().min(1, "Informe uma quantidade maior que zero"),
    note: z.string().trim().min(3, "Explique o motivo").max(500),
  }),
]);

stockRouter.post(
  "/adjustments",
  canWrite,
  wrap(async (req, res) => {
    const user = me(req);
    const body = parse(adjustSchema, req.body);
    const data = await prisma.$transaction(async (tx) => {
      // trava a linha para calcular o delta do ajuste sem corrida
      const rows = await tx.$queryRaw<{ currentStock: number }[]>`SELECT "currentStock" FROM "Item" WHERE "id" = ${body.itemId} FOR UPDATE`;
      const current = rows[0]?.currentStock;
      if (current === undefined) throw notFound("Item não encontrado.");

      let mov;
      if (body.type === "AJUSTE") {
        const delta = body.newStock - current;
        if (delta === 0) return { unchanged: true as const };
        mov = await applyMovement(tx, { itemId: body.itemId, type: "AJUSTE", delta, userId: user.id, origin: "Ajuste de inventário", note: body.note });
      } else {
        mov = await applyMovement(tx, { itemId: body.itemId, type: body.type, quantity: body.quantity, userId: user.id, origin: body.type === "PERDA" ? "Perda" : "Avaria", note: body.note });
      }
      await audit(tx, { userId: user.id, action: "AJUSTE_ESTOQUE", entity: "StockMovement", entityId: mov.id, data: { type: body.type, previous: mov.previousStock, next: mov.newStock, note: body.note } });
      return { unchanged: false as const, movement: mov };
    });
    if (data.unchanged) return res.json({ data: null, message: "O saldo informado é igual ao atual. Nada foi alterado." });
    res.status(201).json({ data: data.movement });
  }),
);

// ---------- Histórico ----------
movementsRouter.get(
  "/",
  wrap(async (req, res) => {
    const { skip, take, page, pageSize } = pageParams(req.query);
    const s = (k: string) => (typeof req.query[k] === "string" && req.query[k] ? String(req.query[k]).trim() : undefined);
    const from = s("from");
    const to = s("to");
    const type = s("type");
    const validTypes = ["ENTRADA", "SAIDA", "DEVOLUCAO", "AJUSTE", "PERDA", "AVARIA"];

    const where: Prisma.StockMovementWhereInput = {
      ...(type && validTypes.includes(type) ? { type: type as Prisma.StockMovementWhereInput["type"] } : {}),
      ...(s("itemId") ? { itemId: s("itemId") } : {}),
      ...(s("categoryId") ? { item: { categoryId: s("categoryId") } } : {}),
      ...(s("userId") ? { userId: s("userId") } : {}),
      ...(s("person") ? { personName: { contains: s("person"), mode: "insensitive" } } : {}),
      ...(s("protocol") ? { protocol: { contains: s("protocol"), mode: "insensitive" } } : {}),
      ...(from || to
        ? {
            createdAt: {
              ...(from ? { gte: new Date(`${from}T00:00:00-03:00`) } : {}),
              ...(to ? { lte: new Date(`${to}T23:59:59.999-03:00`) } : {}),
            },
          }
        : {}),
    };

    const [total, data] = await Promise.all([
      prisma.stockMovement.count({ where }),
      prisma.stockMovement.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take,
        include: {
          item: { select: { id: true, code: true, name: true, unit: true } },
          user: { select: { id: true, name: true } },
        },
      }),
    ]);
    res.json({ data, total, page, pageSize });
  }),
);

movementsRouter.get(
  "/:id",
  wrap(async (req, res) => {
    const data = await prisma.stockMovement.findUnique({
      where: { id: String(req.params.id) },
      include: { item: { include: { category: true } }, user: { select: { id: true, name: true, email: true } }, withdrawal: { select: { id: true, protocol: true, personName: true, status: true } } },
    });
    if (!data) throw notFound("Movimentação não encontrada.");
    res.json({ data });
  }),
);
