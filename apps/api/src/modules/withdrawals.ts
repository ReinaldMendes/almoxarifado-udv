import { Router } from "express";
import { Prisma } from "@prisma/client";
import type { WithdrawalStatus } from "@prisma/client";
import { z } from "zod";
import { wrap, parse, pageParams } from "../lib/http";
import { prisma, type Tx } from "../lib/prisma";
import { audit } from "../lib/audit";
import { conflict, notFound } from "../lib/errors";
import { applyMovement } from "../lib/stock";
import { canWrite, me } from "../middleware/auth";

export const withdrawalsRouter = Router();
export const pendenciesRouter = Router();

export const OVERDUE_DAYS = 7;
const PENDING_STATUSES: WithdrawalStatus[] = ["AGUARDANDO_DEVOLUCAO", "PENDENTE", "EXTRAVIADO", "DANIFICADO", "COBRANCA"];

const text = (max: number) => z.string().trim().max(max).optional().nullable().transform((v) => (v ? v : null));
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida");
const at = (d: string) => new Date(`${d}T12:00:00-03:00`);

const detailInclude = {
  items: { include: { item: { select: { id: true, code: true, name: true, unit: true } }, returns: { include: { user: { select: { id: true, name: true } } }, orderBy: { createdAt: "asc" as const } } } },
  chargeResponsible: { select: { id: true, name: true } },
  movements: { orderBy: { createdAt: "asc" as const }, select: { id: true, type: true, quantity: true, previousStock: true, newStock: true, createdAt: true } },
} satisfies Prisma.WithdrawalInclude;

// ---------- Lista / consulta ----------
withdrawalsRouter.get(
  "/",
  wrap(async (req, res) => {
    const { skip, take, page, pageSize } = pageParams(req.query);
    const s = (k: string) => (typeof req.query[k] === "string" && req.query[k] ? String(req.query[k]).trim() : undefined);
    const q = s("q");
    const status = s("status");
    const statuses = ["RETIRADO", "AGUARDANDO_DEVOLUCAO", "DEVOLVIDO", "PENDENTE", "CANCELADO", "EXTRAVIADO", "DANIFICADO", "COBRANCA"];
    const from = s("from");
    const to = s("to");

    const where: Prisma.WithdrawalWhereInput = {
      ...(q ? { OR: [{ personName: { contains: q, mode: "insensitive" } }, { protocol: { contains: q, mode: "insensitive" } }] } : {}),
      ...(status && statuses.includes(status) ? { status: status as WithdrawalStatus } : {}),
      ...(s("itemId") ? { items: { some: { itemId: s("itemId") } } } : {}),
      ...(from || to ? { withdrawnAt: { ...(from ? { gte: at(from) } : {}), ...(to ? { lte: new Date(`${to}T23:59:59.999-03:00`) } : {}) } } : {}),
    };

    const [total, data] = await Promise.all([
      prisma.withdrawal.count({ where }),
      prisma.withdrawal.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take,
        include: { items: { include: { item: { select: { id: true, name: true, unit: true } } } } },
      }),
    ]);
    res.json({ data, total, page, pageSize });
  }),
);

withdrawalsRouter.get(
  "/by-protocol/:protocol",
  wrap(async (req, res) => {
    const data = await prisma.withdrawal.findUnique({ where: { protocol: String(req.params.protocol).toUpperCase() }, include: detailInclude });
    if (!data) throw notFound("Retirada não encontrada.");
    res.json({ data });
  }),
);

withdrawalsRouter.get(
  "/:id",
  wrap(async (req, res) => {
    const data = await prisma.withdrawal.findUnique({ where: { id: String(req.params.id) }, include: detailInclude });
    if (!data) throw notFound("Retirada não encontrada.");
    res.json({ data });
  }),
);

// ---------- Devolução ----------
const returnSchema = z.object({
  withdrawalItemId: z.string().min(1),
  quantity: z.coerce.number().int().min(1, "Informe uma quantidade maior que zero"),
  condition: z.enum(["DEVOLVIDO_BOM_ESTADO", "DEVOLVIDO_COM_AVARIA", "NAO_DEVOLVIDO", "DEVOLVIDO_PARCIALMENTE"]),
  returnedAt: dateStr,
  note: text(500),
});

/** Recalcula o status da retirada a partir do que já foi devolvido. */
async function recomputeStatus(tx: Tx, withdrawalId: string, lastCondition: string): Promise<WithdrawalStatus> {
  const w = await tx.withdrawal.findUniqueOrThrow({ where: { id: withdrawalId }, include: { items: { include: { returns: true } } } });
  if (lastCondition === "NAO_DEVOLVIDO") return "EXTRAVIADO";
  const tracked = w.items.filter((i) => i.requiresReturn);
  const allDone = tracked.every((i) => i.returnedQuantity >= i.quantity);
  if (!allDone) return "AGUARDANDO_DEVOLUCAO";
  const anyDamaged = tracked.some((i) => i.returns.some((r) => r.condition === "DEVOLVIDO_COM_AVARIA"));
  return anyDamaged ? "DANIFICADO" : "DEVOLVIDO";
}

