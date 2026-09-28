// m² por caixa vem embutido na descrição do produto no ERP.
//
// O sufixo "M2" é opcional: o ERP às vezes omite e escreve só
// "CX.2,43 MARSELHA". Exigir o sufixo deixava o cartão em "Não informado"
// justamente nos produtos que tinham a informação.
//
// Não aceitamos número inteiro sem decimal sem "M2" ("CX 12 PCS") porque
// 12 peças por caixa é outra medida, não m² — e 2,43 m² por peça numa caixa
// de 2 peças daria 4,86 m², o que está errado.
//
// Fica fora de lib/erp.ts porque esse módulo importa next/server e a página
// /sistema é client component.

const M2_CX = /CX\.?\s*(\d+[.,]\d+|\d+\s*M2)/i;

export function m2PorCaixa(descricao: string | null | undefined): number {
  const m = M2_CX.exec(descricao || "");
  if (!m) return 0;
  const v = parseFloat(m[1].replace(",", "."));
  return isNaN(v) ? 0 : v;
}
