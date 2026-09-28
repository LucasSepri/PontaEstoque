"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import "../sistema.css";

type Item = {
  codigo: string;
  descricao: string;
  referencia?: string;
  marca?: string;
  medida?: string;
  unidade?: string;
  estoque?: number;
  estoque_cd?: number;
  estoque_outras?: number;
  estoque_total?: number;
  preco_unitario?: number;
  preco_vista?: number;
  fornecedor?: string;
  disponibilidade?: string;
  classe?: string;
  local?: string;
  m2_caixa?: number;
};

type Lote = { lote: string; filial?: string; disponivel: number };

type Filtros = {
  codigo: string;
  referencia: string;
  descricao: string;
  ordem: string;
  estoque: boolean;
  estoque_outras: boolean;
  estoque_cd: boolean;
};

const VAZIO: Filtros = {
  codigo: "",
  referencia: "",
  descricao: "",
  ordem: "ALFABETICA",
  estoque: false,
  estoque_outras: false,
  estoque_cd: false,
};

const TAMANHO_PAGINA = 20;
const vazio = "—";

function num(n: number | undefined) {
  return (n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
}

function dinheiro(n: number | undefined) {
  if (!n) return "—";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function ConsultaPage() {
  const router = useRouter();
  const [filtros, setFiltros] = useState<Filtros>(VAZIO);
  const [itens, setItens] = useState<Item[] | null>(null);
  const [pagina, setPagina] = useState(1);
  const [total, setTotal] = useState<number | null>(null);
  const [temProxima, setTemProxima] = useState<boolean | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [erro, setErro] = useState("");
  const [usuario, setUsuario] = useState("");
  const [detalhe, setDetalhe] = useState<Item | null>(null);
  const [lotes, setLotes] = useState<Lote[] | null>(null);
  const [lotesErro, setLotesErro] = useState("");

  useEffect(() => {
    const u = sessionStorage.getItem("ponta_usuario");
    if (!u) {
      router.replace("/");
      return;
    }
    setUsuario(u);
  }, [router]);

  const set = <K extends keyof Filtros>(k: K, v: Filtros[K]) => {
    setFiltros((f) => ({ ...f, [k]: v }));
    setPagina(1);
  };

  // busca recebe a página explicitamente: ler `pagina` do estado dentro dela devolveria
  // sempre o valor antigo (o useCallback só recria depois do render), e a paginação
  // repetiria a página 1 indefinidamente.
  const buscar = useCallback(
    async (p: number) => {
      setBuscando(true);
      try {
        const q = new URLSearchParams({
          codigo: filtros.codigo,
          referencia: filtros.referencia,
          descricao: filtros.descricao,
          ordem: filtros.ordem,
          pagina: String(p),
          tamanho: String(TAMANHO_PAGINA),
        });
        if (filtros.estoque) q.set("estoque", "1");
        if (filtros.estoque_cd) q.set("estoque_cd", "1");
        if (filtros.estoque_outras) q.set("estoque_outras", "1");
        const resp = await fetch("/api/buscar?" + q);
        const d = await resp.json().catch(() => ({}));
        if (resp.status === 401) {
          sessionStorage.removeItem("ponta_usuario");
          router.replace("/");
          return;
        }
        if (resp.status === 502 && /sessao|sessão/i.test(d?.erro || "")) {
          setErro("⚠️ Sessão do ERP expirou. Saia e entre novamente.");
          setItens([]);
          return;
        }
        if (!resp.ok) throw new Error(d.erro || "falha na consulta");
        setItens(d.itens || []);
        setTotal(typeof d.total === "number" ? d.total : null);
        setTemProxima(typeof d.temProxima === "boolean" ? d.temProxima : null);
        setErro("");
      } catch (e: any) {
        setItens([]);
        setErro("⚠️ " + (e?.message || "não foi possível consultar o ERP"));
      } finally {
        setBuscando(false);
      }
    },
    [filtros, router]
  );

  const totalPaginas = total != null ? Math.max(1, Math.ceil(total / TAMANHO_PAGINA)) : 1;
  const podeAvancar = temProxima != null ? temProxima : (itens?.length || 0) >= TAMANHO_PAGINA;

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!filtros.codigo.trim() && !filtros.referencia.trim() && !filtros.descricao.trim()) {
      setErro("⚠️ Informe ao menos código, referência ou descrição.");
      setItens(null);
      return;
    }
    setPagina(1);
    buscar(1);
  }

  function irPara(p: number) {
    if (p < 1 || buscando) return;
    setPagina(p);
    buscar(p);
  }

  async function abrirLotes(p: Item) {
    setDetalhe(p);
    setLotes(null);
    setLotesErro("");
    try {
      const resp = await fetch("/api/lotes?codigo=" + encodeURIComponent(p.codigo));
      const d = await resp.json().catch(() => ({}));
      if (resp.status === 401) {
        sessionStorage.removeItem("ponta_usuario");
        router.replace("/");
        return;
      }
      if (!resp.ok) throw new Error(d.erro || "falha ao listar lotes");
      setLotes(d.lotes || []);
    } catch (e: any) {
      setLotes(null);
      setLotesErro("⚠️ " + (e?.message || "não foi possível listar os lotes"));
    }
  }

  async function sair() {
    try {
      await fetch("/api/logout", { method: "POST" });
    } catch {}
    sessionStorage.removeItem("ponta_usuario");
    router.replace("/");
  }

  const temEstoqueTotal = itens?.some((i) => (i.estoque_total || 0) > 0);
  const temEstoqueCD = itens?.some((i) => (i.estoque_cd || 0) > 0);
  const temEstoqueOutras = itens?.some((i) => (i.estoque_outras || 0) > 0);
  const temPreco = itens?.some((i) => (i.preco_unitario || 0) > 0);
  const temClasse = itens?.some((i) => !!i.classe);
  const temMedida = itens?.some((i) => !!i.medida);

  return (
    <>
      <div className="header">
        <h1>
          <span>🔎</span> Consulta de Produtos
        </h1>
        <div className="acoes">
          <span style={{ color: "var(--text-muted)", fontSize: 13, fontWeight: 500, marginRight: 4 }}>
            Olá, {usuario}
          </span>
          <button className="btn secundario" onClick={() => router.push("/sistema")}>
            ← Estoque
          </button>
          <button className="btn secundario sair" onClick={sair}>
            Sair
          </button>
        </div>
      </div>

      <div className="corpo">
        <form className="filtros glass" onSubmit={onSubmit}>
          <div className="filtros-linha">
            <div className="campo">
              <label htmlFor="PesquisaProdutos_Codigo">Código</label>
              <input
                id="PesquisaProdutos_Codigo"
                name="Codigo"
                autoComplete="off"
                maxLength={5}
                value={filtros.codigo}
                onChange={(e) => set("codigo", e.target.value.replace(/\D/g, ""))}
              />
            </div>
            <div className="campo">
              <label htmlFor="PesquisaProdutos_Referencia">Referência</label>
              <input
                id="PesquisaProdutos_Referencia"
                name="Referencia"
                autoComplete="off"
                maxLength={30}
                value={filtros.referencia}
                onChange={(e) => set("referencia", e.target.value)}
              />
            </div>
            <div className="campo">
              <label htmlFor="PesquisaProdutos_Descricao">Descrição</label>
              <input
                id="PesquisaProdutos_Descricao"
                name="Descricao"
                maxLength={100}
                placeholder="piso"
                value={filtros.descricao}
                onChange={(e) => set("descricao", e.target.value)}
              />
            </div>
            <div className="campo">
              <label htmlFor="PesquisaProdutos_Ordem">Ordem</label>
              <select
                id="PesquisaProdutos_Ordem"
                name="Ordem"
                value={filtros.ordem}
                onChange={(e) => set("ordem", e.target.value)}
              >
                <option value="ALFABETICA">Alfabética</option>
                <option value="CODIGO">Código</option>
                <option value="CLASSE">Classe</option>
                <option value="CODIGOFABRICANTE">Código Fabricante</option>
              </select>
            </div>
          </div>

          <div className="filtros-linha">
            <label className="check">
              <input
                type="checkbox"
                id="PesquisaProdutos_EstoqueDisponivelFilialCorrente"
                checked={filtros.estoque}
                onChange={(e) => set("estoque", e.target.checked)}
              />
              Estoque Disponível
            </label>
            <label className="check">
              <input
                type="checkbox"
                id="PesquisaProdutos_EstoqueDisponivelOutrasFiliais"
                checked={filtros.estoque_outras}
                onChange={(e) => set("estoque_outras", e.target.checked)}
              />
              Estoque Disponível Outras Filiais
            </label>
            <label className="check">
              <input
                type="checkbox"
                id="PesquisaProdutos_EstoqueDisponivelCD"
                checked={filtros.estoque_cd}
                onChange={(e) => set("estoque_cd", e.target.checked)}
              />
              Estoque Disponível CD
            </label>
          </div>

          <div className="filtros-acoes">
            <button type="submit" className="btn" disabled={buscando}>
              {buscando ? "Pesquisando..." : "Pesquisar"}
            </button>
            <button
              type="button"
              className="btn secundario"
              onClick={() => {
                setFiltros(VAZIO);
                setPagina(1);
                setItens(null);
                setErro("");
              }}
            >
              Limpar
            </button>
          </div>
        </form>

        {erro && <div className="mensagem erro">{erro}</div>}

        {itens && !erro && (
          <div className="tabela-wrap glass">
            <div className="cards">
              {itens.map((i) => (
                <article key={i.codigo} className="card" onClick={() => abrirLotes(i)}>
                  <header className="card-topo">
                    <span className="card-codigo">{i.codigo}</span>
                    <span className="card-ref">{i.referencia || vazio}</span>
                  </header>

                  <h3 className="card-desc">{i.descricao || vazio}</h3>

                  <div className="card-tags">
                    {temMedida && i.medida && <span className="tag">{i.medida}</span>}
                    {i.unidade && <span className="tag">{i.unidade}</span>}
                    {temClasse && i.classe && <span className="tag">{i.classe}</span>}
                  </div>

                  <dl className="card-dados">
                    {temPreco && (
                      <div>
                        <dt>Preço unit.</dt>
                        <dd>{dinheiro(i.preco_unitario)}</dd>
                      </div>
                    )}
                    {temPreco && (
                      <div>
                        <dt>Preço à vista</dt>
                        <dd className="destaque-verde">{dinheiro(i.preco_vista)}</dd>
                      </div>
                    )}
                    <div>
                      <dt>Est. filial</dt>
                      <dd>{num(i.estoque)}</dd>
                    </div>
                    {temEstoqueTotal && (i.estoque_total || 0) > 0 && (
                      <div>
                        <dt>Est. total</dt>
                        <dd className="forte destaque-verde">{num(i.estoque_total)}</dd>
                      </div>
                    )}
                    {temEstoqueCD && (i.estoque_cd || 0) > 0 && (
                      <div>
                        <dt>Est. CD</dt>
                        <dd>{num(i.estoque_cd)}</dd>
                      </div>
                    )}
                    {temEstoqueOutras && (i.estoque_outras || 0) > 0 && (
                      <div>
                        <dt>Outras filiais</dt>
                        <dd>{num(i.estoque_outras)}</dd>
                      </div>
                    )}
                    {i.m2_caixa ? (
                      <div>
                        <dt>Cx (m²)</dt>
                        <dd>{num(i.m2_caixa)}</dd>
                      </div>
                    ) : null}
                  </dl>

                  <footer className="card-pe">
                    <span className="card-forn" title={i.fornecedor || ""}>
                      {i.fornecedor || vazio}
                    </span>
                    <button
                      className="btn mini"
                      title="Ver lotes"
                      onClick={(e) => {
                        e.stopPropagation();
                        abrirLotes(i);
                      }}
                    >
                      Lotes
                    </button>
                  </footer>
                </article>
              ))}
            </div>

            {itens.length === 0 && <div className="tabela-vazia">Nenhum produto encontrado.</div>}

            {itens.length > 0 && (
              <div className="paginacao">
                <span className="paginacao-info">
                  {itens.length} {itens.length === 1 ? "produto" : "produtos"}
                  {total != null && ` de ${total}`}
                </span>
                <div className="paginacao-botoes">
                  <button className="btn secundario" disabled={pagina <= 1 || buscando} onClick={() => irPara(pagina - 1)}>
                    ‹ Anterior
                  </button>
                  <span className="paginacao-atual">
                    Página <b>{pagina}</b>
                    {total != null && ` de ${totalPaginas}`}
                  </span>
                  <button className="btn secundario" disabled={!podeAvancar || buscando} onClick={() => irPara(pagina + 1)}>
                    Próxima ›
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {!itens && !erro && !buscando && (
          <div className="mensagem">
            Preencha os filtros acima e clique em <b>Pesquisar</b>.
          </div>
        )}
      </div>

      {detalhe && (
        <div className="modal" onClick={(e) => e.target === e.currentTarget && setDetalhe(null)}>
          <div className="modal-conteudo glass">
            <h2>
              {detalhe.codigo} — {detalhe.descricao}
            </h2>
            {lotesErro && <div className="aviso">{lotesErro}</div>}
            {!lotes && !lotesErro && (
              <div className="mensagem">
                <div className="spinner"></div>
                <div>Carregando lotes do ERP…</div>
              </div>
            )}
            {lotes && lotes.length === 0 && <div className="mensagem">Produto sem lotes (estoque único).</div>}
            {lotes &&
              lotes.map((l) => (
                <div key={l.lote + (l.filial || "")} className="metric-row">
                  <span>
                    {l.lote}
                    {l.filial ? ` · filial ${l.filial}` : ""}
                  </span>
                  <strong className="destaque-verde">{num(l.disponivel)} m²</strong>
                </div>
              ))}
            <div className="modal-acoes">
              <button className="btn secundario" onClick={() => setDetalhe(null)}>
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
