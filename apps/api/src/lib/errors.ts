export class AppError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}
export const badRequest = (m: string, code?: string) => new AppError(400, m, code);
export const unauthorized = (m = "Não autenticado") => new AppError(401, m);
export const forbidden = (m = "Sem permissão para esta ação") => new AppError(403, m);
export const notFound = (m = "Registro não encontrado") => new AppError(404, m);
export const conflict = (m: string, code?: string) => new AppError(409, m, code);
