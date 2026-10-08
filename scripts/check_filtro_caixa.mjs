// Autoverificação do filtro local de m²/caixas da tela /consulta.
//
// Importa `lib/m2caixa.ts` — o mesmo arquivo que `app/consulta/page.tsx`
// usa — em vez de reimplementar a regra aqui.
//
// Rodar: node scripts/check_filtro_caixa.mjs  (Node 22.6+/24 faz type-stripping)
import assert from "node:assert/strict";
import { combinaCaixa, m2PorCaixa } from "../lib/m2caixa.ts";

const linha = { m2: 0, estoque: 0 };
const ok = (m2, estoque, l) => combinaCaixa(m2, estoque, l);

// Sem nenhum limite: nada é filtrado, inclusive quem não tem m² na descrição.
assert.ok(ok(0, 0, {}), "sem filtro tudo passa");
assert.ok(ok(0, 0, { m2Min: 2, m2Max: 2.5, cxMin: 10 }) === false, "sem m² não passa em filtro de m²");

// Faixa de metragem, aceitando vírgula e ponto.
assert.ok(ok(2.43, 100, { m2Min: 2, m2Max: 2.5 }), "2,43 dentro de 2–2,5");
assert.ok(!ok(2.6, 100, { m2Min: 2, m2Max: 2.5 }), "2,60 fora de 2–2,5");
assert.ok(!ok(1.99, 100, { m2Min: 2 }), "1,99 abaixo do mínimo");
assert.ok(ok(2.0, 100, { m2Max: 2 }), "limite máximo é inclusivo, não exclusivo");
assert.ok(ok(2, 0, { m2Min: 2, m2Max: 2 }), "de/até iguais casa o valor exato");

// Quantidade de caixas: estoque em m² dividido pelo m² por caixa.
assert.ok(ok(2.5, 50, { cxMin: 20 }), "50 m² ÷ 2,5 = 20 caixas");
assert.ok(!ok(2.5, 49, { cxMin: 20 }), "49 m² ÷ 2,5 = 19,6 caixas não chega em 20");
assert.ok(!ok(0, 500, { cxMin: 1 }), "sem m² por caixa não dá pra contar caixas");

// Combinação: os três limites ao mesmo tempo.
assert.ok(ok(2.43, 24.3, { m2Min: 2.4, m2Max: 2.5, cxMin: 10 }), "10 caixas de 2,43 m²");
assert.ok(!ok(2.43, 4.86, { m2Min: 2.4, m2Max: 2.5, cxMin: 10 }), "estoque curto derruba o filtro");

// A metragem da linha tem de vir da descrição real do ERP.
assert.equal(m2PorCaixa("PISO 56X56 CX.2,43 MARSELHA"), 2.43, "sufixo M2 opcional");
assert.equal(m2PorCaixa("PISO 60X60 CX 2 M2"), 2, "M2 com inteiro");
assert.equal(m2PorCaixa("CX 12 PCS"), 0, "12 peças não é m²");

console.log("check_filtro_caixa: ok");
