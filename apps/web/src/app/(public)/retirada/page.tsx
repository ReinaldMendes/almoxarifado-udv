"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { CheckCircle2, ChevronLeft, Package, Search } from "lucide-react";
import { api, ApiError, qs } from "@/lib/api";
import { fmtDate, plural, todayISO } from "@/lib/format";
import { ErrorBox, Field, Skeleton, Spinner, useDebounced } from "@/components/ui";

interface PubItem { id: string; name: string; unit: string; available: number; requiresReturn: boolean }
interface Receipt { protocol: string; itemName: string; unit: string; quantity: number; requiresReturn: boolean; withdrawnAt: string; personName: string }

export default function RetiradaPage() {
  const [step, setStep] = useState<"form" | "review" | "done">("form");
  const [name, setName] = useState("");
  const [date, setDate] = useState(todayISO());
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<PubItem[] | null>(null);
  const [selected, setSelected] = useState<PubItem | null>(null);
  const [qty, setQty] = useState("1");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState("");
  const [sending, setSending] = useState(false);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const sent = useRef(false); // trava duplo clique
  const debounced = useDebounced(search, 250);

  useEffect(() => {
    let alive = true;
    api<{ data: PubItem[] }>(`/public/items${qs({ q: debounced })}`)
      .then((r) => alive && setItems(r.data))
      .catch((e) => alive && (setItems([]), setSubmitError(e instanceof ApiError ? e.message : "Não foi possível carregar os itens.")));
    return () => { alive = false; };
  }, [debounced]);

  const minDate = useMemo(() => { const d = new Date(); d.setDate(d.getDate() - 7); return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d); }, []);
  const qtyNum = Number(qty);

  function validate() {
    const e: Record<string, string> = {};
    if (!/^[\p{L}][\p{L}\s.'´`-]{2,}$/u.test(name.trim())) e.name = "Informe seu nome completo (apenas letras).";
    if (!date || date > todayISO()) e.date = "A data não pode ser futura.";
    else if (date < minDate) e.date = "Informe uma data recente.";
    if (!selected) e.item = "Selecione o item.";
    if (!Number.isInteger(qtyNum) || qtyNum < 1) e.qty = "Informe ao menos 1.";
    else if (selected && qtyNum > selected.available) e.qty = `Quantidade indisponível. Há apenas ${selected.available} ${selected.available === 1 ? "unidade disponível" : "unidades disponíveis"}.`;
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function confirm() {
    if (!selected || sent.current) return;
    sent.current = true; setSending(true); setSubmitError("");
    try {
      const r = await api<{ data: Receipt }>("/public/withdrawals", { body: { personName: name.trim(), withdrawnAt: date, itemId: selected.id, quantity: qtyNum } });
      setReceipt(r.data); setStep("done");
    } catch (e) {
      setSubmitError(e instanceof ApiError ? e.message : "Erro ao registrar a retirada.");
      setStep("form");
      if (e instanceof ApiError && e.code === "INSUFFICIENT_STOCK") {
        api<{ data: PubItem[] }>("/public/items").then((r) => { setItems(r.data); setSelected(null); });
      }
    } finally { sent.current = false; setSending(false); }
  }

  function reset() { setStep("form"); setSelected(null); setQty("1"); setSearch(""); setReceipt(null); setErrors({}); setSubmitError(""); setDate(todayISO()); }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 pb-10 pt-6">
      <header className="mb-6 flex flex-col items-center text-center">
        <Image src="/logo-udv.png" alt="UDV" width={88} height={88} priority className="rounded-2xl" />
        <h1 className="mt-4 text-2xl font-bold text-slate-900">Retirada de Materiais</h1>
        {step === "form" && <p className="mt-1 text-slate-500">Informe seus dados e registre a retirada do material.</p>}
      </header>

      {step === "form" && (
        <form className="card space-y-5 p-5" onSubmit={(e) => { e.preventDefault(); if (validate()) setStep("review"); }} noValidate>
          {submitError && <ErrorBox message={submitError} />}
          <Field label="Nome completo" error={errors.name}>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="Ex.: João da Silva" maxLength={120} />
          </Field>
          <Field label="Data da retirada" error={errors.date}>
            <input type="date" className="input" value={date} min={minDate} max={todayISO()} onChange={(e) => setDate(e.target.value)} />
          </Field>

          <Field label="Item" error={errors.item}>
            {selected ? (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-brand-300 bg-brand-50 p-3.5">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-slate-900">{selected.name}</p>
                  <p className="text-sm text-brand-700">Disponível: {plural(selected.available, selected.unit)}</p>
                </div>
                <button type="button" className="btn-ghost !px-3 !py-1.5 text-brand-700" onClick={() => { setSelected(null); setQty("1"); }}>Trocar</button>
              </div>
            ) : (
              <div>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                  <input className="input !pl-10" placeholder="Buscar item…" value={search} onChange={(e) => setSearch(e.target.value)} />
                </div>
                <div className="mt-2 max-h-64 overflow-y-auto rounded-xl border border-slate-200">
                  {items === null ? <div className="space-y-2 p-3"><Skeleton className="h-12" /><Skeleton className="h-12" /></div>
                    : items.length === 0 ? <p className="p-4 text-center text-sm text-slate-500">Nenhum item disponível para retirada.</p>
                    : items.map((i) => (
                      <button type="button" key={i.id} onClick={() => setSelected(i)} className="flex w-full items-center gap-3 border-b border-slate-100 px-3.5 py-3 text-left last:border-0 active:bg-slate-50">
                        <Package className="h-5 w-5 shrink-0 text-brand-500" />
                        <span className="min-w-0 flex-1"><span className="block truncate font-medium text-slate-800">{i.name}</span><span className="text-xs text-slate-500">{plural(i.available, i.unit)} disponíveis</span></span>
                      </button>
                    ))}
                </div>
              </div>
            )}
          </Field>

          {selected && (
            <Field label="Quantidade" error={errors.qty}>
              <div className="flex items-center gap-2">
                <button type="button" className="btn-secondary !h-12 !w-12 !text-xl" onClick={() => setQty(String(Math.max(1, (Number(qty) || 1) - 1)))} aria-label="Diminuir">−</button>
                <input className="input !h-12 text-center text-lg font-semibold" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value.replace(/\D/g, ""))} />
                <button type="button" className="btn-secondary !h-12 !w-12 !text-xl" onClick={() => setQty(String(Math.min(selected.available, (Number(qty) || 0) + 1)))} aria-label="Aumentar">+</button>
              </div>
              {selected.requiresReturn && <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">Este item deve ser devolvido ao almoxarifado.</p>}
            </Field>
          )}
          <button className="btn-primary w-full !py-3.5 text-base" type="submit">Continuar</button>
        </form>
      )}

      {step === "review" && selected && (
        <div className="card space-y-5 p-5">
          <p className="text-sm font-medium text-slate-500">Confira os dados antes de confirmar:</p>
          <dl className="space-y-3 text-[15px]">
            <div><dt className="text-xs uppercase tracking-wide text-slate-400">Nome</dt><dd className="font-semibold text-slate-900">{name.trim().replace(/\s+/g, " ")}</dd></div>
            <div><dt className="text-xs uppercase tracking-wide text-slate-400">Item</dt><dd className="font-semibold text-slate-900">{selected.name}</dd></div>
            <div><dt className="text-xs uppercase tracking-wide text-slate-400">Quantidade</dt><dd className="font-semibold text-slate-900">{plural(qtyNum, selected.unit)}</dd></div>
            <div><dt className="text-xs uppercase tracking-wide text-slate-400">Data</dt><dd className="font-semibold text-slate-900">{fmtDate(`${date}T12:00:00-03:00`)}</dd></div>
          </dl>
          {submitError && <ErrorBox message={submitError} />}
          <button className="btn-primary w-full !py-4 text-base uppercase tracking-wide" onClick={confirm} disabled={sending}>{sending && <Spinner />}Confirmar retirada</button>
          <button className="btn-ghost w-full" onClick={() => setStep("form")} disabled={sending}><ChevronLeft className="h-4 w-4" />Voltar e corrigir</button>
        </div>
      )}

      {step === "done" && receipt && (
        <div className="card space-y-5 p-6 text-center">
          <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-500" />
          <div>
            <h2 className="text-xl font-bold text-slate-900">Retirada registrada com sucesso.</h2>
            <p className="mt-1 text-sm text-slate-500">Guarde o protocolo abaixo.</p>
          </div>
          <div className="rounded-xl bg-brand-50 py-4">
            <p className="text-xs uppercase tracking-wide text-brand-700">Protocolo</p>
            <p className="select-all font-mono text-2xl font-bold text-brand-800">{receipt.protocol}</p>
          </div>
          <p className="text-sm text-slate-600">{plural(receipt.quantity, receipt.unit)} de <b>{receipt.itemName}</b> · {fmtDate(`${receipt.withdrawnAt}T12:00:00-03:00`)}</p>
          {receipt.requiresReturn && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">Lembre-se de devolver este item ao almoxarifado e, ao devolver, informe em <b>Devolução</b> usando este protocolo.</p>}
          <button className="btn-secondary w-full" onClick={reset}>Nova retirada</button>
        </div>
      )}
      {step !== "review" && <Link href="/devolucao" className="mt-5 text-center text-sm font-medium text-brand-700 underline underline-offset-2">Vai devolver um material? Informe aqui</Link>}
      <p className="mt-auto pt-8 text-center text-xs text-slate-400">UDV · DAV de Ponta Grossa</p>
    </main>
  );
}
