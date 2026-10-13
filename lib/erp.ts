import { NextResponse } from "next/server.js";
import { m2PorCaixa } from "@/lib/m2caixa";
import { emCache, limparCacheErp } from "@/lib/cacheErp";

export { limparCacheErp };

const ERP = process.env.ERP_URL || "";
const API = process.env.API_URL || "";
const TIMEOUT = Number(process.env.ERP_TIMEOUT || 25000);

// Sessão do usuário ERP (single-user, como o original).
// Em globalThis para sobreviver ao HMR do Next em dev — sem isso, cada recompilação
// recria o módulo e zera a sessão, derrubando o usuário com 401 sem ele ter feito logout.
type Sessao = { usuario: string; senha: string };
const g = globalThis as unknown as { __pontaSessao?: Sessao | null };

export function getSessao(): Sessao | null {
  return g.__pontaSessao ?? null;
}

export function setSessao(u: Sessao | null) {
  g.__pontaSessao = u;
  if (!u) COOKIES.clear();
  // Trocar de usuário invalida tudo o que foi lido com o anterior. Sem isso o
  // próximo login veria preço/disponibilidade do usuário antigo por até 2 min.
  limparCacheErp();
}

// Cookie jar do ERP. Em globalThis pelo mesmo motivo da sessão: sobrevive ao HMR.
const jar = (globalThis as unknown as { __pontaCookies?: Map<string, string> }).__pontaCookies ?? new Map<string, string>();
(globalThis as unknown as { __pontaCookies?: Map<string, string> }).__pontaCookies = jar;
const COOKIES = jar;

// Token da API (servidor 9990) — injetado no HTML após login, diferente do token do app (9999).
// Em globalThis para sobreviver ao HMR.
const apiTokenStore = (globalThis as unknown as { __pontaApiToken?: string | null }).__pontaApiToken ?? null;
(globalThis as unknown as { __pontaApiToken?: string | null }).__pontaApiToken = apiTokenStore;

export function getApiToken(): string | null {
  return (globalThis as unknown as { __pontaApiToken?: string | null }).__pontaApiToken ?? null;
}

export function setApiToken(token: string | null) {
  (globalThis as unknown as { __pontaApiToken?: string | null }).__pontaApiToken = token;
}

export async function erpLogin(usuario: string, senha: string) {
  const resp = await fetch(ERP + "/Login/RealizarLogin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ Usuario: usuario, Senha: senha, DadosLicenciamentoCodificados: null }),
    signal: AbortSignal.timeout(TIMEOUT),
  });
  // O ERP é ASP.NET e autentica por cookie de sessão (ASP.NET_SessionId).
  // O fetch do Node não tem cookie jar nativo, então capturamos e reenviamos à mão.
  // Sem isso, toda chamada voltava com a tela de login do ERP.
  const sc = resp.headers.getSetCookie?.() || [];
  for (const c of sc) {
    const par = c.split(";")[0];
    const i = par.indexOf("=");
    if (i > 0) COOKIES.set(par.slice(0, i).trim(), par.slice(i + 1).trim());
  }
  return resp.json();
}

/**
 * Após login bem-sucedido, acessa a home do ERP (9999) para extrair o token da API (9990)
 * que é injetado no HTML em `GridController.server.token`.
 * Deve ser chamado uma vez após o login.
 */
export async function fetchApiToken(): Promise<string | null> {
  const u = getSessao();
  if (!u) return null;

  try {
    const r = await fetch(ERP + "/", {
      headers: COOKIES.size ? { Cookie: Array.from(COOKIES).map(([k, v]) => `${k}=${v}`).join("; ") } : {},
      signal: AbortSignal.timeout(TIMEOUT),
    });
    const html = await r.text();
    // Extrai token do GridController.server.token injetado no HTML
    const match = html.match(/token:\s*'([^']+)'/);
    if (match && match[1]) {
      const token = match[1];
      setApiToken(token);
      return token;
    }
    return null;
  } catch {
    return null;
  }
}

