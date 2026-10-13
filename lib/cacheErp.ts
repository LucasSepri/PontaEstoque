// Cache de leitura do ERP.
//
// Medido no ERP real: ObterDisponibilidades ~10s, Pesquisar ~1s por 20 itens (página de
// 500 leva ~13s), lotes ~0,5s. Sem cache, voltar para a aba de lotes/estoque refazia a
// mesma chamada e a tela "pensava" de novo. TTL curto (2 min) resolve o repeat de sobra
// para navegação sem servir preço velho o dia inteiro.
//
// Chave = endpoint + corpo: a identidade exata da resposta. Chamadas iguais simultâneas
// (a UI dispara 2-3 juntas ao abrir o card) compartilham a mesma promise em vez de virar
// 2-3 requisições ao ERP — o single-flight economiza uma ida completa ao servidor.
//
// Em globalThis pelo mesmo motivo da sessão (lib/erp.ts): sobrevive ao HMR do Next em dev.
//
// Vive em módulo próprio, sem importar "next/server", para os scripts de verificação
// poderem importá-lo com o type-stripping do Node.

/** TTL padrão das leituras do ERP, em ms. Lido a cada chamada para poder ser ajustado em teste. */
export function ttlErp() {
  return Number(process.env.ERP_CACHE_TTL || 120000);
}

type Entrada = { em: number; dado: any };
const gc = globalThis as unknown as {
  __pontaErpCache?: Map<string, Entrada>;
  __pontaErpPend?: Map<string, Promise<any>>;
};
const CACHE = (gc.__pontaErpCache ??= new Map<string, Entrada>());
const PEND = (gc.__pontaErpPend ??= new Map<string, Promise<any>>());

/** Esquece tudo. Chamado ao trocar de usuário e quando o cache fica velho. */
export function limparCacheErp() {
  CACHE.clear();
}

export function emCache<T>(chave: string, fn: () => Promise<T>, ttl?: number): Promise<T> {
  const hit = CACHE.get(chave);
  if (hit && Date.now() - hit.em < (ttl ?? ttlErp())) return Promise.resolve(hit.dado as T);
  const pend = PEND.get(chave);
  if (pend) return pend as Promise<T>;
  const p = fn()
    .then((dado) => {
      CACHE.set(chave, { em: Date.now(), dado });
      return dado;
    })
    .finally(() => PEND.delete(chave));
  PEND.set(chave, p);
  return p;
}
