"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { categoria, tituloLimpo } from "@/lib/produto";
import { Ic, Sidebar, Toasts, Topbar, ico, useEsc, type Toast } from "@/lib/ui";
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
  // m² por caixa (de/até) e quantidade mínima de caixas. O ERP não filtra por
  // nenhum desses: quem filtra é o servidor, varrendo o catálogo inteiro
  // (lib/catalogo.ts). Por isso a busca precisa ser reenviada ao mudar o campo.
  m2_min: string;
  m2_max: string;
  cx_min: string;
};

const VAZIO: Filtros = {
  codigo: "",
  referencia: "",
  descricao: "",
  ordem: "ALFABETICA",
  estoque: false,
  estoque_outras: false,
  estoque_cd: false,
  m2_min: "",
  m2_max: "",
  cx_min: "",
};

const TAMANHO_PAGINA = 20;
const vazio = "—";

const ORDENS = [
  { id: "ALFABETICA", rotulo: "Alfabética" },
  { id: "CODIGO", rotulo: "Código" },
  { id: "CLASSE", rotulo: "Classe" },
  { id: "CODIGOFABRICANTE", rotulo: "Código Fabricante" },
];

const CHECKS: { id: "estoque" | "estoque_outras" | "estoque_cd"; rotulo: string; idDom: string }[] = [
  { id: "estoque", rotulo: "Estoque na filial", idDom: "PesquisaProdutos_EstoqueDisponivelFilialCorrente" },
  { id: "estoque_outras", rotulo: "Outras filiais", idDom: "PesquisaProdutos_EstoqueDisponivelOutrasFiliais" },
  { id: "estoque_cd", rotulo: "CD (centro de distribuição)", idDom: "PesquisaProdutos_EstoqueDisponivelCD" },
];