export async function erpPost(path: string, body: unknown, credenciais?: { usuario: string; senha: string }) {
  const doReq = async () => {
    const r = await fetch(ERP + path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Array.from em vez de spread: o tsconfig não define "target" (o TS assume
        // es5, onde Map não é iterável).
        ...(COOKIES.size
          ? { Cookie: Array.from(COOKIES).map(([k, v]) => `${k}=${v}`).join("; ") }
          : {}),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT),
    });
    const texto = await r.text();
    // O ERP responde 200 + HTML da tela de login quando a sessão expirou.
    // Sem esta checagem, r.json() estoura e o catch reloga, mas o chamador
    // recebia [] e mostrava "produto não encontrado" em vez de relogar.
    const t = texto.trim();
    if (!t.startsWith("{") && !t.startsWith("[")) throw new Error("sessao-erp-expirada");
    return JSON.parse(t);
  };

  try {
    return await doReq();
  } catch (e: any) {
    // Sessão expirada ou erro de rede: reloga com o usuário ativo e tenta uma vez.
    const u = getSessao();
    if (!u || credenciais) throw new Error("Sessão ERP expirada: " + (e?.message || e));
    const login = await erpLogin(u.usuario, u.senha);
    if (login?.Status !== "SUCESSO") throw new Error("Login ERP falhou: " + (login?.Mensagem || "credenciais inválidas"));
    return await doReq();
  }
}

// Endpoints de leitura do ERP são GET (POST neles devolve 404). Mesmo tratamento
// de sessão expirada do erpPost.
export async function erpGet(path: string) {
  const doReq = async () => {
    const r = await fetch(ERP + path, {
      headers: COOKIES.size ? { Cookie: Array.from(COOKIES).map(([k, v]) => `${k}=${v}`).join("; ") } : {},
      signal: AbortSignal.timeout(TIMEOUT),
    });
    const texto = await r.text();
    const t = texto.trim();
    if (!t.startsWith("{") && !t.startsWith("[")) throw new Error("sessao-erp-expirada");
    return JSON.parse(t);
  };
  try {
    return await doReq();
  } catch (e: any) {
    const u = getSessao();
    if (!u) throw new Error("Sessão ERP expirada: " + (e?.message || e));
    const login = await erpLogin(u.usuario, u.senha);
    if (login?.Status !== "SUCESSO") throw new Error("Login ERP falhou: " + (login?.Mensagem || "credenciais inválidas"));
    return await doReq();
  }
}

export function json(obj: unknown, status = 200) {
  return NextResponse.json(obj, { status });
}

// ---------------------------------------------------------------------------
// Cache de leitura do ERP.
//
// Medido no ERP real: ObterDisponibilidades ~10s, Pesquisar ~1s por 20 itens
// (página de 500 leva ~13s), lotes ~0,5s. Sem cache, voltar para a aba de
// lotes/estoque refazia a mesma chamada e a tela "pensava" de novo. TTL curto
// (2 min) resolve o repeat sem servir preço velho por muito tempo.
//
// Chave = endpoint + corpo: a identidade exata da resposta. Chamadas iguais
// simultâneas (a UI dispara 2-3 juntas ao abrir o card) compartilham a mesma
// promise em vez de virar 2-3 requisições ao ERP.
//
// Em globalThis pelo mesmo motivo da sessão: sobrevive ao HMR do Next em dev.
// ---------------------------------------------------------------------------
// m²/caixa é parseado em lib/m2caixa.ts (client-safe, compartilhado com a UI).

function n(v: any) {
  const x = Number(v);
  return isNaN(x) ? 0 : x;
}

// "PISO  56X56  RX58011" e "ROX        " chegam com o padding bruto do ERP.
function t(v: any) {
  return String(v == null ? "" : v).replace(/\s+/g, " ").trim();
}

// Mapeia a entidade do ERP para a linha da tabela de consulta.
// Campos que o endpoint nem sempre devolve caem em 0/"" — a UI esconde a coluna vazia.
function mapEntidade(e: any) {
  return {
    codigo: t(e.Codigo),
    descricao: t(e.Descricao),
    referencia: t(e.Referencia),
    marca: t(e.CodigoFabricante),
    medida: t(e.Modelo),
    unidade: t(e.Unidade1),
    estoque: n(e.QuantidadeEstoqueFilial),
    estoque_cd: n(e.QuantidadeEstoqueCD),
    estoque_outras: n(e.QuantidadeEstoqueOutraFilial),
    estoque_total: n(e.QuantidadeEstoqueTotal),
    // O ERP só envia o preço numérico em "Preco"; "PrecoAVista" já vem formatado ("R$ 31,90").
    preco_unitario: n(e.Preco),
    preco_vista: n(e.Preco),
    fornecedor: t(e.NomeFornecedor || e.Fornecedor),
    disponibilidade: t(e.DescricaoDisponibilidade || e.Disponibilidade || e.Situacao),
    classe: t(e.Classe || e.ClasseProduto),
    local: t(e.LocalFisico),
    m2_caixa: m2PorCaixa(e.Descricao || ""),
  };
}

