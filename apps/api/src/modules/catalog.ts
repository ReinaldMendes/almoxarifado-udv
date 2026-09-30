import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { wrap, parse, pageParams } from "../lib/http";
import { prisma } from "../lib/prisma";
import { audit } from "../lib/audit";
import { conflict, notFound } from "../lib/errors";
import { applyMovement } from "../lib/stock";
import { canWrite, me } from "../middleware/auth";

export const UNITS = ["UN", "CX", "PCT", "KG", "L", "M", "PAR"] as const;

// ---------- Categorias ----------
export const categoriesRouter = Router();

const categorySchema = z.object({
  name: z.string().trim().min(2, "Informe o nome da categoria").max(80),
  active: z.boolean().optional(),
});

categoriesRouter.get(
  "/",
  wrap(async (req, res) => {
    const onlyActive = req.query.active === "true";
    const data = await prisma.category.findMany({
      where: onlyActive ? { active: true } : undefined,
      orderBy: { name: "asc" },
      include: { _count: { select: { items: true } } },
    });
    res.json({ data });
  }),
);

categoriesRouter.post(
  "/",
  canWrite,
  wrap(async (req, res) => {
    const body = parse(categorySchema, req.body);
    try {
      const data = await prisma.category.create({ data: { name: body.name, active: body.active ?? true } });
      res.status(201).json({ data });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw conflict("Já existe uma categoria com esse nome.");
      throw e;
    }
  }),
);

categoriesRouter.patch(
  "/:id",
  canWrite,
  wrap(async (req, res) => {
    const body = parse(categorySchema.partial(), req.body);
    const id = String(req.params.id);
    if (!(await prisma.category.findUnique({ where: { id } }))) throw notFound("Categoria não encontrada.");
    try {
      const data = await prisma.category.update({ where: { id }, data: body });
      res.json({ data });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw conflict("Já existe uma categoria com esse nome.");
      throw e;
    }
  }),
);

// ---------- Itens ----------
export const itemsRouter = Router();

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

const itemBase = z.object({
  code: z.string().trim().toUpperCase().min(1, "Informe o código").max(30),
  name: z.string().trim().min(2, "Informe o nome do item").max(120),
  description: optionalText(500),
  categoryId: z.string().min(1, "Selecione a categoria"),
  unit: z.enum(UNITS, { errorMap: () => ({ message: "Unidade inválida" }) }),
  minStock: z.coerce.number().int().min(0, "Estoque mínimo inválido").default(0),
  location: optionalText(120),
  active: z.boolean().default(true),
  allowPublicWithdraw: z.boolean().default(true),
  requiresReturn: z.boolean().default(false),
  notes: optionalText(1000),
});

// estoque inicial só existe na criação e gera uma movimentação ENTRADA (nunca edição direta)
const createItemSchema = itemBase.extend({ initialStock: z.coerce.number().int().min(0).default(0) });
const updateItemSchema = itemBase.partial();

itemsRouter.get(
  "/",
  wrap(async (req, res) => {
    const { skip, take, page, pageSize } = pageParams(req.query);
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const categoryId = typeof req.query.categoryId === "string" ? req.query.categoryId : undefined;
    const active = req.query.active === "true" ? true : req.query.active === "false" ? false : undefined;
    const low = req.query.low === "true";

    const where: Prisma.ItemWhereInput = {
      ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { code: { contains: q, mode: "insensitive" } }] } : {}),
      ...(categoryId ? { categoryId } : {}),
      ...(active !== undefined ? { active } : {}),
    };

    if (low) {
      // estoque baixo: currentStock <= minStock (comparação entre colunas exige SQL)
      const ids = await prisma.$queryRaw<{ id: string }[]>`SELECT "id" FROM "Item" WHERE "active" = true AND "currentStock" <= "minStock"`;
      where.id = { in: ids.map((i) => i.id) };
    }

    const [total, data] = await Promise.all([
      prisma.item.count({ where }),
      prisma.item.findMany({ where, orderBy: { name: "asc" }, skip, take, include: { category: { select: { id: true, name: true } } } }),
    ]);
    res.json({ data, total, page, pageSize });
  }),
);

itemsRouter.get(
  "/:id",
  wrap(async (req, res) => {
    const data = await prisma.item.findUnique({ where: { id: String(req.params.id) }, include: { category: true } });
    if (!data) throw notFound("Item não encontrado.");
    res.json({ data });
  }),
);

itemsRouter.post(
  "/",
  canWrite,
  wrap(async (req, res) => {
    const user = me(req);
    const { initialStock, ...body } = parse(createItemSchema, req.body);
    try {
      const data = await prisma.$transaction(async (tx) => {
        if (!(await tx.category.findUnique({ where: { id: body.categoryId } }))) throw notFound("Categoria não encontrada.");
        const item = await tx.item.create({ data: body });
        if (initialStock > 0) {
          await applyMovement(tx, {
            itemId: item.id,
            type: "ENTRADA",
            quantity: initialStock,
            userId: user.id,
            origin: "Estoque inicial",
            note: "Saldo inicial informado no cadastro do item",
          });
        }
        await audit(tx, { userId: user.id, action: "CRIAR_ITEM", entity: "Item", entityId: item.id, data: { code: item.code, name: item.name, initialStock } });
        return tx.item.findUniqueOrThrow({ where: { id: item.id }, include: { category: true } });
      });
      res.status(201).json({ data });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw conflict("Já existe um item com esse código.");
      throw e;
    }
  }),
);

itemsRouter.patch(
  "/:id",
  canWrite,
  wrap(async (req, res) => {
    const user = me(req);
    const id = String(req.params.id);
    const body = parse(updateItemSchema, req.body);
    const before = await prisma.item.findUnique({ where: { id } });
    if (!before) throw notFound("Item não encontrado.");
    try {
      const data = await prisma.$transaction(async (tx) => {
        const item = await tx.item.update({ where: { id }, data: body, include: { category: true } });
        const deactivated = before.active && item.active === false;
        await audit(tx, {
          userId: user.id,
          action: deactivated ? "DESATIVAR_ITEM" : "EDITAR_ITEM",
          entity: "Item",
          entityId: id,
          data: { changes: body } as Prisma.InputJsonValue,
        });
        return item;
      });
      res.json({ data });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw conflict("Já existe um item com esse código.");
      throw e;
    }
  }),
);
