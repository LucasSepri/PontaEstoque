// Autoverificação do cache de leitura do ERP (lib/cacheErp.ts).
//
// Garante o contrato que as rotas dependem: chamada repetida não gasta rede, chamadas
// simultâneas iguais compartilham uma só, erro não fica preso, e limpar invalida.
// Também confere que lib/erp.ts realmente enfia as leituras no cache — sem isso o
// cache seria código morto.
//
// Rodar: node scripts/check_cache_erp.mjs  (Node 22.6+/24 faz type-stripping)
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const { emCache, limparCacheErp } = await import("../lib/cacheErp.ts");

let chamadas = 0;
const contar = (v, ms = 0) => async () => {
  chamadas++;
  if (ms) await new Promise((r) => setTimeout(r, ms));
  return v;
};

// 1) Repetida: a segunda vem do cache.
assert.equal(await emCache("a", contar(1)), 1);
assert.equal(await emCache("a", contar(2)), 1, "segunda chamada deveria vir do cache");
assert.equal(chamadas, 1, "cache nao evitou a segunda ida a fonte");

// 2) Single-flight: 3 simultâneas = 1 ida. A UI dispara 2–3 juntas ao abrir o card.
chamadas = 0;
const r = await Promise.all([emCache("b", contar("x", 20)), emCache("b", contar("y", 20)), emCache("b", contar("z", 20))]);
assert.equal(chamadas, 1, "simultaneas identicas deveriam compartilhar a promise");
assert.deepEqual(r, ["x", "x", "x"], "respostas simultaneas divergem");

// 3) Chave diferente não é servida pelo resultado do outro (corpo do ERP importa).
chamadas = 0;
assert.equal(await emCache("c", contar("cc")), "cc");
assert.equal(chamadas, 1, "chave diferente deveria consultar a fonte");

// 4) TTL vencido relê.
chamadas = 0;
await emCache("d", contar(0), 1);
await new Promise((res) => setTimeout(res, 20));
await emCache("d", contar(1), 1);
assert.equal(chamadas, 2, "apos o TTL deveria reler");

// 5) Falha não fica cacheada: servir erro por 2 min é pior que reler.
chamadas = 0;
await assert.rejects(emCache("err", async () => { chamadas++; throw new Error("boom"); }), /boom/);
assert.equal(chamadas, 1, "a falha nao deveria ter chamado a fonte duas vezes");
assert.equal(await emCache("err", contar("ok")), "ok", "falha ficou presa no cache");

// 6) limparCacheErp invalida tudo.
chamadas = 0;
limparCacheErp();
await emCache("a", contar(9));
assert.equal(chamadas, 1, "apos limparCacheErp deveria reler");

// 7) As leituras de lib/erp.ts estão de fato passando pelo cache.
const erp = readFileSync(fileURLToPath(new URL("../lib/erp.ts", import.meta.url)), "utf8");
for (const fn of ["erpPesquisar", "erpEstoquePorFilial", "erpSimilares", "erpAgregados", "erpOfertas", "erpDisponibilidades"]) {
  const inicio = erp.indexOf(`export async function ${fn}(`);
  assert.ok(inicio > 0, `${fn} nao encontrada em lib/erp.ts`);
  const corpo = erp.slice(inicio, erp.indexOf("\n}\n", inicio));
  assert.ok(corpo.includes("emCache"), `${fn} nao usa o cache`);
}
assert.ok(/setSessao[\s\S]{0,250}limparCacheErp\(\)/.test(erp), "setSessao deveria limpar o cache ao trocar de usuario");

console.log("check_cache_erp: ok");
