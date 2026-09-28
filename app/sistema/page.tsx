"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { m2PorCaixa } from "@/lib/m2caixa";
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

export default function SistemaPage() {
  const router = useRouter();
  const [pontas, setPontas] = useState<Ponta[]>([]);
  const [filtro, setFiltro] = useState("");
  const [status, setStatus] = useState<{ texto: string; cor: string }>({ texto: "● Sincronizado", cor: "var(--success)" });
  const [mensagem, setMensagem] = useState<{ carregando: boolean; texto: string }>({ carregando: true, texto: "Consultando banco de dados e ERP…" });
  const [usuario, setUsuario] = useState("");
  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState<Ponta | null>(null);

  const carregar = useCallback(
    async (silencioso = false) => {
      if (!silencioso) {
        setMensagem({ carregando: true, texto: "Consultando banco de dados e ERP…" });
        setPontas([]);
      }
      setStatus({ texto: "● Sincronizando...", cor: "#fbbf24" });
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
        setStatus({ texto: "● Sincronizado", cor: "var(--success)" });
        setMensagem({ carregando: false, texto: "" });
      } catch (e: any) {
        if (!silencioso) {
          setMensagem({
            carregando: false,
            texto: "⚠️ Não foi possível consultar o ERP: " + (e?.message || "erro desconhecido"),
          });
        }
        setStatus({ texto: "● Erro de conexão", cor: "var(--danger)" });
        return;
      }
    },
    [router]
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

  async function remover(codigo: string) {
    if (!confirm("Remover a ponta código " + codigo + "?")) return;
    const resp = await fetch("/api/pontas?codigo=" + encodeURIComponent(codigo), { method: "DELETE" });
    const d = await resp.json().catch(() => ({}));
    if (resp.status === 401) {
      sessionStorage.removeItem("ponta_usuario");
      router.replace("/");
      return;
    }
    if (!resp.ok) {
      setStatus({ texto: "● Erro ao remover", cor: "var(--danger)" });
      setMensagem({ carregando: false, texto: "⚠️ " + (d.erro || "não foi possível remover") });
      return;
    }
    carregar(true);
  }

  async function sair() {
    try {
      await fetch("/api/logout", { method: "POST" });
    } catch {}
    sessionStorage.removeItem("ponta_usuario");
    router.replace("/");
  }

  const filtradas = pontas.filter((p) =>
    (p.produto || p.descricao || "").toLowerCase().includes(filtro.toLowerCase()) ||
    (p.lote || "").toLowerCase().includes(filtro.toLowerCase())
  );

  return (
    <>
      <div className="header">
        <h1>
          <span>📦</span> Ponta de Estoque
        </h1>
        <div className="acoes">
          <span style={{ color: "var(--text-muted)", fontSize: 13, fontWeight: 500, marginRight: 4 }}>
            Olá, {usuario}
          </span>
          <button className="btn" onClick={() => setModalAberto(true)}>
            + Novo Cadastro
          </button>
          <button className="btn secundario" title="Consultar produtos no ERP" onClick={() => router.push("/consulta")}>
            🔎 Consultar produtos
          </button>
          <button className="btn secundario" title="Sincronizar com ERP" onClick={() => carregar()}>
            🔄 Atualizar
          </button>
          <button className="btn secundario sair" title="Sair" onClick={sair}>
            Sair
          </button>
        </div>
      </div>

      <div className="corpo">
        <div className="barra-topo glass">
          <div className="barra-topo-texto">
            <h2>Controle de Pisos (Pontas)</h2>
            <p>Monitoramento de saldos sincronizado com o ERP</p>
          </div>
          <div className="controles-topo">
            <span className="status" style={{ color: status.cor }}>
              {status.texto}
            </span>
            <input
              type="text"
              placeholder="Pesquisar produto ou lote…"
              style={{ minWidth: 240 }}
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
            />
          </div>
        </div>

        <div className="grid">
          {mensagem.carregando && (
            <div className="mensagem">
              <div className="spinner"></div>
              <div>{mensagem.texto}</div>
            </div>
          )}
          {!mensagem.carregando && mensagem.texto && <div className="mensagem">{mensagem.texto}</div>}
          {!mensagem.carregando && !mensagem.texto && filtradas.length === 0 && (
            <div className="mensagem">Nenhuma ponta de estoque cadastrada no momento.</div>
          )}
          {filtradas.map((ponta) => (
            <CardPonta
              key={ponta.codigo_erp}
              ponta={ponta}
              onRemover={remover}
              onEditar={() => setEditando(ponta)}
            />
          ))}
        </div>
      </div>

      {modalAberto && (
        <ModalCadastro
          onClose={() => setModalAberto(false)}
          onSalvo={() => {
            setModalAberto(false);
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
            carregar(true);
          }}
        />
      )}
    </>
  );
}

