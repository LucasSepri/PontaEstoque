// Checagem da conferência de ponta de estoque. Sem framework: roda com
//   node scripts/check_conferencia.mjs
// Os casos usam os dois produtos que estavam no banco quando a estratégia foi
// medida: 33985 (Δ de exatamente 1 caixa) e 32434 (Δ zero).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  TOLERANCIA_M2,
  MINUTOS_SYNC_VELHO,
  caixasDe,
  divergencia,
  frescorSync,
  minutosDesde,
  DIVERGENCIA_INFO,
} from "../lib/conferencia.ts";

let ok = 0;
const t = (nome, fn) => {
  fn();
  ok++;
  console.log("  ok", nome);
};

console.log("divergencia");

// Caso real medido: 95,15 m² contados vs 96,88 m² no lote → +1,73 m² = 1 caixa.
t("sobra de 1 caixa no ERP vira leitura 'sobra'", () => {
  const d = divergencia(95.15, 96.88);
  assert.equal(d.leitura, "sobra");
  assert.ok(Math.abs(d.absoluta - 1.73) < 1e-9, `absoluta=${d.absoluta}`);
  assert.equal(d.texto, "+1,73 m² a mais no ERP");
});

t("valores iguais conferem", () => {
  const d = divergencia(170.1, 170.1);
  assert.equal(d.leitura, "confere");
  assert.equal(d.absoluta, 0);
});

t("diferenca dentro da tolerancia confere", () => {
  assert.equal(divergencia(10, 10 + TOLERANCIA_M2).leitura, "confere");
  assert.equal(divergencia(10, 10 - TOLERANCIA_M2).leitura, "confere");
});

t("um passo acima da tolerancia ja diverge", () => {
  assert.equal(divergencia(10, 10 + TOLERANCIA_M2 * 3).leitura, "sobra");
  assert.equal(divergencia(10, 10 - TOLERANCIA_M2 * 3).leitura, "falta");
});

t("contado maior que o lote vira 'falta' com sinal de menos", () => {
  const d = divergencia(100, 90);
  assert.equal(d.leitura, "falta");
  assert.ok(d.delta < 0);
  assert.match(d.texto, /^−10,00 m² a menos no ERP$/);
  assert.ok(d.texto.includes("\u2212"), "usa U+2212, nao hifen");
});

t("saldo do ERP ausente vira 'nao_lido' e nao inventa delta", () => {
  for (const v of [null, undefined, NaN, "abc"]) {
    const d = divergencia(95.15, v);
    assert.equal(d.leitura, "nao_lido", String(v));
    assert.equal(d.absoluta, 0);
  }
});

t("estoque_erp chega como string do pg e e convertido", () => {
  assert.equal(divergencia(95.15, "96.88").leitura, "sobra");
});

console.log("caixasDe");

t("caixa cheia", () => {
  assert.equal(caixasDe(1.73, 1.73), "1 cx");
  assert.equal(caixasDe(96.88, 1.73), "56 cx");
});

t("caixa quebrada", () => {
  assert.equal(caixasDe(96.88, 1.73), "56 cx");
  assert.equal(caixasDe(2.1, 1.73), "1 cx + 0,37 m²");
});

t("menos de uma caixa mostra so o resto", () => {
  assert.equal(caixasDe(0.37, 1.73), "0,37 m²");
});

t("sem m2 por caixa cai para m2", () => {
  assert.equal(caixasDe(4.5, 0), "4,50 m²");
});

t("zero ou negativo nao gera rotulo", () => {
  assert.equal(caixasDe(0, 1.73), null);
  assert.equal(caixasDe(-3, 1.73), null);
});

console.log("frescor");

t("minutosDesde le iso, lixo e vazio", () => {
  const agora = Date.parse("2024-05-01T12:00:00Z");
  assert.equal(minutosDesde("2024-05-01T11:30:00Z", agora), 30);
  assert.equal(minutosDesde(null, agora), null);
  assert.equal(minutosDesde("", agora), null);
  assert.equal(minutosDesde("nao e data", agora), null);
});

