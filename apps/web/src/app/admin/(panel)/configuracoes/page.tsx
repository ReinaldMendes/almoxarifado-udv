"use client";
import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { fmtDateTime } from "@/lib/format";
import type { Category, Paged } from "@/lib/types";
import { useCanWrite, useUser } from "@/components/admin-shell";
import { Badge, DataTable, ErrorBox, PageHeader, Pagination, Spinner, useToast } from "@/components/ui";

interface Log { id: string; action: string; entity: string | null; createdAt: string; user: { name: string } | null; data: Record<string, unknown> | null }

export default function ConfiguracoesPage() {
  const user = useUser(); const canWrite = useCanWrite(); const toast = useToast();
  const [cats, setCats] = useState<Category[] | null>(null);
  const [name, setName] = useState(""); const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const [logs, setLogs] = useState<Paged<Log> | null>(null); const [page, setPage] = useState(1);

  const loadCats = useCallback(() => { api<{ data: Category[] }>("/admin/categories").then((r) => setCats(r.data)).catch((e) => setErr(e.message)); }, []);
  useEffect(loadCats, [loadCats]);
  useEffect(() => { if (user.role === "ADMIN") api<Paged<Log>>(`/admin/audit?page=${page}&pageSize=15`).then(setLogs).catch(() => {}); }, [user.role, page]);

  async function add() {
    setBusy(true); setErr("");
    try { await api("/admin/categories", { body: { name } }); setName(""); toast("success", "Categoria criada."); loadCats(); }
    catch (e) { setErr(e instanceof ApiError ? e.message : "Erro"); } finally { setBusy(false); }
  }
  async function toggle(c: Category) {
    try { await api(`/admin/categories/${c.id}`, { method: "PATCH", body: { active: !c.active } }); loadCats(); } catch (e) { toast("error", e instanceof Error ? e.message : "Erro"); }
  }

  return (
    <>
      <PageHeader title="Configurações" />
      <section className="card mb-6 p-4">
        <h2 className="mb-3 font-semibold text-slate-900">Categorias</h2>
        {err && <div className="mb-3"><ErrorBox message={err} /></div>}
        {canWrite && <div className="mb-4 flex gap-2"><input className="input" placeholder="Nova categoria…" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && name.trim().length > 1 && add()} /><button className="btn-primary" disabled={busy || name.trim().length < 2} onClick={add}>{busy && <Spinner />}Adicionar</button></div>}
        <ul className="divide-y divide-slate-100">
          {(cats ?? []).map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <span className={c.active ? "font-medium text-slate-800" : "text-slate-400 line-through"}>{c.name} <span className="font-normal text-slate-400">· {c._count?.items ?? 0} itens</span></span>
              {canWrite && <button className="btn-ghost !py-1.5" onClick={() => toggle(c)}>{c.active ? "Desativar" : "Reativar"}</button>}
            </li>
          ))}
        </ul>
      </section>
      {user.role === "ADMIN" && (
        <section className="card overflow-hidden">
          <h2 className="px-4 py-3.5 font-semibold text-slate-900">Auditoria</h2>
          <DataTable rows={logs?.data ?? null} mobileTitle={(r) => r.action}
            columns={[
              { header: "Data", cell: (r) => fmtDateTime(r.createdAt) },
              { header: "Ação", cell: (r) => <Badge tone="blue">{r.action}</Badge>, hideOnMobile: true },
              { header: "Usuário", cell: (r) => r.user?.name ?? "—" },
              { header: "Registro", cell: (r) => r.entity ?? "—", hideOnMobile: true },
              { header: "Dados", cell: (r) => <span className="block max-w-xs truncate font-mono text-xs text-slate-500">{r.data ? JSON.stringify(r.data) : "—"}</span>, hideOnMobile: true },
            ]} />
          {logs && <Pagination page={logs.page} pageSize={logs.pageSize} total={logs.total} onPage={setPage} />}
        </section>
      )}
    </>
  );
}
