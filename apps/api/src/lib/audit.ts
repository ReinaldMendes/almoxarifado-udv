import type { AuditAction, Prisma } from "@prisma/client";
import { prisma, type Tx } from "./prisma";

export async function audit(
  db: Tx | typeof prisma,
  p: { userId?: string | null; action: AuditAction; entity?: string; entityId?: string; data?: Prisma.InputJsonValue },
) {
  await db.auditLog.create({
    data: {
      userId: p.userId ?? null,
      action: p.action,
      entity: p.entity ?? null,
      entityId: p.entityId ?? null,
      data: p.data ?? undefined,
    },
  });
}
