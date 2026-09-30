"use client";
import { Suspense, useCallback, useEffect, useState } from "react";
import { Search } from "lucide-react";
import { api, qs } from "@/lib/api";
import { fmtDate, STATUS_LABEL, STATUS_TONE } from "@/lib/format";
import type { Paged, Withdrawal } from "@/lib/types";
import { WithdrawalModal } from "@/components/withdrawal-modal";
import { Badge, DataTable, ErrorBox, PageHeader, Pagination, useDebounced } from "@/components/ui";

export default function RetiradasPage() { return <Suspense><Inner /></Suspense>; }

function Inner() {
  const [q, setQ] = useState(""); const [status, setStatus] = useState(""); const [from, setFrom] = useState(""); const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [res, setRes] = useState<Paged<Withdrawal> | null>(null);
  const [error, setError] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const dq = useDebounced(q);
  const load = useCallback(() => { api<Paged<Withdrawal>>(`/admin/withdrawals${qs({ q: dq, status, from, to, page })}`).then(setRes).catch((e) => setError(e.message)); }, [dq, status, from, to, page]);
  useEffect(load, [load]);
  useEffect(() => setPage(1), [dq, status, from, to]);

  return (
    <>
      <PageHeader title="Retiradas" subtitle="Consulte por nome, protocolo, data ou status" />
      <div className="card overflow-hidden">
        <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-[1fr_190px_150px_150px]">
          <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input className="input !pl-9" placeholder="Nome ou protocolo (RET-…)" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Todos os status</option>{Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          <input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="De" />
          <input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Até" />
        </div>
        {error && <div className="px-4 pb-4"><ErrorBox message={error} /></div>}
        <DataTable rows={res?.data ?? null} onRowClick={(r) => setOpenId(r.id)} mobileTitle={(r) => r.personName}
          columns={[
            { header: "Protocolo", cell: (r) => <span className="font-mono text-xs">{r.protocol}</span> },
            { header: "Pessoa", cell: (r) => r.personName, hideOnMobile: true },
            { header: "Item", cell: (r) => r.items.map((i) => `${i.item.name} (${i.quantity})`).join(", ") },
            { header: "Data", cell: (r) => fmtDate(r.withdrawnAt) },
            { header: "Status", cell: (r) => <Badge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge> },
          ]} />
        {res && <Pagination page={res.page} pageSize={res.pageSize} total={res.total} onPage={setPage} />}
      </div>
      {openId && <WithdrawalModal id={openId} onClose={() => setOpenId(null)} onChanged={load} />}
    </>
  );
}