// Códigos de disponibilidade pré-marcados pela tela "Consultar Produtos" do ERP
// (capturados via DevTools). "Não disponível para venda" (21085) fica desmarcado.
export const DISPONIBILIDADES_PADRAO = ["32260", "21081", "21073", "21077", "21069", "29105", "32246", "32410"];

export type FiltroProduto = {
  codigo?: string;
  referencia?: string;
  descricao?: string;
  ordem?: string;
  estoque_disponivel?: boolean;
  estoque_cd?: boolean;
  estoque_outras?: boolean;
  disponibilidade?: string[];
  classe?: string;
  fabricante?: string;
  modelo?: string;
  texto_tecnico?: string;
  oferta?: boolean;
  pagina?: number;
  tamanho?: number;
};

export type ResultadoBusca = {
  itens: ReturnType<typeof mapEntidade>[];
  pagina: number;
  tamanho: number;
  // null quando o ERP não devolve o total: a UI mostra só anterior/próxima.
  total: number | null;
  // null quando o ERP não informa (a UI deduz pelo tamanho da página).
  temProxima: boolean | null;
};

/** Pesquisa com os filtros da tela "Consultar Produtos" do ERP. */
export async function erpPesquisar(f: FiltroProduto = {}): Promise<ResultadoBusca> {
  const codigo = (f.codigo || "").trim();
  const referencia = (f.referencia || "").trim();
  const descricao = (f.descricao || "").trim();
  const pagina = Math.max(1, f.pagina || 1);
  const tamanho = f.tamanho || 20;

  // Código/referência sem nenhum filtro avançado: o ERP resolve pelo produto exato
  // (PesquisarUnicoProduto, como o modal de cadastro usa). O teste antigo era
  // /^\d+$/, que mandava código alfanumérico ("CE123") para /Produto/Pesquisar e
  // casava o produto errado — lá "Codigo" é prefixo, não igualdade.
  const soCodigo = codigo && !referencia && !descricao && !f.classe && !f.fabricante && !f.modelo && !f.texto_tecnico && !f.oferta;
  if (soCodigo) {
    // O cadastro de pontas olha o mesmo código várias vezes seguidas; com o cache
    // a checagem de "já existe" deixa de pagar ~1,5s ao ERP.
    return emCache(`unico:${codigo}`, async () => {
      const data = await erpPost("/Produto/PesquisarUnicoProduto", {
        codigoOuReferencia: codigo,
        NumeroPagina: 1,
        TamanhoPagina: 20,
        identificadorOrcamento: null,
      });
      return { itens: (data.Entities || []).map(mapEntidade), pagina: 1, tamanho: 20, total: null, temProxima: false };
    });
  }

  // Corpo idêntico ao que a tela do ERP envia (18 campos). Sem os campos vazios o
  // backend aplica defaults diferentes — "Disponibilidade" omitido, por exemplo,
  // devolve 1461 registros onde o ERP devolve 851.
  const corpo = {
    Classe: f.classe || "",
    ClasseProduto: "",
    Codigo: codigo,
    CodigoFabricante: f.fabricante || "",
    Descricao: descricao,
    Disponibilidade: f.disponibilidade ?? DISPONIBILIDADES_PADRAO,
    // O front do ERP manda "onEstoqueDisponivelFilialCorrente" (typo) e o backend
    // ignora. A grafia sem "on" é a que realmente filtra (235 vs 1461 registros).
    EstoqueDisponivelFilialCorrente: !!f.estoque_disponivel,
    EstoqueDisponivelOutrasFiliais: !!f.estoque_outras,
    EstoqueDisponivelCD: !!f.estoque_cd,
    Fornecedor: "",
    ModeloProduto: f.modelo || "",
    NomeFornecedor: "",
    NumeroPagina: pagina,
    Ordem: f.ordem || "ALFABETICA",
    ProdutoEmTransito: false,
    ProdutoOferta: !!f.oferta,
    Referencia: referencia,
    SistemaTintometrico: "",
    TamanhoPagina: tamanho,
    TextoTecnico: f.texto_tecnico || "",
    TipoFiltroEstoque: null,
  };
  return emCache(`pesq:${JSON.stringify(corpo)}`, async () => {
    const data = await erpPost("/Produto/Pesquisar", corpo);
    // A paginação do ERP vem em PageCount/RowsCount, não em "Total".
    const totalBruto = data.RowsCount ?? data.Total ?? data.TotalRegistros ?? data.TotalRows;
    return {
      itens: (data.Entities || []).map(mapEntidade),
      pagina,
      tamanho,
      total: totalBruto == null ? null : n(totalBruto),
      temProxima: data.IsLastPage === false || (data.PageCount != null ? pagina < n(data.PageCount) : null),
    };
  });
}

