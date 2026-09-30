import rateLimit from "express-rate-limit";

const base = { standardHeaders: true, legacyHeaders: false } as const;

export const loginLimiter = rateLimit({
  ...base,
  windowMs: 15 * 60 * 1000,
  limit: 10,
  message: { error: "Muitas tentativas de login. Aguarde alguns minutos." },
});

export const publicWithdrawLimiter = rateLimit({
  ...base,
  windowMs: 10 * 60 * 1000,
  limit: 20,
  message: { error: "Muitas solicitações. Aguarde alguns minutos e tente novamente." },
});

export const publicReadLimiter = rateLimit({
  ...base,
  windowMs: 60 * 1000,
  limit: 60,
  message: { error: "Muitas solicitações. Aguarde um instante." },
});

export const apiLimiter = rateLimit({ ...base, windowMs: 60 * 1000, limit: 300 });
