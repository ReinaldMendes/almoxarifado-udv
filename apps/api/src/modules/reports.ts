import { Router } from "express";
import { Prisma } from "@prisma/client";
import type { Request } from "express";
import { wrap } from "../lib/http";
import { prisma } from "../lib/prisma";
import { badRequest } from "../lib/errors";

export const reportsRouter = Router();

type Cell = string | number | null;
interface Report {
  title: string;
  columns: string[];
  rows: Cell[][];
}

const fmtDate = (d: Date) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" }).format(d);
const fmtDateTime = (d: Date) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(d);

function range(req: Request) {
  const from = typeof req.query.from === "string" && req.query.from ? req.query.from : undefined;
  const to = typeof req.query.to === "string" && req.query.to ? req.query.to : undefined;
  if ((from && !/^\d{4}-\d{2}-\d{2}$/.test(from)) || (to && !/^\d{4}-\d{2}-\d{2}$/.test(to))) throw badRequest("Período inválido");
  return {
    gte: from ? new Date(`${from}T00:00:00-03:00`) : undefined,
    lte: to ? new Date(`${to}T23:59:59.999-03:00`) : undefined,
  };
}

const builders: Record<string, (req: Request) => Promise<Report>> = {
  async stock() {
    const items = await prisma.item.findMany({ orderBy: [{ category: { name: "asc" } }, { name: "asc" }], include: { category: true } });
    return {
      title: "Estoque atual",
      columns: ["Código", "Item", "Categoria", "Unidade", "Estoque atual", "Estoque mínimo", "Localização", "Ativo"],
      rows: items.map((i) => [i.code, i.name, i.category.name, i.unit, i.currentStock, i.minStock, i.location, i.active ? "Sim" : "Não"]),
    };
  },
  async entries(req) {
    const r = range(req);
    const list = await prisma.stockMovement.findMany({ where: { type: "ENTRADA", createdAt: r }, orderBy: { createdAt: "desc" }, include: { item: true, user: true } });
    return {
      title: "Entradas por período",
      columns: ["Data", "Protocolo", "Item", "Quantidade", "Origem", "Documento", "Responsável"],
      rows: list.map((m) => [fmtDateTime(m.createdAt), m.protocol, m.item.name, m.quantity, m.origin, m.reference, m.user?.name ?? null]),
    };
  },
  async exits(req) {
    const r = range(req);
    const list = await prisma.stockMovement.findMany({ where: { type: { in: ["SAIDA", "PERDA", "AVARIA"] }, createdAt: r }, orderBy: { createdAt: "desc" }, include: { item: true } });
    return {
      title: "Saídas por período",
      columns: ["Data", "Tipo", "Protocolo", "Item", "Quantidade", "Pessoa", "Origem"],
      rows: list.map((m) => [fmtDateTime(m.createdAt), m.type, m.protocol, m.item.name, m.quantity, m.personName, m.origin]),
    };
  },
  async "by-person"(req) {
    const r = range(req);
    const list = await prisma.withdrawal.findMany({ where: { withdrawnAt: r, status: { not: "CANCELADO" } }, orderBy: [{ personName: "asc" }, { withdrawnAt: "desc" }], include: { items: { include: { item: true } } } });
    return {
      title: "Retiradas por pessoa",
      columns: ["Pessoa", "Data", "Protocolo", "Item", "Quantidade", "Status"],
      rows: list.flatMap((w) => w.items.map((i) => [w.personName, fmtDate(w.withdrawnAt), w.protocol, i.item.name, i.quantity, w.status])),
    };
  },
  async "by-item"(req) {
    const r = range(req);
    const list = await prisma.withdrawalItem.findMany({ where: { withdrawal: { withdrawnAt: r, status: { not: "CANCELADO" } } }, include: { item: true, withdrawal: true } });
    const acc = new Map<string, { name: string; unit: string; qty: number; count: number }>();
    for (const i of list) {
      const cur = acc.get(i.itemId) ?? { name: i.item.name, unit: i.item.unit, qty: 0, count: 0 };
      cur.qty += i.quantity;
      cur.count += 1;
      acc.set(i.itemId, cur);
    }
    const rows = [...acc.values()].sort((a, b) => b.qty - a.qty).map((v) => [v.name, v.unit, v.count, v.qty] as Cell[]);
    return { title: "Retiradas por item", columns: ["Item", "Unidade", "Nº de retiradas", "Quantidade total"], rows };
  },
  async "pending-returns"() {
    const list = await prisma.withdrawal.findMany({ where: { status: { in: ["AGUARDANDO_DEVOLUCAO", "PENDENTE", "EXTRAVIADO", "DANIFICADO", "COBRANCA"] } }, orderBy: { withdrawnAt: "asc" }, include: { items: { include: { item: true } } } });
    return {
      title: "Itens pendentes de devolução",
      columns: ["Protocolo", "Pessoa", "Retirada em", "Item", "Retirado", "Devolvido", "Pendente", "Status", "Cobrança"],
      rows: list.flatMap((w) => w.items.filter((i) => i.requiresReturn).map((i) => [w.protocol, w.personName, fmtDate(w.withdrawnAt), i.item.name, i.quantity, i.returnedQuantity, i.quantity - i.returnedQuantity, w.status, w.chargeStatus])),
    };
  },
  async "low-stock"() {
    const items = await prisma.$queryRaw<{ code: string; name: string; unit: string; currentStock: number; minStock: number; location: string | null }[]>(
      Prisma.sql`SELECT "code","name","unit","currentStock","minStock","location" FROM "Item" WHERE "active" = true AND "currentStock" <= "minStock" ORDER BY "name"`,
    );
    return {
      title: "Itens com estoque baixo",
      columns: ["Código", "Item", "Unidade", "Estoque atual", "Estoque mínimo", "Localização"],
      rows: items.map((i) => [i.code, i.name, i.unit, i.currentStock, i.minStock, i.location]),
    };
  },
  async history(req) {
    const r = range(req);
    const list = await prisma.stockMovement.findMany({ where: { createdAt: r }, orderBy: { createdAt: "desc" }, take: 20000, include: { item: true, user: true } });
    return {
      title: "Histórico completo de movimentações",
      columns: ["Data", "Tipo", "Item", "Quantidade", "Pessoa", "Responsável", "Estoque anterior", "Estoque posterior", "Protocolo", "Origem", "Observação"],
      rows: list.map((m) => [fmtDateTime(m.createdAt), m.type, m.item.name, m.quantity, m.personName, m.user?.name ?? null, m.previousStock, m.newStock, m.protocol, m.origin, m.note]),
    };
  },
};

