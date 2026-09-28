"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { m2PorCaixa } from "@/lib/m2caixa";
import {
  CATEGORIAS,
  STATUS_INFO,
  categoria,
  contarCategorias,
  m2Caixa,
  statusEstoque,
  tamanho,
  tituloLimpo,
  type Categoria,
  type StatusEstoque,
} from "@/lib/produto";
import { Ic, Sidebar, Toasts, Topbar, ico, type Toast } from "@/lib/ui";
import "../sistema.css";

type Ponta = {
  codigo_erp: string;
  descricao: string;
  produto?: string;
  unidade?: string;
  foto_url?: string;
  foto?: string;
  imagem?: string;
  quantidade: number;
  lote?: string;
  estoque_erp?: number | null;
  sistema?: number;
  saldo_sistema?: number;
  metros_por_caixa?: number;
  ativo?: boolean;
  criado_em?: string;
  sincronizado_em?: string;
};

type ItemERP = {
  codigo: string;
  descricao: string;
  medida?: string;
  marca?: string;
  unidade?: string;
  estoque?: number;
  estoque_total?: number;
};

type Lote = { lote: string; disponivel: number };

const TAMANHO_PAGINA = 20;

type FiltroCategoria = Categoria | "Todos";
type FiltroStatus = StatusEstoque | "todos";
type Ordem = "recentes" | "maior" | "menor" | "caixas" | "nome";

const FILTROS_CATEGORIA: FiltroCategoria[] = ["Todos", ...CATEGORIAS];
const FILTROS_STATUS: { id: FiltroStatus; rotulo: string }[] = [
  { id: "todos", rotulo: "Todos" },
  { id: "disponivel", rotulo: "Disponíveis" },
  { id: "baixo", rotulo: "Estoque baixo" },
  { id: "critico", rotulo: "Crítico" },
  { id: "sem", rotulo: "Sem estoque" },
];

const ORDENS: { id: Ordem; rotulo: string }[] = [
  { id: "recentes", rotulo: "Mais recentes" },
  { id: "maior", rotulo: "Maior estoque" },
  { id: "menor", rotulo: "Menor estoque" },
  { id: "caixas", rotulo: "Mais caixas" },
  { id: "nome", rotulo: "Nome (A–Z)" },
];

function formatar(n: number) {
  return Number(n || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

// Caixa fechada não é fração de caixa: 2,43 m² ÷ 2,43 m²/cx é 1 cx, não
// "1,00 cx". Só as sobras (barra quebrada) aparecem decimais.
function formatarCaixas(n: number) {
  const inteiro = Math.round(n);
  return Math.abs(n - inteiro) < 0.01 ? String(inteiro) : n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

function formatarBytes(b: number) {
  if (b < 1024) return b + " B";
  if (b < 1024 * 1024) return (b / 1024).toFixed(0).replace(".", ",") + " KB";
  return (b / 1024 / 1024).toFixed(1).replace(".", ",") + " MB";
}

function urlDaFoto(p: { foto_url?: string; foto?: string; imagem?: string }) {
  const caminho = p.foto_url || p.foto || p.imagem;
  if (!caminho) return "";
  if (caminho.startsWith("http") || caminho.startsWith("data:image")) return caminho;
  return caminho.startsWith("/") ? caminho : "/" + caminho;
}

// Foto de celular chega com 3-8 MB e resolução que ninguém chega a ver: o card
// mostra ~200px e o zoom para em 3x na tela. Reduzir no cliente (canvas) economiza
// o banco de disco, o base64 no POST (que é 33% maior que o arquivo) e o
// tráfego, e o servidor nunca chega a gravar o arquivo grande.
const FOTO_LADO_MAX = 1600; // px do lado maior
const FOTO_QUALIDADE = 0.82; // acima disso o card não ganha nada visível

/**
 * Redimensiona e recomprime a imagem no browser. Sempre devolve JPEG: assim o
 * nome do arquivo é previsível e trocar uma .png antiga por .jpg funciona (a
 * foto velha é apagada pelo pontaTrocarFoto).
 * ponytail: qualidade fixa e sem WebP. Medir ~15 fotos reais antes de trocar por
 * WebP com encode ajustado por tamanho alvo.
 */
async function prepararFoto(arq: File) {
  const dataUrl: string = await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("Não consegui ler a imagem."));
    r.readAsDataURL(arq);
  });

  const img: HTMLImageElement = await new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error("Arquivo não é uma imagem válida (HEIC precisa ser convertido)."));
    i.src = dataUrl;
  });

  const escala = Math.min(1, FOTO_LADO_MAX / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * escala));
  const h = Math.max(1, Math.round(img.height * escala));
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext("2d");
  if (!ctx) throw new Error("Não consegui processar a imagem.");
  // JPEG não tem canal alpha: sem este fundo o que era transparente sairia preto.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);

  const saida = cv.toDataURL("image/jpeg", FOTO_QUALIDADE);
  return { base64: saida.split(",")[1], nome: "foto.jpg", tipo: "image/jpeg", preview: saida };
}

