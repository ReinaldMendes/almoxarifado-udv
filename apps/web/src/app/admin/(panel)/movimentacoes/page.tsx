"use client";
import { useCallback, useEffect, useState } from "react";
import { api, qs } from "@/lib/api";
import { fmtDateTime, MOVEMENT_LABEL, MOVEMENT_TONE } from "@/lib/format";
import type { Category, Item, Movement, Paged } from "@/lib/types";
import { Badge, DataTable, ErrorBox, Modal, PageHeader, Pagination, useDebounced } from "@/components/ui";

export default function MovimentacoesPage() {
  const [f, setF] = useState({ from: "", to: "", itemId: "", categoryId: "", type: "", person: "", protocol: "" });
  const [page, setPage] = useState(1);
  const [res, setRes] = useState<Paged<Movement> | null>(null);
  const [items, setItems] = useState<Item[]>([]); const [cats, setCats] = useState<Category[]>([]);
  const [error, setError] = useState(""); const [open, setOpen] = useState<Movement | null>(null);
  const person = useDebounced(f.person); const protocol = useDebounced(f.protocol);
  const set = (k: keyof typeof f, v: string) => setF((s) => ({ ...s, [k]: v }));

  useEffect(() => { api<Paged<Item>>("/admin/items?pageSize=100").then((r) => setItems(r.data)); api<{ data: Category[] }>("/admin/categories").then((r) => setCats(r.data)); }, []);
  const load = useCallback(() => { api<Paged<Movement>>(`/admin/movements${qs({ ...f, person, protocol, page })}`).then(setRes).catch((e) => setError(e.message)); }, [f.from, f.to, f.itemId, f.categoryId, f.type, person, protocol, page]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(load, [load]);
  useEffect(() => setPage(1), [f.from, f.to, f.itemId, f.categoryId, f.type, person, protocol]);

  return (
    <>
      <PageHeader title="Movimentações" subtitle="Histórico completo — nada é apagado" />
      <div className="card overflow-hidden">
        <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <input type="date" className="input" value={f.from} onChange={(e) => set("from", e.target.value)} aria-label="De" />
          <input type="date" className="input" value={f.to} onChange={(e) => set("to", e.target.value)} aria-label="Até" />
          <select className="input" value={f.type} onChange={(e) => set("type", e.target.value)}><option value="">Todos os tipos</option>{Object.entries(MOVEMENT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          <select className="input" value={f.itemId} onChange={(e) => set("itemId", e.target.value)}><option value="">Todos os itens</option>{items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</select>
          <select className="input" value={f.categoryId} onChange={(e) => set("categoryId", e.target.value)}><option value="">Todas as categorias</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          <input className="input" placeholder="Pessoa" value={f.person} onChange={(e) => set("person", e.target.value)} />
          <input className="input" placeholder="Protocolo" value={f.protocol} onChange={(e) => set("protocol", e.target.value)} />
        </div>
        {error && <div className="px-4 pb-4"><ErrorBox message={error} /></div>}
        <DataTable rows={res?.data ?? null} onRowClick={setOpen} mobileTitle={(r) => r.item.name}
          columns={[
            { header: "Data", cell: (r) => fmtDateTime(r.createdAt) },
            { header: "Tipo", cell: (r) => <Badge tone={MOVEMENT_TONE[r.type]}>{MOVEMENT_LABEL[r.type]}</Badge> },
            { header: "Item", cell: (r) => r.item.name, hideOnMobile: true },
            { header: "Qtd.", cell: (r) => r.quantity },
            { header: "Pessoa", cell: (r) => r.personName ?? "—", hideOnMobile: true },
            { header: "Responsável", cell: (r) => r.user?.name ?? "Retirada pública", hideOnMobile: true },
            { header: "Estoque", cell: (r) => `${r.previousStock} → ${r.newStock}` },
            { header: "Protocolo", cell: (r) => <span className="font-mono text-xs">{r.protocol ?? "—"}</span>, hideOnMobile: true },
          ]} />
        {res && <Pagination page={res.page} pageSize={res.pageSize} total={res.total} onPage={setPage} />}
      </div>
      <Modal open={!!open} onClose={() => setOpen(null)} title="Detalhes da movimentação">
        {open && (
          <dl className="grid grid-cols-2 gap-3 text-sm">
            {([["Tipo", MOVEMENT_LABEL[open.type]], ["Data/hora", fmtDateTime(open.createdAt)], ["Item", `${open.item.code} · ${open.item.name}`], ["Quantidade", `${open.quantity} ${open.item.unit}`], ["Estoque anterior", open.previousStock], ["Estoque posterior", open.newStock], ["Pessoa", open.personName ?? "—"], ["Responsável", open.user?.name ?? "Retirada pública"], ["Protocolo", open.protocol ?? "—"], ["Origem", open.origin ?? "—"], ["Documento", open.reference ?? "—"], ["Observação", open.note ?? "—"]] as [string, string | number][]).map(([k, v]) => (
              <div key={k}><dt className="text-xs uppercase text-slate-400">{k}</dt><dd className="break-words font-medium text-slate-800">{v}</dd></div>
            ))}
          </dl>
        )}
      </Modal>
    </>
  );
}
