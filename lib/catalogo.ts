// Varredura do catálogo para os filtros de m² e de caixas da tela /consulta.
//
// O ERP não tem filtro de metragem nem de quantidade de caixas. Testado no servidor
// real: Description "2,18" não acha "CX.2,18M2", então nem substring numérica funciona.
// (Os demais filtros — classe, fabricante, modelo, disponibilidade — o ERP aceita sim e
// são repassados em `b` pelo erpPesquisar.)
//
// Solução: varrer TODAS as páginas do resultado da busca e filtrar em memória.
// Medido contra o ERP: TamanhoPagina aceita até 500 (750+ estoura o timeout de 60s) e cada
// página de 500 leva ~15s. Paralelizar não ajuda: 3 em voo deram 27,3s contra 31,7s em
// sequência, com o servidor levantando de 15s para 26s por página. Ler em sequência.
//
// ponytail: a varredura completa de "PISO" (851 itens, 2 páginas) leva ~25s na primeira vez.
// O cache de erpPesquisar em lib/erp.ts resolve o repeat — cada página já vem memoizada, então
// não há cache próprio aqui. O upgrade real é pedir ao ERP um endpoint com esses campos.

import { erpPesquisar, type ResultadoBusca } from "@/lib/erp";
import { combinaCaixa, m2PorCaixa } from "@/lib/m2caixa";

const PAGINA_ERP = 500;
const MAX_PAGINAS = 20; // 20 × 500 = 10.000 produtos; acima disso o ERP demora demais.

export type Limites = { m2Min?: number | null; m2Max?: number | null; cxMin?: number | null };

/** Todas as linhas do resultado da busca, paginando o ERP até o fim. */
export async function varrerCatalogo(b: Record<string, unknown>): Promise<NonNullable<ResultadoBusca["itens"]>> {
  const todos: NonNullable<ResultadoBusca["itens"]> = [];
  for (let p = 1; p <= MAX_PAGINAS; p++) {
    const r = await erpPesquisar({ ...(b as any), pagina: p, tamanho: PAGINA_ERP });
    todos.push(...r.itens);
    if (r.temProxima === false) break;
    if (r.temProxima == null && r.itens.length < PAGINA_ERP) break;
  }
  return todos;
}

/** Varre o catálogo e devolve só o que bate com o filtro de m²/caixas. */
export async function buscarPorCaixa(
  b: Record<string, unknown>,
  lim: Limites
): Promise<{ itens: NonNullable<ResultadoBusca["itens"]>; varridos: number }> {
  if (lim.m2Min == null && lim.m2Max == null && lim.cxMin == null) {
    return { itens: await varrerCatalogo(b), varridos: 0 };
  }
  const todos = await varrerCatalogo(b);
  const itens = todos.filter((i) => {
    const m2 = i.m2_caixa || m2PorCaixa(i.descricao);
    return combinaCaixa(m2, i.estoque || 0, lim);
  });
  return { itens, varridos: todos.length };
}
