"use client";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { CheckCircle2, ChevronLeft } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { fmtDate, plural } from "@/lib/format";
import { ErrorBox, Field, Spinner, useDebounced } from "@/components/ui";

interface Pending { protocol: string; itemName: string; unit: string; outstanding: number; withdrawnAt: string; alreadyClaimed: boolean }
interface Receipt { protocol: string; itemName: string; unit: string; quantity: number; damaged: boolean }

export default function DevolucaoPage() {
  const [protocol, setProtocol] = useState("");
  const [name, setName] = useState("");
  const [qty, setQty] = useState("");
  const [damaged, setDamaged] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const sent = useRef(false);
  const [found, setFound] = useState<Pending[]>([]);
  const [auto, setAuto] = useState(false); // protocolo veio da busca automática
  const dName = useDebounced(name, 500);

  // nome completo → procura pendências e preenche o protocolo
  useEffect(() => {
    const words = dName.trim().split(/\s+/).filter((w) => w.length >= 2);
    if (words.length < 2 || dName.trim().length < 6) { setFound([]); return; }
    let alive = true;
    api<{ data: Pending[] }>(`/public/returns/lookup?name=${encodeURIComponent(dName.trim())}`)
      .then((r) => {
        if (!alive) return;
        setFound(r.data);
        const open = r.data.filter((p) => !p.alreadyClaimed);
        if (open.length >= 1 && (!protocol || auto)) { setProtocol(open[0]!.protocol); setAuto(true); }
      })
      .catch(() => alive && setFound([]));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dName]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (sent.current) return;
    sent.current = true; setSending(true); setError("");
    try {
      const r = await api<{ data: Receipt }>("/public/returns", { body: { protocol: protocol.trim().toUpperCase(), personName: name.trim(), quantity: qty ? Number(qty) : undefined, damaged, note: note.trim() || undefined } });
      setReceipt(r.data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível registrar a devolução.");
    } finally { sent.current = false; setSending(false); }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 pb-10 pt-6">
      <header className="mb-6 flex flex-col items-center text-center">
        <Image src="/logo-udv.png" alt="UDV" width={88} height={88} priority className="rounded-2xl" />
        <h1 className="mt-4 text-2xl font-bold text-slate-900">Devolução de Materiais</h1>
        {!receipt && <p className="mt-1 text-slate-500">Digite seu nome completo e o protocolo aparece sozinho.</p>}
      </header>

      {!receipt ? (
        <form className="card space-y-5 p-5" onSubmit={submit}>
          {error && <ErrorBox message={error} />}
          <Field label="Nome completo (o mesmo da retirada)" hint="Nome e sobrenome.">
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={120} required />
          </Field>
          <Field label="Protocolo da retirada" hint={auto ? "Preenchido automaticamente pelo seu nome." : "Ex.: RET-20260930-0001"}>
            <input className="input font-mono uppercase" value={protocol} onChange={(e) => { setProtocol(e.target.value); setAuto(false); }} placeholder="RET-AAAAMMDD-0000" autoCapitalize="characters" required />
          </Field>
          {found.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-700">{found.length === 1 ? "Retirada encontrada:" : "Escolha qual item está devolvendo:"}</p>
              {found.map((p) => (
                <button type="button" key={p.protocol} disabled={p.alreadyClaimed} onClick={() => { setProtocol(p.protocol); setAuto(true); setQty(""); }}
                  className={`w-full rounded-xl border p-3 text-left text-sm ${protocol === p.protocol ? "border-brand-500 bg-brand-50" : "border-slate-200"} disabled:opacity-60`}>
                  <span className="block font-semibold text-slate-900">{p.itemName}</span>
                  <span className="text-slate-500">{plural(p.outstanding, p.unit)} · retirado em {fmtDate(p.withdrawnAt)}{p.alreadyClaimed && " · já informado"}</span>
                </button>
              ))}
            </div>
          )}
          <Field label="Quantidade devolvida" hint="Deixe em branco para devolver tudo o que está pendente.">
            <input className="input" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value.replace(/\D/g, ""))} placeholder="Todas" />
          </Field>
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-3.5">
            <input type="checkbox" className="mt-1 h-5 w-5 accent-[#009fd1]" checked={damaged} onChange={(e) => setDamaged(e.target.checked)} />
            <span className="text-sm text-slate-700"><b>O material voltou com avaria</b><br /><span className="text-slate-500">Marque se estiver danificado ou faltando peça.</span></span>
          </label>
          {(damaged || note) && <Field label="Observação"><textarea className="input" rows={2} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Descreva rapidamente…" /></Field>}
          <button className="btn-primary w-full !py-4 text-base uppercase tracking-wide" disabled={sending}>{sending && <Spinner />}Informar devolução</button>
          <Link href="/retirada" className="btn-ghost w-full"><ChevronLeft className="h-4 w-4" />Voltar para retirada</Link>
        </form>
      ) : (
        <div className="card space-y-5 p-6 text-center">
          <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-500" />
          <div>
            <h2 className="text-xl font-bold text-slate-900">Devolução informada.</h2>
            <p className="mt-1 text-sm text-slate-500">{plural(receipt.quantity, receipt.unit)} de <b>{receipt.itemName}</b>{receipt.damaged && " (com avaria)"} · <span className="font-mono">{receipt.protocol}</span></p>
          </div>
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">Entregue o material ao responsável do almoxarifado. A devolução será confirmada pela administração.</p>
          <Link href="/retirada" className="btn-secondary w-full">Fazer uma retirada</Link>
        </div>
      )}
      <p className="mt-auto pt-8 text-center text-xs text-slate-400">UDV · DAV de Ponta Grossa</p>
    </main>
  );
}
