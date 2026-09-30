import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ToastProvider } from "@/components/ui";

export const metadata: Metadata = {
  title: { default: "Almoxarifado UDV – DAV Ponta Grossa", template: "%s · Almoxarifado UDV" },
  description: "Controle de almoxarifado — UDV, DAV de Ponta Grossa",
  robots: { index: false, follow: false },
  icons: { icon: "/logo-udv.png" },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#009fd1" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body><ToastProvider>{children}</ToastProvider></body>
    </html>
  );
}
