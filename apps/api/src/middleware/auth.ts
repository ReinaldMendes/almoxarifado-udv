import type { NextFunction, Request, Response } from "express";
import type { Role } from "@prisma/client";
import { COOKIE_NAME, verifyToken } from "../lib/auth";
import { forbidden, unauthorized } from "../lib/errors";
import { prisma } from "../lib/prisma";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
}

declare module "express-serve-static-core" {
  interface Request {
    user?: AuthUser;
  }
}

/** Valida o token E confere no banco (usuário inativo perde acesso imediatamente). */
export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = (req.cookies as Record<string, string | undefined>)[COOKIE_NAME];
    const payload = token ? verifyToken(token) : null;
    if (!payload) throw unauthorized();
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, name: true, email: true, role: true, active: true },
    });
    if (!user || !user.active) throw unauthorized();
    req.user = { id: user.id, name: user.name, email: user.email, role: user.role };
    next();
  } catch (e) {
    next(e);
  }
}

export const requireRole =
  (...roles: Role[]) =>
  (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(unauthorized());
    if (!roles.includes(req.user.role)) return next(forbidden());
    next();
  };

/** CONSULTA só lê; GESTOR e ADMIN escrevem em estoque/retiradas/devoluções. */
export const canWrite = requireRole("ADMIN", "GESTOR");
export const adminOnly = requireRole("ADMIN");

export const me = (req: Request): AuthUser => {
  if (!req.user) throw unauthorized();
  return req.user;
};
