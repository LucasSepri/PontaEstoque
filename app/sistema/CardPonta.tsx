"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { criarGesto, type Estado, type Gesto } from "@/lib/gestoZoom";
import { STATUS_INFO } from "@/lib/produto";
import { Ic, ico, useEsc } from "@/lib/ui";
import { formatar, formatarCaixas, urlDaFoto, type Derivado, type Ponta } from "./types";

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
  const {
    ponta,
    m2,
    caixas,
    porCaixa,
    status,
    categoria: cat,
    titulo,
  } = dados;

  const info = STATUS_INFO[status];
  const urlFoto = urlDaFoto(ponta);

  const qtdSistema =
    parseFloat(
      String(
        ponta.sistema ??
        ponta.saldo_sistema
      )
    ) || 0;

  const diferenca =
    m2 - qtdSistema;

  const [zoomAberto, setZoomAberto] =
    useState(false);

  const [escala, setEscala] =
    useState(1);

  const [pos, setPos] = useState({
    x: 0,
    y: 0,
  });

  const st = useRef<Estado>({
    escala: 1,
    pos: {
      x: 0,
      y: 0,
    },
  });

  st.current = {
    escala,
    pos,
  };

  const fimGesto = useRef(0);

  const zoomRef =
    useRef<HTMLDialogElement>(null);

  const imgRef =
    useRef<HTMLImageElement>(null);

  const areaRef =
    useRef<HTMLDivElement>(null);

  const [arrastando, setArrastando] =
    useState(false);

  const mousePan = useRef<{
    ativo: boolean;
    pointerId: number;
    x: number;
    y: number;
    posX: number;
    posY: number;
  }>({
    ativo: false,
    pointerId: -1,
    x: 0,
    y: 0,
    posX: 0,
    posY: 0,
  });

  useEsc(
    () => setZoomAberto(false),
    zoomAberto
  );

  useEffect(() => {
    const dlg = zoomRef.current;

    if (
      zoomAberto &&
      dlg &&
      !dlg.open
    ) {
      dlg.showModal();
    }

    if (
      !zoomAberto &&
      dlg?.open
    ) {
      dlg.close();
    }
  }, [zoomAberto]);

  useEffect(() => {
    if (!zoomAberto) return;

    const inicial = {
      escala: 1,
      pos: {
        x: 0,
        y: 0,
      },
    };

    st.current = inicial;

    setEscala(1);
    setPos({
      x: 0,
      y: 0,
    });

    mousePan.current = {
      ativo: false,
      pointerId: -1,
      x: 0,
      y: 0,
      posX: 0,
      posY: 0,
    };
  }, [zoomAberto]);

  const gestoRef =
    useRef<Gesto | null>(null);

  const limitar = useCallback(
    (e: Estado): Estado => {
      if (e.escala <= 1) {
        return {
          escala: 1,
          pos: {
            x: 0,
            y: 0,
          },
        };
      }

      const img = imgRef.current;
      const area = areaRef.current;

      if (!img || !area) {
        return e;
      }

      const larguraImagem =
        img.offsetWidth *
        e.escala;

      const alturaImagem =
        img.offsetHeight *
        e.escala;

      const mx = Math.max(
        0,
        (larguraImagem -
          area.clientWidth) /
        2
      );

      const my = Math.max(
        0,
        (alturaImagem -
          area.clientHeight) /
        2
      );

      return {
        escala: e.escala,
        pos: {
          x: Math.max(
            -mx,
            Math.min(
              mx,
              e.pos.x
            )
          ),

          y: Math.max(
            -my,
            Math.min(
              my,
              e.pos.y
            )
          ),
        },
      };
    },
    []
  );

  const aplicar = useCallback(
    (bruto: Estado | null) => {
      if (!bruto) return;

      const e = limitar(bruto);

      st.current = e;

      setEscala(e.escala);
      setPos(e.pos);
    },
    [limitar]
  );

  useEffect(() => {
    const dlg = zoomRef.current;

    if (!zoomAberto || !dlg) {
      return;
    }

    const gesto = criarGesto(
      dlg.getBoundingClientRect(),
      st.current
    );

    gestoRef.current = gesto;

    const aoBaixar = (
      e: PointerEvent
    ) => {
      const target =
        e.target as HTMLElement | null;

      if (
        target?.closest(
          ".zoom-bar"
        )
      ) {
        return;
      }

      if (
        e.pointerType === "mouse"
      ) {
        if (
          e.button !== 0 ||
          st.current.escala <= 1
        ) {
          return;
        }

        e.preventDefault();
        e.stopPropagation();

        const atual =
          st.current.pos;

        mousePan.current = {
          ativo: true,
          pointerId: e.pointerId,
          x: e.clientX,
          y: e.clientY,
          posX: atual.x,
          posY: atual.y,
        };

        try {
          dlg.setPointerCapture(
            e.pointerId
          );
        } catch { }

        setArrastando(true);

        return;
      }

      try {
        dlg.setPointerCapture(
          e.pointerId
        );
      } catch { }

      gesto.down(
        e.pointerId,
        e.clientX,
        e.clientY
      );
    };

    const aoMover = (
      e: PointerEvent
    ) => {
      const mouse =
        mousePan.current;

      if (
        mouse.ativo &&
        mouse.pointerId ===
        e.pointerId
      ) {
        e.preventDefault();

        const dx =
          e.clientX - mouse.x;

        const dy =
          e.clientY - mouse.y;

        const novo: Estado = {
          escala:
            st.current.escala,

          pos: {
            x:
              mouse.posX + dx,
            y:
              mouse.posY + dy,
          },
        };

        aplicar(novo);

        return;
      }

      if (
        e.pointerType === "mouse"
      ) {
        return;
      }

      if (
        gesto.move(
          e.pointerId,
          e.clientX,
          e.clientY
        )
      ) {
        e.preventDefault();
      }

      aplicar(gesto.estado());
    };

    const encerrar = (
      e: PointerEvent
    ) => {
      if (
        mousePan.current.ativo &&
        mousePan.current.pointerId ===
        e.pointerId
      ) {
        mousePan.current.ativo =
          false;

        mousePan.current.pointerId =
          -1;

        try {
          if (
            dlg.hasPointerCapture(
              e.pointerId
            )
          ) {
            dlg.releasePointerCapture(
              e.pointerId
            );
          }
        } catch { }

        setArrastando(false);

        fimGesto.current =
          performance.now();

        return;
      }

      gesto.up(e.pointerId);

      try {
        if (
          dlg.hasPointerCapture(
            e.pointerId
          )
        ) {
          dlg.releasePointerCapture(
            e.pointerId
          );
        }
      } catch { }

      fimGesto.current =
        gesto.dedos() > 0
          ? performance.now()
          : 0;

      setArrastando(false);
    };

    const aoCancelar = (
      e: PointerEvent
    ) => {
      if (
        mousePan.current.ativo &&
        mousePan.current.pointerId ===
        e.pointerId
      ) {
        mousePan.current.ativo =
          false;

        mousePan.current.pointerId =
          -1;

        setArrastando(false);

        fimGesto.current =
          performance.now();

        return;
      }

      if (
        e.pointerType === "mouse"
      ) {
        return;
      }

      gesto.cancelar();

      aplicar(gesto.estado());

      fimGesto.current =
        performance.now();

      setArrastando(false);
    };

    dlg.addEventListener(
      "pointerdown",
      aoBaixar
    );

    dlg.addEventListener(
      "pointermove",
      aoMover,
      {
        passive: false,
      }
    );

    dlg.addEventListener(
      "pointerup",
      encerrar
    );

    dlg.addEventListener(
      "pointercancel",
      aoCancelar
    );

    return () => {
      mousePan.current.ativo =
        false;

      gestoRef.current = null;

      dlg.removeEventListener(
        "pointerdown",
        aoBaixar
      );

      dlg.removeEventListener(
        "pointermove",
        aoMover
      );

      dlg.removeEventListener(
        "pointerup",
        encerrar
      );

      dlg.removeEventListener(
        "pointercancel",
        aoCancelar
      );
    };
  }, [
    zoomAberto,
    aplicar,
  ]);

  const mudarEscala = useCallback(
    (
      nova: number,
      ponto?: {
        x: number;
        y: number;
      }
    ) => {
      const atual = st.current;

      const limitada = Math.max(
        1,
        Math.min(8, nova)
      );

      if (limitada === 1) {
        aplicar({
          escala: 1,
          pos: {
            x: 0,
            y: 0,
          },
        });

        return;
      }

      const area = areaRef.current;

      if (!area) {
        aplicar({
          escala: limitada,
          pos: atual.pos,
        });

        return;
      }

      const rect =
        area.getBoundingClientRect();

      const focoX =
        ponto?.x ??
        rect.left +
        rect.width / 2;

      const focoY =
        ponto?.y ??
        rect.top +
        rect.height / 2;

      const mouseX =
        focoX -
        (rect.left +
          rect.width / 2);

      const mouseY =
        focoY -
        (rect.top +
          rect.height / 2);

      const imagemX =
        (mouseX - atual.pos.x) /
        atual.escala;

      const imagemY =
        (mouseY - atual.pos.y) /
        atual.escala;

      const novaPos = {
        x:
          mouseX -
          imagemX * limitada,

        y:
          mouseY -
          imagemY * limitada,
      };

      aplicar({
        escala: limitada,
        pos: novaPos,
      });
    },
    [aplicar]
  );

  const ajustar = (
    f: (s: number) => number
  ) => {
    return () => {
      mudarEscala(
        f(st.current.escala)
      );
    };
  };

  useEffect(() => {
    const dlg = zoomRef.current;

    if (!zoomAberto || !dlg) {
      return;
    }

    const aoRolar = (
      e: WheelEvent
    ) => {
      e.preventDefault();

      const fator =
        e.deltaY < 0
          ? 1.15
          : 1 / 1.15;

      mudarEscala(
        st.current.escala * fator,
        {
          x: e.clientX,
          y: e.clientY,
        }
      );
    };

    dlg.addEventListener(
      "wheel",
      aoRolar,
      {
        passive: false,
      }
    );

    return () => {
      dlg.removeEventListener(
        "wheel",
        aoRolar
      );
    };
  }, [
    zoomAberto,
    escala,
  ]);

  return (
    <article className="card">
      <div
        className="card-media"
        onClick={() =>
          urlFoto &&
          setZoomAberto(true)
        }
        title={
          urlFoto
            ? "Clique para ampliar a foto"
            : undefined
        }
      >
        {urlFoto ? (
          <img
            src={urlFoto}
            alt={titulo}
            loading="lazy"
          />
        ) : (
          <div className="card-media-vazio">
            <span>📦</span>
            <span>Sem foto</span>
          </div>
        )}

        <span
          className={
            "badge badge-sobre " +
            info.classe
          }
        >
          {info.rotulo}
        </span>

        {urlFoto && (
          <span className="card-media-zoom">
            <Ic d={ico.lupa} />
          </span>
        )}
      </div>

      <div className="card-corpo">
        <div>
          <h3 className="card-nome">
            {titulo}
          </h3>

          <div className="card-ref">
            Ref.{" "}
            {ponta.codigo_erp || "—"}
          </div>
        </div>

        <div className="card-tags">
          <span className="tag tag--forte">
            {cat}
          </span>

          {porCaixa > 0 && (
            <span className="tag">
              {formatar(porCaixa)} m²/cx
            </span>
          )}
        </div>

        <div className="metricas">
          <div className="metrica metrica--destaque">
            <div className="metrica-rotulo">
              M² disponível
            </div>

            <div className="metrica-valor">
              {formatar(m2)}{" "}
              <small>m²</small>
            </div>
          </div>

          <div className="metrica metrica--caixa">
            <div className="metrica-rotulo">
              Caixas
            </div>

            <div
              className="metrica-valor"
              title={
                porCaixa > 0
                  ? `${formatar(
                    m2
                  )} m² ÷ ${formatar(
                    porCaixa
                  )} m²/cx`
                  : "Produto não informa m² por caixa no ERP"
              }
            >
              {porCaixa > 0
                ? formatarCaixas(
                  caixas
                )
                : "—"}
            </div>
          </div>

          <div className="metrica">
            <div className="metrica-rotulo">
              Lote
            </div>

            <div className="metrica-valor">
              {ponta.lote || "—"}
            </div>
          </div>
        </div>

        {qtdSistema > 0 &&
          Math.abs(
            diferenca
          ) > 0.005 && (
            <div
              className={
                "divergencia " +
                (diferenca > 0
                  ? "divergencia--ok"
                  : "divergencia--bad")
              }
            >
              <Ic d={ico.info} />

              Divergência de{" "}
              {diferenca > 0
                ? "+"
                : ""}
              {formatar(
                diferenca
              )}{" "}
              m² vs. sistema
            </div>
          )}

        <div className="card-pe">
          <div className="card-preco">
            <div className="card-preco-valor">
              —
            </div>

            <div className="card-preco-un">
              preço na consulta ERP
            </div>
          </div>

          <div className="card-acoes">
            <button
              type="button"
              className="btn secundario mini"
              onClick={onAbrir}
            >
              Ver detalhes
            </button>

            <button
              type="button"
              className="btn-icone"
              onClick={onEditar}
              title="Editar ponta"
              aria-label={`Editar ${titulo}`}
            >
              <Ic d={ico.lapis} />
            </button>

            <button
              type="button"
              className="btn-icone perigo"
              onClick={onRemover}
              title="Excluir ponta"
              aria-label={`Excluir ${titulo}`}
            >
              <Ic d={ico.lixeira} />
            </button>
          </div>
        </div>
      </div>

      {urlFoto && (
        <dialog
          ref={zoomRef}
          className="zoom-foto"
          onClick={(e) => {
            if (
              e.target ===
              e.currentTarget &&
              performance.now() -
              fimGesto.current >
              400
            ) {
              setZoomAberto(false);
            }
          }}
          onClose={() =>
            setZoomAberto(false)
          }
        >
          <div
            ref={areaRef}
            className="zoom-area"
            onClick={() => {
              if (
                escala === 1 &&
                performance.now() -
                fimGesto.current >
                400
              ) {
                setZoomAberto(false);
              }
            }}
          >
            <img
              ref={imgRef}
              src={urlFoto}
              alt={titulo}
              draggable={false}
              onDragStart={(e) =>
                e.preventDefault()
              }
              className={
                (escala > 1
                  ? "ampliada"
                  : "") +
                (arrastando
                  ? " arrastando"
                  : "")
              }
              style={{
                transform: `translate(${pos.x}px, ${pos.y}px) scale(${escala})`,
                transformOrigin: "center center",
                userSelect: "none",
                WebkitUserSelect: "none",
                touchAction: "none",
              }}
              onClick={(e) =>
                e.stopPropagation()
              }
              onDoubleClick={(e) => {
                const novaEscala =
                  st.current.escala > 1
                    ? 1
                    : 3;

                mudarEscala(
                  novaEscala,
                  {
                    x: e.clientX,
                    y: e.clientY,
                  }
                );
              }}
            />
          </div>

          <div className="zoom-bar">
            <span className="zoom-titulo">
              {titulo} ·{" "}
              {ponta.lote ||
                "sem lote"}
            </span>

            <span className="zoom-nivel">
              {Math.round(
                escala * 100
              )}
              %
            </span>

            <button
              type="button"
              className="btn secundario mini"
              onClick={ajustar(
                (s) =>
                  Math.max(
                    1,
                    s - 0.5
                  )
              )}
              aria-label="Diminuir zoom"
            >
              −
            </button>

            <button
              type="button"
              className="btn secundario mini"
              onClick={ajustar(
                (s) =>
                  Math.min(
                    8,
                    s + 0.5
                  )
              )}
              aria-label="Aumentar zoom"
            >
              +
            </button>

            <button
              type="button"
              className="btn secundario mini"
              onClick={ajustar(
                () => 1
              )}
            >
              Ajustar
            </button>

            <button
              type="button"
              className="btn secundario mini"
              onClick={() =>
                setZoomAberto(
                  false
                )
              }
            >
              Fechar
            </button>
          </div>

          <div className="zoom-dica">
            Scroll ou pinça amplia ·
            arraste com o mouse para
            deslocar · duplo clique
            alterna 1x/3x · ESC fecha
          </div>
        </dialog>
      )}
    </article>
  );
}

export default CardPonta;