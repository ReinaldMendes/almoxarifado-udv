"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, Loader2, X, XCircle, Inbox } from "lucide-react";

// ---------- Badge ----------
const TONES = {
  green: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  blue: "bg-brand-50 text-brand-700 ring-brand-600/20",
  yellow: "bg-amber-50 text-amber-700 ring-amber-600/20",
  red: "bg-red-50 text-red-700 ring-red-600/20",
  gray: "bg-slate-100 text-slate-600 ring-slate-500/20",
};
export type Tone = keyof typeof TONES;
export const Badge = ({ tone = "gray", children }: { tone?: Tone; children: ReactNode }) => (
  <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${TONES[tone]}`}>{children}</span>
);

// ---------- Form ----------
export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
export const Toggle = ({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) => (
  <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-3">
    <input type="checkbox" className="mt-1 h-4 w-4 accent-[#009fd1]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    <span>
      <span className="block text-sm font-medium text-slate-800">{label}</span>
      {hint && <span className="block text-xs text-slate-500">{hint}</span>}
    </span>
  </label>
);

export const Spinner = ({ className = "h-4 w-4" }: { className?: string }) => <Loader2 className={`animate-spin ${className}`} aria-hidden />;
export const Skeleton = ({ className = "h-4 w-full" }: { className?: string }) => <div className={`animate-pulse rounded-lg bg-slate-200/70 ${className}`} />;
export const TableSkeleton = ({ rows = 5 }: { rows?: number }) => (
  <div className="space-y-3 p-4">{Array.from({ length: rows }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
);

export const EmptyState = ({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) => (
  <div className="flex flex-col items-center px-6 py-14 text-center">
    <div className="mb-3 rounded-full bg-slate-100 p-3 text-slate-400"><Inbox className="h-6 w-6" /></div>
    <p className="font-medium text-slate-700">{title}</p>
    {hint && <p className="mt-1 max-w-sm text-sm text-slate-500">{hint}</p>}
    {action && <div className="mt-4">{action}</div>}
  </div>
);

export const PageHeader = ({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) => (
  <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
    <div>
      <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">{title}</h1>
      {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
    </div>
    {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
  </div>
);

export const ErrorBox = ({ message }: { message: string }) => (
  <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
    <XCircle className="mt-0.5 h-4 w-4 shrink-0" /> <span>{message}</span>
  </div>
);

// ---------- Modal / ConfirmDialog ----------
export function Modal({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-slate-900/50" onClick={onClose} />
      <div className={`relative flex max-h-[92dvh] w-full flex-col rounded-t-2xl bg-white shadow-xl sm:rounded-2xl ${wide ? "sm:max-w-2xl" : "sm:max-w-lg"}`}>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" aria-label="Fechar"><X className="h-5 w-5" /></button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmDialog({ open, title, message, confirmLabel = "Confirmar", danger, loading, onConfirm, onClose }: { open: boolean; title: string; message: ReactNode; confirmLabel?: string; danger?: boolean; loading?: boolean; onConfirm: () => void; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title={title} footer={<>
      <button className="btn-secondary" onClick={onClose} disabled={loading}>Cancelar</button>
      <button className={danger ? "btn-danger" : "btn-primary"} onClick={onConfirm} disabled={loading}>{loading && <Spinner />}{confirmLabel}</button>
    </>}>
      <div className="text-sm text-slate-600">{message}</div>
    </Modal>
  );
}

// ---------- Toast ----------
interface ToastItem { id: number; kind: "success" | "error" | "info"; text: string }
const ToastCtx = createContext<(kind: ToastItem["kind"], text: string) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const n = useRef(0);
  const push = useCallback((kind: ToastItem["kind"], text: string) => {
    const id = ++n.current;
    setItems((s) => [...s, { id, kind, text }]);
    setTimeout(() => setItems((s) => s.filter((t) => t.id !== id)), 4500);
  }, []);
  const icon = { success: <CheckCircle2 className="h-5 w-5 text-emerald-500" />, error: <AlertTriangle className="h-5 w-5 text-red-500" />, info: <Info className="h-5 w-5 text-brand-500" /> };
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-3 z-[60] flex flex-col items-center gap-2 px-3" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border border-slate-200 bg-white p-3.5 text-sm shadow-lg">
            {icon[t.kind]} <span className="text-slate-700">{t.text}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

// ---------- Table ----------
export interface Column<T> { header: string; cell: (row: T) => ReactNode; className?: string; hideOnMobile?: boolean }
export function DataTable<T extends { id: string }>({ columns, rows, loading, empty, onRowClick, mobileTitle }: { columns: Column<T>[]; rows: T[] | null; loading?: boolean; empty?: ReactNode; onRowClick?: (r: T) => void; mobileTitle?: (r: T) => ReactNode }) {
  if (loading || rows === null) return <TableSkeleton />;
  if (rows.length === 0) return <>{empty ?? <EmptyState title="Nenhum registro encontrado" />}</>;
  return (
    <>
      {/* desktop */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>{columns.map((c) => <th key={c.header} className={`px-4 py-3 font-semibold ${c.className ?? ""}`}>{c.header}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.id} onClick={onRowClick ? () => onRowClick(r) : undefined} className={onRowClick ? "cursor-pointer hover:bg-slate-50" : ""}>
                {columns.map((c) => <td key={c.header} className={`px-4 py-3 align-middle ${c.className ?? ""}`}>{c.cell(r)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* mobile: cartões */}
      <ul className="divide-y divide-slate-100 md:hidden">
        {rows.map((r) => (
          <li key={r.id} onClick={onRowClick ? () => onRowClick(r) : undefined} className={`space-y-1.5 px-4 py-3.5 ${onRowClick ? "active:bg-slate-50" : ""}`}>
            {mobileTitle && <div className="font-medium text-slate-900">{mobileTitle(r)}</div>}
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
              {columns.filter((c) => !c.hideOnMobile).map((c) => (
                <div key={c.header} className="min-w-0">
                  <dt className="text-[11px] uppercase tracking-wide text-slate-400">{c.header}</dt>
                  <dd className="truncate text-slate-700">{c.cell(r)}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
    </>
  );
}

export function Pagination({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;
  return (
    <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-sm text-slate-500">
      <span>{total} {total === 1 ? "registro" : "registros"}</span>
      <div className="flex items-center gap-2">
        <button className="btn-secondary !px-3 !py-1.5" disabled={page <= 1} onClick={() => onPage(page - 1)}>Anterior</button>
        <span>{page}/{pages}</span>
        <button className="btn-secondary !px-3 !py-1.5" disabled={page >= pages} onClick={() => onPage(page + 1)}>Próxima</button>
      </div>
    </div>
  );
}

export const StatCard = ({ label, value, icon, tone = "blue", href }: { label: string; value: ReactNode; icon: ReactNode; tone?: Tone; href?: string }) => {
  const bg = { green: "bg-emerald-50 text-emerald-600", blue: "bg-brand-50 text-brand-600", yellow: "bg-amber-50 text-amber-600", red: "bg-red-50 text-red-600", gray: "bg-slate-100 text-slate-500" }[tone];
  const body = (
    <div className="card flex items-center gap-3 p-4 transition-colors hover:border-brand-300">
      <div className={`rounded-xl p-2.5 ${bg}`}>{icon}</div>
      <div className="min-w-0">
        <p className="truncate text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
        <p className="text-2xl font-bold text-slate-900">{value}</p>
      </div>
    </div>
  );
  return href ? <a href={href}>{body}</a> : body;
};

export function useDebounced<T>(value: T, ms = 350) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}