function CardPonta({
  ponta,
  onRemover,
  onEditar,
}: {
  ponta: Ponta;
  onRemover: (codigo: string) => void;
  onEditar: () => void;
}) {
  const qtdCadastrada = parseFloat(String(ponta.quantidade)) || 0;
  // Descrição do ERP tem prioridade: `metros_por_caixa` é cadastro antigo, sem
  // garantia de existir, e a descrição é a fonte que o ERP mantém atualizada.
  const metrosPorCaixa = m2PorCaixa(ponta.descricao) || parseFloat(String(ponta.metros_por_caixa || 0));

  const qtdSistema = parseFloat(String(ponta.sistema ?? ponta.saldo_sistema)) || 0;
  const diferenca = qtdCadastrada - qtdSistema;

  const caminhoFoto = ponta.foto_url || ponta.foto || ponta.imagem;
  const urlFoto = caminhoFoto && !caminhoFoto.startsWith("http") && !caminhoFoto.startsWith("data:image")
    ? caminhoFoto.startsWith("/") ? caminhoFoto : "/" + caminhoFoto
    : caminhoFoto;

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

  const aoSoltar = () => {
    arrasto.current = null;
  };

  return (
    <div className="card glass">
      <div
        className="foto"
        onClick={() => urlFoto && setZoomAberto(true)}
        title={urlFoto ? "Clique para ampliar a foto" : undefined}
      >
        {urlFoto ? (
          <img src={urlFoto} alt={ponta.produto || ponta.descricao} />
        ) : (
          <span style={{ fontSize: 36 }}>📦</span>
        )}
        <div className="card-acoes">
          <button
            className="editar"
            title="Editar ponta"
            onClick={(e) => {
              e.stopPropagation(); // senão abriria o zoom junto com a edição
              onEditar();
            }}
          >
            ✏️ Editar
          </button>
          <button
            className="remover"
            title="Excluir ponta"
            onClick={(e) => {
              e.stopPropagation(); // senão abriria o zoom junto com o delete
              onRemover(ponta.codigo_erp);
            }}
          >
            🗑 Excluir
          </button>
        </div>
      </div>
      <div className="info">
        <h3>{ponta.produto || ponta.descricao || "Produto sem nome"}</h3>
        <div className="card-metrics">
          <div className="metric-row">
            <span>Cadastrado</span>
            <span className="destaque-verde">{formatar(qtdCadastrada)} m²</span>
          </div>
          <div className="metric-row">
            <span>Caixas</span>
            {metrosPorCaixa > 0 ? (
              <strong className="destaque-azul" title={`${formatar(qtdCadastrada)} m² ÷ ${formatar(metrosPorCaixa)} m²/cx`}>
                {formatarCaixas(qtdCadastrada / metrosPorCaixa)} cx
              </strong>
            ) : (
              <em style={{ color: "#64748b", fontSize: 11 }}>Não informado</em>
            )}
          </div>
          {qtdSistema > 0 && diferenca !== 0 && (
            <div className="metric-row" style={{ borderTop: "1px solid rgba(255,255,255,0.04)", paddingTop: 6, marginTop: 2 }}>
              <span>Divergência</span>
              <span style={{ color: diferenca > 0 ? "#10b981" : "#ef4444", fontWeight: 600 }}>
                {diferenca > 0 ? "+" : ""}
                {diferenca.toFixed(2)} m²
              </span>
            </div>
          )}
        </div>
        <div className="meta">
          <span>
            Lote: <b>{ponta.lote || "N/A"}</b>
          </span>
          <span>
            F3: <b>{ponta.codigo_erp || "N/A"}</b>
          </span>
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
            {/* Zoom e pan ficam no transform em vez de width/height: assim a
                transição de escala é suave e o navegador não recalcula layout a
                cada roda do mouse. */}
            <img
              src={urlFoto}
              alt={ponta.produto || ponta.descricao}
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
              onMouseUp={aoSoltar}
              onMouseLeave={aoSoltar}
            />
          </div>
          <div className="zoom-bar">
            <span className="zoom-titulo">
              {ponta.codigo_erp} · {ponta.lote || "sem lote"}
            </span>
            <span className="zoom-nivel">{Math.round(escala * 100)}%</span>
            <button type="button" className="btn secundario" onClick={() => { setEscala((s) => Math.max(1, s - 0.5)); setPos({ x: 0, y: 0 }); }}>
              −
            </button>
            <button type="button" className="btn secundario" onClick={() => { setEscala((s) => Math.min(8, s + 0.5)); setPos({ x: 0, y: 0 }); }}>
              +
            </button>
            <button type="button" className="btn secundario" onClick={() => { setEscala(1); setPos({ x: 0, y: 0 }); }}>
              Ajustar
            </button>
            <button type="button" className="btn secundario" onClick={() => setZoomAberto(false)}>
              Fechar
            </button>
          </div>
          <div className="zoom-dica">Scroll do mouse amplia · duplo clique alterna 1x/3x · ESC fecha</div>
        </dialog>
      )}
    </div>
  );
}

