import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

// Inter como variável CSS em vez de família fixa: o `globals.css` consome
// `var(--fonte-sistema)` e pode cair para a stack do sistema se o download
// falhar, em vez de renderizar com a fonte padrão por um tempo.
const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--fonte-sistema",
});

export const metadata: Metadata = {
  title: "Ponta de Estoque",
  description: "Sistema de controle de pontas de estoque",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}