export async function erpBuscar(codigo = "", descricao = "") {
  return (await erpPesquisar({ codigo, descricao })).itens;
}

// O ERP sinaliza "nada encontrado" com um erro de domínio em vez de lista vazia.
// Sem isso, similares/agregados/ofertas de um produto comum estourariam 502.
function semRegistros(d: any) {
  return d?.SubType === "RegisterNotFoundException" || d?.ErrorType === "DomainLayerException";
}

/**
 * Lotes do produto. Endpoint idêntico ao que a tela do ERP chama.
 * `fresco` ignora o cache: o GET de /api/pontas deleta a ponta quando o lote
 * zera, então ali um dado velho apaga registro do usuário. Em todo o resto o
 * lote é só leitura de tela e o cache de 2min economiza ~1,5s por produto.
 */
export async function erpLotes(codigo: string, fresco = false) {
  if (fresco) return erpLotesBruto(codigo);
  return emCache(`lotes:${codigo}`, () => erpLotesBruto(codigo));
}

async function erpLotesBruto(codigo: string) {
  const data = await erpPost("/Produto/ObterDadosLotesProdutoConsulta", {
    filtros: { CodigoProduto: String(codigo), Filial: null, NumeroPagina: 1, TamanhoPagina: 20 },
  });
  // Lança em vez de devolver []: quem chama trata erro como "ERP fora do ar" e mantém
  // o último estoque conhecido. Retornar [] seria lido como estoque zerado e apagaria a ponta.
  if (data.Error) throw new Error(data.ErrorMessage || data.Error || "Erro ao listar lotes");
  if (!data.Lotes) throw new Error("Resposta do ERP sem lista de lotes");
  return (data.Lotes.Entities || []).map((l: any) => ({
    lote: String(l.Lote || "").trim(),
    filial: l.CodigoFilial,
    disponivel: l.QuantidadeDisponivelVenda || 0,
    situacao: l.Situacao,
  }));
}

/** Estoque do produto por filial (01–04). */
export async function erpEstoquePorFilial(codigo: string) {
  return emCache(`estoque:${codigo}`, async () => {
    const data = await erpPost("/Produto/ObterDadosEstoque", {
      pesquisa: { Codigo: String(codigo), NumeroPagina: 1, RetornaTodasAsFiliais: true, TamanhoPagina: 20 },
    });
    if (semRegistros(data)) return [];
    return (data.Entities || []).map((e: any) => ({
      filial: t(e.Filial),
      quantidade: n(e.Quantidade),
      disponivel: n(e.QuantidadeDisponivel),
      disponivel_lote: n(e.QuantidadeDisponivelLote),
      reservado: n(e.QuantidadeReservado),
      transito: n(e.QuantidadeEmTransito),
      local: t(e.LocalFisico),
    }));
  });
}

/** Produtos similares. */
export async function erpSimilares(codigo: string) {
  return emCache(`similares:${codigo}`, async () => {
    const data = await erpPost("/Produto/ConsultarSimilares", {
      pesquisaProdutoContract: { Codigo: String(codigo), NumeroPagina: 1, TamanhoPagina: 20 },
    });
    if (semRegistros(data)) return [];
    return (data.Entities || []).map(mapEntidade);
  });
}

