"use client";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowDownToLine, Pencil, Plus, Search, SlidersHorizontal } from "lucide-react";
import { api, ApiError, qs } from "@/lib/api";
import { UNITS } from "@/lib/format";
import type { Category, Item, Paged } from "@/lib/types";
import { useCanWrite } from "@/components/admin-shell";
import { Badge, DataTable, EmptyState, ErrorBox, Field, Modal, PageHeader, Pagination, Spinner, Toggle, useDebounced, useToast } from "@/components/ui";

type ItemForm = { name: string; description: string; categoryId: string; unit: string; minStock: string; location: string; active: boolean; allowPublicWithdraw: boolean; requiresReturn: boolean; notes: string; initialStock: string };
const empty: ItemForm = { name: "", description: "", categoryId: "", unit: "UN", minStock: "0", location: "", active: true, allowPublicWithdraw: true, requiresReturn: false, notes: "", initialStock: "0" };

function EstoqueInner() {
  const canWrite = useCanWrite();
  const toast = useToast();
  const params = useSearchParams();
  const [q, setQ] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [low, setLow] = useState(params.get("low") === "true");
  const [page, setPage] = useState(1);
  const [res, setRes] = useState<Paged<Item> | null>(null);
  const [cats, setCats] = useState<Category[]>([]);
  const [error, setError] = useState("");
  const [edit, setEdit] = useState<Item | "new" | null>(null);
  const [entryFor, setEntryFor] = useState<Item | "pick" | null>(null);
  const [adjustFor, setAdjustFor] = useState<Item | null>(null);
  const dq = useDebounced(q);

  const load = useCallback(() => {
    setError("");
    api<Paged<Item>>(`/admin/items${qs({ q: dq, categoryId, page, pageSize: 20, low: low || undefined })}`).then(setRes).catch((e) => setError(e.message));
  }, [dq, categoryId, page, low]);
  useEffect(load, [load]);
  useEffect(() => { api<{ data: Category[] }>("/admin/categories?active=true").then((r) => setCats(r.data)).catch(() => {}); }, []);
  useEffect(() => setPage(1), [dq, categoryId, low]);

  const done = (msg: string) => { toast("success", msg); setEdit(null); setEntryFor(null); setAdjustFor(null); load(); };

  return (
    <>
      <PageHeader title="Estoque" subtitle="Itens cadastrados e saldos atuais" actions={canWrite && <>
        <button className="btn-secondary" onClick={() => setEntryFor("pick")}><ArrowDownToLine className="h-4 w-4" />Registrar entrada</button>
        <button className="btn-primary" onClick={() => setEdit("new")}><Plus className="h-4 w-4" />Novo item</button>
      </>} />
      <div className="card overflow-hidden">
        <div className="grid gap-3 p-4 sm:grid-cols-[1fr_200px_auto]">
          <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input className="input !pl-9" placeholder="Buscar por nome ou código…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <select className="input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}><option value="">Todas as categorias</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" className="h-4 w-4 accent-[#009fd1]" checked={low} onChange={(e) => setLow(e.target.checked)} />Só estoque baixo</label>
        </div>
        {error && <div className="px-4 pb-4"><ErrorBox message={error} /></div>}
        <DataTable rows={res?.data ?? null} onRowClick={canWrite ? (r) => setEdit(r) : undefined} mobileTitle={(r) => r.name}
          empty={<EmptyState title="Nenhum item encontrado" hint="Ajuste os filtros ou cadastre um novo item." />}
          columns={[
            { header: "Código", cell: (r) => <span className="font-mono text-xs">{r.code}</span>, hideOnMobile: true },
            { header: "Item", cell: (r) => <span className="font-medium text-slate-900">{r.name}</span>, hideOnMobile: true },
            { header: "Categoria", cell: (r) => r.category?.name },
            { header: "Estoque", cell: (r) => <span className={r.currentStock <= r.minStock ? "font-bold text-red-600" : "font-semibold"}>{r.currentStock} {r.unit}</span> },
            { header: "Mínimo", cell: (r) => r.minStock, hideOnMobile: true },
            { header: "Situação", cell: (r) => (<div className="flex flex-wrap gap-1">{!r.active && <Badge>Inativo</Badge>}{r.active && r.currentStock <= r.minStock && <Badge tone="red">Estoque baixo</Badge>}{r.requiresReturn && <Badge tone="yellow">Devolução</Badge>}{r.active && !r.allowPublicWithdraw && <Badge>Só interno</Badge>}</div>) },
            { header: "", cell: (r) => canWrite && (
              <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                <button className="btn-ghost !p-2" title="Entrada" onClick={() => setEntryFor(r)}><ArrowDownToLine className="h-4 w-4" /></button>
                <button className="btn-ghost !p-2" title="Ajustar / baixa" onClick={() => setAdjustFor(r)}><SlidersHorizontal className="h-4 w-4" /></button>
                <button className="btn-ghost !p-2" title="Editar" onClick={() => setEdit(r)}><Pencil className="h-4 w-4" /></button>
              </div>), hideOnMobile: true },
          ]} />
        {res && <Pagination page={res.page} pageSize={res.pageSize} total={res.total} onPage={setPage} />}
      </div>
      {edit && <ItemModal item={edit === "new" ? null : edit} cats={cats} onClose={() => setEdit(null)} onDone={done} />}
      {entryFor && <EntryModal fixed={entryFor === "pick" ? null : entryFor} onClose={() => setEntryFor(null)} onDone={done} />}
      {adjustFor && <AdjustModal item={adjustFor} onClose={() => setAdjustFor(null)} onDone={done} />}
    </>
  );
}