t("faixas do frescor", () => {
  assert.equal(frescorSync(null).texto, "nunca sincronizado");
  assert.equal(frescorSync(null).classe, "badge--idle");
  assert.equal(frescorSync(0).texto, "sincronizado agora");
  assert.equal(frescorSync(0).velho, false);
  assert.equal(frescorSync(MINUTOS_SYNC_VELHO).velho, false);
  assert.equal(frescorSync(MINUTOS_SYNC_VELHO + 1).velho, true);
  assert.equal(frescorSync(59).texto, "sincronizado há 59 min");
  assert.equal(frescorSync(60).texto, "sincronizado há 1 h");
  assert.equal(frescorSync(60 * 24).texto, "sincronizado há 1 d");
});

t("toda leitura tem rotulo e classe", () => {
  for (const k of ["confere", "sobra", "falta", "nao_lido"]) {
    assert.ok(DIVERGENCIA_INFO[k].rotulo, k);
    assert.match(DIVERGENCIA_INFO[k].classe, /^divergencia--/);
  }
});

console.log("sincronizacao (/api/pontas)");

// Regressao de perda de dado: lote que nao aparece na lista do ERP nao pode
// apagar a ponta (antes apagava, junto com a foto, por causa de um lote digitado
// errado). So saldo zerado apaga.
const rota = readFileSync(new URL("../app/api/pontas/route.ts", import.meta.url), "utf8");
const inicio = rota.indexOf("const ler = (ls");
const fim = rota.indexOf("export async function POST");
assert.ok(inicio > 0 && fim > inicio, "nao achei o bloco de sincronizacao em route.ts");
const trecho = rota.slice(inicio, fim);

t("lote nao encontrado nao remove", () => {
  assert.match(trecho, /if \(!r\.achou\)/, "falta o ramo !achou");
  assert.match(trecho, /estoque_erp: null/, "deveria zerar o saldo lido");
});

t("saldo do ERP e comparado como numero, nao como string", () => {
  // `estoque_erp` e `numeric` e o pg devolve string: com `!==` direto o sync
  // reescrevia a linha a cada poll e zerava `conferido_em`.
  assert.match(trecho, /r\.disponivel !== Number\(p\.estoque_erp\)/, "comparacao precisa ser numerica");
});

t("saldo novo invalida a conferencia aceita", () => {
  assert.match(trecho, /conferido_em: null/, "o sync deveria limpar conferido_em");
});

t("remocao so acontece com disponibilidade <= 0", () => {
  assert.match(trecho, /disponivel <= 0/, "falta a guarda de saldo zerado");
  const remove = trecho.match(/remover: true/g) || [];
  assert.equal(remove.length, 1, `esperado 1 remover:true, achou ${remove.length}`);
  const pos = trecho.indexOf("disponivel <= 0");
  assert.ok(pos < trecho.indexOf("remover: true"), "remover:true deve estar sob a guarda de saldo");
});

console.log("conferencia aceita (PUT /api/pontas)");

const put = rota.slice(rota.indexOf("export async function PUT"));

t("PUT aceita conferido_em", () => {
  assert.match(put, /corpo\.conferido_em !== undefined/, "nao detecta o campo");
  assert.match(put, /pontaConferir\(codigo, quando\)/, "nao chama pontaConferir");
});

t("carimbo de data vem do servidor", () => {
  assert.match(put, /new Date\(\)\.toISOString\(\)/, "deveria carimbar no servidor");
});

t("conferido_em sozinho nao cai no 'nada para atualizar'", () => {
  assert.match(put, /!conferir\)\s*\{/, "a guarda precisa considerar conferir");
});

const db = readFileSync(new URL("../lib/db.ts", import.meta.url), "utf8");

t("coluna conferido_em criada de forma idempotente", () => {
  assert.match(db, /ADD COLUMN IF NOT EXISTS conferido_em timestamptz/, "falta o ALTER TABLE");
});

t("falha do ALTER TABLE nao fica memoizada", () => {
  assert.match(db, /schemaPronto = null/, "uma falha travaria o schema para sempre");
});

console.log("CSS do card");

const css = readFileSync(new URL("../app/sistema.css", import.meta.url), "utf8");
for (const cls of [".metrica--erp", ".metrica-nota", ".divergencia--sobra", ".divergencia--idle", ".divergencia-badge", ".divergencia-frescor", ".divergencia-diag", ".divergencia-diag--ok", ".divergencia-diag--aceita", ".diag-tabela", ".diag-linha--on"]) {
  t(`estilo ${cls}`, () => assert.ok(css.includes(cls), `${cls} sem estilo`));
}

console.log(`\n${ok} checagens ok`);
