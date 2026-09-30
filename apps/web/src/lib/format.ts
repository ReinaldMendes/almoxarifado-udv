const TZ = "America/Sao_Paulo";
export const fmtDate = (d: string | Date) => new Intl.DateTimeFormat("pt-BR", { timeZone: TZ }).format(new Date(d));
export const fmtDateTime = (d: string | Date) => new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, dateStyle: "short", timeStyle: "short" }).format(new Date(d));
export const todayISO = () => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
export const plural = (n: number, unit: string) => `${n} ${unit === "UN" ? (n === 1 ? "unidade" : "unidades") : unit}`;

export const STATUS_LABEL: Record<string, string> = {
  RETIRADO: "Retirado", AGUARDANDO_DEVOLUCAO: "Aguardando devolução", DEVOLVIDO: "Devolvido", PENDENTE: "Pendente",
  CANCELADO: "Cancelado", EXTRAVIADO: "Não devolvido", DANIFICADO: "Danificado", COBRANCA: "Em cobrança",
};
export const STATUS_TONE: Record<string, "green" | "blue" | "yellow" | "red" | "gray"> = {
  RETIRADO: "blue", AGUARDANDO_DEVOLUCAO: "yellow", DEVOLVIDO: "green", PENDENTE: "yellow",
  CANCELADO: "gray", EXTRAVIADO: "red", DANIFICADO: "red", COBRANCA: "red",
};
export const MOVEMENT_LABEL: Record<string, string> = { ENTRADA: "Entrada", SAIDA: "Saída", DEVOLUCAO: "Devolução", AJUSTE: "Ajuste", PERDA: "Perda", AVARIA: "Avaria" };
export const MOVEMENT_TONE: Record<string, "green" | "blue" | "yellow" | "red" | "gray"> = { ENTRADA: "green", SAIDA: "blue", DEVOLUCAO: "green", AJUSTE: "yellow", PERDA: "red", AVARIA: "red" };
export const CHARGE_LABEL: Record<string, string> = { SEM_COBRANCA: "Sem cobrança", PENDENTE_DE_COBRANCA: "Pendente de cobrança", COBRANCA_REALIZADA: "Cobrança realizada", REGULARIZADO: "Regularizado" };
export const CONDITION_LABEL: Record<string, string> = { DEVOLVIDO_BOM_ESTADO: "Devolvido em bom estado", DEVOLVIDO_COM_AVARIA: "Devolvido com avaria", NAO_DEVOLVIDO: "Não devolvido", DEVOLVIDO_PARCIALMENTE: "Devolvido parcialmente" };
export const ROLE_LABEL: Record<string, string> = { ADMIN: "Administrador", GESTOR: "Gestor", CONSULTA: "Consulta" };
export const UNITS = ["UN", "CX", "PCT", "KG", "L", "M", "PAR"];