function num(n: number | undefined) {
  return (n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
}

function dinheiro(n: number | undefined) {
  if (!n) return "—";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// "2,43" e "2.43" são a mesma metragem; string vazia é "sem filtro" (null, não 0).
function numero(s: string): number | null {
  const v = parseFloat(String(s).trim().replace(",", "."));
  return isNaN(v) ? null : v;
}

export default function ConsultaPage() {
  const router = useRouter();
  const [filtros, setFiltros] = useState<Filtros>(VAZIO);
  const [itens, setItens] = useState<Item[] | null>(null);
  const [pagina, setPagina] = useState(1);
  const [total, setTotal] = useState<number | null>(null);
  const [temProxima, setTemProxima] = useState<boolean | null>(null);
  const [varridos, setVarridos] = useState<number | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [erro, setErro] = useState("");
  const [usuario, setUsuario] = useState("");
  const [detalhe, setDetalhe] = useState<Item | null>(null);
  const [lotes, setLotes] = useState<Lote[] | null>(null);
  const [lotesErro, setLotesErro] = useState("");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [menuAberto, setMenuAberto] = useState(false);

  useEsc(() => setDetalhe(null), !!detalhe);
  useEsc(() => setMenuAberto(false), menuAberto);

  const toast = useCallback((tipo: Toast["tipo"], titulo: string, desc?: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, tipo, titulo, desc }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);

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
        if (filtros.m2_min) q.set("m2_min", filtros.m2_min);
        if (filtros.m2_max) q.set("m2_max", filtros.m2_max);
        if (filtros.cx_min) q.set("cx_min", filtros.cx_min);
        const resp = await fetch("/api/buscar?" + q);
        const d = await resp.json().catch(() => ({}));
        if (resp.status === 401) {
          sessionStorage.removeItem("ponta_usuario");
          router.replace("/");
          return;
        }
        // A sessão do ERP vive no servidor e morre quando o ASP.NET reinicia.
        // Não é erro de rede: pedir para sair e entrar resolve.
        if (resp.status === 502 && /sessao|sessão/i.test(d?.erro || "")) {
          setErro("Sessão do ERP expirou. Saia e entre novamente.");
          setItens([]);
          return;
        }
        if (!resp.ok) throw new Error(d.erro || "falha na consulta");
        setItens(d.itens || []);
        setTotal(typeof d.total === "number" ? d.total : null);
        setTemProxima(typeof d.temProxima === "boolean" ? d.temProxima : null);
        setVarridos(typeof d.varridos === "number" ? d.varridos : null);
        setErro("");
      } catch (e: any) {
        setItens([]);
        setErro(e?.message || "não foi possível consultar o ERP");
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
      setErro("Informe ao menos código, referência ou descrição.");
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

  function limpar() {
    setFiltros(VAZIO);
    setPagina(1);
    setItens(null);
    setErro("");
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
      setLotesErro(e?.message || "não foi possível listar os lotes");
    }
  }

  async function sair() {
    try {
      await fetch("/api/logout", { method: "POST" });
    } catch {}
    sessionStorage.removeItem("ponta_usuario");
    router.replace("/");
  }

  // O ERP nem sempre devolve todas as colunas: se nenhum produto da página tem
  // preço, mostrar a linha "Preço unit." em todo card vira ruído repetido 20
  // vezes. Só renderiza o campo que tem dado em algum lugar da página.
  const cols = useMemo(() => {
    const lista = itens || [];
    return {
      preco: lista.some((i) => (i.preco_unitario || 0) > 0),
      classe: lista.some((i) => !!i.classe),
      medida: lista.some((i) => !!i.medida),
      m2cx: lista.some((i) => (i.m2_caixa || 0) > 0),
      total: lista.some((i) => (i.estoque_total || 0) > 0),
      cd: lista.some((i) => (i.estoque_cd || 0) > 0),
      outras: lista.some((i) => (i.estoque_outras || 0) > 0),
      fornecedor: lista.some((i) => !!i.fornecedor),
      classeValores: Array.from(new Set(lista.map((i) => i.classe).filter(Boolean))).sort() as string[],
    };
  }, [itens]);

  const checksAtivos = (filtros.estoque ? 1 : 0) + (filtros.estoque_cd ? 1 : 0) + (filtros.estoque_outras ? 1 : 0);
  const temFiltro = !!(
    filtros.codigo ||
    filtros.referencia ||
    filtros.descricao ||
    filtros.ordem !== "ALFABETICA" ||
    checksAtivos ||
    filtros.m2_min ||
    filtros.m2_max ||
    filtros.cx_min
  );
  const cxMinNum = numero(filtros.cx_min);
  const temFiltroCaixa = numero(filtros.m2_min) != null || numero(filtros.m2_max) != null || cxMinNum != null;

  return (
    <div className={"shell" + (menuAberto ? " shell--drawer" : "")}>
      <Sidebar
        mini={false}
        usuario={usuario}
        ativo="consulta"
        onNavegar={(r) => {
          setMenuAberto(false);
          router.push(r);
        }}
      />
      {menuAberto && <button type="button" className="sidebar-fundo" onClick={() => setMenuAberto(false)} aria-label="Fechar menu" />}

      <div className="main">
        <Topbar titulo="Consulta de Produtos" subtitulo={usuario ? `Olá, ${usuario}` : undefined} onAbrirMenu={() => setMenuAberto(true)}>
          <button type="button" className="btn" onClick={() => router.push("/sistema")}>
            <Ic d={ico.seta_esq} /> <span className="rotulo">Voltar ao Estoque</span>
          </button>
          <div className="topbar-sep" />
          <details className="menu-usuario">
            <summary className="btn-icone" title="Usuário" aria-label="Usuário">
              <Ic d={ico.usuario} />
            </summary>
            <div className="menu-lista">
              <button
                type="button"
                className="menu-item"
                onClick={() => toast("info", "Perfil", "Sessão de " + (usuario || "—"))}
              >
                <Ic d={ico.usuario} /> Perfil
              </button>
              <button type="button" className="menu-item perigo" onClick={sair}>
                <Ic d={ico.sair} /> Sair
              </button>
            </div>
          </details>
        </Topbar>

        <main className="page">
          <div className="pg-topo">
            <div>
              <h2>Consulta de Produtos</h2>
              <p>Busque produtos direto no ERP por código, referência ou descrição.</p>
            </div>
            <div className="pg-topo-dir">
              <span className={"pill " + (erro ? "pill--bad" : itens ? "pill--ok" : "pill--idle")}>
                {erro ? "Erro" : itens ? `${itens.length} na página` : "Aguardando busca"}
              </span>
            </div>
          </div>

          {/* ---- Filtros ---- */}
          <form className="filtros" onSubmit={onSubmit}>
            <div className="filtros-linha">
              <div className="campo">
                <label htmlFor="PesquisaProdutos_Codigo">Código</label>
                <input
                  id="PesquisaProdutos_Codigo"
                  name="Codigo"
                  autoComplete="off"
                  maxLength={5}
                  inputMode="numeric"
                  placeholder="12345"
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
                  placeholder="Ref. do fabricante"
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
                  placeholder="piso, porcelanato…"
                  value={filtros.descricao}
                  onChange={(e) => set("descricao", e.target.value)}
                />
              </div>
              <div className="campo">
                <label htmlFor="PesquisaProdutos_Ordem">Ordenar por</label>
                <select
                  id="PesquisaProdutos_Ordem"
                  name="Ordem"
                  value={filtros.ordem}
                  onChange={(e) => set("ordem", e.target.value)}
                >
                  {ORDENS.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.rotulo}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="filtros-checks">
              {CHECKS.map((c) => (
                <label className="check" key={c.id}>
                  <input
                    type="checkbox"
                    id={c.idDom}
                    checked={filtros[c.id]}
                    onChange={(e) => set(c.id, e.target.checked)}
                  />
                  {c.rotulo}
                </label>
              ))}
            </div>

            <div className="filtros-linha">
              <div className="campo">
                <label htmlFor="FiltroM2Min">m² por caixa (de)</label>
                <input
                  id="FiltroM2Min"
                  inputMode="decimal"
                  placeholder="2,00"
                  value={filtros.m2_min}
                  onChange={(e) => set("m2_min", e.target.value.replace(/[^\d.,]/g, ""))}
                />
              </div>
              <div className="campo">
                <label htmlFor="FiltroM2Max">m² por caixa (até)</label>
                <input
                  id="FiltroM2Max"
                  inputMode="decimal"
                  placeholder="2,50"
                  value={filtros.m2_max}
                  onChange={(e) => set("m2_max", e.target.value.replace(/[^\d.,]/g, ""))}
                />
              </div>
              <div className="campo">
                <label htmlFor="FiltroCxMin">Mínimo de caixas em estoque</label>
                <input
                  id="FiltroCxMin"
                  inputMode="decimal"
                  placeholder="10"
                  value={filtros.cx_min}
                  onChange={(e) => set("cx_min", e.target.value.replace(/[^\d.,]/g, ""))}
                />
              </div>
              <div className="campo" style={{ flex: "2 1 260px" }}>
                <small className="dica">
                  O ERP não filtra por m² nem por caixas. Estes campos fazem o servidor varrer
                  todo o resultado da busca e filtrar em memória — a primeira busca leva alguns
                  segundos, as seguintes usam cache. Clique em <b>Pesquisar</b> depois de mexer
                  aqui.
                </small>
              </div>
            </div>

            <div className="filtros-acoes">
              <button type="submit" className="btn" disabled={buscando}>
                <Ic d={ico.busca} /> {buscando ? "Pesquisando…" : "Pesquisar"}
              </button>
              <button type="button" className="btn secundario" onClick={limpar} disabled={!temFiltro && !itens}>
                Limpar
              </button>
              {itens && total != null && (
                <span className="paginacao-info" style={{ marginLeft: "auto", alignSelf: "center" }}>
                  <b>{itens.length}</b> de <b>{total}</b> produtos
                </span>
              )}
            </div>
          </form>

          {erro && <div className="mensagem erro">{erro}</div>}

          {/* ---- Resultados ---- */}
          {itens && !erro && (
            <div className="painel">
              <div className="painel-topo">
                <span>
                  {varridos != null && varridos > 0 ? (
                    <>
                      <b>{total}</b> {total === 1 ? "produto" : "produtos"} com o filtro de m²/caixas ·{" "}
                      <b>{varridos}</b> analisados
                    </>
                  ) : (
                    <>
                      Resultados da consulta · <b>{itens.length}</b>{" "}
                      {itens.length === 1 ? "produto" : "produtos"} na página{" "}
                      {total != null && <>de <b>{total}</b> no ERP</>}
                    </>
                  )}
                </span>
                {buscando && (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                    <div className="spinner" />{" "}
                    {temFiltroCaixa ? "varrendo o catálogo no ERP (pode demorar)…" : "consultando…"}
                  </span>
                )}
              </div>

              <div className="cards" id="resultados">
                {(itens || []).map((i) => {
                  const estoque = i.estoque || 0;
                  const disponivel = estoque > 0;
                  return (
                    <article key={i.codigo} className="card card--erp">
                      <div className="card-media card-media--baixa">
                        <div className="card-media-erp">
                          <span className="card-media-erp-titulo">{tituloLimpo(i.descricao) || "—"}</span>
                          <span className="card-media-erp-cat">{categoria(i.descricao)}</span>
                        </div>
                        <span className={"badge badge-sobre " + (disponivel ? "badge--ok" : "badge--idle")}>
                          {disponivel ? "Disponível" : "Sem estoque"}
                        </span>
                      </div>

                      <div className="card-corpo">
                        <div>
                          <h3 className="card-nome">{tituloLimpo(i.descricao) || vazio}</h3>
                          <div className="card-ref">
                            Cód. {i.codigo}
                            {i.referencia ? ` · Ref. ${i.referencia}` : ""}
                          </div>
                        </div>

                        <div className="card-tags">
                          {cols.medida && i.medida && <span className="tag">{i.medida}</span>}
                          {i.unidade && <span className="tag">{i.unidade}</span>}
                          {cols.classe && i.classe && <span className="tag tag--forte">{i.classe}</span>}
                          {i.marca && <span className="tag">{i.marca}</span>}
                        </div>

                        <div className="metricas">
                          <div className="metrica metrica--destaque">
                            <div className="metrica-rotulo">Estoque na filial</div>
                            <div className="metrica-valor">
                              {num(estoque)} <small>{i.unidade || "un"}</small>
                            </div>
                          </div>
                          {cols.preco && (
                            <div className="metrica metrica--caixa">
                              <div className="metrica-rotulo">Preço unit.</div>
                              <div className="metrica-valor" style={{ fontSize: 18 }}>
                                {dinheiro(i.preco_unitario)}
                              </div>
                            </div>
                          )}
                          {cols.m2cx && i.m2_caixa ? (
                            <div className="metrica">
                              <div className="metrica-rotulo">Caixa</div>
                              <div className="metrica-valor">{num(i.m2_caixa)} m²</div>
                              {cxMinNum != null && estoque > 0 && (
                                <div className="metrica-valor" style={{ fontSize: 13, color: "var(--txt-3)" }}>
                                  ≈ {num(estoque / (i.m2_caixa || 1))} cx
                                </div>
                              )}
                            </div>
                          ) : null}
                          {cols.total && (i.estoque_total || 0) > 0 && (
                            <div className="metrica">
                              <div className="metrica-rotulo">Est. total</div>
                              <div className="metrica-valor" style={{ color: "var(--ok)" }}>
                                {num(i.estoque_total)}
                              </div>
                            </div>
                          )}
                          {cols.cd && (i.estoque_cd || 0) > 0 && (
                            <div className="metrica">
                              <div className="metrica-rotulo">CD</div>
                              <div className="metrica-valor">{num(i.estoque_cd)}</div>
                            </div>
                          )}
                          {cols.outras && (i.estoque_outras || 0) > 0 && (
                            <div className="metrica">
                              <div className="metrica-rotulo">Outras filiais</div>
                              <div className="metrica-valor">{num(i.estoque_outras)}</div>
                            </div>
                          )}
                        </div>

                        {cols.preco && i.preco_vista ? (
                          <div className="divergencia divergencia--ok">
                            <Ic d={ico.moeda} /> À vista: {dinheiro(i.preco_vista)}
                          </div>
                        ) : null}

                        <div className="card-pe">
                          <span className="card-forn" title={i.fornecedor || ""}>
                            {cols.fornecedor ? i.fornecedor || vazio : i.classe || vazio}
                          </span>
                          <div className="card-acoes">
                            <button type="button" className="btn secundario mini" onClick={() => abrirLotes(i)}>
                              <Ic d={ico.camadas_min} /> Lotes
                            </button>
                          </div>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>

              {itens.length === 0 && (
                <div className="tabela-vazia">
                  {temFiltroCaixa
                    ? "Nenhum produto do ERP bate com esse filtro de m²/caixas. A busca acima já varreu todo o resultado — tente outro m² ou outra descrição."
                    : "Nenhum produto encontrado."}
                </div>
              )}

              {itens.length > 0 && (
                <div className="paginacao">
                  <span className="paginacao-info">
                    <b>{itens.length}</b> {itens.length === 1 ? "produto" : "produtos"}
                    {total != null && ` de ${total}`}
                  </span>
                  <div className="paginacao-botoes">
                    <button type="button" className="btn secundario mini" disabled={pagina <= 1 || buscando} onClick={() => irPara(pagina - 1)}>
                      <Ic d={ico.seta_esq} /> Anterior
                    </button>
                    <span className="paginacao-atual">
                      Página <b>{pagina}</b>
                      {total != null && ` de ${totalPaginas}`}
                    </span>
                    <button type="button" className="btn secundario mini" disabled={!podeAvancar || buscando} onClick={() => irPara(pagina + 1)}>
                      Próxima <Ic d={ico.seta_dir} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {!itens && !erro && !buscando && (
            <div className="vazio">
              <div className="vazio-icone">
                <Ic d={ico.lupa} />
              </div>
              <h3>Consulte o catálogo do ERP</h3>
              <p>Informe código, referência ou descrição e clique em Pesquisar para ver preços e estoque em tempo real.</p>
            </div>
          )}
        </main>
      </div>

      {detalhe && (
        <div className="modal" onClick={(e) => e.target === e.currentTarget && setDetalhe(null)}>
          <div className="modal-conteudo">
            <h2>
              <Ic d={ico.camadas} /> {detalhe.codigo} — {tituloLimpo(detalhe.descricao)}
            </h2>
            {lotesErro && <div className="aviso">{lotesErro}</div>}
            {!lotes && !lotesErro && (
              <div className="mensagem">
                <div className="spinner" />
                <div>Carregando lotes do ERP…</div>
              </div>
            )}
            {lotes && lotes.length === 0 && <div className="mensagem">Produto sem lotes (estoque único).</div>}
            {lotes && lotes.length > 0 && (
              <div className="metric-row">
                {lotes.map((l) => (
                  <div className="metrica" key={l.lote + (l.filial || "")}>
                    <div className="metrica-rotulo">{l.filial ? "Filial " + l.filial : "Lote"}</div>
                    <div className="metrica-valor" style={{ fontSize: 19 }}>
                      {l.lote}
                    </div>
                    <div className="metrica-valor" style={{ fontSize: 15, color: "var(--ok)", marginTop: 2 }}>
                      {num(l.disponivel)} {detalhe.unidade || "m²"} disponíveis
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="modal-acoes">
              <button type="button" className="btn secundario" onClick={() => setDetalhe(null)}>
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      <Toasts itens={toasts} />
    </div>
  );
}
