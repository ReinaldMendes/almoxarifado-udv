"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BarChart3, Boxes, ClipboardList, Clock, History, LayoutDashboard, LogOut, MoreHorizontal, Settings, Users } from "lucide-react";
import { api } from "@/lib/api";
import { ROLE_LABEL } from "@/lib/format";
import type { User } from "@/lib/types";
import { Modal, Skeleton } from "@/components/ui";

const UserCtx = createContext<User | null>(null);
export const useUser = () => {
  const u = useContext(UserCtx);
  if (!u) throw new Error("useUser fora do AdminShell");
  return u;
};
export const useCanWrite = () => useUser().role !== "CONSULTA";

const NAV = [
  { href: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard, main: true },
  { href: "/admin/estoque", label: "Estoque", icon: Boxes, main: true },
  { href: "/admin/retiradas", label: "Retiradas", icon: ClipboardList, main: true },
  { href: "/admin/pendencias", label: "Pendências", icon: Clock, main: true },
  { href: "/admin/movimentacoes", label: "Movimentações", icon: History },
  { href: "/admin/relatorios", label: "Relatórios", icon: BarChart3 },
  { href: "/admin/usuarios", label: "Usuários", icon: Users, adminOnly: true },
  { href: "/admin/configuracoes", label: "Configurações", icon: Settings },
];

export function AdminShell({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [more, setMore] = useState(false);
  const path = usePathname();
  const router = useRouter();

  useEffect(() => { api<{ user: User }>("/auth/me").then((r) => setUser(r.user)).catch(() => router.replace("/admin/login")); }, [router]);
  useEffect(() => setMore(false), [path]);

  async function logout() {
    await api("/auth/logout", { method: "POST", body: {} }).catch(() => {});
    router.replace("/admin/login");
  }

  if (!user) return <div className="mx-auto max-w-5xl space-y-4 p-6"><Skeleton className="h-10 w-56" /><Skeleton className="h-40" /><Skeleton className="h-40" /></div>;

  const items = NAV.filter((n) => !n.adminOnly || user.role === "ADMIN");
  const active = (href: string) => path === href || path.startsWith(href + "/");

  return (
    <UserCtx.Provider value={user}>
      <div className="min-h-dvh lg:flex">
        {/* sidebar desktop/tablet */}
        <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-slate-200 bg-white lg:flex">
          <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-4">
            <Image src="/logo-udv.png" alt="UDV" width={40} height={40} className="rounded-lg" />
            <div className="leading-tight"><p className="text-sm font-bold text-slate-900">Almoxarifado</p><p className="text-xs text-slate-500">UDV · DAV Ponta Grossa</p></div>
          </div>
          <nav className="flex-1 space-y-1 overflow-y-auto p-3">
            {items.map((n) => (
              <Link key={n.href} href={n.href} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium ${active(n.href) ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-100"}`}>
                <n.icon className="h-5 w-5" />{n.label}
              </Link>
            ))}
          </nav>
          <div className="border-t border-slate-100 p-3">
            <p className="truncate px-2 text-sm font-medium text-slate-800">{user.name}</p>
            <p className="px-2 text-xs text-slate-500">{ROLE_LABEL[user.role]}</p>
            <button onClick={logout} className="btn-ghost mt-2 w-full !justify-start"><LogOut className="h-4 w-4" />Sair</button>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          {/* topo mobile/tablet */}
          <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
            <Image src="/logo-udv.png" alt="UDV" width={32} height={32} className="rounded-lg" />
            <p className="flex-1 text-sm font-bold text-slate-900">Almoxarifado UDV</p>
            <span className="text-xs text-slate-500">{user.name.split(" ")[0]}</span>
          </header>
          <main className="mx-auto w-full max-w-6xl px-4 pb-28 pt-5 lg:px-8 lg:pb-10 lg:pt-8">{children}</main>
        </div>

        {/* bottom navigation mobile */}
        <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] lg:hidden" aria-label="Navegação principal">
          {items.filter((n) => n.main).map((n) => (
            <Link key={n.href} href={n.href} className={`flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium ${active(n.href) ? "text-brand-600" : "text-slate-500"}`}>
              <n.icon className="h-5 w-5" />{n.label}
            </Link>
          ))}
          <button onClick={() => setMore(true)} className="flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium text-slate-500"><MoreHorizontal className="h-5 w-5" />Mais</button>
        </nav>
        <Modal open={more} onClose={() => setMore(false)} title="Mais opções">
          <div className="space-y-1">
            {items.filter((n) => !n.main).map((n) => (
              <Link key={n.href} href={n.href} className="flex items-center gap-3 rounded-xl px-3 py-3 text-slate-700 hover:bg-slate-100"><n.icon className="h-5 w-5" />{n.label}</Link>
            ))}
            <button onClick={logout} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-red-600 hover:bg-red-50"><LogOut className="h-5 w-5" />Sair</button>
          </div>
        </Modal>
      </div>
    </UserCtx.Provider>
  );
}