/** Produtos agregados (mesmo item em outra embalagem/medida). */
export async function erpAgregados(codigo: string) {
  return emCache(`agregados:${codigo}`, async () => {
    const data = await erpPost("/Produto/ConsultarAgregados", {
      pesquisaProdutoContract: { Codigo: String(codigo), NumeroPagina: 1, TamanhoPagina: 20 },
    });
    if (semRegistros(data)) return [];
    return (data.Entities || []).map(mapEntidade);
  });
}

/** Ofertas vigentes do produto. */
export async function erpOfertas(codigo: string) {
  return emCache(`ofertas:${codigo}`, async () => {
    const data = await erpPost("/Produto/DadosOfertas", {
      filtros: { CodigoProduto: String(codigo), NumeroPagina: 1, TamanhoPagina: 20 },
    });
    if (semRegistros(data)) return [];
    return (data.Dados?.Entities || []).map((o: any) => ({
      descricao: t(o.Descricao),
      inicio: t(o.DataInicial),
      fim: t(o.DataFinal),
      filiais: (o.Filiais || []).map((fi: any) => t(fi.Codigo)),
    }));
  });
}

/** Opções de disponibilidade (filtro multi-select da tela do ERP). */
export async function erpDisponibilidades() {
  // ~10s no ERP real e o conjunto não muda durante a sessão — o TTL longo aqui é o
  // que evita a tela de consulta "pensar" 10s toda vez que o filtro é aberto.
  return emCache("disponibilidades", erpDisponibilidadesBruto, 30 * 60 * 1000);
}

async function erpDisponibilidadesBruto() {
  const data = await erpGet("/Produto/ObterDisponibilidades");
  return (Array.isArray(data) ? data : []).map((d: any) => ({
    codigo: t(d.Codigo),
    nome: t(d.Nome),
    selecionado: n(d.Selecionado) === 1,
  }));
}

/**
 * ============================================================================
 * ENDPOINTS DO SERVIDOR API (9990)
 * ============================================================================
 * Estes endpoints usam o token da API (diferente do token do app 9999)
 * e são chamados via Authorization: Bearer {apiToken}
 */

interface ApiRequestOptions {
  method?: "GET" | "POST";
  body?: unknown;
  params?: Record<string, string | number | boolean | undefined | null>;
}

/** Faz requisição para o servidor API (9990) com token Bearer. */
async function apiRequest(path: string, options: ApiRequestOptions = {}): Promise<any> {
  const token = getApiToken();
  if (!token) throw new Error("Token da API não disponível. Faça login novamente.");

  const { method = "GET", body, params } = options;
  const url = new URL(API + path);
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    });
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  const doReq = async () => {
    const r = await fetch(url.toString(), {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(TIMEOUT),
    });
    const texto = await r.text();
    const t = texto.trim();
    if (!t.startsWith("{") && !t.startsWith("[")) throw new Error("sessao-api-expirada");
    return JSON.parse(t);
  };

  try {
    return await doReq();
  } catch (e: any) {
    // Se token expirou, tenta buscar novo token da home
    if (e?.message === "sessao-api-expirada") {
      await fetchApiToken();
      const newToken = getApiToken();
      if (newToken) {
        headers.Authorization = `Bearer ${newToken}`;
        return await doReq();
      }
    }
    throw e;
  }
}

/** Grid Controller - Obter configuração de grid */
export async function apiGridObter(codigoUsuario: number, modulo: string, nomeGrid: string) {
  return apiRequest("/api/seguranca/grid/obter", {
    params: { codigoUsuario, modulo, nomeGrid, token: getApiToken() },
  });
}

/** Grid Controller - Atualizar configuração de grid */
export async function apiGridAtualizar(codigoUsuario: number, modulo: string, nomeGrid: string, colunas: any[]) {
  return apiRequest("/api/seguranca/grid/atualizar", {
    method: "POST",
    body: { codigoUsuario, modulo, nomeGrid, token: getApiToken(), colunas },
  });
}

/** Orçamento - Criar novo orçamento */
export async function apiOrcamentoCriar(codigoUsuario: number, modulo: string, nomeGrid: string) {
  return apiRequest("/api/venda/orcamento/criar", {
    method: "POST",
    params: { codigoUsuario, modulo, nomeGrid, token: getApiToken() },
  });
}

