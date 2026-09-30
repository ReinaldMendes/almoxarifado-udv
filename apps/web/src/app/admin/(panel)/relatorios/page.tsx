"use client";
import { useEffect, useState } from "react";
import { Download, Eye } from "lucide-react";
import { api, qs } from "@/lib/api";
import { Badge, ErrorBox, Modal, PageHeader, Skeleton, Spinner } from "@/components/ui";

interface Def { key: string; title: string; period: boolean }
interface Report { title: string; columns: string[]; rows: (string | number | null)[][] }

export default function RelatoriosPage() {
  const [defs, setDefs] = useState<Def[] | null>(null);
  const [from, setFrom] = useState(""); const [to, setTo] = useState("");
  const [preview, setPreview] = useState<Report | null>(null); const [loading, setLoading] = useState(""); const [err, setErr] = useState("");
  useEffect(() => { api<{ data: Def[] }>("/admin/reports").then((r) => setDefs(r.data)).catch((e) => setErr(e.message)); }, []);

  async function view(d: Def) {
    setLoading(d.key); setErr("");
    try { const r = await api<{ data: Report }>(`/admin/reports/${d.key}${qs({ from, to })}`); setPreview(r.data); }
    catch (e) { setErr(e instanceof Error ? e.message : "Erro"); } finally { setLoading(""); }
  }

  return (
    <>
      <PageHeader title="Relatórios" subtitle="Visualize na tela ou exporte em CSV (abre no Excel)" />
      {err && <div className="mb-3"><ErrorBox message={err} /></div>}
      <div className="card mb-4 grid gap-3 p-4 sm:grid-cols-2">
        <div><label className="label">Período — de</label><input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div><label className="label">até</label><input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        <p className="text-xs text-slate-500 sm:col-span-2">O período vale apenas para os relatórios marcados com “por período”.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {!defs ? Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-20" />) : defs.map((d) => (
          <div key={d.key} className="card flex items-center justify-between gap-3 p-4">
            <div><p className="font-semibold text-slate-900">{d.title}</p>{d.period && <Badge tone="blue">por período</Badge>}</div>
            <div className="flex gap-1.5">
              <button className="btn-secondary !p-2.5" title="Visualizar" onClick={() => view(d)}>{loading === d.key ? <Spinner /> : <Eye className="h-4 w-4" />}</button>
              <a className="btn-primary !p-2.5" title="Exportar CSV" href={`/api/admin/reports/${d.key}${qs({ from: d.period ? from : "", to: d.period ? to : "", format: "csv" })}`}><Download className="h-4 w-4" /></a>
            </div>
          </div>
        ))}
      </div>
      <Modal open={!!preview} onClose={() => setPreview(null)} title={preview?.title ?? ""} wide>
        {preview && (preview.rows.length === 0 ? <p className="py-6 text-center text-slate-500">Sem dados para o período.</p> : (
          <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead className="bg-slate-50 uppercase text-slate-500"><tr>{preview.columns.map((c) => <th key={c} className="whitespace-nowrap px-3 py-2">{c}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-100">{preview.rows.slice(0, 200).map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className="whitespace-nowrap px-3 py-2">{c ?? "—"}</td>)}</tr>)}</tbody></table>
            {preview.rows.length > 200 && <p className="mt-2 text-xs text-slate-500">Mostrando 200 de {preview.rows.length}. Exporte o CSV para ver tudo.</p>}</div>
        ))}
      </Modal>
    </>
  );
}
