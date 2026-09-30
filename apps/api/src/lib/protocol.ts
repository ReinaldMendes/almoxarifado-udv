import type { Tx } from "./prisma";

const pad = (n: number, l: number) => String(n).padStart(l, "0");

/** Data no fuso de Brasília (AAAAMMDD) — evita virar o dia às 21h UTC. */
export function dayStamp(d = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
  return parts.replaceAll("-", "");
}

/** Contador atômico (INSERT … ON CONFLICT DO UPDATE) — sem colisão em concorrência. */
export async function nextProtocol(tx: Tx, prefix: "RET" | "ENT"): Promise<string> {
  const key = `${prefix}-${dayStamp()}`;
  const rows = await tx.$queryRaw<{ value: number }[]>`
    INSERT INTO "ProtocolCounter" ("key", "value") VALUES (${key}, 1)
    ON CONFLICT ("key") DO UPDATE SET "value" = "ProtocolCounter"."value" + 1
    RETURNING "value"`;
  const value = rows[0]?.value ?? 1;
  return `${key}-${pad(value, 4)}`;
}