/** Orçamento - Definir controle de exclusividade */
export async function apiOrcamentoDefinirControleExclusividade(
  numeroPedido: number,
  codigoSituacaoManutencao: number
) {
  return apiRequest("/api/venda/orcamento/definirControleExclusividade", {
    method: "POST",
    params: { numeroPedido, codigoSituacaoManutencao, token: getApiToken() },
  });
}

/** Orçamento - Remover controle de exclusividade */
export async function apiOrcamentoRemoverControleExclusividade(
  numeroPedido: number,
  ehParaCheckoutMovel: boolean,
  removerOidFilial: boolean
) {
  return apiRequest("/api/venda/orcamento/removerControleExclusividade", {
    method: "POST",
    params: { numeroPedido, ehParaCheckoutMovel, removerOidFilial, token: getApiToken() },
  });
}

/** Orçamento - Gerar PDF template padrão */
export async function apiOrcamentoGerarPdfTemplatePadrao(
  numero: number,
  siglaFuncionalidade: string,
  siglaAcao: string
) {
  return apiRequest("/api/venda/orcamento/gerarpdftemplatepadrao", {
    params: { numero, siglaFuncionalidade, siglaAcao, token: getApiToken() },
  });
}

/** Comum - Obter parâmetro chave movimentação */
export async function apiComumObterParametroChaveMovimentacao() {
  return apiRequest("/api/comum/ObterParametroChaveMovimentacao", {
    params: { token: getApiToken() },
  });
}

/** Comum - Validar CPF/CNPJ */
export async function apiComumValidarCpfCnpj(numeroCpfCnpj: string, validarCnpjCpfCadastrado: boolean) {
  return apiRequest("/api/comum/ValidarCpfCnpj", {
    method: "POST",
    params: { numeroCpfCnpj, validarCnpjCpfCadastrado, token: getApiToken() },
  });
}

/** Comum - Validar data */
export async function apiComumValidateDate(date: string) {
  return apiRequest("/api/comum/ValidateDate", {
    method: "POST",
    params: { date, token: getApiToken() },
  });
}

/** Comum - Validar Int32 */
export async function apiComumValidateInt32(value: number) {
  return apiRequest("/api/comum/ValidateInt32", {
    method: "POST",
    params: { value, token: getApiToken() },
  });
}

/** Comum - Obter URL logout sistema segurança */
export async function apiComumObterUrlLogoutSistemaSeguranca() {
  return apiRequest("/api/comum/ObterUrlLogoutSistemaSeguranca", {
    params: { token: getApiToken() },
  });
}

/** Comum - Verificar permissão usuário para funcionalidade/ação */
export async function apiComumUsuarioPermitidoFuncionalidadeAcao(funcionalidade: string, acao: string) {
  return apiRequest("/api/comum/UsuarioPermitidoFuncionalidadeAcao", {
    method: "POST",
    params: { funcionalidade, acao, token: getApiToken() },
  });
}

/** Segurança - Renovar sessão aplicativo */
export async function apiSegurancaRenovarSessaoAplicativo() {
  return apiRequest("/api/seguranca/renovarSessaoAplicativo", {
    params: { token: getApiToken() },
  });
}

/** Vendedor - Autenticar vendedor (senha vendedor) */
export async function apiVendedorAutenticar2(senhaVendedor: string, loginParaCriarAlterarOrcamento: boolean) {
  return apiRequest("/Vendedor/Autenticar2", {
    method: "POST",
    params: { SenhaVendedor: senhaVendedor, loginParaCriarAlterarOrcamento, token: getApiToken() },
  });
}

/** Vendedor - Alterar senha */
export async function apiVendedorAlterarSenha(senhaAtual: string, novaSenha: string) {
  return apiRequest("/Vendedor/AlterarSenha", {
    method: "POST",
    params: { senhaAtual, novaSenha, token: getApiToken() },
  });
}

/** Vendedor - Obter vendedor gerente */
export async function apiVendedorVendedorGerente(codigoVendedor: number) {
  return apiRequest("/Vendedor/VendedorGerente", {
    params: { codigoVendedor, token: getApiToken() },
  });
}

/** Vendedor - Obter vendedor autenticado */
export async function apiVendedorObterVendedorAutenticado() {
  return apiRequest("/Vendedor/ObterVendedorAutenticado", {
    params: { token: getApiToken() },
  });
}

