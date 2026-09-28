// Metadados derivados da descrição do produto.
//
// A tabela `pontas` não guarda categoria, tamanho, referência nem preço: o ERP
// manda só a string de descrição ("PISO 22X89 ELEGANCE NOCCE POLIDO
// CX.1,73M2 (LW)"). Tudo o que a tela mostra além do m² sai de um regex sobre
// essa string — sem coluna nova, sem chamada extra ao ERP.
import { m2PorCaixa } from "@/lib/m2caixa";

export type Categoria = "Piso" | "Porcelanato" | "Revestimento" | "Outros";
export type StatusEstoque = "disponivel" | "baixo" | "critico" | "sem" | "inativo";

/* Limiares de estoque em m². ponytail: fixos e por produto, ignorandoMarkup e
   LEAD TIME. Quando houver regra comercial, mover para a tabela `pontas`
   (minimo_m2, critico_m2) — aí isto vira o fallback. */
export const LIMITE_CRITICO = 5;
export const LIMITE_BAIXO = 25;

const M2_CX = /CX\.?\s*(\d+[.,]\d+|\d+\s*M2)/i;
const MEDIDA = /\b(\d{2,3})\s*X\s*(\d{2,3})\b/i;
const PAREN = /\s*[([{][^)\]}]*[)\]}]\s*$/;

/** Descrição sem o ruído de embalagem: "PISO 22X89 ELEGANCE NOCCE POLIDO". */
export function tituloLimpo(descricao: string | null | undefined) {
  const s = String(descricao || "").trim();
  const m = M2_CX.exec(s);
  // Corta do "CX.x,xxM2" em diante; se sobrou só um "(" solto, remove também.
  let base = m && m.index > 0 ? s.slice(0, m.index) : s;
  base = base.replace(PAREN, "").trim();
  // Descrição curta demais depois do corte: melhor o texto inteiro do que nada.
  return base.length >= 3 ? base : s;
}

/** Primeira palavra útil da descrição define a família do material. */
export function categoria(descricao: string | null | undefined): Categoria {
  const s = String(descricao || "").toUpperCase();
  // A ordem importa: "PORCELANATO" costuma vir antes de "PISO" e é a
  // informação mais específica.
  if (/\bPORCELANAT\w*/.test(s)) return "Porcelanato";
  if (/\bREVESTIMENT\w*/.test(s)) return "Revestimento";
  if (/\bPISOS?\b/.test(s)) return "Piso";
  return "Outros";
}

/** Medida da placa ("22X89") ou string vazia. */
export function tamanho(descricao: string | null | undefined) {
  const m = MEDIDA.exec(String(descricao || ""));
  return m ? `${m[1]}X${m[2]}` : "";
}

export function statusEstoque(m2: number, ativo = true): StatusEstoque {
  if (!ativo) return "inativo";
  if (!(m2 > 0)) return "sem";
  if (m2 < LIMITE_CRITICO) return "critico";
  if (m2 < LIMITE_BAIXO) return "baixo";
  return "disponivel";
}

export const STATUS_INFO: Record<StatusEstoque, { rotulo: string; classe: string }> = {
  disponivel: { rotulo: "Disponível", classe: "badge--ok" },
  baixo: { rotulo: "Estoque baixo", classe: "badge--warn" },
  critico: { rotulo: "Crítico", classe: "badge--bad" },
  sem: { rotulo: "Sem estoque", classe: "badge--idle" },
  inativo: { rotulo: "Inativo", classe: "badge--idle" },
};

export const CATEGORIAS: Categoria[] = ["Piso", "Porcelanato", "Revestimento", "Outros"];

/** Contagens por categoria, para os chips mostrarem o que existe. */
export function contarCategorias<T>(itens: T[], descricaoDe: (i: T) => string | null | undefined) {
  const mapa = new Map<Categoria, number>();
  for (const i of itens) {
    const c = categoria(descricaoDe(i));
    mapa.set(c, (mapa.get(c) || 0) + 1);
  }
  return mapa;
}

/** m² por caixa: descrição do ERP primeiro, `metros_por_caixa` como reserva. */
export function m2Caixa(descricao: string | null | undefined, legado?: number | null) {
  return m2PorCaixa(descricao) || parseFloat(String(legado || 0)) || 0;
}
