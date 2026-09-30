import { dayStamp } from "./protocol";

/** Início do dia (00:00 de Brasília) como Date UTC. */
export function startOfDayBRT(d = new Date()): Date {
  const s = dayStamp(d);
  return new Date(`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T00:00:00-03:00`);
}

export function startOfMonthBRT(d = new Date()): Date {
  const s = dayStamp(d);
  return new Date(`${s.slice(0, 4)}-${s.slice(4, 6)}-01T00:00:00-03:00`);
}