/** Neutraliza injeção de fórmulas (=, +, -, @) ao abrir no Excel. */
function csvCell(v: Cell): string {
  if (v === null || v === undefined) return "";
  let s = String(v);
  if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[";\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

export function toCsv(r: Report): string {
  const lines = [r.columns, ...r.rows].map((row) => row.map(csvCell).join(";"));
  return "\uFEFF" + lines.join("\r\n"); // BOM + ';' → abre correto no Excel pt-BR
}

reportsRouter.get(
  "/",
  wrap(async (_req, res) => {
    res.json({
      data: [
        { key: "stock", title: "Estoque atual", period: false },
        { key: "entries", title: "Entradas por período", period: true },
        { key: "exits", title: "Saídas por período", period: true },
        { key: "by-person", title: "Retiradas por pessoa", period: true },
        { key: "by-item", title: "Retiradas por item", period: true },
        { key: "pending-returns", title: "Itens pendentes de devolução", period: false },
        { key: "low-stock", title: "Itens com estoque baixo", period: false },
        { key: "history", title: "Histórico completo", period: true },
      ],
    });
  }),
);

// Arquitetura pronta para PDF: basta adicionar um formatter (ex.: format=pdf) que consuma o mesmo Report.
reportsRouter.get(
  "/:type",
  wrap(async (req, res) => {
    const build = builders[String(req.params.type)];
    if (!build) throw badRequest("Relatório desconhecido");
    const report = await build(req);
    if (req.query.format === "csv") {
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${String(req.params.type)}-${new Date().toISOString().slice(0, 10)}.csv"`);
      return res.send(toCsv(report));
    }
    res.json({ data: report });
  }),
);