/** Vendedor - Listar filiais orçamento */
export async function apiVendedorListarFiliaisOrcamento() {
  return apiRequest("/Vendedor/ListarFiliaisOrcamento", {
    method: "POST",
    params: { token: getApiToken() },
  });
}

/** Vendedor - Listar por nome */
export async function apiVendedorListarPorNome(nome: string) {
  return apiRequest("/Vendedor/ListarPorNome", {
    method: "POST",
    params: { nome, token: getApiToken() },
  });
}

/** Cliente - Pesquisar */
export async function apiClientePesquisar(filtros: any) {
  return apiRequest("/Cliente/Pesquisar", {
    method: "POST",
    body: { ...filtros, token: getApiToken() },
  });
}

/** Cliente - Salvar */
export async function apiClienteSalvar(dados: any) {
  return apiRequest("/Cliente/Salvar", {
    method: "POST",
    body: { ...dados, token: getApiToken() },
  });
}

/** Produto - Pesquisar */
export async function apiProdutoPesquisar(filtros: any) {
  return apiRequest("/Produto/Pesquisar", {
    method: "POST",
    body: { ...filtros, token: getApiToken() },
  });
}

/** Produto - Obter dados estoque */
export async function apiProdutoObterDadosEstoque(codigo: string) {
  return apiRequest("/Produto/ObterDadosEstoque", {
    method: "POST",
    body: { pesquisa: { Codigo: codigo, NumeroPagina: 1, RetornaTodasAsFiliais: true, TamanhoPagina: 20 }, token: getApiToken() },
  });
}

/** Produto - Obter dados lotes produto consulta */
export async function apiProdutoObterDadosLotesProdutoConsulta(codigo: string) {
  return apiRequest("/Produto/ObterDadosLotesProdutoConsulta", {
    method: "POST",
    body: { filtros: { CodigoProduto: codigo, Filial: null, NumeroPagina: 1, TamanhoPagina: 20 }, token: getApiToken() },
  });
}

/** Produto - Obter markup pesquisa produtos */
export async function apiProdutoObterMarkupPesquisaProdutos() {
  return apiRequest("/Produto/ObterMarkupPesquisaProdutos", {
    params: { token: getApiToken() },
  });
}

/** Cupom Desconto - Buscar todas campanhas descontos válidas */
export async function apiCupomDescontoBuscarTodasCampanhasDescontosValidas() {
  return apiRequest("/CupomDesconto/BuscarTodasCampanhasDescontosValidas", {
    method: "POST",
    params: { token: getApiToken() },
  });
}

/** Cupom Desconto - Adicionar cupons orçamento */
export async function apiCupomDescontoAdicionarCuponsOrcamento(identificadorOrcamento: string) {
  return apiRequest("/CupomDesconto/AdicionarCuponsOrcamento", {
    method: "POST",
    params: { IdentificadorOrcamento: identificadorOrcamento, token: getApiToken() },
  });
}

/** Agente Dia Util - Calcular previsão entrega orçamento */
export async function apiAgenteDiaUtilCalcularPrevisaoEntregaOrcamento(codigoFilial: number) {
  return apiRequest("/AgenteDiaUtil/CalcularPrevisaoEntregaOrcamento", {
    params: { codigoFilial, token: getApiToken() },
  });
}

/** Atendimento Cliente - Pesquisar */
export async function apiAtendimentoClientePesquisar(filtros: any) {
  return apiRequest("/AtendimentoCliente/Pesquisar", {
    method: "POST",
    body: { ...filtros, token: getApiToken() },
  });
}

/** Upload de anexos (multipart/form-data) */
export async function apiComumEmailAnexos(formData: FormData) {
  const token = getApiToken();
  if (!token) throw new Error("Token da API não disponível. Faça login novamente.");

  const url = new URL(API + "/api/comum/email/anexos");
  url.searchParams.set("token", token);

  const r = await fetch(url.toString(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
    signal: AbortSignal.timeout(TIMEOUT),
  });
  const texto = await r.text();
  const t = texto.trim();
  if (!t.startsWith("{") && !t.startsWith("[")) throw new Error("sessao-api-expirada");
  return JSON.parse(t);
}