export default function EstoquePage() { return <Suspense><EstoqueInner /></Suspense>; }

function ItemModal({ item, cats, onClose, onDone }: { item: Item | null; cats: Category[]; onClose: () => void; onDone: (m: string) => void }) {
  const [f, setF] = useState<ItemForm>(item ? { name: item.name, description: item.description ?? "", categoryId: item.categoryId, unit: item.unit, minStock: String(item.minStock), location: item.location ?? "", active: item.active, allowPublicWithdraw: item.allowPublicWithdraw, requiresReturn: item.requiresReturn, notes: item.notes ?? "", initialStock: "0" } : { ...empty, categoryId: cats[0]?.id ?? "" });
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const set = <K extends keyof ItemForm>(k: K, v: ItemForm[K]) => setF((s) => ({ ...s, [k]: v }));

  async function save() {
    setBusy(true); setErr("");
    try {
      const { initialStock, ...rest } = f;
      const body = { ...rest, minStock: Number(f.minStock) || 0, ...(item ? {} : { initialStock: Number(initialStock) || 0 }) };
      await api(item ? `/admin/items/${item.id}` : "/admin/items", { method: item ? "PATCH" : "POST", body });
      onDone(item ? "Item atualizado." : "Item cadastrado.");
    } catch (e) { setErr(e instanceof ApiError ? e.message : "Erro ao salvar."); setBusy(false); }
  }
  return (
    <Modal open onClose={onClose} title={item ? "Editar item" : "Novo item"} wide footer={<><button className="btn-secondary" onClick={onClose}>Cancelar</button><button className="btn-primary" onClick={save} disabled={busy}>{busy && <Spinner />}Salvar</button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        {err && <div className="sm:col-span-2"><ErrorBox message={err} /></div>}
        <Field label="Código" hint={item ? "Gerado pelo sistema e não pode ser alterado." : "Será gerado automaticamente ao salvar (ex.: ITM-0001)."}>
          <input className="input bg-slate-100 font-mono text-slate-500" value={item ? item.code : "Automático"} readOnly disabled />
        </Field>
        <Field label="Nome"><input className="input" value={f.name} onChange={(e) => set("name", e.target.value)} /></Field>
        <Field label="Categoria"><select className="input" value={f.categoryId} onChange={(e) => set("categoryId", e.target.value)}><option value="">Selecione…</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
        <Field label="Unidade de medida"><select className="input" value={f.unit} onChange={(e) => set("unit", e.target.value)}>{UNITS.map((u) => <option key={u}>{u}</option>)}</select></Field>
        {!item && <Field label="Estoque inicial" hint="Gera uma movimentação de entrada."><input className="input" inputMode="numeric" value={f.initialStock} onChange={(e) => set("initialStock", e.target.value.replace(/\D/g, ""))} /></Field>}
        <Field label="Estoque mínimo"><input className="input" inputMode="numeric" value={f.minStock} onChange={(e) => set("minStock", e.target.value.replace(/\D/g, ""))} /></Field>
        <Field label="Localização"><input className="input" value={f.location} onChange={(e) => set("location", e.target.value)} placeholder="Ex.: Armário 2" /></Field>
        <div className="sm:col-span-2"><Field label="Descrição"><input className="input" value={f.description} onChange={(e) => set("description", e.target.value)} /></Field></div>
        <div className="sm:col-span-2"><Field label="Observações"><textarea className="input" rows={2} value={f.notes} onChange={(e) => set("notes", e.target.value)} /></Field></div>
        <Toggle checked={f.allowPublicWithdraw} onChange={(v) => set("allowPublicWithdraw", v)} label="Permite retirada pública" hint="Aparece na página /retirada." />
        <Toggle checked={f.requiresReturn} onChange={(v) => set("requiresReturn", v)} label="Exige devolução" hint="Gera pendência até ser devolvido." />
        {item && <Toggle checked={f.active} onChange={(v) => set("active", v)} label="Item ativo" hint="Desativar oculta o item, sem apagar o histórico." />}
        {item && <p className="self-center text-xs text-slate-500">Saldo atual: <b>{item.currentStock} {item.unit}</b>. O saldo só muda por movimentações (entrada, ajuste, retirada…).</p>}
      </div>
    </Modal>
  );
}

function EntryModal({ fixed, onClose, onDone }: { fixed: Item | null; onClose: () => void; onDone: (m: string) => void }) {
  const [items, setItems] = useState<Item[]>([]);
  const [itemId, setItemId] = useState(fixed?.id ?? "");
  const [quantity, setQuantity] = useState("1"); const [origin, setOrigin] = useState("Compra"); const [reference, setReference] = useState(""); const [note, setNote] = useState("");
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  useEffect(() => { if (!fixed) api<Paged<Item>>("/admin/items?active=true&pageSize=100").then((r) => setItems(r.data)); }, [fixed]);
  async function save() {
    setBusy(true); setErr("");
    try {
      const r = await api<{ data: { protocol: string; previousStock: number; newStock: number } }>("/admin/stock/entries", { body: { itemId, quantity: Number(quantity), origin, reference, note } });
      onDone(`Entrada ${r.data.protocol} registrada: ${r.data.previousStock} → ${r.data.newStock}.`);
    } catch (e) { setErr(e instanceof ApiError ? e.message : "Erro ao registrar."); setBusy(false); }
  }
  return (
    <Modal open onClose={onClose} title="Registrar entrada" footer={<><button className="btn-secondary" onClick={onClose}>Cancelar</button><button className="btn-primary" onClick={save} disabled={busy || !itemId}>{busy && <Spinner />}Confirmar entrada</button></>}>
      <div className="space-y-4">
        {err && <ErrorBox message={err} />}
        <Field label="Item">{fixed ? <p className="rounded-xl bg-slate-50 px-3.5 py-2.5 font-medium">{fixed.name} <span className="text-slate-500">(saldo {fixed.currentStock})</span></p> : <select className="input" value={itemId} onChange={(e) => setItemId(e.target.value)}><option value="">Selecione…</option>{items.map((i) => <option key={i.id} value={i.id}>{i.name} — saldo {i.currentStock}</option>)}</select>}</Field>
        <Field label="Quantidade"><input className="input" inputMode="numeric" value={quantity} onChange={(e) => setQuantity(e.target.value.replace(/\D/g, ""))} /></Field>
        <Field label="Origem"><input className="input" value={origin} onChange={(e) => setOrigin(e.target.value)} placeholder="Compra, doação…" /></Field>
        <Field label="Documento / referência"><input className="input" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Nº da nota, recibo…" /></Field>
        <Field label="Observação"><textarea className="input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

function AdjustModal({ item, onClose, onDone }: { item: Item; onClose: () => void; onDone: (m: string) => void }) {
  const [type, setType] = useState<"AJUSTE" | "PERDA" | "AVARIA">("AJUSTE");
  const [value, setValue] = useState(String(item.currentStock)); const [note, setNote] = useState("");
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true); setErr("");
    try {
      const body = type === "AJUSTE" ? { type, itemId: item.id, newStock: Number(value), note } : { type, itemId: item.id, quantity: Number(value), note };
      const r = await api<{ data: unknown; message?: string }>("/admin/stock/adjustments", { body });
      onDone(r.message ?? "Movimentação registrada.");
    } catch (e) { setErr(e instanceof ApiError ? e.message : "Erro ao registrar."); setBusy(false); }
  }
  return (
    <Modal open onClose={onClose} title={`Ajuste · ${item.name}`} footer={<><button className="btn-secondary" onClick={onClose}>Cancelar</button><button className="btn-primary" onClick={save} disabled={busy}>{busy && <Spinner />}Registrar</button></>}>
      <div className="space-y-4">
        {err && <ErrorBox message={err} />}
        <Field label="Tipo"><select className="input" value={type} onChange={(e) => { const t = e.target.value as typeof type; setType(t); setValue(t === "AJUSTE" ? String(item.currentStock) : "1"); }}><option value="AJUSTE">Ajuste de inventário (nova contagem)</option><option value="PERDA">Perda</option><option value="AVARIA">Avaria (baixa)</option></select></Field>
        <Field label={type === "AJUSTE" ? `Saldo correto (atual: ${item.currentStock})` : "Quantidade a baixar"}><input className="input" inputMode="numeric" value={value} onChange={(e) => setValue(e.target.value.replace(/\D/g, ""))} /></Field>
        <Field label="Motivo (obrigatório)"><textarea className="input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}
