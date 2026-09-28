import { NextResponse } from "next/server";
import { m2PorCaixa } from "@/lib/m2caixa";

const ERP = process.env.ERP_URL || "http://177.185.46.243:9999";
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
}

// Cookie jar do ERP. Em globalThis pelo mesmo motivo da sessão: sobrevive ao HMR.
const jar = (globalThis as unknown as { __pontaCookies?: Map<string, string> }).__pontaCookies ?? new Map<string, string>();
(globalThis as unknown as { __pontaCookies?: Map<string, string> }).__pontaCookies = jar;
const COOKIES = jar;

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

export function json(obj: unknown, status = 200) {
  return NextResponse.json(obj, { status });
}

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

export type FiltroProduto = {
  codigo?: string;
  referencia?: string;
  descricao?: string;
  ordem?: string;
  estoque_disponivel?: boolean;
  estoque_cd?: boolean;
  estoque_outras?: boolean;
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

  // Código numérico busca o produto exato (PesquisarUnicoProduto, como o modal de
  // cadastro usa). Sem ele, /Produto/Pesquisar aceita código+referência+descrição
  // combinados e pagina de verdade.
  if (/^\d+$/.test(codigo)) {
    const data = await erpPost("/Produto/PesquisarUnicoProduto", {
      codigoOuReferencia: codigo,
      NumeroPagina: 1,
      TamanhoPagina: 20,
      identificadorOrcamento: null,
    });
    return { itens: (data.Entities || []).map(mapEntidade), pagina: 1, tamanho: 20, total: null, temProxima: false };
  }

  const data = await erpPost("/Produto/Pesquisar", {
    Codigo: codigo,
    Referencia: referencia,
    Descricao: descricao,
    EstoqueDisponivelFilialCorrente: !!f.estoque_disponivel,
    EstoqueDisponivelOutrasFiliais: !!f.estoque_outras,
    EstoqueDisponivelCD: !!f.estoque_cd,
    Ordem: f.ordem || "ALFABETICA",
    NumeroPagina: pagina,
    TamanhoPagina: tamanho,
  });
  // A paginação do ERP vem em PageCount/RowsCount, não em "Total".
  const totalBruto = data.RowsCount ?? data.Total ?? data.TotalRegistros ?? data.TotalRows;
  return {
    itens: (data.Entities || []).map(mapEntidade),
    pagina,
    tamanho,
    total: totalBruto == null ? null : n(totalBruto),
    temProxima: data.IsLastPage === false || (data.PageCount != null ? pagina < n(data.PageCount) : null),
  };
}

export async function erpBuscar(codigo = "", descricao = "") {
  return (await erpPesquisar({ codigo, descricao })).itens;
}

export async function erpLotes(codigo: string) {
  const data = await erpPost("/Produto/ListarLotesProduto", {
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