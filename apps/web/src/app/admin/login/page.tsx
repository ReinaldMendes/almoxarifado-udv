"use client";
import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { ErrorBox, Field, Spinner } from "@/components/ui";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError("");
    try {
      await api("/auth/login", { body: { email, password } });
      router.replace("/admin/dashboard");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível entrar.");
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4 py-10">
      <div className="mb-6 flex flex-col items-center text-center">
        <Image src="/logo-udv.png" alt="UDV" width={80} height={80} priority className="rounded-2xl" />
        <h1 className="mt-4 text-xl font-bold text-slate-900">Almoxarifado · Acesso administrativo</h1>
        <p className="text-sm text-slate-500">UDV · DAV de Ponta Grossa</p>
      </div>
      <form onSubmit={submit} className="card space-y-4 p-5">
        {error && <ErrorBox message={error} />}
        <Field label="E-mail"><input className="input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
        <Field label="Senha"><input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></Field>
        <button className="btn-primary w-full !py-3" disabled={loading}>{loading && <Spinner />}Entrar</button>
      </form>
    </main>
  );
}
