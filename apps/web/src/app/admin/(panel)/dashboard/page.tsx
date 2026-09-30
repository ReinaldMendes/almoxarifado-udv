"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeftRight, Boxes, ClipboardList, Clock, Info, Package, XCircle } from "lucide-react";
import { api } from "@/lib/api";
import { fmtDate, STATUS_LABEL, STATUS_TONE } from "@/lib/format";
import { Badge, DataTable, ErrorBox, PageHeader, Skeleton, StatCard } from "@/components/ui";

interface Dash {
  totalStock: number; activeItems: number; withdrawalsToday: number; pendingReturns: number; overdueReturns: number; lowStock: number; movementsMonth: number; entriesMonth: number; exitsMonth: number;
  alerts: { level: "warning" | "info" | "danger"; text: string; href: string }[];
  recentWithdrawals: { id: string; protocol: string; personName: string; withdrawnAt: string; status: string; items: { name: string; unit: string; quantity: number }[] }[];
}

export default function DashboardPage() {
  const [d, setD] = useState<Dash | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => { api<{ data: Dash }>("/admin/dashboard").then((r) => setD(r.data)).catch((e) => setErr(e.message)); }, []);

  if (err) return <ErrorBox message={err} />;
  const alertStyle = { warning: "border-amber-200 bg-amber-50 text-amber-800", info: "border-brand-200 bg-brand-50 text-brand-800", danger: "border-red-200 bg-red-50 text-red-800" };
  const alertIcon = { warning: AlertTriangle, info: Info, danger: XCircle };

  return (
    <>
      <PageHeader title="Dashboard" subtitle="Visão geral do almoxarifado" />
      {!d ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-20" />)}</div>
      ) : (
        <>
          {d.alerts.length > 0 && (
            <div className="mb-4 space-y-2">
              {d.alerts.map((a) => { const I = alertIcon[a.level]; return (
                <Link key={a.text} href={a.href} className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium ${alertStyle[a.level]}`}><I className="h-4 w-4 shrink-0" />{a.text}</Link>
              ); })}
            </div>
          )}
          <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-3">
            <StatCard label="Estoque total" value={d.totalStock} icon={<Boxes className="h-5 w-5" />} href="/admin/estoque" />
            <StatCard label="Itens cadastrados" value={d.activeItems} icon={<Package className="h-5 w-5" />} href="/admin/estoque" />
            <StatCard label="Retiradas hoje" value={d.withdrawalsToday} icon={<ClipboardList className="h-5 w-5" />} tone="green" href="/admin/retiradas" />
            <StatCard label="Pendências de devolução" value={d.pendingReturns} icon={<Clock className="h-5 w-5" />} tone={d.pendingReturns ? "yellow" : "gray"} href="/admin/pendencias" />
            <StatCard label="Estoque baixo" value={d.lowStock} icon={<AlertTriangle className="h-5 w-5" />} tone={d.lowStock ? "red" : "gray"} href="/admin/estoque?low=true" />
            <StatCard label="Movimentações no mês" value={d.movementsMonth} icon={<ArrowLeftRight className="h-5 w-5" />} href="/admin/movimentacoes" />
          </div>
          <p className="mt-3 text-sm text-slate-500">No mês: <b className="text-emerald-700">+{d.entriesMonth}</b> entradas · <b className="text-brand-700">−{d.exitsMonth}</b> saídas</p>

          <section className="card mt-6 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3.5"><h2 className="font-semibold text-slate-900">Últimas retiradas</h2><Link href="/admin/retiradas" className="text-sm font-medium text-brand-600">Ver todas</Link></div>
            <DataTable rows={d.recentWithdrawals} mobileTitle={(r) => r.personName}
              columns={[
                { header: "Protocolo", cell: (r) => <span className="font-mono text-xs">{r.protocol}</span> },
                { header: "Pessoa", cell: (r) => r.personName, hideOnMobile: true },
                { header: "Item", cell: (r) => r.items.map((i) => i.name).join(", ") },
                { header: "Qtd.", cell: (r) => r.items.reduce((s, i) => s + i.quantity, 0) },
                { header: "Data", cell: (r) => fmtDate(r.withdrawnAt) },
                { header: "Status", cell: (r) => <Badge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge> },
              ]} />
          </section>
        </>
      )}
    </>
  );
}
