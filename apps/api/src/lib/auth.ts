import type { Response } from "express";
import jwt from "jsonwebtoken";
import type { Role } from "@prisma/client";
import { env } from "../config/env";

export const COOKIE_NAME = "almox_token";
const MAX_AGE_MS = 1000 * 60 * 60 * 8; // 8h

export interface TokenPayload {
  sub: string;
  role: Role;
}

export const signToken = (p: TokenPayload) => jwt.sign(p, env.JWT_SECRET, { expiresIn: "8h" });

export function verifyToken(token: string): TokenPayload | null {
  try {
    const d = jwt.verify(token, env.JWT_SECRET);
    if (typeof d === "object" && d && typeof d.sub === "string" && typeof d.role === "string") {
      return { sub: d.sub, role: d.role as Role };
    }
    return null;
  } catch {
    return null;
  }
}

export const cookieOptions = () =>
  ({
    httpOnly: true,
    secure: env.isProd,
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_MS,
  }) as const;

export const setAuthCookie = (res: Response, token: string) => res.cookie(COOKIE_NAME, token, cookieOptions());
export const clearAuthCookie = (res: Response) => res.clearCookie(COOKIE_NAME, { ...cookieOptions(), maxAge: undefined });
