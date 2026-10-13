// Conferência de ponta de estoque: saldo contado na loja vs. saldo do lote no ERP.
//
// O confronto é entre `pontas.quantidade` (o que o operador contou) e
// `pontas.estoque_erp` (disponível para venda do lote, gravado pelo GET de
// /api/pontas). Fica fora de lib/produto.ts porque aquele módulo importa
// `@/lib/m2caixa`, e o alias só resolve dentro do Next — sem isso os scripts de
// verificação em scripts/ não conseguem importar este módulo (mesmo motivo do
// lib/cacheErp.ts).

/** Abaixo disso é arredondamento de float, não divergência de estoque. */
export const TOLERANCIA_M2 = 0.005;

/** Acima disso o card avisa que o saldo do ERP está velho. */
export const MINUTOS_SYNC_VELHO = 10;

export type LeituraDivergencia = "confere" | "sobra" | "falta" | "nao_lido";

/** Número no padrão da loja: vírgula decimal, sempre 2 casas. */
const num = (n: number) =>
  n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** "N cx", "N cx + 0,37 m²" ou "0,37 m²" — a unidade em que o operador conta. */
export function caixasDe(m2: number, porCaixa: number): string | null {
  if (!(m2 > 0)) return null;
  if (!(porCaixa > 0)) return `${num(m2)} m²`;
  const inteiras = Math.floor(m2 / porCaixa + 1e-9);
  const resto = m2 - inteiras * porCaixa;
  const cx = inteiras > 0 ? `${inteiras} cx` : "";
  if (resto <= TOLERANCIA_M2 + 1e-9) return cx || "0 cx";
  return cx ? `${cx} + ${num(resto)} m²` : `${num(resto)} m²`;
}

export type Divergencia = {
  leitura: LeituraDivergencia;
  /** ERP − contado. Positivo = sobra no lote. */
  delta: number;
  absoluta: number;
  texto: string;
};

/**
 * Quanto o ERP tem além do contado. Positivo (sobra) = mercadoria saiu sem
 * baixa. Negativo (falta) = o contado passa do disponível do lote.
 */
export function divergencia(m2: number, estoqueErp: number | null | undefined): Divergencia {
  const erp = estoqueErp == null ? null : Number(estoqueErp);
  if (erp == null || isNaN(erp)) {
    return { leitura: "nao_lido", delta: 0, absoluta: 0, texto: "saldo do ERP não lido" };
  }
  const delta = erp - m2;
  const absoluta = Math.abs(delta);
  // +1e-9: a subtração introduz ruído de float e a borda da tolerância viraria
  // divergência falsa em valores exatamente no limite.
  if (absoluta <= TOLERANCIA_M2 + 1e-9) {
    return { leitura: "confere", delta: 0, absoluta: 0, texto: "confere com o ERP" };
  }
  const aMais = delta > 0;
  return {
    leitura: aMais ? "sobra" : "falta",
    delta,
    absoluta,
    // "−" U+2212 em vez de "-": o número já vem com sinal do toFixed, e um
    // hífen solto antes fica ilegível em coluna de tabela.
    texto: `${aMais ? "+" : "−"}${num(absoluta)} m² ${aMais ? "a mais no ERP" : "a menos no ERP"}`,
  };
}

/** Minutos desde a última sincronização. null = nunca sincronizou. */
export function minutosDesde(iso: string | null | undefined, agora = Date.now()) {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!t || isNaN(t)) return null;
  return Math.max(0, Math.round((agora - t) / 60000));
}

export type Frescor = { texto: string; classe: string; velho: boolean };

export function frescorSync(min: number | null): Frescor {
  if (min == null) return { texto: "nunca sincronizado", classe: "badge--idle", velho: true };
  if (min < 1) return { texto: "sincronizado agora", classe: "badge--ok", velho: false };
  if (min < 60) {
    return {
      texto: `sincronizado há ${min} min`,
      classe: min > MINUTOS_SYNC_VELHO ? "badge--warn" : "badge--ok",
      velho: min > MINUTOS_SYNC_VELHO,
    };
  }
  const h = Math.floor(min / 60);
  if (h < 24) return { texto: `sincronizado há ${h} h`, classe: "badge--warn", velho: true };
  return { texto: `sincronizado há ${Math.floor(h / 24)} d`, classe: "badge--bad", velho: true };
}

export const DIVERGENCIA_INFO: Record<LeituraDivergencia, { rotulo: string; classe: string }> = {
  confere: { rotulo: "Confere", classe: "divergencia--ok" },
  sobra: { rotulo: "Sobra no ERP", classe: "divergencia--sobra" },
  falta: { rotulo: "Falta no lote", classe: "divergencia--bad" },
  nao_lido: { rotulo: "Não lido", classe: "divergencia--idle" },
};