withdrawalsRouter.post(
  "/:id/returns",
  canWrite,
  wrap(async (req, res) => {
    const user = me(req);
    const withdrawalId = String(req.params.id);
    const body = parse(returnSchema, req.body);

    const data = await prisma.$transaction(async (tx) => {
      const w = await tx.withdrawal.findUnique({ where: { id: withdrawalId } });
      if (!w) throw notFound("Retirada não encontrada.");
      if (w.status === "CANCELADO") throw conflict("Esta retirada foi cancelada.");

      // trava a linha do item retirado para não devolver duas vezes em paralelo
      const rows = await tx.$queryRaw<{ id: string; itemId: string; quantity: number; returnedQuantity: number; requiresReturn: boolean }[]>`
        SELECT "id", "itemId", "quantity", "returnedQuantity", "requiresReturn" FROM "WithdrawalItem"
        WHERE "id" = ${body.withdrawalItemId} AND "withdrawalId" = ${withdrawalId} FOR UPDATE`;
      const wi = rows[0];
      if (!wi) throw notFound("Item da retirada não encontrado.");
      if (!wi.requiresReturn) throw conflict("Este item não exige devolução.");

      const outstanding = wi.quantity - wi.returnedQuantity;
      if (outstanding <= 0 && body.condition !== "NAO_DEVOLVIDO") throw conflict("Este item já foi totalmente devolvido.");
      if (body.quantity > outstanding) throw conflict(`Quantidade maior que a pendente. Restam ${outstanding} para devolver.`);
      if (body.condition === "DEVOLVIDO_PARCIALMENTE" && body.quantity >= outstanding) {
        throw conflict('Para devolver a quantidade total, use "Devolvido em bom estado" ou "Devolvido com avaria".');
      }

      const ref = { userId: user.id, personName: w.personName, protocol: w.protocol, withdrawalId: w.id };
      if (body.condition === "DEVOLVIDO_BOM_ESTADO" || body.condition === "DEVOLVIDO_PARCIALMENTE") {
        await applyMovement(tx, { ...ref, itemId: wi.itemId, type: "DEVOLUCAO", quantity: body.quantity, origin: "Devolução", note: body.note });
      } else if (body.condition === "DEVOLVIDO_COM_AVARIA") {
        // volta ao almoxarifado, mas não fica disponível: o rastro registra as duas etapas
        await applyMovement(tx, { ...ref, itemId: wi.itemId, type: "DEVOLUCAO", quantity: body.quantity, origin: "Devolução com avaria", note: body.note });
        await applyMovement(tx, { ...ref, itemId: wi.itemId, type: "AVARIA", quantity: body.quantity, origin: "Avaria na devolução", note: body.note });
      }

      const ret = await tx.return.create({
        data: { withdrawalItemId: wi.id, quantity: body.quantity, condition: body.condition, returnedAt: at(body.returnedAt), note: body.note, userId: user.id },
      });
      if (body.condition !== "NAO_DEVOLVIDO") {
        await tx.withdrawalItem.update({ where: { id: wi.id }, data: { returnedQuantity: { increment: body.quantity } } });
      }

      const newStatus = await recomputeStatus(tx, w.id, body.condition);
      await tx.withdrawal.update({ where: { id: w.id }, data: { status: newStatus } });
      await audit(tx, { userId: user.id, action: "REGISTRAR_DEVOLUCAO", entity: "Withdrawal", entityId: w.id, data: { protocol: w.protocol, condition: body.condition, quantity: body.quantity, status: newStatus } });
      return { return: ret, status: newStatus };
    });
    res.status(201).json({ data });
  }),
);

// ---------- Status manual / cobrança / observações ----------
const MANUAL_STATUSES = ["PENDENTE", "EXTRAVIADO", "DANIFICADO", "COBRANCA", "AGUARDANDO_DEVOLUCAO", "CANCELADO"] as const;
const statusSchema = z.object({ status: z.enum(MANUAL_STATUSES), note: text(500) });

