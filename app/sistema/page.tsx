
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { m2PorCaixa as m2Caixa } from "@/lib/m2caixa";
import {
  CATEGORIAS,
  categoria,
  contarCategorias,
  statusEstoque,
  tituloLimpo,
  type StatusEstoque,
} from "@/lib/produto";
import { Ic, Sidebar, Toasts, Topbar, ico, useEsc, type Toast } from "@/lib/ui";
import CardPonta from "./CardPonta";
import ModalCadastro from "./ModalCadastro";
import ModalEdicao from "./ModalEdicao";
import {
  formatar,
  dataCurta,
  fotoVersao,
  type FiltroCategoria,
  type FiltroStatus,
  type Ordem,
  type Ponta,
  FILTROS_CATEGORIA,
  FILTROS_STATUS,
  ORDENS,
} from "./types";
import { Kpi, Esqueletos } from "./Kpi";
import "../sistema.css";

const STATUS_INICIAL = {
  texto: "Sincronizando",
  classe: "pill--warn pill--pulso",
};

export default function SistemaPage() {
  const router = useRouter();

  const [pontas, setPontas] = useState<Ponta[]>([]);
  const [filtro, setFiltro] = useState("");
  const [status, setStatus] = useState(STATUS_INICIAL);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [atualizando, setAtualizando] = useState(false);
  const [usuario, setUsuario] = useState("");
  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState<Ponta | null>(null);
  const [menuAberto, setMenuAberto] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [cat, setCat] = useState<FiltroCategoria>("Todos");
  const [fStatus, setFStatus] = useState<FiltroStatus>("todos");
  const [ordem, setOrdem] = useState<Ordem>("recentes");
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);

  useEsc(() => setMenuAberto(false), menuAberto);

  const toast = useCallback(
    (tipo: Toast["tipo"], titulo: string, desc?: string) => {
      const id = Date.now() + Math.random();
      setToasts((t) => [...t, { id, tipo, titulo, desc }]);
      setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
    },
    [],
  );

  const carregar = useCallback(
    async (silencioso = false) => {
      if (!silencioso) {
        setCarregando(true);
        setPontas([]);
      }

      setAtualizando(true);
      setStatus(STATUS_INICIAL);

      try {
        const resp = await fetch("/api/pontas");
        const d = await resp.json();

        if (resp.status === 401) {
          sessionStorage.removeItem("ponta_usuario");
          router.replace("/");
          return;
        }

        if (!resp.ok) throw new Error(d.erro || "Falha ao consultar o ERP.");

        setPontas(d.pontas || []);
        setStatus({ texto: "ERP sincronizado", classe: "pill--ok" });
        setErro("");

        if (silencioso) {
          toast("ok", "Estoque atualizado", "Saldos relidos do ERP.");
        }
      } catch (e: unknown) {
        const mensagem =
          e instanceof Error
            ? e.message
            : "Não foi possível consultar o ERP.";

        setErro(mensagem);
        setStatus({ texto: "Erro de conexão", classe: "pill--bad" });

        if (!silencioso) toast("erro", "Falha na sincronização", mensagem);
      } finally {
        setCarregando(false);
        setAtualizando(false);
      }
    },
    [router, toast],
  );

  useEffect(() => {
    const u = sessionStorage.getItem("ponta_usuario");

    if (!u) {
      router.replace("/");
      return;
    }

    setUsuario(u);
    void carregar();

    const timer = setInterval(() => void carregar(true), 60_000);
    return () => clearInterval(timer);
  }, [router, carregar]);

  async function remover(codigo: string, nome: string) {
    if (!confirm(`Remover a ponta de "${nome}"? A foto e o cadastro serão apagados.`)) {
      return;
    }

    try {
      const resp = await fetch(
        `/api/pontas?codigo=${encodeURIComponent(codigo)}`,
        { method: "DELETE" },
      );
      const d = await resp.json().catch(() => ({}));

      if (resp.status === 401) {
        sessionStorage.removeItem("ponta_usuario");
        router.replace("/");
        return;
      }

      if (!resp.ok) throw new Error(d.erro || "Não foi possível remover.");

      toast("ok", "Ponta removida", nome);
      void carregar(true);
    } catch (e: unknown) {
      toast(
        "erro",
        "Erro ao remover",
        e instanceof Error ? e.message : "Não foi possível remover.",
      );
    }
  }

  async function sair() {
    try {
      await fetch("/api/logout", { method: "POST" });
    } catch {
      // A sessão local também deve ser encerrada se a requisição falhar.
    }

    sessionStorage.removeItem("ponta_usuario");
    router.replace("/");
  }

  const derivados = useMemo(
    () =>
      pontas.map((p) => {
        const m2 = parseFloat(String(p.quantidade)) || 0;
        const porCaixa = m2Caixa(p.descricao);

        return {
          ponta: p,
          m2,
          caixas: porCaixa > 0 ? m2 / porCaixa : 0,
          porCaixa,
          status: statusEstoque(m2, p.ativo !== false),
          categoria: categoria(p.descricao),
          titulo: tituloLimpo(p.produto || p.descricao),
          criado: p.criado_em ? new Date(p.criado_em).getTime() || 0 : 0,
        };
      }),
    [pontas],
  );

  const contagemCategorias = useMemo(
    () => contarCategorias(derivados, (d) => d.ponta.descricao),
    [derivados],
  );

  const categoriaVisivel = useMemo(
    () => CATEGORIAS.filter((c) => (contagemCategorias.get(c) || 0) > 0),
    [contagemCategorias],
  );

  const resumo = useMemo(() => {
    let totalM2 = 0;
    let totalCx = 0;
    let baixo = 0;

    const contagemStatus = new Map<StatusEstoque, number>();
    const recentes = [];

    for (const d of derivados) {
      totalM2 += d.m2;
      totalCx += d.caixas;

      if (d.status === "baixo" || d.status === "critico") baixo++;

      contagemStatus.set(
        d.status,
        (contagemStatus.get(d.status) || 0) + 1,
      );

      if (d.criado) recentes.push(d);
    }

    recentes.sort((a, b) => b.criado - a.criado);

    return {
      totalM2,
      totalCx,
      baixo,
      recentes: recentes.slice(0, 3),
      total: derivados.length,
      contagemStatus,
    };
  }, [derivados]);

  const visiveis = useMemo(() => {
    const termo = filtro.trim().toLowerCase();

    const lista = derivados.filter((d) => {
      if (cat !== "Todos" && d.categoria !== cat) return false;
      if (fStatus !== "todos" && d.status !== fStatus) return false;
      if (!termo) return true;

      return [
        d.titulo,
        d.ponta.descricao,
        d.ponta.codigo_erp,
        d.ponta.lote,
      ].some((v) => (v || "").toLowerCase().includes(termo));
    });

    const comparadores: Record<Ordem, (a: (typeof lista)[number], b: (typeof lista)[number]) => number> = {
      maior: (a, b) => b.m2 - a.m2,
      menor: (a, b) => a.m2 - b.m2,
      caixas: (a, b) => b.caixas - a.caixas,
      nome: (a, b) => a.titulo.localeCompare(b.titulo, "pt-BR"),
      recentes: (a, b) =>
        b.criado - a.criado || a.titulo.localeCompare(b.titulo, "pt-BR"),
    };

    return lista.sort(comparadores[ordem]);
  }, [derivados, filtro, cat, fStatus, ordem]);

  const filtroAtivo = cat !== "Todos" || fStatus !== "todos" || ordem !== "recentes";

  function limparFiltros() {
    setCat("Todos");
    setFStatus("todos");
    setOrdem("recentes");
  }

  return (
    <div className={"shell" + (menuAberto ? " shell--drawer" : "")}>
      <Sidebar
        mini={false}
        usuario={usuario}
        ativo="sistema"
        onNavegar={(r) => {
          setMenuAberto(false);
          router.push(r);
        }}
      />

      {menuAberto && (
        <button
          type="button"
          className="sidebar-fundo"
          onClick={() => setMenuAberto(false)}
          aria-label="Fechar menu"
        />
      )}

      <div className="main">
        <Topbar
          titulo="Controle de Ponta de Estoque"
          subtitulo={usuario ? `Olá, ${usuario}` : undefined}
          onAbrirMenu={() => setMenuAberto(true)}
        >
          <button type="button" className="btn" onClick={() => setModalAberto(true)}>
            <Ic d={ico.mais} />
            <span className="rotulo">Novo Cadastro</span>
          </button>

          <button
            type="button"
            className="btn secundario"
            onClick={() => router.push("/consulta")}
            title="Consultar produtos no ERP"
          >
            <Ic d={ico.lupa} />
            <span className="rotulo">Consultar Produtos</span>
          </button>

          <div className="topbar-sep" />

          <button
            type="button"
            className={"btn-icone" + (atualizando ? " girando" : "")}
            onClick={() => void carregar()}
            disabled={atualizando}
            title="Atualizar do ERP"
            aria-label="Atualizar"
          >
            <Ic d={ico.atualizar} />
          </button>

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
              <button type="button" className="menu-item perigo" onClick={() => void sair()}>
                <Ic d={ico.sair} /> Sair
              </button>
            </div>
          </details>
        </Topbar>

        <main className="page">
          <div className="pg-topo">
            <div>
              <h2>Controle de Ponta de Estoque</h2>
              <p>Monitore produtos, lotes e saldos disponíveis.</p>
            </div>

            <div className="pg-topo-dir">
              <span className={"pill " + status.classe}>{status.texto}</span>
              <div className="busca">
                <Ic d={ico.busca} />
                <input
                  type="search"
                  placeholder="Pesquisar por produto, código, referência ou lote…"
                  value={filtro}
                  onChange={(e) => setFiltro(e.target.value)}
                  aria-label="Pesquisar produtos"
                />
                {filtro && (
                  <button
                    type="button"
                    className="busca-limpar"
                    onClick={() => setFiltro("")}
                    aria-label="Limpar pesquisa"
                  >
                    ×
                  </button>
                )}
              </div>
            </div>
          </div>

          <section className="kpis" aria-label="Resumo do estoque">
            <Kpi
              icone={ico.caixa}
              rotulo="Produtos"
              valor={String(resumo.total)}
              nota={`${categoriaVisivel.length} categoria(s)`}
            />
            <Kpi
              icone={ico.metro}
              rotulo="M² disponíveis"
              valor={formatar(resumo.totalM2)}
              sufixo="m²"
              nota="Soma das pontas"
              classe="kpi--ok"
            />
            <Kpi
              icone={ico.camadas}
              rotulo="Caixas"
              valor={formatar(resumo.totalCx)}
              sufixo="cx"
              nota="Convertido por m²/cx"
              classe="kpi--brand"
            />
            <Kpi
              icone={ico.alerta}
              rotulo="Estoque baixo"
              valor={String(resumo.baixo)}
              nota="Abaixo de 25 m²"
              classe={resumo.baixo > 0 ? "kpi--warn" : ""}
            />

            <div className="kpi kpi--largo">
              <div className="kpi-rotulo">
                <Ic d={ico.atualizar} />
                Movimentações recentes
              </div>
              {resumo.recentes.length ? (
                <ul className="kpi-mov">
                  {resumo.recentes.map((d) => (
                    <li key={d.ponta.codigo_erp}>
                      <span className="kpi-mov-nome">{d.titulo}</span>
                      <span className="kpi-mov-data">{dataCurta(d.ponta.criado_em)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="kpi-nota">Sem cadastros recentes.</div>
              )}
            </div>
          </section>

          <div className="filtros-bar">
            <div className="chips" role="tablist" aria-label="Filtrar por categoria">
              {FILTROS_CATEGORIA.filter(
                (c) => c === "Todos" || categoriaVisivel.includes(c),
              ).map((c) => (
                <button
                  key={c}
                  type="button"
                  role="tab"
                  aria-selected={cat === c}
                  className={"chip" + (cat === c ? " chip--on" : "")}
                  onClick={() => setCat(c)}
                >
                  {c}
                  <span className="chip-count">
                    {c === "Todos" ? derivados.length : contagemCategorias.get(c) || 0}
                  </span>
                </button>
              ))}
            </div>

            <div className="filtros-dir">
              <button
                type="button"
                className={"chip" + (filtrosAbertos ? " chip--on" : "")}
                onClick={() => setFiltrosAbertos((v) => !v)}
                aria-expanded={filtrosAbertos}
              >
                <Ic d={ico.filtro} />
                Mais filtros
                {(fStatus !== "todos" || ordem !== "recentes") && (
                  <span className="chip-count">•</span>
                )}
              </button>

              <label className="ordenacao">
                Ordenar
                <select
                  value={ordem}
                  onChange={(e) => setOrdem(e.target.value as Ordem)}
                  aria-label="Ordenar produtos"
                >
                  {ORDENS.map((o) => (
                    <option key={o.id} value={o.id}>{o.rotulo}</option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          {filtrosAbertos && (
            <div className="filtros-extras">
              <div className="campo">
                <label htmlFor="fStatus">Status do estoque</label>
                <select
                  id="fStatus"
                  value={fStatus}
                  onChange={(e) => setFStatus(e.target.value as FiltroStatus)}
                >
                  {FILTROS_STATUS.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.rotulo}
                      {s.id !== "todos" && resumo.contagemStatus.get(s.id)
                        ? ` (${resumo.contagemStatus.get(s.id)})`
                        : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div className="campo">
                <label htmlFor="fOrdem">Ordenação</label>
                <select
                  id="fOrdem"
                  value={ordem}
                  onChange={(e) => setOrdem(e.target.value as Ordem)}
                >
                  {ORDENS.map((o) => (
                    <option key={o.id} value={o.id}>{o.rotulo}</option>
                  ))}
                </select>
              </div>

              {filtroAtivo && (
                <div className="campo" style={{ display: "flex", alignItems: "flex-end" }}>
                  <button
                    type="button"
                    className="btn secundario bloco"
                    onClick={limparFiltros}
                  >
                    Limpar filtros
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="grid">
            {carregando && <Esqueletos />}

            {!carregando && erro && (
              <div className="mensagem erro">
                <span>Não foi possível consultar o ERP: {erro}</span>
                <button
                  type="button"
                  className="btn secundario mini"
                  style={{ marginTop: 10 }}
                  onClick={() => void carregar()}
                >
                  Tentar de novo
                </button>
              </div>
            )}

            {!carregando && !erro && visiveis.length === 0 && (
              <div className="vazio">
                <div className="vazio-icone"><Ic d={ico.caixa} /></div>
                <h3>
                  {derivados.length
                    ? "Nenhum produto encontrado"
                    : "Nenhuma ponta cadastrada"}
                </h3>
                <p>
                  {derivados.length
                    ? "Ajuste a pesquisa ou limpe os filtros para ver todos os produtos."
                    : "Cadastre a primeira ponta de estoque para começar o controle."}
                </p>
                {derivados.length ? (
                  <button
                    type="button"
                    className="btn secundario"
                    onClick={() => {
                      setFiltro("");
                      limparFiltros();
                    }}
                  >
                    Limpar filtros
                  </button>
                ) : (
                  <button type="button" className="btn" onClick={() => setModalAberto(true)}>
                    <Ic d={ico.mais} /> Novo Cadastro
                  </button>
                )}
              </div>
            )}

            {!carregando && !erro && visiveis.map((d) => (
              <CardPonta
                key={d.ponta.codigo_erp}
                dados={d}
                onRemover={() => void remover(d.ponta.codigo_erp, d.titulo)}
                onEditar={() => setEditando(d.ponta)}
                onAbrir={() => setEditando(d.ponta)}
              />
            ))}
          </div>
        </main>
      </div>

      {modalAberto && (
        <ModalCadastro
          onClose={() => setModalAberto(false)}
          onSalvo={() => {
            setModalAberto(false);
            toast("ok", "Ponta cadastrada", "Produto adicionado ao controle de estoque.");
            void carregar();
          }}
        />
      )}

      {editando && (
        <ModalEdicao
          ponta={editando}
          onClose={() => setEditando(null)}
          onSalvo={() => {
            setEditando(null);
            if (editando.codigo_erp) fotoVersao[editando.codigo_erp] = Date.now();
            toast("ok", "Alterações salvas", "Estoque atualizado com sucesso.");
            void carregar(true);
          }}
          onAviso={(m) => toast("erro", "Erro ao salvar", m)}
        />
      )}

      <Toasts itens={toasts} />
    </div>
  );
}
