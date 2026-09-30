export type Role = "ADMIN" | "GESTOR" | "CONSULTA";
export interface User { id: string; name: string; email: string; role: Role; active?: boolean; createdAt?: string; lastLoginAt?: string | null }
export interface Category { id: string; name: string; active: boolean; _count?: { items: number } }
export interface Item {
  id: string; code: string; name: string; description: string | null; categoryId: string; unit: string;
  currentStock: number; minStock: number; location: string | null; active: boolean;
  allowPublicWithdraw: boolean; requiresReturn: boolean; notes: string | null; category?: { id: string; name: string };
}
export interface ReturnRec { id: string; quantity: number; condition: string; returnedAt: string; note: string | null; user: { name: string } }
export interface Claim { id: string; quantity: number; declaredCondition: string; note: string | null; createdAt: string }
export interface WithdrawalItem {
  claims?: Claim[]; id: string; quantity: number; returnedQuantity: number; requiresReturn: boolean; outstanding?: number; item: { id: string; name: string; unit: string; code?: string }; returns?: ReturnRec[] }
export interface Withdrawal {
  id: string; protocol: string; personName: string; withdrawnAt: string; status: string; adminNotes: string | null; createdAt: string;
  chargeStatus: string; chargeAmount: string | null; chargeDate: string | null; chargeNote: string | null;
  items: WithdrawalItem[]; overdue?: boolean; hasClaim?: boolean; chargeResponsible?: { name: string } | null;
}
export interface Movement {
  id: string; type: string; quantity: number; previousStock: number; newStock: number; personName: string | null; origin: string | null;
  reference: string | null; note: string | null; protocol: string | null; createdAt: string;
  item: { id: string; code: string; name: string; unit: string }; user: { id: string; name: string } | null;
}
export interface Paged<T> { data: T[]; total: number; page: number; pageSize: number }
