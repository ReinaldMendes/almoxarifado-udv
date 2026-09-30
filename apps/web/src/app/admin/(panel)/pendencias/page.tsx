"use client";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { api, qs } from "@/lib/api";
import { CHARGE_LABEL, fmtDate, STATUS_LABEL, STATUS_TONE } from "@/lib/format";
import type { Paged, Withdrawal } from "@/lib/types";
import { WithdrawalModal } from "@/components/withdrawal-modal";
import { Badge, DataTable, EmptyState, ErrorBox, PageHeader, Pagination } from "@/components/ui";

const KINDS = [["todas", "Todas"], ["conferir", "Conferir devolução"], ["aguardando", "Aguardando devolução"], ["atrasadas", "Atrasadas"], ["nao_devolvidas", "Não devolvidas"], ["danificadas", "Danificadas"], ["cobranca", "Cobrança"]] as const;

function Inner() {
  const params = useSearchParams();
  const [kind, setKind] = useState(params.get("kind") ?? "todas");
  const [page, setPage] = useState(1);
  const [res, setRes] = useState<(Paged<Withdrawal> & { overdueDays: number }) | null>(null);
  const [error, setError] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const load = useCallback(() => { api<Paged<Withdrawal> & { overdueDays: number }>(`/admin/pendencies${qs({ kind, page })}`).then(setRes).catch((e) => setError(e.message)); }, [kind, page]);
  useEffect(load, [load]);
  useEffect(() => setPage(1), [kind]);

  return (
    <>
      <PageHeader title="Pendências" subtitle={res ? `Devoluções com mais de ${res.overdueDays} dias são marcadas como atrasadas` : undefined} />
      <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
        {KINDS.map(([k, label]) => <button key={k} onClick={() => { setRes(null); setKind(k); }} className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-medium ${kind === k ? "bg-brand-500 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200"}`}>{label}</button>)}
      </div>
      <div className="card overflow-hidden">
        {error && <div className="p-4"><ErrorBox message={error} /></div>}
        <DataTable rows={res?.data ?? null} onRowClick={(r) => setOpenId(r.id)} mobileTitle={(r) => r.personName}
          empty={<EmptyState title="Nenhuma pendência" hint="Tudo em dia por aqui." action={<CheckCircle2 className="h-6 w-6 text-emerald-500" />} />}
          columns={[
            { header: "Pessoa", cell: (r) => <span className="font-medium text-slate-900">{r.personName}</span>, hideOnMobile: true },
            { header: "Item", cell: (r) => r.items.map((i) => `${i.item.name} (${i.outstanding ?? i.quantity} pend.)`).join(", ") },
            { header: "Retirada", cell: (r) => fmtDate(r.withdrawnAt) },
            { header: "Protocolo", cell: (r) => <span className="font-mono text-xs">{r.protocol}</span>, hideOnMobile: true },
            { header: "Status", cell: (r) => <div className="flex flex-wrap gap-1"><Badge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge>{r.hasClaim && <Badge tone="blue">Devolução informada</Badge>}{r.overdue && <Badge tone="red">Atrasada</Badge>}{r.chargeStatus === "PENDENTE_DE_COBRANCA" && <Badge tone="yellow">{CHARGE_LABEL[r.chargeStatus]}</Badge>}</div> },
          ]} />
        {res && <Pagination page={res.page} pageSize={res.pageSize} total={res.total} onPage={setPage} />}
      </div>
      {openId && <WithdrawalModal id={openId} onClose={() => setOpenId(null)} onChanged={load} />}
    </>
  );
}
export default function PendenciasPage() { return <Suspense><Inner /></Suspense>; }
