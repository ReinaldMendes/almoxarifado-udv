import { Router } from "express";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { wrap, parse, pageParams } from "../lib/http";
import { prisma } from "../lib/prisma";
import { audit } from "../lib/audit";
import { conflict, notFound } from "../lib/errors";
import { me } from "../middleware/auth";

/** Montado com adminOnly em app.ts. */
export const usersRouter = Router();
export const auditRouter = Router();

const publicUser = { id: true, name: true, email: true, active: true, role: true, createdAt: true, lastLoginAt: true } as const;
const roleEnum = z.enum(["ADMIN", "GESTOR", "CONSULTA"]);

const createSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome").max(120),
  email: z.string().trim().toLowerCase().email("E-mail inválido"),
  password: z.string().min(8, "A senha precisa ter ao menos 8 caracteres").max(100),
  role: roleEnum,
});
const updateSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  email: z.string().trim().toLowerCase().email("E-mail inválido").optional(),
  password: z.string().min(8, "A senha precisa ter ao menos 8 caracteres").max(100).optional(),
  role: roleEnum.optional(),
  active: z.boolean().optional(),
});

usersRouter.get(
  "/",
  wrap(async (_req, res) => {
    const data = await prisma.user.findMany({ orderBy: { name: "asc" }, select: publicUser });
    res.json({ data });
  }),
);

usersRouter.post(
  "/",
  wrap(async (req, res) => {
    const actor = me(req);
    const body = parse(createSchema, req.body);
    try {
      const passwordHash = await bcrypt.hash(body.password, 12);
      const data = await prisma.$transaction(async (tx) => {
        const u = await tx.user.create({ data: { name: body.name, email: body.email, role: body.role, passwordHash }, select: publicUser });
        await audit(tx, { userId: actor.id, action: "CRIAR_USUARIO", entity: "User", entityId: u.id, data: { email: u.email, role: u.role } });
        return u;
      });
      res.status(201).json({ data });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw conflict("Já existe um usuário com esse e-mail.");
      throw e;
    }
  }),
);

usersRouter.patch(
  "/:id",
  wrap(async (req, res) => {
    const actor = me(req);
    const id = String(req.params.id);
    const { password, ...rest } = parse(updateSchema, req.body);
    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) throw notFound("Usuário não encontrado.");

    const losesAdmin = target.role === "ADMIN" && target.active && (rest.role === "GESTOR" || rest.role === "CONSULTA" || rest.active === false);
    if (losesAdmin) {
      if (id === actor.id) throw conflict("Você não pode remover seu próprio acesso de administrador.");
      const others = await prisma.user.count({ where: { role: "ADMIN", active: true, id: { not: id } } });
      if (others === 0) throw conflict("É necessário manter ao menos um administrador ativo.");
    }
    try {
      const data = await prisma.$transaction(async (tx) => {
        const u = await tx.user.update({
          where: { id },
          data: { ...rest, ...(password ? { passwordHash: await bcrypt.hash(password, 12) } : {}) },
          select: publicUser,
        });
        await audit(tx, { userId: actor.id, action: "EDITAR_USUARIO", entity: "User", entityId: id, data: { fields: Object.keys(rest), passwordChanged: Boolean(password) } });
        return u;
      });
      res.json({ data });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw conflict("Já existe um usuário com esse e-mail.");
      throw e;
    }
  }),
);

auditRouter.get(
  "/",
  wrap(async (req, res) => {
    const { skip, take, page, pageSize } = pageParams(req.query);
    const action = typeof req.query.action === "string" ? req.query.action : undefined;
    const where: Prisma.AuditLogWhereInput = action ? { action: action as Prisma.AuditLogWhereInput["action"] } : {};
    const [total, data] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip, take, include: { user: { select: { id: true, name: true } } } }),
    ]);
    res.json({ data, total, page, pageSize });
  }),
);
