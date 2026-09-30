import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";
import { env } from "./config/env";
import { prisma } from "./lib/prisma";
import { requireAuth, adminOnly } from "./middleware/auth";
import { apiLimiter } from "./middleware/rateLimit";
import { errorHandler, notFoundHandler } from "./middleware/error";
import { authRouter } from "./modules/auth";
import { publicRouter } from "./modules/public";
import { categoriesRouter, itemsRouter } from "./modules/catalog";
import { stockRouter, movementsRouter } from "./modules/stock";
import { withdrawalsRouter, pendenciesRouter } from "./modules/withdrawals";
import { dashboardRouter } from "./modules/dashboard";
import { reportsRouter } from "./modules/reports";
import { usersRouter, auditRouter } from "./modules/users";

export function createApp() {
  const app = express();
  app.set("trust proxy", env.TRUST_PROXY_HOPS);
  app.disable("x-powered-by");
  app.use(helmet());
  app.use(cors({ origin: env.corsOrigins, credentials: true }));
  app.use(express.json({ limit: "100kb" }));
  app.use(cookieParser());

  // healthcheck do Railway (sem autenticação, sem dados)
  app.get("/health", async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ status: "ok" });
    } catch {
      res.status(503).json({ status: "db_unavailable" });
    }
  });

  app.use("/api", apiLimiter);
  app.use("/api/public", publicRouter);
  app.use("/api/auth", authRouter);

  // tudo abaixo exige login; CONSULTA lê, GESTOR/ADMIN escrevem (ver canWrite nas rotas)
  const admin = express.Router();
  admin.use(requireAuth);
  admin.use("/dashboard", dashboardRouter);
  admin.use("/categories", categoriesRouter);
  admin.use("/items", itemsRouter);
  admin.use("/stock", stockRouter);
  admin.use("/movements", movementsRouter);
  admin.use("/withdrawals", withdrawalsRouter);
  admin.use("/pendencies", pendenciesRouter);
  admin.use("/reports", reportsRouter);
  admin.use("/users", adminOnly, usersRouter);
  admin.use("/audit", adminOnly, auditRouter);
  app.use("/api/admin", admin);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
