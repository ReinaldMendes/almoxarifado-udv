import type { NextFunction, Request, Response } from "express";
import { AppError } from "../lib/errors";
import { env } from "../config/env";

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ error: "Rota não encontrada" });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Express identifica handlers de erro pela aridade (4 args)
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: err.message, code: err.code });
  }
  console.error("[erro]", err);
  res.status(500).json({ error: "Erro interno do servidor", ...(env.isProd ? {} : { detail: String(err) }) });
}