withdrawalsRouter.patch(
  "/:id/status",
  canWrite,
  wrap(async (req, res) => {
    const user = me(req);
    const id = String(req.params.id);
    const body = parse(statusSchema, req.body);

    const data = await prisma.$transaction(async (tx) => {
      const w = await tx.withdrawal.findUnique({ where: { id }, include: { items: { include: { returns: true } } } });
      if (!w) throw notFound("Retirada não encontrada.");
      if (w.status === "CANCELADO") throw conflict("Esta retirada já foi cancelada.");

      if (body.status === "CANCELADO") {
        if (w.items.some((i) => i.returns.length > 0)) throw conflict("Não é possível cancelar uma retirada que já possui devolução registrada.");
        // cancelamento devolve o saldo ao estoque, mantendo o histórico (nada é apagado)
        for (const wi of w.items) {
          await applyMovement(tx, { itemId: wi.itemId, type: "DEVOLUCAO", quantity: wi.quantity, userId: user.id, personName: w.personName, protocol: w.protocol, withdrawalId: w.id, origin: "Cancelamento de retirada", note: body.note });
        }
      }
      const updated = await tx.withdrawal.update({
        where: { id },
        data: {
          status: body.status,
          adminNotes: body.note ? [w.adminNotes, `[${new Date().toISOString().slice(0, 10)}] ${user.name}: ${body.note}`].filter(Boolean).join("\n") : w.adminNotes,
        },
      });
      await audit(tx, { userId: user.id, action: "ALTERAR_STATUS", entity: "Withdrawal", entityId: id, data: { protocol: w.protocol, from: w.status, to: body.status } });
      return updated;
    });
    res.json({ data });
  }),
);

const chargeSchema = z.object({
  chargeStatus: z.enum(["SEM_COBRANCA", "PENDENTE_DE_COBRANCA", "COBRANCA_REALIZADA", "REGULARIZADO"]),
  chargeAmount: z.coerce.number().min(0).max(1_000_000).optional().nullable(),
  chargeDate: dateStr.optional().nullable(),
  chargeNote: text(500),
});

withdrawalsRouter.patch(
  "/:id/charge",
  canWrite,
  wrap(async (req, res) => {
    const user = me(req);
    const id = String(req.params.id);
    const body = parse(chargeSchema, req.body);
    if (!(await prisma.withdrawal.findUnique({ where: { id }, select: { id: true } }))) throw notFound("Retirada não encontrada.");
    const data = await prisma.$transaction(async (tx) => {
      const w = await tx.withdrawal.update({
        where: { id },
        data: {
          chargeStatus: body.chargeStatus,
          chargeAmount: body.chargeAmount != null ? new Prisma.Decimal(body.chargeAmount) : null,
          chargeDate: body.chargeDate ? at(body.chargeDate) : null,
          chargeNote: body.chargeNote,
          chargeResponsibleId: user.id,
        },
      });
      await audit(tx, { userId: user.id, action: "ALTERAR_STATUS", entity: "Withdrawal", entityId: id, data: { protocol: w.protocol, charge: body.chargeStatus } });
      return w;
    });
    res.json({ data });
  }),
);

const notesSchema = z.object({ note: z.string().trim().min(2, "Escreva a observação").max(500) });

withdrawalsRouter.post(
  "/:id/notes",
  canWrite,
  wrap(async (req, res) => {
    const user = me(req);
    const id = String(req.params.id);
    const { note } = parse(notesSchema, req.body);
    const w = await prisma.withdrawal.findUnique({ where: { id } });
    if (!w) throw notFound("Retirada não encontrada.");
    const line = `[${new Date().toISOString().slice(0, 10)}] ${user.name}: ${note}`;
    const data = await prisma.withdrawal.update({ where: { id }, data: { adminNotes: [w.adminNotes, line].filter(Boolean).join("\n") } });
    res.json({ data });
  }),
);

// ---------- Pendências ----------
pendenciesRouter.get(
  "/",
  wrap(async (req, res) => {
    const { skip, take, page, pageSize } = pageParams(req.query);
    const kind = typeof req.query.kind === "string" ? req.query.kind : "todas";
    const limit = new Date(Date.now() - OVERDUE_DAYS * 24 * 3600 * 1000);

    const byKind: Record<string, Prisma.WithdrawalWhereInput> = {
      todas: { OR: [{ status: { in: PENDING_STATUSES } }, { chargeStatus: "PENDENTE_DE_COBRANCA" }] },
      aguardando: { status: "AGUARDANDO_DEVOLUCAO" },
      atrasadas: { status: "AGUARDANDO_DEVOLUCAO", withdrawnAt: { lt: limit } },
      nao_devolvidas: { status: "EXTRAVIADO" },
      danificadas: { status: "DANIFICADO" },
      cobranca: { OR: [{ status: "COBRANCA" }, { chargeStatus: "PENDENTE_DE_COBRANCA" }] },
    };
    const where = byKind[kind] ?? byKind.todas!;

    const [total, rows] = await Promise.all([
      prisma.withdrawal.count({ where }),
      prisma.withdrawal.findMany({
        where,
        orderBy: { withdrawnAt: "asc" },
        skip,
        take,
        include: { items: { include: { item: { select: { id: true, name: true, unit: true } } } } },
      }),
    ]);
    const data = rows.map((w) => ({
      ...w,
      overdue: w.status === "AGUARDANDO_DEVOLUCAO" && w.withdrawnAt < limit,
      items: w.items.map((i) => ({ ...i, outstanding: Math.max(0, i.quantity - i.returnedQuantity) })),
    }));
    res.json({ data, total, page, pageSize, overdueDays: OVERDUE_DAYS });
  }),
);