// Edição de uma ponta já cadastrada. Só metragem, lote e foto: o código ERP é
// a identidade da ponta (chave do UPDATE e nome do arquivo de foto), então
// trocar o produto continua sendo apagar + cadastrar.
function ModalEdicao({ ponta, onClose, onSalvo }: { ponta: Ponta; onClose: () => void; onSalvo: () => void }) {
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

  const metrosPorCaixa = m2PorCaixa(ponta.descricao || "") || parseFloat(String(ponta.metros_por_caixa || 0)) || 0;
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
      setAviso(err.message || "Erro ao salvar as alterações.");
    } finally {
      setSalvando(false);
    }
  }

  const fotoAtual = ponta.foto_url || ponta.foto || ponta.imagem;
  const urlFotoAtual = fotoAtual && !fotoAtual.startsWith("http")
    ? fotoAtual.startsWith("/") ? fotoAtual : "/" + fotoAtual
    : fotoAtual;

  return (
    <div className="modal" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-conteudo glass">
        <h2>Editar Ponta</h2>
        {aviso && <div className="aviso">{aviso}</div>}

        <div className="info-produto">
          <b>
            {ponta.codigo_erp} — {ponta.produto || ponta.descricao || "Produto sem nome"}
          </b>
          {cxPossivel ? `${formatar(metrosPorCaixa)} m² por caixa` : "Produto não informa m² por caixa no ERP"}
        </div>

        <div className="campo" style={{ marginTop: 18 }}>
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
              <button
                type="button"
                className={unidadeQtd === "m2" ? "ativo" : ""}
                onClick={() => setUnidadeQtd("m2")}
              >
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
          <small className="dica-unidade">
            Saldo atual: {formatar(parseFloat(String(ponta.quantidade)) || 0)} m²
            {unidadeQtd === "cx" ? ` · = ${formatar(qtdM2)} m² (${formatarCaixas(metrosPorCaixa)} m²/cx)` : ""}
          </small>
        </div>

        <div className="campo">
          <label>Foto (opcional)</label>
          <input type="file" accept="image/*" onChange={onImagemChange} />
          <div style={{ marginTop: 10, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            {urlFotoAtual && (
              <img
                src={urlFotoAtual}
                alt="Foto atual"
                style={{ width: 110, height: 76, objectFit: "contain", borderRadius: "var(--radius-sm)", border: "1px solid var(--glass-border)" }}
              />
            )}
            {preview && (
              <img
                src={preview}
                alt="Nova foto"
                style={{ width: 110, height: 76, objectFit: "contain", borderRadius: "var(--radius-sm)", border: "1px solid var(--accent)" }}
              />
            )}
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
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
          <button className="btn secundario" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn" disabled={!valido || salvando} onClick={salvar}>
            {salvando ? "Salvando..." : "Salvar alterações"}
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
      setAviso("⚠️ Produto escolhido, mas não foi possível carregar os lotes do ERP.");
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
      <div className="modal-conteudo glass">
        <h2>Cadastrar Nova Ponta</h2>
        {aviso && <div className="aviso">{aviso}</div>}

        <div className="campo">
          <label>
            Foto do material <span className="req">*</span>
          </label>
          <input type="file" accept="image/*" onChange={onImagemChange} />
          {preview && (
            <div style={{ marginTop: 10 }}>
              <img
                src={preview}
                alt="Preview"
                style={{ width: "100%", height: 140, objectFit: "cover", borderRadius: "var(--radius-sm)", border: "1px solid var(--glass-border)" }}
              />
              {economia && (
                <small style={{ display: "block", marginTop: 6, color: "var(--text-muted)" }}>
                  Reduzida: {economia} · máx. {FOTO_LADO_MAX}px
                </small>
              )}
            </div>
          )}
        </div>

        <div className="campo">
          <label>
            Produto ERP <span className="req">*</span>
          </label>
          {produto ? (
            <div className="info-produto">
              <b>
                {produto.codigo} — {produto.descricao}
              </b>
              {[produto.medida, produto.marca, produto.unidade].filter(Boolean).join(" · ")}
              <div style={{ marginTop: 10 }}>
                <button type="button" className="btn secundario" onClick={() => setPickerAberto(true)}>
                  Trocar produto
                </button>
              </div>
            </div>
          ) : (
            <button type="button" className="btn" onClick={() => setPickerAberto(true)}>
              🔎 Consultar produtos
            </button>
          )}
        </div>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <div className="campo" style={{ flex: 1, minWidth: 120 }}>
            <label>
              Lote <span className="req">*</span>
            </label>
            <select
              value={lote}
              disabled={!produto || lotesCarregando}
              onChange={(e) => onLoteChange(e.target.value)}
            >
              {!produto && <option value="">— Aguardando código —</option>}
              {produto && lotesCarregando && <option value="">Buscando lotes no ERP...</option>}
              {produto && !lotesCarregando && lotes && lotes.length === 0 && (
                <option value="ÚNICO">LOTE ÚNICO (Sem lote especificado)</option>
              )}
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

          <div className="campo" style={{ flex: 1, minWidth: 120 }}>
            <label>
              {unidadeQtd === "cx" ? "Quantidade de caixas" : "Metragem (m²)"}{" "}
              <span className="req">*</span>
              <span className="unidade-troca">
                <button
                  type="button"
                  className={unidadeQtd === "m2" ? "ativo" : ""}
                  disabled={!produto}
                  onClick={() => setUnidadeQtd("m2")}
                >
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
            {unidadeQtd === "cx" && (
              <small className="dica-unidade">
                = {formatar(qtdM2)} m² ({formatarCaixas(m2cx)} m²/cx)
              </small>
            )}
          </div>
        </div>

        <div className="modal-acoes">
          <button
            className="btn secundario"
            onClick={() => {
              reset();
              onClose();
            }}
          >
            Cancelar
          </button>
          <button className="btn" disabled={!valido || salvando} onClick={salvar}>
            {salvando ? "Enviando..." : "Confirmar Cadastro"}
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
      setErro("⚠️ Informe ao menos código, referência ou descrição.");
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
      setErro("⚠️ " + (e?.message || "não foi possível consultar o ERP"));
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
      <div className="modal-conteudo largo glass">
        <h2>Selecionar produto</h2>
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
          <div className="filtros-acoes">
            <button type="submit" className="btn" disabled={carregando}>
              {carregando ? "Pesquisando..." : "Pesquisar"}
            </button>
            <button type="button" className="btn secundario" onClick={onFechar}>
              Fechar
            </button>
          </div>
        </form>

        {carregando && !itens && (
          <div className="mensagem">
            <div className="spinner"></div>
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
                <h3 className="card-desc">{i.descricao || "—"}</h3>
                {i.marca && <div className="card-tags"><span className="tag">{i.marca}</span></div>}
                <dl className="card-dados">
                  <div>
                    <dt>Est. filial</dt>
                    <dd>{formatar(i.estoque || 0)}</dd>
                  </div>
                  <div>
                    <dt>Est. total</dt>
                    <dd className="forte destaque-verde">{formatar(i.estoque_total || 0)}</dd>
                  </div>
                </dl>
              </button>
            ))}
          </div>
        )}

        {itens && itens.length > 0 && (
          <div className="paginacao">
            <span className="paginacao-info">
              {itens.length} {itens.length === 1 ? "produto" : "produtos"}
              {total != null && ` de ${total}`}
            </span>
            <div className="paginacao-botoes">
              <button type="button" className="btn secundario" disabled={pagina <= 1 || carregando} onClick={() => irPara(pagina - 1)}>
                ‹ Anterior
              </button>
              <span className="paginacao-atual">
                Página <b>{pagina}</b>
                {total != null && ` de ${totalPaginas}`}
              </span>
              <button type="button" className="btn secundario" disabled={!podeAvancar || carregando} onClick={() => irPara(pagina + 1)}>
                Próxima ›
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}