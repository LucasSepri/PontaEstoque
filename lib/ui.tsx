// Ícones e componentes de UI compartilhados por /sistema e /consulta.
// Ficam em `lib/ui.tsx` (e não em cada page.tsx) porque os dois arquivos
// precisam exatamente dos mesmos SVGs: duplicar path de ícone é como os dois
// menus acabam com o mesmo item desenhado de formas diferentes.
import type { ReactNode } from "react";
import { useEffect } from "react";

/** Fecha a camada aberta com ESC. Overlay sem isso é um beco sem saída no teclado. */
export function useEsc(fecha: () => void, ativo = true) {
  useEffect(() => {
    if (!ativo) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") fecha();
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [fecha, ativo]);
}

// Ícones desenhados no viewBox 24×24 e preenchidos com `currentColor`
// (fill: currentColor no CSS) para herdarem a cor do texto sem `stroke`.
export function Ic({ d, className }: { d: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path d={d} />
    </svg>
  );
}

export const ico = {
  painel: "M3 13h8V3H3v10Zm0 8h8v-6H3v6Zm10 0h8V11h-8v10Zm0-18v6h8V3h-8Z",
  caixa: "M12 2 3 7v10l9 5 9-5V7l-9-5Zm0 2.3 6.8 3.8L12 11.9 5.2 8.1 12 4.3ZM5 9.7l6 3.4v6.6l-6-3.4V9.7Zm8 10V13l6-3.4v6.6l-6 3.4Z",
  camadas: "m12 3 9 5-9 5-9-5 9-5Zm0 7.2 5.5-3L12 4.2 6.5 7.2 12 10.2ZM3 12.5l9 5 9-5-2.4-1.3-6.6 3.7-6.6-3.7L3 12.5Zm0 4 9 5 9-5-2.4-1.3-6.6 3.7-6.6-3.7L3 16.5Z",
  entrada: "M12 3 5 10h4v7h6v-7h4l-7-7ZM4 19h16v2H4v-2Z",
  saida: "M12 17 5 10h4V3h6v7h4l-7 7ZM4 19h16v2H4v-2Z",
  grade: "M3 3h8v8H3V3Zm10 0h8v8h-8V3ZM3 13h8v8H3v-8Zm10 0h8v8h-8v-8Z",
  etiqueta: "M21 12 12 3H4a1 1 0 0 0-1 1v8l9 9 9-9ZM7.5 8A1.5 1.5 0 1 1 7.5 5a1.5 1.5 0 0 1 0 3Z",
  relatorio: "M5 3h9l5 5v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm8 1.5V9h4.5L13 4.5ZM7 12h10v1.8H7V12Zm0 4h10v1.8H7V16Zm0-8h4v1.8H7V8Z",
  config: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm8.4 4c0 .5 0 1-.1 1.4l2 1.6-2 3.4-2.4-1a7.6 7.6 0 0 1-2.4 1.4l-.4 2.6h-4l-.4-2.6a7.6 7.6 0 0 1-2.4-1.4l-2.4 1-2-3.4 2-1.6a8.2 8.2 0 0 1 0-2.8l-2-1.6 2-3.4 2.4 1a7.6 7.6 0 0 1 2.4-1.4L9.6 2h4l.4 2.6c.8.3 1.6.8 2.4 1.4l2.4-1 2 3.4-2 1.6c.1.4.1.9.1 1.4Z",
  busca: "M10 4a6 6 0 1 0 0 12 6 6 0 0 0 0-12Zm0 2a4 4 0 1 1 0 8 4 4 0 0 1 0-8Zm5.5 8.5 4 4-1.5 1.5-4-4 1.5-1.5Z",
  mais: "M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6V5Z",
  atualizar: "M12 5V2L8 6l4 4V7a5 5 0 1 1-5 5H5a7 7 0 1 0 7-7Z",
  usuario: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0 2c-4 0-8 2-8 5v3h16v-3c0-3-4-5-8-5Z",
  sair: "M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h5v-2H5V5h5V3Zm6.2 3.2-1.4 1.4L17.2 10H9v2h8.2l-2.4 2.4 1.4 1.4L21 11l-4.8-4.8Z",
  menu: "M3 6h18v2H3V6Zm0 5h18v2H3v-2Zm0 5h18v2H3v-2Z",
  filtro: "M3 5h18v2.2l-7 7V21l-4-2.4v-4.4l-7-7V5Z",
  seta: "m7 9 5 5 5-5 1.4 1.4-6.4 6.4-6.4-6.4L7 9Z",
  lupa: "M15.5 14h-.8l-.3-.3a6.5 6.5 0 1 0-.7.7l.3.3v.8l5 5 1.5-1.5-5-5Zm-6 0a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9Z",
  camadas_min: "M4 6h16v2H4V6Zm0 5h16v2H4v-2Zm0 5h16v2H4v-2Z",
  metro: "M4 4h16a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Zm1 2v12h14V6H5Zm2.5 3h3v2h-3V9Zm0 4h3v2h-3v-2Z",
  moeda: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm.9 4.2v1c1.4.1 2.6.6 2.6 1.7h-1.6c0-.5-.6-.8-1.5-.8s-1.4.3-1.4.7c0 .4.4.6 1.7.8 1.9.3 2.9 1 2.9 2.2 0 1.2-1 1.9-2.6 2v1.2h-1.7v-1.2c-1.6-.1-2.7-.7-2.8-1.9h1.7c.1.6.7 1 1.7 1s1.6-.3 1.6-.8c0-.4-.4-.6-1.6-.8-2-.3-3-.9-3-2.1 0-1.1 1-1.8 2.6-1.9v-1.1h1.7Z",
  alerta: "M12 2 1 21h22L12 2Zm1 14h-2v2h2v-2Zm0-6h-2v5h2v-5Z",
  ok: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm-1.2 14.6-4-4 1.4-1.4 2.6 2.6 6-6 1.4 1.4-7.4 7.4Z",
  info: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm1 15h-2v-6h2v6Zm0-8h-2V7h2v2Z",
  sair_x: "M6.4 5 5 6.4 10.6 12 5 17.6 6.4 19 12 13.4 17.6 19 19 17.6 13.4 12 19 6.4 17.6 5 12 10.6 6.4 5Z",
  lixeira: "M6 7h12v13a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V7Zm3-4h6l1 2h4v2H4V5h4l1-2Z",
  lapis: "M3 17.2V21h3.8L17.8 10 14 6.2 3 17.2ZM20.7 7.1a1 1 0 0 0 0-1.4l-2.4-2.4a1 1 0 0 0-1.4 0L15 5.2 18.8 9l1.9-1.9Z",
  mais_detalhe: "M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm1 2v10h14V7H5Z",
  seta_esq: "m14 6-6 6 6 6 1.4-1.4-4.6-4.6 4.6-4.6L14 6Z",
  seta_dir: "m10 6 6 6-6 6-1.4-1.4 4.6-4.6-4.6-4.6L10 6Z",
};

/** Iniciais do usuário para o avatar: 1ª e 2ª palavra. */
export function iniciais(nome: string) {
  const partes = (nome || "").trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return "?";
  return ((partes[0][0] || "") + (partes[1]?.[0] || "")).toUpperCase();
}

/** Item do menu da sidebar. */
export function NavItem({
  icone,
  children,
  ativo,
  desabilitado,
  onClick,
  badge,
}: {
  icone: string;
  children: ReactNode;
  ativo?: boolean;
  desabilitado?: boolean;
  onClick?: () => void;
  badge?: string;
}) {
  return (
    <button
      type="button"
      className={"nav-item" + (ativo ? " nav-item--ativo" : "") + (desabilitado ? " nav-item--off" : "")}
      onClick={onClick}
      disabled={desabilitado}
      aria-current={ativo ? "page" : undefined}
      title={desabilitado ? "Em breve" : undefined}
    >
      <Ic d={icone} />
      <span>{children}</span>
      {badge && <span className="nav-badge">{badge}</span>}
    </button>
  );
}

/**
 * Menu lateral. `mini` recolhe para ícones; em telas estreitas a gaveta abre
 * sobre o conteúdo (ver `.shell--drawer` no CSS).
 *
 * Itens sem rota existem mas ficam desabilitados e marcados "Em breve" — a
 * alternativa (esconder) faz a sidebar parecer quebrada.
 */
export function Sidebar({
  mini,
  usuario,
  ativo,
  onNavegar,
  onRecolher,
}: {
  mini: boolean;
  usuario: string;
  ativo: string;
  onNavegar: (rota: string) => void;
  onRecolher?: () => void;
}) {
  return (
    <aside className="sidebar">
      <div className="sidebar-marca">
        <div className="sidebar-logo">📦</div>
        <div style={{ minWidth: 0 }}>
          <div className="sidebar-nome">Ponta de Estoque</div>
          <div className="sidebar-sub">Pisos e revestimentos</div>
        </div>
      </div>

      <div className="sidebar-secao">Operação</div>
      <NavItem icone={ico.painel} ativo={ativo === "sistema"} onClick={() => onNavegar("/sistema")}>
        Controle
      </NavItem>
      <NavItem icone={ico.grade} ativo={ativo === "consulta"} onClick={() => onNavegar("/consulta")}>
        Produtos
      </NavItem>
      <NavItem icone={ico.caixa} desabilitado>
        Estoque
      </NavItem>
      <NavItem icone={ico.entrada} desabilitado>
        Entradas
      </NavItem>
      <NavItem icone={ico.saida} desabilitado>
        Saídas
      </NavItem>

      <div className="sidebar-secao">Catálogo</div>
      <NavItem icone={ico.grade} desabilitado>
        Categorias
      </NavItem>
      <NavItem icone={ico.etiqueta} desabilitado>
        Marcas
      </NavItem>
      <NavItem icone={ico.relatorio} desabilitado>
        Relatórios
      </NavItem>
      <NavItem icone={ico.config} desabilitado>
        Configurações
      </NavItem>

      <div className="sidebar-rodape">
        <div className="sidebar-user">
          <div className="avatar">{iniciais(usuario)}</div>
          <div className="sidebar-user-txt">
            <div className="sidebar-user-nome">{usuario || "—"}</div>
            <div className="sidebar-user-papel">Operador</div>
          </div>
        </div>
        {onRecolher && (
          <button type="button" className="nav-item" onClick={onRecolher} title="Recolher menu" style={{ marginTop: 4, width: "100%" }}>
            <Ic d={ico.menu} />
            <span>Recolher menu</span>
          </button>
        )}
      </div>
    </aside>
  );
}

/** Barra superior: contexto da tela à esquerda, ações à direita. */
export function Topbar({
  titulo,
  subtitulo,
  onAbrirMenu,
  children,
}: {
  titulo: string;
  subtitulo?: string;
  onAbrirMenu?: () => void;
  children?: ReactNode;
}) {
  return (
    <header className="topbar">
      {onAbrirMenu && (
        <button type="button" className="hamburger" onClick={onAbrirMenu} aria-label="Abrir menu">
          <Ic d={ico.menu} />
        </button>
      )}
      <div className="topbar-titulo">
        <h1>{titulo}</h1>
        {subtitulo && <p>{subtitulo}</p>}
      </div>
      <div className="topbar-acoes">{children}</div>
    </header>
  );
}

type Toast = { id: number; tipo: "ok" | "erro" | "info"; titulo: string; desc?: string };

/** Pilha de toasts. Fica aqui porque as duas telas usam o mesmo tipo. */
export function Toasts({ itens }: { itens: Toast[] }) {
  if (!itens.length) return null;
  return (
    <div className="toasts" role="status" aria-live="polite">
      {itens.map((t) => (
        <div key={t.id} className={"toast toast--" + t.tipo}>
          <span className="toast-icone">
            <Ic d={t.tipo === "ok" ? ico.ok : t.tipo === "erro" ? ico.alerta : ico.info} />
          </span>
          <div className="toast-txt">
            <div className="toast-titulo">{t.titulo}</div>
            {t.desc && <div className="toast-desc">{t.desc}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

export type { Toast };
