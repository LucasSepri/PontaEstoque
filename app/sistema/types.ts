"use client";

import { CATEGORIAS, type Categoria, type StatusEstoque } from "@/lib/produto";

export type Ponta = {
  codigo_erp: string;
  descricao: string;
  produto?: string;
  unidade?: string;
  foto_url?: string;
  foto?: string;
  imagem?: string;
  quantidade: number;
  lote?: string;
  estoque_erp?: number | null;
  sistema?: number;
  saldo_sistema?: number;
  metros_por_caixa?: number;
  ativo?: boolean;
  criado_em?: string;
  sincronizado_em?: string;
};

export type ItemERP = {
  codigo: string;
  descricao: string;
  medida?: string;
  marca?: string;
  unidade?: string;
  estoque?: number;
  estoque_total?: number;
};

export type Lote = {
  lote: string;
  disponivel: number;
};

export const TAMANHO_PAGINA = 20;

export type FiltroCategoria = Categoria | "Todos";
export type FiltroStatus = StatusEstoque | "todos";
export type Ordem = "recentes" | "maior" | "menor" | "caixas" | "nome";

export const FILTROS_CATEGORIA: FiltroCategoria[] = ["Todos", ...CATEGORIAS];

export const FILTROS_STATUS: { id: FiltroStatus; rotulo: string }[] = [
  { id: "todos", rotulo: "Todos" },
  { id: "disponivel", rotulo: "Disponíveis" },
  { id: "baixo", rotulo: "Estoque baixo" },
  { id: "critico", rotulo: "Crítico" },
  { id: "sem", rotulo: "Sem estoque" },
];

export const ORDENS: { id: Ordem; rotulo: string }[] = [
  { id: "recentes", rotulo: "Mais recentes" },
  { id: "maior", rotulo: "Maior estoque" },
  { id: "menor", rotulo: "Menor estoque" },
  { id: "caixas", rotulo: "Mais caixas" },
  { id: "nome", rotulo: "Nome (A–Z)" },
];

export type Derivado = {
  ponta: Ponta;
  m2: number;
  caixas: number;
  porCaixa: number;
  status: StatusEstoque;
  categoria: Categoria;
  titulo: string;
  criado: number;
};

export function formatar(n: number) {
  return Number(n || 0).toLocaleString("pt-BR", {
    maximumFractionDigits: 2,
  });
}

export function formatarCaixas(n: number) {
  const inteiro = Math.round(n);

  return Math.abs(n - inteiro) < 0.01
    ? String(inteiro)
    : n.toLocaleString("pt-BR", {
      maximumFractionDigits: 2,
    });
}

export function formatarBytes(b: number) {
  if (b < 1024) return b + " B";

  if (b < 1024 * 1024) {
    return (b / 1024).toFixed(0).replace(".", ",") + " KB";
  }

  return (b / 1024 / 1024).toFixed(1).replace(".", ",") + " MB";
}

export const fotoVersao: Record<string, number> = {};

export function bumparVersaoFoto(codigo: string) {
  fotoVersao[codigo] = Date.now();
}

export function dataCurta(iso?: string) {
  if (!iso) return "—";

  const d = new Date(iso);

  if (isNaN(d.getTime())) return "—";

  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
}

const FOTO_LADO_MAX = 1600;
const FOTO_QUALIDADE = 0.82;

export async function prepararFoto(arq: File) {
  const dataUrl: string = await new Promise((resolve, reject) => {
    const r = new FileReader();

    r.onload = () => resolve(String(r.result));

    r.onerror = () =>
      reject(new Error("Não consegui ler a imagem."));

    r.readAsDataURL(arq);
  });

  const img: HTMLImageElement = await new Promise((resolve, reject) => {
    const i = new Image();

    i.onload = () => resolve(i);

    i.onerror = () =>
      reject(
        new Error(
          "Arquivo não é uma imagem válida (HEIC precisa ser convertido)."
        )
      );

    i.src = dataUrl;
  });

  const escala = Math.min(
    1,
    FOTO_LADO_MAX / Math.max(img.width, img.height)
  );

  const w = Math.max(1, Math.round(img.width * escala));
  const h = Math.max(1, Math.round(img.height * escala));

  const cv = document.createElement("canvas");

  cv.width = w;
  cv.height = h;

  const ctx = cv.getContext("2d");

  if (!ctx) {
    throw new Error("Não consegui processar a imagem.");
  }

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);

  ctx.drawImage(img, 0, 0, w, h);

  const saida = cv.toDataURL("image/jpeg", FOTO_QUALIDADE);

  return {
    base64: saida.split(",")[1],
    nome: "foto.jpg",
    tipo: "image/jpeg",
    preview: saida,
  };
}

export function urlDaFoto(p: {
  codigo_erp?: string;
  foto_url?: string;
  foto?: string;
  imagem?: string;
}) {
  const caminho = p.foto_url || p.foto || p.imagem;

  if (!caminho) return "";

  if (caminho.startsWith("http") || caminho.startsWith("data:image")) {
    return caminho;
  }

  const url = caminho.startsWith("/") ? caminho : "/" + caminho;
  const v = p.codigo_erp ? fotoVersao[p.codigo_erp] : 0;
  return v ? url + "?v=" + v : url;
}