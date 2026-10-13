"use client";

import { useCallback, useEffect, useState } from "react";
import { m2PorCaixa as m2Caixa } from "@/lib/m2caixa";
import { Ic, ico, useEsc } from "@/lib/ui";
import { formatar, formatarCaixas, prepararFoto, urlDaFoto, type Lote, type Ponta, formatarBytes } from "./types";

interface ModalEdicaoProps {
  ponta: Ponta;
  onClose: () => void;
  onSalvo: () => void;
  onAviso: (m: string) => void;
}

export default function ModalEdicao({
  ponta,
  onClose,
  onSalvo,
  onAviso,
}: ModalEdicaoProps) {
  const [quantidade, setQuantidade] =
    useState(
      String(
        ponta.quantidade ?? ""
      ).replace(".", ",")
    );

  const [unidadeQtd, setUnidadeQtd] =
    useState<"m2" | "cx">("m2");

  const [lote, setLote] = useState(
    ponta.lote || ""
  );

  const [lotes, setLotes] =
    useState<Lote[] | null>(null);

  const [
    lotesCarregando,
    setLotesCarregando,
  ] = useState(false);

  const [imagem, setImagem] =
    useState<{
      base64: string;
      nome: string;
      tipo: string;
    } | null>(null);

  const [preview, setPreview] =
    useState("");

  const [economia, setEconomia] =
    useState("");

  const [aviso, setAviso] =
    useState("");

  const [salvando, setSalvando] =
    useState(false);

  useEsc(onClose);

  const metrosPorCaixa = m2Caixa(ponta.descricao);

  const cxPossivel =
    metrosPorCaixa > 0;

  const qtdM2 =
    unidadeQtd === "cx"
      ? (parseFloat(
        quantidade.replace(
          ",",
          "."
        )
      ) || 0) *
      metrosPorCaixa
      : parseFloat(
        quantidade.replace(
          ",",
          "."
        )
      ) || 0;

  const valido =
    quantidade.trim() !== "" &&
    lote.trim() !== "" &&
    (unidadeQtd === "m2" ||
      cxPossivel) &&
    qtdM2 > 0;

  useEffect(() => {
    let cancelado = false;

    setLotesCarregando(true);

    fetch(
      "/api/lotes?codigo=" +
      encodeURIComponent(
        ponta.codigo_erp
      )
    )
      .then((r) =>
        r.json().catch(() => ({}))
      )
      .then(
        (d) =>
          !cancelado &&
          setLotes(d.lotes || [])
      )
      .catch(
        () =>
          !cancelado &&
          setLotes([])
      )
      .finally(
        () =>
          !cancelado &&
          setLotesCarregando(false)
      );

    return () => {
      cancelado = true;
    };
  }, [ponta.codigo_erp]);

  async function onImagemChange(
    e: React.ChangeEvent<HTMLInputElement>
  ) {
    const arq =
      e.target.files?.[0];

    if (!arq) return;

    setAviso("");

    try {
      const p =
        await prepararFoto(arq);

      setImagem({
        base64: p.base64,
        nome: p.nome,
        tipo: p.tipo,
      });

      setPreview(p.preview);

      setEconomia(
        `${formatarBytes(
          arq.size
        )} → ${formatarBytes(
          Math.round(
            (p.base64.length *
              3) /
            4
          )
        )}`
      );
    } catch (err: any) {
      setImagem(null);
      setPreview("");
      setEconomia("");

      setAviso(
        err.message ||
        "Não consegui carregar a imagem."
      );
    }
  }

  function nomeFoto() {
    return `${ponta.codigo_erp}.jpg`;
  }

  async function salvar() {
    setAviso("");
    setSalvando(true);

    try {
      const corpo: Record<
        string,
        unknown
      > = {
        codigo_erp:
          ponta.codigo_erp,
        quantidade: qtdM2,
        lote: lote.trim(),
      };

      if (imagem) {
        const up = await fetch(
          "/api/upload",
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              ...imagem,
              nome: nomeFoto(),
              codigo_erp:
                ponta.codigo_erp,
            }),
          }
        );

        const upData =
          await up.json();

        if (upData.erro) {
          throw new Error(
            upData.erro
          );
        }

        corpo.foto = upData.url;
      }

      const resp = await fetch(
        "/api/pontas",
        {
          method: "PUT",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify(
            corpo
          ),
        }
      );

      const d =
        await resp
          .json()
          .catch(() => ({}));

      if (resp.status === 401) {
        throw new Error(
          "sessão expirada"
        );
      }

      if (d.erro) {
        throw new Error(d.erro);
      }

      onSalvo();
    } catch (err: any) {
      const m =
        err.message ||
        "Erro ao salvar as alterações.";

      setAviso(m);
      onAviso(m);
    } finally {
      setSalvando(false);
    }
  }

  const urlFotoAtual =
    urlDaFoto(ponta);

  return (
    <div
      className="modal"
      onClick={(e) =>
        e.target ===
        e.currentTarget &&
        onClose()
      }
    >
      <div className="modal-conteudo">
        <h2>
          <Ic d={ico.lapis} /> Editar
          ponta
        </h2>

        {aviso && (
          <div className="aviso">
            {aviso}
          </div>
        )}

        <div className="info-produto">
          <b>
            {ponta.codigo_erp} —{" "}
            {ponta.produto ||
            ponta.descricao}
          </b>

          {cxPossivel
            ? `${formatar(
              metrosPorCaixa
            )} m² por caixa`
            : "Produto não informa m² por caixa no ERP"}
        </div>

        <div
          className="modal-grade"
          style={{ marginTop: 16 }}
        >
          <div className="campo">
            <label>
              Lote{" "}
              <span className="req">
                *
              </span>
            </label>

            <input
              type="text"
              list="lotes-edicao"
              placeholder={
                lotesCarregando
                  ? "Buscando lotes no ERP..."
                  : "Lote do material"
              }
              value={lote}
              onChange={(e) =>
                setLote(
                  e.target.value
                )
              }
            />

            <datalist id="lotes-edicao">
              {(lotes || []).map(
                (l) => (
                  <option
                    key={l.lote}
                    value={l.lote}
                  >
                    {formatar(
                      l.disponivel
                    )}{" "}
                    m² disponíveis
                  </option>
                )
              )}
            </datalist>
          </div>

          <div className="campo">
            <label>
              {unidadeQtd === "cx"
                ? "Quantidade de caixas"
                : "Metragem (m²)"}{" "}
              <span className="req">
                *
              </span>

              <span className="unidade-troca">
                <button
                  type="button"
                  className={
                    unidadeQtd ===
                      "m2"
                      ? "ativo"
                      : ""
                  }
                  onClick={() =>
                    setUnidadeQtd(
                      "m2"
                    )
                  }
                >
                  m²
                </button>

                <button
                  type="button"
                  className={
                    unidadeQtd ===
                      "cx"
                      ? "ativo"
                      : ""
                  }
                  disabled={
                    !cxPossivel
                  }
                  title={
                    cxPossivel
                      ? "Informar em caixas e calcular os m²"
                      : "Este produto não informa m² por caixa no ERP"
                  }
                  onClick={() =>
                    setUnidadeQtd(
                      "cx"
                    )
                  }
                >
                  cx
                </button>
              </span>
            </label>

            <input
              type="text"
              inputMode="decimal"
              placeholder={
                unidadeQtd === "cx"
                  ? "Ex: 12 caixas"
                  : "Ex: 45,5"
              }
              value={quantidade}
              onChange={(e) =>
                setQuantidade(
                  e.target.value
                )
              }
            />

            <small className="dica">
              Saldo atual:{" "}
              {formatar(
                parseFloat(
                  String(
                    ponta.quantidade
                  )
                ) || 0
              )}{" "}
              m²
              {unidadeQtd === "cx"
                ? ` · = ${formatar(
                  qtdM2
                )} m² (${formatarCaixas(
                  metrosPorCaixa
                )} m²/cx)`
                : ""}
            </small>
          </div>
        </div>

        <div className="campo">
          <label>
            Foto (opcional)
          </label>

          <input
            type="file"
            accept="image/*"
            onChange={onImagemChange}
          />

          <div className="foto-linha">
            {urlFotoAtual && (
              <img
                src={urlFotoAtual}
                alt="Foto atual"
                className="foto-mini"
              />
            )}

            {preview && (
              <img
                src={preview}
                alt="Nova foto"
                className="foto-mini foto-mini--nova"
              />
            )}

            <span className="foto-nota">
              {preview
                ? "A nova foto substitui a atual ao salvar."
                : "Deixe em branco para manter a foto atual."}

              {economia && (
                <>
                  <br />
                  Reduzida:{" "}
                  {economia}
                </>
              )}
            </span>
          </div>
        </div>

        <div className="modal-acoes">
          <button
            type="button"
            className="btn secundario"
            onClick={onClose}
          >
            Cancelar
          </button>

          <button
            type="button"
            className="btn"
            disabled={
              !valido || salvando
            }
            onClick={salvar}
          >
            {salvando
              ? "Salvando…"
              : "Salvar alterações"}
          </button>
        </div>
      </div>
    </div>
  );
}