"use client";
import { useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { fmtDateTime, ROLE_LABEL } from "@/lib/format";
import type { Role, User } from "@/lib/types";
import { useUser } from "@/components/admin-shell";
import { Badge, DataTable, ErrorBox, Field, Modal, PageHeader, Spinner, useToast } from "@/components/ui";

export default function UsuariosPage() {
  const me = useUser(); const toast = useToast();
  const [rows, setRows] = useState<User[] | null>(null);
  const [edit, setEdit] = useState<User | "new" | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(() => { api<{ data: User[] }>("/admin/users").then((r) => setRows(r.data)).catch((e) => setError(e.message)); }, []);
  useEffect(load, [load]);

  if (me.role !== "ADMIN") return <ErrorBox message="Somente administradores podem gerenciar usuários." />;
  return (
    <>
      <PageHeader title="Usuários" subtitle="Acesso à área administrativa" actions={<button className="btn-primary" onClick={() => setEdit("new")}><Plus className="h-4 w-4" />Novo usuário</button>} />
      {error && <ErrorBox message={error} />}
      <div className="card overflow-hidden">
        <DataTable rows={rows} onRowClick={setEdit} mobileTitle={(r) => r.name}
          columns={[
            { header: "Nome", cell: (r) => <span className="font-medium text-slate-900">{r.name}</span>, hideOnMobile: true },
            { header: "E-mail", cell: (r) => r.email },
            { header: "Perfil", cell: (r) => <Badge tone={r.role === "ADMIN" ? "blue" : "gray"}>{ROLE_LABEL[r.role]}</Badge> },
            { header: "Situação", cell: (r) => <Badge tone={r.active ? "green" : "gray"}>{r.active ? "Ativo" : "Inativo"}</Badge> },
            { header: "Último acesso", cell: (r) => (r.lastLoginAt ? fmtDateTime(r.lastLoginAt) : "—"), hideOnMobile: true },
          ]} />
      </div>
      {edit && <UserModal user={edit === "new" ? null : edit} onClose={() => setEdit(null)} onDone={(m) => { toast("success", m); setEdit(null); load(); }} />}
    </>
  );
}

function UserModal({ user, onClose, onDone }: { user: User | null; onClose: () => void; onDone: (m: string) => void }) {
  const [f, setF] = useState({ name: user?.name ?? "", email: user?.email ?? "", password: "", role: (user?.role ?? "CONSULTA") as Role, active: user?.active ?? true });
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true); setErr("");
    try {
      const body = user ? { name: f.name, email: f.email, role: f.role, active: f.active, ...(f.password ? { password: f.password } : {}) } : { name: f.name, email: f.email, role: f.role, password: f.password };
      await api(user ? `/admin/users/${user.id}` : "/admin/users", { method: user ? "PATCH" : "POST", body });
      onDone(user ? "Usuário atualizado." : "Usuário criado.");
    } catch (e) { setErr(e instanceof ApiError ? e.message : "Erro ao salvar."); setBusy(false); }
  }
  return (
    <Modal open onClose={onClose} title={user ? "Editar usuário" : "Novo usuário"} footer={<><button className="btn-secondary" onClick={onClose}>Cancelar</button><button className="btn-primary" onClick={save} disabled={busy}>{busy && <Spinner />}Salvar</button></>}>
      <div className="space-y-4">
        {err && <ErrorBox message={err} />}
        <Field label="Nome"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="E-mail"><input className="input" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <Field label={user ? "Nova senha (deixe em branco para manter)" : "Senha"} hint="Mínimo de 8 caracteres."><input className="input" type="password" autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>
        <Field label="Perfil" hint="Administrador: tudo · Gestor: estoque, retiradas e devoluções · Consulta: somente leitura"><select className="input" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as Role })}>{(Object.keys(ROLE_LABEL) as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select></Field>
        {user && <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-[#009fd1]" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} />Usuário ativo</label>}
      </div>
    </Modal>
  );
}