function dataCurta(iso?: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

export default function SistemaPage() {
  const router = useRouter();
  const [pontas, setPontas] = useState<Ponta[]>([]);
  const [filtro, setFiltro] = useState("");
  const [status, setStatus] = useState<{ texto: string; classe: string }>({
    texto: "Sincronizando",
    classe: "pill--warn pill--pulso",
  });
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [atualizando, setAtualizando] = useState(false);
  const [usuario, setUsuario] = useState("");
  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState<Ponta | null>(null);
  const [menuAberto, setMenuAberto] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Filtros
  const [cat, setCat] = useState<FiltroCategoria>("Todos");
  const [fStatus, setFStatus] = useState<FiltroStatus>("todos");
  const [ordem, setOrdem] = useState<Ordem>("recentes");
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);

  const toast = useCallback((tipo: Toast["tipo"], titulo: string, desc?: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, tipo, titulo, desc }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);

  const carregar = useCallback(
    async (silencioso = false) => {
      if (!silencioso) {
        setCarregando(true);
        setPontas([]);
      }
      setAtualizando(true);
      setStatus({ texto: "Sincronizando", classe: "pill--warn pill--pulso" });
      try {
        const resp = await fetch("/api/pontas");
        const d = await resp.json();
        // Sessão do servidor morreu (restart do app): o sessionStorage do browser
        // sobrevive, então sem isto a tela ficava presa em "erro de conexão" pra sempre.
        if (resp.status === 401) {
          sessionStorage.removeItem("ponta_usuario");
          router.replace("/");
          return;
        }
        if (!resp.ok) throw new Error(d.erro);
        setPontas(d.pontas || []);
        setStatus({ texto: "ERP sincronizado", classe: "pill--ok" });
        setErro("");
        if (silencioso) toast("ok", "Estoque atualizado", "Saldos relidos do ERP.");
      } catch (e: any) {
        setErro(e?.message || "Não foi possível consultar o ERP.");
        setStatus({ texto: "Erro de conexão", classe: "pill--bad" });
        if (!silencioso) toast("erro", "Falha na sincronização", e?.message);
        return;
      } finally {
        setCarregando(false);
        setAtualizando(false);
      }
    },
    [router, toast]
  );

  useEffect(() => {
    const u = sessionStorage.getItem("ponta_usuario");
    if (!u) {
      router.replace("/");
      return;
    }
    setUsuario(u);
    carregar();
    const timer = setInterval(() => carregar(true), 60000);
    return () => clearInterval(timer);
  }, [router, carregar]);

  async function remover(codigo: string, nome: string) {
    if (!confirm(`Remover a ponta de "${nome}"? A foto e o cadastro serão apagados.`)) return;
    try {
      const resp = await fetch("/api/pontas?codigo=" + encodeURIComponent(codigo), { method: "DELETE" });
      const d = await resp.json().catch(() => ({}));
      if (resp.status === 401) {
        sessionStorage.removeItem("ponta_usuario");
        router.replace("/");
        return;
      }
      if (!resp.ok) throw new Error(d.erro || "não foi possível remover");
      toast("ok", "Ponta removida", nome);
      carregar(true);
    } catch (e: any) {
      toast("erro", "Erro ao remover", e?.message);
    }
  }

  async function sair() {
    try {
      await fetch("/api/logout", { method: "POST" });
    } catch {}
    sessionStorage.removeItem("ponta_usuario");
    router.replace("/");
  }

  // Derivados por ponta: calculados uma vez por lista em vez de a cada card
  // renderizar (o filtro e o KPI leem os mesmos números).
  const derivados = useMemo(
    () =>
      pontas.map((p) => {
        const m2 = parseFloat(String(p.quantidade)) || 0;
        const porCaixa = m2Caixa(p.descricao, p.metros_por_caixa);
        return {
          ponta: p,
          m2,
          caixas: porCaixa > 0 ? m2 / porCaixa : 0,
          porCaixa,
          status: statusEstoque(m2, p.ativo !== false),
          categoria: categoria(p.descricao),
          medida: tamanho(p.descricao),
          titulo: tituloLimpo(p.produto || p.descricao),
          criado: p.criado_em ? new Date(p.criado_em).getTime() || 0 : 0,
        };
      }),
    [pontas]
  );

  const contagemCategorias = useMemo(() => contarCategorias(derivados, (d) => d.ponta.descricao), [derivados]);
  const contagemStatus = useMemo(() => {
    const m = new Map<StatusEstoque, number>();
    for (const d of derivados) m.set(d.status, (m.get(d.status) || 0) + 1);
    return m;
  }, [derivados]);

  // KPIs
  const kpis = useMemo(() => {
    const totalM2 = derivados.reduce((s, d) => s + d.m2, 0);
    const totalCx = derivados.reduce((s, d) => s + d.caixas, 0);
    const baixo = derivados.filter((d) => d.status === "baixo" || d.status === "critico").length;
    const recentes = derivados
      .filter((d) => d.criado)
      .sort((a, b) => b.criado - a.criado)
      .slice(0, 3);
    return { totalM2, totalCx, baixo, recentes, total: derivados.length };
  }, [derivados]);

  const visiveis = useMemo(() => {
    const termo = filtro.trim().toLowerCase();
    const lista = derivados.filter((d) => {
      if (cat !== "Todos" && d.categoria !== cat) return false;
      if (fStatus !== "todos" && d.status !== fStatus) return false;
      if (!termo) return true;
      return (
        d.titulo.toLowerCase().includes(termo) ||
        (d.ponta.descricao || "").toLowerCase().includes(termo) ||
        (d.ponta.codigo_erp || "").toLowerCase().includes(termo) ||
        (d.ponta.lote || "").toLowerCase().includes(termo)
      );
    });

    const ord = [...lista];
    if (ordem === "maior") ord.sort((a, b) => b.m2 - a.m2);
    else if (ordem === "menor") ord.sort((a, b) => a.m2 - b.m2);
    else if (ordem === "caixas") ord.sort((a, b) => b.caixas - a.caixas);
    else if (ordem === "nome") ord.sort((a, b) => a.titulo.localeCompare(b.titulo, "pt-BR"));
    else ord.sort((a, b) => b.criado - a.criado || a.titulo.localeCompare(b.titulo, "pt-BR"));
    return ord;
  }, [derivados, filtro, cat, fStatus, ordem]);

  const filtroAtivo = cat !== "Todos" || fStatus !== "todos" || ordem !== "recentes";
  const categoriaVisivel = CATEGORIAS.filter((c) => (contagemCategorias.get(c) || 0) > 0);

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
      {menuAberto && <button type="button" className="sidebar-fundo" onClick={() => setMenuAberto(false)} aria-label="Fechar menu" />}

      <div className="main">
        <Topbar titulo="Controle de Ponta de Estoque" subtitulo={usuario ? `Olá, ${usuario}` : undefined} onAbrirMenu={() => setMenuAberto(true)}>
          <button type="button" className="btn" onClick={() => setModalAberto(true)}>
            <Ic d={ico.mais} /> <span className="rotulo">Novo Cadastro</span>
          </button>
          <button type="button" className="btn secundario" onClick={() => router.push("/consulta")} title="Consultar produtos no ERP">
            <Ic d={ico.lupa} /> <span className="rotulo">Consultar Produtos</span>
          </button>
          <div className="topbar-sep" />
          <button
            type="button"
            className={"btn-icone" + (atualizando ? " girando" : "")}
            onClick={() => carregar()}
            disabled={atualizando}
            title="Atualizar do ERP"
            aria-label="Atualizar"
          >
            <Ic d={ico.atualizar} />
          </button>
          <button type="button" className="btn-icone" onClick={() => toast("info", "Perfil", "Sessão de " + (usuario || "—"))} title="Perfil" aria-label="Perfil">
            <Ic d={ico.usuario} />
          </button>
          <button type="button" className="btn-icone perigo" onClick={sair} title="Sair" aria-label="Sair">
            <Ic d={ico.sair} />
          </button>
        </Topbar>

        <main className="page">
          {/* ---- Cabeçalho da página + busca ---- */}
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
                  <button type="button" className="busca-limpar" onClick={() => setFiltro("")} aria-label="Limpar pesquisa">
                    ×
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* ---- Resumo ---- */}
          <section className="kpis" aria-label="Resumo do estoque">
            <Kpi icone={ico.caixa} rotulo="Produtos" valor={String(kpis.total)} nota={`${categoriaVisivel.length} categoria(s)`} />
            <Kpi icone={ico.metro} rotulo="M² disponíveis" valor={formatar(kpis.totalM2)} sufixo="m²" nota="Soma das pontas" classe="kpi--ok" />
            <Kpi icone={ico.camadas} rotulo="Caixas" valor={formatar(kpis.totalCx)} sufixo="cx" nota="Convertido por m²/cx" classe="kpi--brand" />
            <Kpi icone={ico.alerta} rotulo="Estoque baixo" valor={String(kpis.baixo)} nota="Abaixo de 25 m²" classe={kpis.baixo > 0 ? "kpi--warn" : ""} />
            <div className="kpi kpi--largo">
              <div className="kpi-rotulo">
                <Ic d={ico.atualizar} /> Movimentações recentes
              </div>
              {kpis.recentes.length ? (
                <ul className="kpi-mov">
                  {kpis.recentes.map((d) => (
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

          {/* ---- Filtros ---- */}
          <div className="filtros-bar">
            <div className="chips" role="tablist" aria-label="Filtrar por categoria">
              {FILTROS_CATEGORIA.filter((c) => c === "Todos" || categoriaVisivel.includes(c)).map((c) => (
                <button
                  key={c}
                  type="button"
                  role="tab"
                  aria-selected={cat === c}
                  className={"chip" + (cat === c ? " chip--on" : "")}
                  onClick={() => setCat(c)}
                >
                  {c}
                  <span className="chip-count">{c === "Todos" ? derivados.length : contagemCategorias.get(c) || 0}</span>
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
                <Ic d={ico.filtro} /> Mais filtros
                {(fStatus !== "todos" || ordem !== "recentes") && <span className="chip-count">•</span>}
              </button>
              <label className="ordenacao">
                Ordenar
                <select value={ordem} onChange={(e) => setOrdem(e.target.value as Ordem)} aria-label="Ordenar produtos">
                  {ORDENS.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.rotulo}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          {filtrosAbertos && (
            <div className="filtros-extras">
              <div className="campo">
                <label htmlFor="fStatus">Status do estoque</label>
                <select id="fStatus" value={fStatus} onChange={(e) => setFStatus(e.target.value as FiltroStatus)}>
                  {FILTROS_STATUS.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.rotulo}
                      {s.id !== "todos" && contagemStatus.get(s.id) ? ` (${contagemStatus.get(s.id)})` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div className="campo">
                <label htmlFor="fOrdem">Ordenação</label>
                <select id="fOrdem" value={ordem} onChange={(e) => setOrdem(e.target.value as Ordem)}>
                  {ORDENS.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.rotulo}
                    </option>
                  ))}
                </select>
              </div>
              {filtroAtivo && (
                <div className="campo" style={{ display: "flex", alignItems: "flex-end" }}>
                  <button
                    type="button"
                    className="btn secundario bloco"
                    onClick={() => {
                      setCat("Todos");
                      setFStatus("todos");
                      setOrdem("recentes");
                    }}
                  >
                    Limpar filtros
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ---- Grade de produtos ---- */}
          <div className="grid">
            {carregando && <Esqueletos />}

            {!carregando && erro && (
              <div className="mensagem erro">
                <span>
                  Não foi possível consultar o ERP: {erro}
                </span>
                <button type="button" className="btn secundario mini" style={{ marginTop: 10 }} onClick={() => carregar()}>
                  Tentar de novo
                </button>
              </div>
            )}

            {!carregando && !erro && visiveis.length === 0 && (
              <div className="vazio">
                <div className="vazio-icone">
                  <Ic d={ico.caixa} />
                </div>
                <h3>{derivados.length ? "Nenhum produto encontrado" : "Nenhuma ponta cadastrada"}</h3>
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
                      setCat("Todos");
                      setFStatus("todos");
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

            {!carregando &&
              !erro &&
              visiveis.map((d) => (
                <CardPonta
                  key={d.ponta.codigo_erp}
                  dados={d}
                  onRemover={() => remover(d.ponta.codigo_erp, d.titulo)}
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
            carregar();
          }}
        />
      )}

      {editando && (
        <ModalEdicao
          ponta={editando}
          onClose={() => setEditando(null)}
          onSalvo={() => {
            setEditando(null);
            toast("ok", "Alterações salvas", "Estoque atualizado com sucesso.");
            carregar(true);
          }}
          onAviso={(m) => toast("erro", "Erro ao salvar", m)}
        />
      )}

      <Toasts itens={toasts} />
    </div>
  );
}

function Kpi({
  icone,
  rotulo,
  valor,
  sufixo,
  nota,
  classe = "",
}: {
  icone: string;
  rotulo: string;
  valor: string;
  sufixo?: string;
  nota?: string;
  classe?: string;
}) {
  return (
    <div className={"kpi " + classe}>
      <div className="kpi-rotulo">
        <Ic d={icone} /> {rotulo}
      </div>
      <div className="kpi-valor">
        {valor}
        {sufixo && <small>{sufixo}</small>}
      </div>
      {nota && <div className="kpi-nota">{nota}</div>}
    </div>
  );
}

function Esqueletos() {
  return (
    <>
      {[0, 1, 2, 3].map((i) => (
        <div className="esqueleto" key={i}>
          <div className="esqueleto-media" />
          <div className="esqueleto-corpo">
            <div className="esqueleto-barra g" />
            <div className="esqueleto-barra gg" />
            <div className="esqueleto-barra ggg" />
            <div className="esqueleto-barra g" />
          </div>
        </div>
      ))}
    </>
  );
}

type Derivado = {
  ponta: Ponta;
  m2: number;
  caixas: number;
  porCaixa: number;
  status: StatusEstoque;
  categoria: Categoria;
  medida: string;
  titulo: string;
  criado: number;
};

function CardPonta({
  dados,
  onRemover,
  onEditar,
  onAbrir,
}: {
  dados: Derivado;
  onRemover: () => void;
  onEditar: () => void;
  onAbrir: () => void;
}) {
  const { ponta, m2, caixas, porCaixa, status, categoria: cat, medida, titulo } = dados;
  const info = STATUS_INFO[status];
  const urlFoto = urlDaFoto(ponta);

  const qtdSistema = parseFloat(String(ponta.sistema ?? ponta.saldo_sistema)) || 0;
  const diferenca = m2 - qtdSistema;

  const [zoomAberto, setZoomAberto] = useState(false);
  // Escala contínua (1 = cabe na tela). Substitui o antigo booleano: zoom em
  // degraus de 1x/100% não deixa ver a textura no meio do caminho.
  const [escala, setEscala] = useState(1);
  // `transform: scale` não cresce o container, então o zoom sozinho deixaria a
  // imagem presa no centro, sem como olhar as bordas. O pan em translate
  // compensa — fewest code que faz o zoom ser realmente útil.
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const arrasto = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const zoomRef = useRef<HTMLDialogElement>(null);

  // showModal() e não o atributo `open`: o dialog fica no top layer, imune ao
  // `overflow: hidden` do .card. Em troca ganha ESC e ::backdrop de graça.
  useEffect(() => {
    const dlg = zoomRef.current;
    if (zoomAberto && dlg && !dlg.open) dlg.showModal();
    if (!zoomAberto && dlg?.open) dlg.close();
  }, [zoomAberto]);

  // Reabre sempre no ajuste, não na ampliação da sessão anterior.
  useEffect(() => {
    if (zoomAberto) {
      setEscala(1);
      setPos({ x: 0, y: 0 });
    }
  }, [zoomAberto]);

  // onWheel é passivo por padrão no React: o preventDefault seria ignorado e a
  // página inteira rolaria junto com o zoom. `passive: false` é obrigatório.
  useEffect(() => {
    const dlg = zoomRef.current;
    if (!zoomAberto || !dlg) return;
    const aoRolar = (e: WheelEvent) => {
      e.preventDefault();
      setEscala((s) => Math.min(8, Math.max(1, s * (e.deltaY < 0 ? 1.15 : 1 / 1.15))));
    };
    dlg.addEventListener("wheel", aoRolar, { passive: false });
    return () => dlg.removeEventListener("wheel", aoRolar);
  }, [zoomAberto]);

  return (
    <article className="card">
      <div
        className="card-media"
        onClick={() => urlFoto && setZoomAberto(true)}
        title={urlFoto ? "Clique para ampliar a foto" : undefined}
      >
        {urlFoto ? (
          <img src={urlFoto} alt={titulo} loading="lazy" />
        ) : (
          <div className="card-media-vazio">
            <span>📦</span>
            <span>Sem foto</span>
          </div>
        )}
        <span className={"badge badge-sobre " + info.classe}>{info.rotulo}</span>
        {urlFoto && (
          <span className="card-media-zoom">
            <Ic d={ico.lupa} />
          </span>
        )}
      </div>

      <div className="card-corpo">
        <div>
          <h3 className="card-nome">{titulo}</h3>
          <div className="card-ref">Ref. {ponta.codigo_erp || "—"}</div>
        </div>

        <div className="card-tags">
          <span className="tag tag--forte">{cat}</span>
          {medida && <span className="tag">{medida}</span>}
          {porCaixa > 0 && <span className="tag">{formatar(porCaixa)} m²/cx</span>}
        </div>

        <div className="metricas">
          <div className="metrica metrica--destaque">
            <div className="metrica-rotulo">M² disponível</div>
            <div className="metrica-valor">
              {formatar(m2)} <small>m²</small>
            </div>
          </div>
          <div className="metrica metrica--caixa">
            <div className="metrica-rotulo">Caixas</div>
            <div className="metrica-valor" title={porCaixa > 0 ? `${formatar(m2)} m² ÷ ${formatar(porCaixa)} m²/cx` : "Produto não informa m² por caixa no ERP"}>
              {porCaixa > 0 ? formatarCaixas(caixas) : "—"}
            </div>
          </div>
          <div className="metrica">
            <div className="metrica-rotulo">Lote</div>
            <div className="metrica-valor">{ponta.lote || "—"}</div>
          </div>
        </div>

        {qtdSistema > 0 && Math.abs(diferenca) > 0.005 && (
          <div className={"divergencia " + (diferenca > 0 ? "divergencia--ok" : "divergencia--bad")}>
            <Ic d={ico.info} /> Divergência de {diferenca > 0 ? "+" : ""}
            {formatar(diferenca)} m² vs. sistema
          </div>
        )}

        <div className="card-pe">
          <div className="card-preco">
            {/* A tabela `pontas` não tem preço: ele vive no ERP e só aparece na
                tela de consulta. Mostrar "—" era mais honesto que estimar. */}
            <div className="card-preco-valor">—</div>
            <div className="card-preco-un">preço na consulta ERP</div>
          </div>
          <div className="card-acoes">
            <button type="button" className="btn secundario mini" onClick={onAbrir}>
              Ver detalhes
            </button>
            <button type="button" className="btn-icone" onClick={onEditar} title="Editar ponta" aria-label={`Editar ${titulo}`}>
              <Ic d={ico.lapis} />
            </button>
            <button type="button" className="btn-icone perigo" onClick={onRemover} title="Excluir ponta" aria-label={`Excluir ${titulo}`}>
              <Ic d={ico.lixeira} />
            </button>
          </div>
        </div>
      </div>

      {urlFoto && (
        <dialog
          ref={zoomRef}
          className="zoom-foto"
          onClick={(e) => e.target === e.currentTarget && setZoomAberto(false)}
          onClose={() => setZoomAberto(false)}
        >
          <div className="zoom-area" onClick={() => escala === 1 && setZoomAberto(false)}>
            <img
              src={urlFoto}
              alt={titulo}
              className={escala > 1 ? "ampliada" : ""}
              style={{ transform: `translate(${pos.x}px, ${pos.y}px) scale(${escala})` }}
              onClick={(e) => e.stopPropagation()}
              onDoubleClick={() => {
                setEscala((s) => (s > 1 ? 1 : 3));
                setPos({ x: 0, y: 0 });
              }}
              onMouseDown={(e) => {
                if (escala <= 1) return;
                arrasto.current = { x: e.clientX, y: e.clientY, ox: pos.x, oy: pos.y };
              }}
              onMouseMove={(e) => {
                const a = arrasto.current;
                if (!a) return;
                setPos({ x: a.ox + e.clientX - a.x, y: a.oy + e.clientY - a.y });
              }}
              onMouseUp={() => (arrasto.current = null)}
              onMouseLeave={() => (arrasto.current = null)}
            />
          </div>
          <div className="zoom-bar">
            <span className="zoom-titulo">
              {titulo} · {ponta.lote || "sem lote"}
            </span>
            <span className="zoom-nivel">{Math.round(escala * 100)}%</span>
            <button type="button" className="btn secundario mini" onClick={() => { setEscala((s) => Math.max(1, s - 0.5)); setPos({ x: 0, y: 0 }); }} aria-label="Diminuir zoom">
              −
            </button>
            <button type="button" className="btn secundario mini" onClick={() => { setEscala((s) => Math.min(8, s + 0.5)); setPos({ x: 0, y: 0 }); }} aria-label="Aumentar zoom">
              +
            </button>
            <button type="button" className="btn secundario mini" onClick={() => { setEscala(1); setPos({ x: 0, y: 0 }); }}>
              Ajustar
            </button>
            <button type="button" className="btn secundario mini" onClick={() => setZoomAberto(false)}>
              Fechar
            </button>
          </div>
          <div className="zoom-dica">Scroll do mouse amplia · duplo clique alterna 1x/3x · ESC fecha</div>
        </dialog>
      )}
    </article>
  );
}

// Edição de uma ponta já cadastrada. Só metragem, lote e foto: o código ERP é
// a identidade da ponta (chave do UPDATE e nome do arquivo de foto), então
// trocar o produto continua sendo apagar + cadastrar.
function ModalEdicao({
  ponta,
  onClose,
  onSalvo,
  onAviso,
}: {
  ponta: Ponta;
  onClose: () => void;
  onSalvo: () => void;
  onAviso: (m: string) => void;
}) {
  const [quantidade, setQuantidade] = useState(String(ponta.quantidade ?? "").replace(".", ","));
  const [unidadeQtd, setUnidadeQtd] = useState<"m2" | "cx">("m2");
  const [lote, setLote] = useState(ponta.lote || "");
  const [lotes, setLotes] = useState<Lote[] | null>(null);
  const [lotesCarregando, setLotesCarregando] = useState(false);
  const [imagem, setImagem] = useState<{ base64: string; nome: string; tipo: string } | null>(null);
  const [preview, setPreview] = useState("");
  // "3,8 MB → 240 KB": o usuário precisa ver que a foto foi enxuta, senão parece
  // que o sistema trocou a imagem por uma versão pior.
  const [economia, setEconomia] = useState("");
  const [aviso, setAviso] = useState("");
  const [salvando, setSalvando] = useState(false);

  const metrosPorCaixa = m2Caixa(ponta.descricao, ponta.metros_por_caixa);
  const cxPossivel = metrosPorCaixa > 0;
  const qtdM2 =
    unidadeQtd === "cx"
      ? (parseFloat(quantidade.replace(",", ".")) || 0) * metrosPorCaixa
      : parseFloat(quantidade.replace(",", ".")) || 0;
  const valido = quantidade.trim() !== "" && lote.trim() !== "" && (unidadeQtd === "m2" || cxPossivel) && qtdM2 > 0;

  // Lotes do ERP, para corrigir um lote digitado errado. O valor atual fica
  // disponível mesmo se o ERP estiver fora: o campo é editável à mão.
  useEffect(() => {
    let cancelado = false;
    setLotesCarregando(true);
    fetch("/api/lotes?codigo=" + encodeURIComponent(ponta.codigo_erp))
      .then((r) => r.json().catch(() => ({})))
      .then((d) => !cancelado && setLotes(d.lotes || []))
      .catch(() => !cancelado && setLotes([]))
      .finally(() => !cancelado && setLotesCarregando(false));
    return () => {
      cancelado = true;
    };
  }, [ponta.codigo_erp]);

  async function onImagemChange(e: React.ChangeEvent<HTMLInputElement>) {
    const arq = e.target.files?.[0];
    if (!arq) return;
    setAviso("");
    try {
      const p = await prepararFoto(arq);
      setImagem({ base64: p.base64, nome: p.nome, tipo: p.tipo });
      setPreview(p.preview);
      setEconomia(`${formatarBytes(arq.size)} → ${formatarBytes(Math.round((p.base64.length * 3) / 4))}`);
    } catch (err: any) {
      setImagem(null);
      setPreview("");
      setEconomia("");
      setAviso(err.message || "Não consegui carregar a imagem.");
    }
  }

  // Mesma convenção do cadastro: <codigo>.jpg sobrescreve a foto anterior em
  // vez de deixar arquivos órfãos. A extensão é sempre .jpg porque
  // `prepararFoto` já devolve JPEG.
  function nomeFoto() {
    return `${ponta.codigo_erp}.jpg`;
  }

  async function salvar() {
    setAviso("");
    setSalvando(true);
    try {
      const corpo: Record<string, unknown> = {
        codigo_erp: ponta.codigo_erp,
        quantidade: qtdM2,
        lote: lote.trim(),
      };
      if (imagem) {
        const up = await fetch("/api/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...imagem, nome: nomeFoto() }),
        });
        const upData = await up.json();
        if (upData.erro) throw new Error(upData.erro);
        corpo.foto = upData.url;
      }
      const resp = await fetch("/api/pontas", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      });
      const d = await resp.json().catch(() => ({}));
      if (resp.status === 401) throw new Error("sessão expirada");
      if (d.erro) throw new Error(d.erro);
      onSalvo();
    } catch (err: any) {
      const m = err.message || "Erro ao salvar as alterações.";
      setAviso(m);
      onAviso(m);
    } finally {
      setSalvando(false);
    }
  }

  const urlFotoAtual = urlDaFoto(ponta);

  return (
    <div className="modal" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-conteudo">
        <h2>
          <Ic d={ico.lapis} /> Editar ponta
        </h2>
        {aviso && <div className="aviso">{aviso}</div>}

        <div className="info-produto">
          <b>
            {ponta.codigo_erp} — {tituloLimpo(ponta.produto || ponta.descricao)}
          </b>
          {cxPossivel ? `${formatar(metrosPorCaixa)} m² por caixa` : "Produto não informa m² por caixa no ERP"}
        </div>

        <div className="modal-grade" style={{ marginTop: 16 }}>
          <div className="campo">
            <label>
              Lote <span className="req">*</span>
            </label>
            {/* <input list> e não <select>: a lista do ERP precisa ser sugestão, não
                trava — o usuário ainda corrige à mão um lote que o ERP não listou. */}
            <input
              type="text"
              list="lotes-edicao"
              placeholder={lotesCarregando ? "Buscando lotes no ERP..." : "Lote do material"}
              value={lote}
              onChange={(e) => setLote(e.target.value)}
            />
            <datalist id="lotes-edicao">
              {(lotes || []).map((l) => (
                <option key={l.lote} value={l.lote}>
                  {formatar(l.disponivel)} m² disponíveis
                </option>
              ))}
            </datalist>
          </div>

          <div className="campo">
            <label>
              {unidadeQtd === "cx" ? "Quantidade de caixas" : "Metragem (m²)"}{" "}
              <span className="req">*</span>
              <span className="unidade-troca">
                <button type="button" className={unidadeQtd === "m2" ? "ativo" : ""} onClick={() => setUnidadeQtd("m2")}>
                  m²
                </button>
                <button
                  type="button"
                  className={unidadeQtd === "cx" ? "ativo" : ""}
                  disabled={!cxPossivel}
                  title={cxPossivel ? "Informar em caixas e calcular os m²" : "Este produto não informa m² por caixa no ERP"}
                  onClick={() => setUnidadeQtd("cx")}
                >
                  cx
                </button>
              </span>
            </label>
            <input
              type="text"
              inputMode="decimal"
              placeholder={unidadeQtd === "cx" ? "Ex: 12 caixas" : "Ex: 45,5"}
              value={quantidade}
              onChange={(e) => setQuantidade(e.target.value)}
            />
            <small className="dica">
              Saldo atual: {formatar(parseFloat(String(ponta.quantidade)) || 0)} m²
              {unidadeQtd === "cx" ? ` · = ${formatar(qtdM2)} m² (${formatarCaixas(metrosPorCaixa)} m²/cx)` : ""}
            </small>
          </div>
        </div>

        <div className="campo">
          <label>Foto (opcional)</label>
          <input type="file" accept="image/*" onChange={onImagemChange} />
          <div className="foto-linha">
            {urlFotoAtual && (
              <img src={urlFotoAtual} alt="Foto atual" className="foto-mini" />
            )}
            {preview && <img src={preview} alt="Nova foto" className="foto-mini foto-mini--nova" />}
            <span className="foto-nota">
              {preview ? "A nova foto substitui a atual ao salvar." : "Deixe em branco para manter a foto atual."}
              {economia && (
                <>
                  <br />
                  Reduzida: {economia}
                </>
              )}
            </span>
          </div>
        </div>

        <div className="modal-acoes">
          <button type="button" className="btn secundario" onClick={onClose}>
            Cancelar
          </button>
          <button type="button" className="btn" disabled={!valido || salvando} onClick={salvar}>
            {salvando ? "Salvando…" : "Salvar alterações"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ModalCadastro({ onClose, onSalvo }: { onClose: () => void; onSalvo: () => void }) {
  const [imagem, setImagem] = useState<{ base64: string; nome: string; tipo: string } | null>(null);
  const [preview, setPreview] = useState("");
  const [quantidade, setQuantidade] = useState("");
  const [lote, setLote] = useState("");
  const [lotes, setLotes] = useState<Lote[] | null>(null);
  const [lotesCarregando, setLotesCarregando] = useState(false);
  const [produto, setProduto] = useState<ItemERP | null>(null);
  const [pickerAberto, setPickerAberto] = useState(false);
  const [economia, setEconomia] = useState("");
  // "m2" ou "cx": o campo aceita as duas unidades e `quantidade` guarda sempre o
  // que o usuário digitou, na unidade escolhida. Converter a cada tecla faz o
  // cursor pular (2,43 não volta exatamente para 2,43), então a conversão para
  // m² acontece só no salvar.
  const [unidadeQtd, setUnidadeQtd] = useState<"m2" | "cx">("m2");
  const [aviso, setAviso] = useState("");
  const [salvando, setSalvando] = useState(false);

  const m2cx = produto ? m2PorCaixa(produto.descricao) : 0;
  const cxPossivel = m2cx > 0;
  const qtdM2 =
    unidadeQtd === "cx" ? (parseFloat(quantidade.replace(",", ".")) || 0) * m2cx : parseFloat(quantidade.replace(",", ".")) || 0;
  const valido = imagem && quantidade.trim() && produto && lote && (unidadeQtd === "m2" || cxPossivel) && qtdM2 > 0;

  function reset() {
    setImagem(null);
    setPreview("");
    setEconomia("");
    setQuantidade("");
    setUnidadeQtd("m2");
    setLote("");
    setLotes(null);
    setProduto(null);
    setAviso("");
  }

  async function onImagemChange(e: React.ChangeEvent<HTMLInputElement>) {
    const arq = e.target.files?.[0];
    if (!arq) {
      setImagem(null);
      setPreview("");
      setEconomia("");
      return;
    }
    try {
      const p = await prepararFoto(arq);
      setImagem({ base64: p.base64, nome: p.nome, tipo: p.tipo });
      setPreview(p.preview);
      setEconomia(`${formatarBytes(arq.size)} → ${formatarBytes(Math.round((p.base64.length * 3) / 4))}`);
    } catch (err: any) {
      setImagem(null);
      setPreview("");
      setEconomia("");
      setAviso(err.message || "Não consegui carregar a imagem.");
    }
  }

  // Escolher o produto já dispara a carga dos lotes: um clique resolve o par
  // produto+lote, sem obrigar o usuário a um segundo passo.
  async function escolherProduto(p: ItemERP) {
    setProduto(p);
    setLote("");
    setLotes(null);
    setLotesCarregando(true);
    setPickerAberto(false);
    setAviso("");
    try {
      const r = await fetch("/api/lotes?codigo=" + encodeURIComponent(p.codigo));
      const d = await r.json().catch(() => ({}));
      setLotes(d.lotes || []);
    } catch {
      setLotes([]);
      setAviso("Produto escolhido, mas não foi possível carregar os lotes do ERP.");
    } finally {
      setLotesCarregando(false);
    }
  }

  // Escolher o lote já traz a metragem disponível do ERP: na maioria dos casos é
  // exatamente o que vai para a ponta, e o campo continua editável para quando não é.
  function onLoteChange(codigoLote: string) {
    setLote(codigoLote);
    const escolhido = lotes?.find((l) => l.lote === codigoLote);
    if (escolhido && escolhido.disponivel > 0) {
      setQuantidade(String(escolhido.disponivel).replace(".", ","));
      setUnidadeQtd("m2");
    }
  }

  // A foto vira <código ERP>.jpg: o nome original ("foto.jpg", "IMG_4821.jpg")
  // não diz nada e a pontada é única por código_erp (POST /api/pontas devolve 409
  // na duplicidade), então o nome não colide. Reenviar sobrescreve em vez de
  // encher a pasta de lixo quando o cadastro é refeito.
  function nomeFoto() {
    return `${produto!.codigo}.jpg`;
  }

  async function salvar() {
    setAviso("");
    setSalvando(true);
    try {
      const up = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...imagem, nome: nomeFoto() }),
      });
      const upData = await up.json();
      if (upData.erro) throw new Error(upData.erro);

      const resp = await fetch("/api/pontas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          codigo_erp: produto!.codigo,
          descricao: produto!.descricao,
          foto: upData.url,
          quantidade: qtdM2,
          lote: lote.trim(),
        }),
      });
      const d = await resp.json();
      if (d.erro) throw new Error(d.erro);
      onSalvo();
    } catch (err: any) {
      setAviso(err.message || "Erro ao salvar o produto.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="modal" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-conteudo">
        <h2>
          <Ic d={ico.mais} /> Cadastrar nova ponta
        </h2>
        {aviso && <div className="aviso">{aviso}</div>}

        <div className="campo">
          <label>
            Produto ERP <span className="req">*</span>
          </label>
          {produto ? (
            <div className="info-produto">
              <b>
                {produto.codigo} — {tituloLimpo(produto.descricao)}
              </b>
              {[produto.medida, produto.marca, produto.unidade].filter(Boolean).join(" · ")}
              <div style={{ marginTop: 10 }}>
                <button type="button" className="btn secundario mini" onClick={() => setPickerAberto(true)}>
                  Trocar produto
                </button>
              </div>
            </div>
          ) : (
            <button type="button" className="btn bloco" onClick={() => setPickerAberto(true)}>
              <Ic d={ico.lupa} /> Consultar produtos
            </button>
          )}
        </div>

        <div className="campo">
          <label>
            Foto do material <span className="req">*</span>
          </label>
          <input type="file" accept="image/*" onChange={onImagemChange} />
          {preview && (
            <div style={{ marginTop: 10 }}>
              <img src={preview} alt="Preview" className="foto-preview" />
              {economia && (
                <small className="dica">
                  Reduzida: {economia} · máx. {FOTO_LADO_MAX}px
                </small>
              )}
            </div>
          )}
        </div>

        <div className="modal-grade">
          <div className="campo">
            <label>
              Lote <span className="req">*</span>
            </label>
            <select value={lote} disabled={!produto || lotesCarregando} onChange={(e) => onLoteChange(e.target.value)}>
              {!produto && <option value="">— Escolha o produto —</option>}
              {produto && lotesCarregando && <option value="">Buscando lotes no ERP…</option>}
              {produto && !lotesCarregando && lotes && lotes.length === 0 && <option value="ÚNICO">LOTE ÚNICO (sem lote especificado)</option>}
              {produto && !lotesCarregando && lotes && lotes.length > 0 && (
                <>
                  <option value="">— Selecione o lote —</option>
                  {lotes.map((l) => (
                    <option key={l.lote} value={l.lote}>
                      {l.lote} (Disp: {l.disponivel} m²)
                    </option>
                  ))}
                </>
              )}
            </select>
          </div>

          <div className="campo">
            <label>
              {unidadeQtd === "cx" ? "Quantidade de caixas" : "Metragem (m²)"}{" "}
              <span className="req">*</span>
              <span className="unidade-troca">
                <button type="button" className={unidadeQtd === "m2" ? "ativo" : ""} disabled={!produto} onClick={() => setUnidadeQtd("m2")}>
                  m²
                </button>
                <button
                  type="button"
                  className={unidadeQtd === "cx" ? "ativo" : ""}
                  disabled={!produto || !cxPossivel}
                  title={cxPossivel ? "Informar em caixas e calcular os m²" : "Este produto não informa m² por caixa no ERP"}
                  onClick={() => setUnidadeQtd("cx")}
                >
                  cx
                </button>
              </span>
            </label>
            <input
              type="text"
              inputMode="decimal"
              placeholder={unidadeQtd === "cx" ? "Ex: 12 caixas" : "Ex: 45,5"}
              value={quantidade}
              onChange={(e) => setQuantidade(e.target.value)}
            />
            <small className="dica">
              {unidadeQtd === "cx" ? `= ${formatar(qtdM2)} m² (${formatarCaixas(m2cx)} m²/cx)` : "Metragem que ficará disponível na ponta."}
            </small>
          </div>
        </div>

        <div className="modal-acoes">
          <button
            type="button"
            className="btn secundario"
            onClick={() => {
              reset();
              onClose();
            }}
          >
            Cancelar
          </button>
          <button type="button" className="btn" disabled={!valido || salvando} onClick={salvar}>
            {salvando ? "Enviando…" : "Confirmar cadastro"}
          </button>
        </div>
      </div>

      {pickerAberto && <PickerProdutos onEscolher={escolherProduto} onFechar={() => setPickerAberto(false)} />}
    </div>
  );
}

// Seletor de produtos: mesma consulta da tela /consulta, sobreposta ao modal de
// cadastro. Evita duplicar o formulário de filtros — o /sistema já tem o picker
// inteiro, não precisa de mais uma tela de consulta.
function PickerProdutos({ onEscolher, onFechar }: { onEscolher: (p: ItemERP) => void; onFechar: () => void }) {
  const router = useRouter();
  const [filtros, setFiltros] = useState({ codigo: "", referencia: "", descricao: "" });
  const [itens, setItens] = useState<ItemERP[] | null>(null);
  const [pagina, setPagina] = useState(1);
  const [total, setTotal] = useState<number | null>(null);
  const [temProxima, setTemProxima] = useState<boolean | null>(null);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);

  // A página vem por argumento: ler `pagina` do estado aqui devolveria sempre o
  // valor antigo e o "Próxima" repetiria a página 1.
  async function pesquisar(p: number) {
    if (!filtros.codigo.trim() && !filtros.referencia.trim() && !filtros.descricao.trim()) {
      setErro("Informe ao menos código, referência ou descrição.");
      return;
    }
    setCarregando(true);
    try {
      const q = new URLSearchParams({ ...filtros, pagina: String(p), tamanho: String(TAMANHO_PAGINA) });
      const resp = await fetch("/api/buscar?" + q);
      const d = await resp.json().catch(() => ({}));
      if (resp.status === 401) {
        sessionStorage.removeItem("ponta_usuario");
        router.replace("/");
        return;
      }
      if (!resp.ok) throw new Error(d.erro || "falha na consulta");
      setItens(d.itens || []);
      setPagina(p);
      setTotal(typeof d.total === "number" ? d.total : null);
      setTemProxima(typeof d.temProxima === "boolean" ? d.temProxima : null);
      setErro("");
    } catch (e: any) {
      setItens(null);
      setErro(e?.message || "não foi possível consultar o ERP");
    } finally {
      setCarregando(false);
    }
  }

  function irPara(p: number) {
    if (p < 1 || carregando) return;
    const alvo = document.getElementById("pickerProdutos");
    if (alvo) alvo.scrollTop = 0;
    pesquisar(p);
  }

  const totalPaginas = total != null ? Math.max(1, Math.ceil(total / TAMANHO_PAGINA)) : 1;
  const podeAvancar = temProxima != null ? temProxima : (itens?.length || 0) >= TAMANHO_PAGINA;

  return (
    <div className="modal focado" onClick={(e) => e.target === e.currentTarget && onFechar()}>
      <div className="modal-conteudo largo">
        <h2>
          <Ic d={ico.lupa} /> Selecionar produto
        </h2>
        {erro && <div className="aviso">{erro}</div>}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            pesquisar(1);
          }}
        >
          <div className="filtros-linha">
            <div className="campo">
              <label htmlFor="pickerCodigo">Código</label>
              <input
                id="pickerCodigo"
                autoComplete="off"
                value={filtros.codigo}
                onChange={(e) => setFiltros((f) => ({ ...f, codigo: e.target.value.replace(/\D/g, "") }))}
              />
            </div>
            <div className="campo">
              <label htmlFor="pickerReferencia">Referência</label>
              <input
                id="pickerReferencia"
                autoComplete="off"
                value={filtros.referencia}
                onChange={(e) => setFiltros((f) => ({ ...f, referencia: e.target.value }))}
              />
            </div>
            <div className="campo">
              <label htmlFor="pickerDescricao">Descrição</label>
              <input
                id="pickerDescricao"
                placeholder="piso"
                value={filtros.descricao}
                onChange={(e) => setFiltros((f) => ({ ...f, descricao: e.target.value }))}
              />
            </div>
          </div>
          <div className="filtros-acoes" style={{ marginTop: 14 }}>
            <button type="submit" className="btn" disabled={carregando}>
              {carregando ? "Pesquisando…" : "Pesquisar"}
            </button>
            <button type="button" className="btn secundario" onClick={onFechar}>
              Fechar
            </button>
          </div>
        </form>

        {carregando && !itens && (
          <div className="mensagem">
            <div className="spinner" />
            <div>Consultando o ERP…</div>
          </div>
        )}
        {itens && itens.length === 0 && <div className="tabela-vazia">Nenhum produto encontrado.</div>}
        {itens && itens.length > 0 && (
          <div className="cards" id="pickerProdutos">
            {itens.map((i) => (
              <button type="button" key={i.codigo} className="card" onClick={() => onEscolher(i)}>
                <header className="card-topo">
                  <span className="card-codigo">{i.codigo}</span>
                  {(i.medida || i.unidade) && <span className="card-ref">{[i.medida, i.unidade].filter(Boolean).join(" · ")}</span>}
                </header>
                <h3 className="card-desc">{tituloLimpo(i.descricao) || "—"}</h3>
                {i.marca && (
                  <div className="card-tags">
                    <span className="tag">{i.marca}</span>
                  </div>
                )}
                <dl className="card-dados">
                  <div>
                    <dt>Est. filial</dt>
                    <dd>{formatar(i.estoque || 0)}</dd>
                  </div>
                  <div>
                    <dt>Est. total</dt>
                    <dd className="destaque-verde">{formatar(i.estoque_total || 0)}</dd>
                  </div>
                </dl>
              </button>
            ))}
          </div>
        )}

        {itens && itens.length > 0 && (
          <div className="paginacao">
            <span className="paginacao-info">
              <b>{itens.length}</b> {itens.length === 1 ? "produto" : "produtos"}
              {total != null && ` de ${total}`}
            </span>
            <div className="paginacao-botoes">
              <button type="button" className="btn secundario mini" disabled={pagina <= 1 || carregando} onClick={() => irPara(pagina - 1)}>
                <Ic d={ico.seta_esq} /> Anterior
              </button>
              <span className="paginacao-atual">
                Página <b>{pagina}</b>
                {total != null && ` de ${totalPaginas}`}
              </span>
              <button type="button" className="btn secundario mini" disabled={!podeAvancar || carregando} onClick={() => irPara(pagina + 1)}>
                Próxima <Ic d={ico.seta_dir} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
