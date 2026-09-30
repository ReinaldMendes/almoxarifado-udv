import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { wrap, parse } from "../lib/http";
import { prisma } from "../lib/prisma";
import { signToken, setAuthCookie, clearAuthCookie } from "../lib/auth";
import { unauthorized } from "../lib/errors";
import { audit } from "../lib/audit";
import { requireAuth, me } from "../middleware/auth";
import { loginLimiter } from "../middleware/rateLimit";

export const authRouter = Router();

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("E-mail inválido"),
  password: z.string().min(1, "Informe a senha"),
});

// hash fictício para igualar o tempo de resposta quando o e-mail não existe
const DUMMY_HASH = bcrypt.hashSync("dummy-password", 10);

authRouter.post(
  "/login",
  loginLimiter,
  wrap(async (req, res) => {
    const { email, password } = parse(loginSchema, req.body);
    const user = await prisma.user.findUnique({ where: { email } });
    const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !ok || !user.active) throw unauthorized("E-mail ou senha incorretos");

    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await audit(prisma, { userId: user.id, action: "LOGIN", entity: "User", entityId: user.id });
    setAuthCookie(res, signToken({ sub: user.id, role: user.role }));
    res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  }),
);

authRouter.post("/logout", (_req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

authRouter.get("/me", requireAuth, (req, res) => {
  res.json({ user: me(req) });
});
