import type { MovementType } from "@prisma/client";
import type { Tx } from "./prisma";
import { conflict, notFound } from "./errors";

const INCREASES: MovementType[] = ["ENTRADA", "DEVOLUCAO"];
const DECREASES: MovementType[] = ["SAIDA", "PERDA", "AVARIA"];

export interface MovementInput {
  itemId: string;
  type: MovementType;
  /** Quantidade positiva. Para AJUSTE use `delta` (com sinal). */
  quantity?: number;
  delta?: number;
  userId?: string | null;
  personName?: string | null;
  origin?: string | null;
  reference?: string | null;
  note?: string | null;
  protocol?: string | null;
  withdrawalId?: string | null;
}

/**
 * ÚNICO ponto que altera Item.currentStock. Deve ser chamado dentro de $transaction.
 *
 * Concorrência: o UPDATE condicional (`currentStock >= qtd`) toma o lock da linha e só
 * aplica se ainda houver saldo. Duas retiradas simultâneas são serializadas pelo Postgres:
 * a segunda reavalia a condição após o commit da primeira e falha se não houver saldo.
 * Além disso, há um CHECK ("currentStock" >= 0) no banco como última barreira.
 */
export async function applyMovement(tx: Tx, m: MovementInput) {
  const delta =
    m.type === "AJUSTE"
      ? (m.delta ?? 0)
      : INCREASES.includes(m.type)
        ? Math.abs(m.quantity ?? 0)
        : DECREASES.includes(m.type)
          ? -Math.abs(m.quantity ?? 0)
          : 0;
  if (delta === 0) throw conflict("Quantidade inválida para a movimentação.", "INVALID_QUANTITY");

  let updated: { currentStock: number; name: string }[];
  if (delta < 0) {
    updated = await tx.$queryRaw`
      UPDATE "Item" SET "currentStock" = "currentStock" + ${delta}, "updatedAt" = NOW()
      WHERE "id" = ${m.itemId} AND "currentStock" >= ${-delta}
      RETURNING "currentStock", "name"`;
  } else {
    updated = await tx.$queryRaw`
      UPDATE "Item" SET "currentStock" = "currentStock" + ${delta}, "updatedAt" = NOW()
      WHERE "id" = ${m.itemId}
      RETURNING "currentStock", "name"`;
  }

  const row = updated[0];
  if (!row) {
    const item = await tx.item.findUnique({ where: { id: m.itemId }, select: { currentStock: true } });
    if (!item) throw notFound("Item não encontrado.");
    throw conflict(
      `Quantidade indisponível. Há apenas ${item.currentStock} unidades disponíveis.`,
      "INSUFFICIENT_STOCK",
    );
  }

  const newStock = row.currentStock;
  const previousStock = newStock - delta;
  return tx.stockMovement.create({
    data: {
      itemId: m.itemId,
      type: m.type,
      quantity: Math.abs(delta),
      previousStock,
      newStock,
      userId: m.userId ?? null,
      personName: m.personName ?? null,
      origin: m.origin ?? null,
      reference: m.reference ?? null,
      note: m.note ?? null,
      protocol: m.protocol ?? null,
      withdrawalId: m.withdrawalId ?? null,
    },
  });
}
