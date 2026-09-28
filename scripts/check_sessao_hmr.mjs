// Verifica que a sessão em globalThis sobrevive ao recarregamento do módulo
// (o que o HMR do Next faz a cada edição em dev).
import assert from "node:assert";

const g = globalThis;

// Estado inicial: sem sessão
assert.equal(g.__pontaSessao ?? null, null, "deveria iniciar sem sessao");

// Login define a sessão
g.__pontaSessao = { usuario: "Lucas", senha: "x" };
assert.deepEqual(g.__pontaSessao, { usuario: "Lucas", senha: "x" });

// HMR recarrega o módulo -> a sessão NÃO pode ser perdida
const getSessao = () => g.__pontaSessao ?? null;
assert.deepEqual(getSessao(), { usuario: "Lucas", senha: "x" }, "sessao perdida no reload");

// Logout limpa
g.__pontaSessao = null;
assert.equal(getSessao(), null, "logout nao limpou");

console.log("OK: sessao sobrevive ao reload e logout limpa.");
