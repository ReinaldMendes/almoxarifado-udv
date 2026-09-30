import { Router } from "express";
import { wrap } from "../lib/http";
import { prisma } from "../lib/prisma";
import { startOfDayBRT, startOfMonthBRT } from "../lib/dates";
import { OVERDUE_DAYS } from "./withdrawals";

export const dashboardRouter = Router();

// Todos os indicadores são calculados no banco.
dashboardRouter.get(
  "/",
  wrap(async (_req, res) => {
    const dayStart = startOfDayBRT();
    const monthStart = startOfMonthBRT();
    const overdueLimit = new Date(Date.now() - OVERDUE_DAYS * 24 * 3600 * 1000);

    const [stockAgg, activeItems, withdrawalsToday, pendingReturns, overdueReturns, claimsToReview, lowRows, movementsMonth, monthByType, recent] = await Promise.all([
      prisma.item.aggregate({ where: { active: true }, _sum: { currentStock: true } }),
      prisma.item.count({ where: { active: true } }),
      prisma.withdrawal.count({ where: { createdAt: { gte: dayStart }, status: { not: "CANCELADO" } } }),
      prisma.withdrawal.count({ where: { status: "AGUARDANDO_DEVOLUCAO" } }),
      prisma.withdrawal.count({ where: { status: "AGUARDANDO_DEVOLUCAO", withdrawnAt: { lt: overdueLimit } } }),
      prisma.returnClaim.count({ where: { status: "PENDENTE" } }),
      prisma.$queryRaw<{ n: bigint }[]>`SELECT COUNT(*) AS n FROM "Item" WHERE "active" = true AND "currentStock" <= "minStock"`,
      prisma.stockMovement.count({ where: { createdAt: { gte: monthStart } } }),
      prisma.stockMovement.groupBy({ by: ["type"], where: { createdAt: { gte: monthStart } }, _sum: { quantity: true } }),
      prisma.withdrawal.findMany({
        orderBy: { createdAt: "desc" },
        take: 8,
        include: { items: { include: { item: { select: { name: true, unit: true } } } } },
      }),
    ]);

    const lowStock = Number(lowRows[0]?.n ?? 0);
    const sum = (t: string) => monthByType.find((m) => m.type === t)?._sum.quantity ?? 0;

    res.json({
      data: {
        totalStock: stockAgg._sum.currentStock ?? 0,
        activeItems,
        withdrawalsToday,
        pendingReturns,
        overdueReturns,
        lowStock,
        movementsMonth,
        entriesMonth: sum("ENTRADA"),
        exitsMonth: sum("SAIDA"),
        recentWithdrawals: recent.map((w) => ({
          id: w.id,
          protocol: w.protocol,
          personName: w.personName,
          withdrawnAt: w.withdrawnAt,
          status: w.status,
          items: w.items.map((i) => ({ name: i.item.name, unit: i.item.unit, quantity: i.quantity })),
        })),
        claimsToReview,
        alerts: [
          ...(claimsToReview > 0 ? [{ level: "info", text: `${claimsToReview} ${claimsToReview === 1 ? "devolução informada aguarda" : "devoluções informadas aguardam"} conferência.`, href: "/admin/pendencias?kind=conferir" }] : []),
          ...(lowStock > 0 ? [{ level: "warning", text: `${lowStock} ${lowStock === 1 ? "item está" : "itens estão"} com estoque abaixo do mínimo.`, href: "/admin/estoque?low=true" }] : []),
          ...(pendingReturns > 0 ? [{ level: "info", text: `${pendingReturns} ${pendingReturns === 1 ? "retirada aguarda" : "retiradas aguardam"} devolução.`, href: "/admin/pendencias" }] : []),
          ...(overdueReturns > 0 ? [{ level: "danger", text: `${overdueReturns} ${overdueReturns === 1 ? "devolução está atrasada" : "devoluções estão atrasadas"} (mais de ${OVERDUE_DAYS} dias).`, href: "/admin/pendencias?kind=atrasadas" }] : []),
        ],
      },
    });
  }),
);
