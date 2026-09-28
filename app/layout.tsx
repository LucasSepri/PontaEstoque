import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ponta de Estoque",
  description: "Sistema de controle de pontas de estoque",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}