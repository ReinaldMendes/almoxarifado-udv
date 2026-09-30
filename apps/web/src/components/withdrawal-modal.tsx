"use client";
import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { CHARGE_LABEL, CONDITION_LABEL, fmtDate, fmtDateTime, STATUS_LABEL, STATUS_TONE, todayISO } from "@/lib/format";
import type { Withdrawal } from "@/lib/types";
import { useCanWrite } from "@/components/admin-shell";
import { Badge, ConfirmDialog, ErrorBox, Field, Modal, Spinner, useToast } from "@/components/ui";

export function WithdrawalModal({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const canWrite = useCanWrite();
  const toast = useToast();
  const [w, setW] = useState<Withdrawal | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [ret, setRet] = useState<{ itemId: string; max: number } | null>(null);
  const [retQty, setRetQty] = useState("1"); const [cond, setCond] = useState("DEVOLVIDO_BOM_ESTADO"); const [retDate, setRetDate] = useState(todayISO()); const [retNote, setRetNote] = useState("");
  const [note, setNote] = useState("");
  const [confirm, setConfirm] = useState<string | null>(null);
  const [charge, setCharge] = useState({ status: "SEM_COBRANCA", amount: "", date: "", note: "" });

  const load = useCallback(() => api<{ data: Withdrawal }>(`/admin/withdrawals/${id}`).then((r) => {
    setW(r.data);
    setCharge({ status: r.data.chargeStatus, amount: r.data.chargeAmount ?? "", date: r.data.chargeDate ? r.data.chargeDate.slice(0, 10) : "", note: r.data.chargeNote ?? "" });
  }).catch((e) => setErr(e.message)), [id]);
  useEffect(() => { load(); }, [load]);

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true); setErr("");
    try { await fn(); toast("success", ok); setRet(null); setConfirm(null); setNote(""); await load(); onChanged(); }
    catch (e) { setErr(e instanceof ApiError ? e.message : "Erro ao salvar."); }
    finally { setBusy(false); }
  }

  const submitReturn = () => ret && run(() => api(`/admin/withdrawals/${id}/returns`, { body: { withdrawalItemId: ret.itemId, quantity: Number(retQty), condition: cond, returnedAt: retDate, note: retNote } }), "Devolução registrada.");

  return (
    <Modal open onClose={onClose} title={w ? w.protocol : "Retirada"} wide>
      {!w ? (err ? <ErrorBox message={err} /> : <div className="flex justify-center py-8"><Spinner className="h-6 w-6 text-brand-500" /></div>) : (
        <div className="space-y-5">
          {err && <ErrorBox message={err} />}
          <div className="flex flex-wrap items-center gap-2"><Badge tone={STATUS_TONE[w.status]}>{STATUS_LABEL[w.status]}</Badge>{w.overdue && <Badge tone="red">Atrasada</Badge>}{w.chargeStatus !== "SEM_COBRANCA" && <Badge tone="yellow">{CHARGE_LABEL[w.chargeStatus]}</Badge>}</div>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div><dt className="text-xs uppercase text-slate-400">Pessoa</dt><dd className="font-medium">{w.personName}</dd></div>
            <div><dt className="text-xs uppercase text-slate-400">Data da retirada</dt><dd className="font-medium">{fmtDate(w.withdrawnAt)}</dd></div>
            <div><dt className="text-xs uppercase text-slate-400">Registrada em</dt><dd>{fmtDateTime(w.createdAt)}</dd></div>
          </dl>

          <div className="space-y-2">
            {w.items.map((i) => (
              <div key={i.id} className="rounded-xl border border-slate-200 p-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div><p className="font-medium">{i.item.name}</p><p className="text-sm text-slate-500">Retirado: {i.quantity} {i.item.unit}{i.requiresReturn && <> · Devolvido: {i.returnedQuantity}</>}</p></div>
                  {canWrite && i.requiresReturn && i.quantity - i.returnedQuantity > 0 && w.status !== "CANCELADO" && <button className="btn-secondary" onClick={() => { setRet({ itemId: i.id, max: i.quantity - i.returnedQuantity }); setRetQty(String(i.quantity - i.returnedQuantity)); setCond("DEVOLVIDO_BOM_ESTADO"); }}>Registrar devolução</button>}
                </div>
                {i.returns && i.returns.length > 0 && <ul className="mt-2 space-y-1 border-t border-slate-100 pt-2 text-sm text-slate-600">{i.returns.map((r) => <li key={r.id}>{fmtDate(r.returnedAt)} · {r.quantity}× {CONDITION_LABEL[r.condition]} · {r.user.name}{r.note && ` — ${r.note}`}</li>)}</ul>}
              </div>
            ))}
          </div>

          {ret && (
            <div className="space-y-3 rounded-xl border border-brand-200 bg-brand-50/50 p-4">
              <p className="font-semibold text-slate-800">Registrar devolução (pendente: {ret.max})</p>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Condição"><select className="input" value={cond} onChange={(e) => setCond(e.target.value)}>{Object.entries(CONDITION_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
                <Field label={cond === "NAO_DEVOLVIDO" ? "Quantidade não devolvida" : "Quantidade devolvida"}><input className="input" inputMode="numeric" value={retQty} onChange={(e) => setRetQty(e.target.value.replace(/\D/g, ""))} /></Field>
                <Field label="Data"><input type="date" className="input" value={retDate} max={todayISO()} onChange={(e) => setRetDate(e.target.value)} /></Field>
              </div>
              <Field label="Observação"><input className="input" value={retNote} onChange={(e) => setRetNote(e.target.value)} /></Field>
              <div className="flex justify-end gap-2"><button className="btn-secondary" onClick={() => setRet(null)}>Cancelar</button><button className="btn-primary" disabled={busy} onClick={submitReturn}>{busy && <Spinner />}Salvar devolução</button></div>
            </div>
          )}

          {(w.adminNotes || canWrite) && (
            <div>
              <p className="label">Observações administrativas</p>
              {w.adminNotes && <pre className="mb-2 whitespace-pre-wrap rounded-xl bg-slate-50 p-3 font-sans text-sm text-slate-700">{w.adminNotes}</pre>}
              {canWrite && <div className="flex gap-2"><input className="input" placeholder="Adicionar observação…" value={note} onChange={(e) => setNote(e.target.value)} /><button className="btn-secondary" disabled={busy || note.trim().length < 2} onClick={() => run(() => api(`/admin/withdrawals/${id}/notes`, { body: { note } }), "Observação adicionada.")}>Adicionar</button></div>}
            </div>
          )}

          {canWrite && w.status !== "CANCELADO" && (
            <div className="space-y-3 rounded-xl border border-slate-200 p-4">
              <p className="font-semibold text-slate-800">Cobrança / acompanhamento</p>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Situação"><select className="input" value={charge.status} onChange={(e) => setCharge({ ...charge, status: e.target.value })}>{Object.entries(CHARGE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
                <Field label="Valor (R$)"><input className="input" inputMode="decimal" value={charge.amount} onChange={(e) => setCharge({ ...charge, amount: e.target.value.replace(",", ".") })} /></Field>
                <Field label="Data"><input type="date" className="input" value={charge.date} onChange={(e) => setCharge({ ...charge, date: e.target.value })} /></Field>
              </div>
              <Field label="Observação"><input className="input" value={charge.note} onChange={(e) => setCharge({ ...charge, note: e.target.value })} /></Field>
              {w.chargeResponsible && <p className="text-xs text-slate-500">Último responsável: {w.chargeResponsible.name}</p>}
              <button className="btn-secondary" disabled={busy} onClick={() => run(() => api(`/admin/withdrawals/${id}/charge`, { method: "PATCH", body: { chargeStatus: charge.status, chargeAmount: charge.amount === "" ? null : Number(charge.amount), chargeDate: charge.date || null, chargeNote: charge.note } }), "Cobrança atualizada.")}>Salvar cobrança</button>
            </div>
          )}

          {canWrite && w.status !== "CANCELADO" && w.status !== "DEVOLVIDO" && (
            <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
              {w.items.some((i) => i.requiresReturn) && <button className="btn-secondary" onClick={() => setConfirm("EXTRAVIADO_NOTE")}>Registrar não devolução</button>}
              <button className="btn-secondary" onClick={() => setConfirm("DANIFICADO")}>Marcar como danificado</button>
              {!w.items.some((i) => i.returns && i.returns.length) && <button className="btn-danger" onClick={() => setConfirm("CANCELADO")}>Cancelar retirada</button>}
            </div>
          )}
          <ConfirmDialog open={confirm === "CANCELADO"} danger title="Cancelar retirada?" message="O saldo retorna ao estoque e fica registrado no histórico. Esta ação não pode ser desfeita." confirmLabel="Cancelar retirada" loading={busy} onClose={() => setConfirm(null)} onConfirm={() => run(() => api(`/admin/withdrawals/${id}/status`, { method: "PATCH", body: { status: "CANCELADO", note: "Retirada cancelada pela administração" } }), "Retirada cancelada.")} />
          <ConfirmDialog open={confirm === "DANIFICADO"} title="Marcar como danificado?" message="O status será alterado para Danificado. Para registrar a entrada física com avaria, use Registrar devolução." loading={busy} onClose={() => setConfirm(null)} onConfirm={() => run(() => api(`/admin/withdrawals/${id}/status`, { method: "PATCH", body: { status: "DANIFICADO" } }), "Status atualizado.")} />
          <ConfirmDialog open={confirm === "EXTRAVIADO_NOTE"} title="Registrar não devolução?" message="O item será sinalizado como Não devolvido e permanecerá nas pendências para acompanhamento." loading={busy} onClose={() => setConfirm(null)} onConfirm={() => run(() => api(`/admin/withdrawals/${id}/status`, { method: "PATCH", body: { status: "EXTRAVIADO" } }), "Status atualizado.")} />
        </div>
      )}
    </Modal>
  );
}
