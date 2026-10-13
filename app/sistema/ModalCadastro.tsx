"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { m2PorCaixa } from "@/lib/m2caixa";
import { Ic, ico, useEsc } from "@/lib/ui";
import { formatar, formatarBytes, formatarCaixas, prepararFoto, type ItemERP, type Lote } from "./types";

interface ModalCadastroProps {
  onClose: () => void;
  onSalvo: () => void;
}

export default function ModalCadastro({
  onClose,
  onSalvo,
}: ModalCadastroProps) {
  const router = useRouter();
  useEsc(onClose);

  const [imagem, setImagem] =
    useState<{
      base64: string;
      nome: string;
      tipo: string;
    } | null>(null);

  const [preview, setPreview] =
    useState("");

  const [quantidade, setQuantidade] =
    useState("");

  const [lote, setLote] =
    useState("");

  const [lotes, setLotes] =
    useState<Lote[] | null>(null);

  const [
    lotesCarregando,
    setLotesCarregando,
  ] = useState(false);

  const [produto, setProduto] =
    useState<ItemERP | null>(null);

  const [
    pickerAberto,
    setPickerAberto,
  ] = useState(false);

  const [economia, setEconomia] =
    useState("");

  const [unidadeQtd, setUnidadeQtd] =
    useState<"m2" | "cx">("m2");

  const [aviso, setAviso] =
    useState("");

  const [salvando, setSalvando] =
    useState(false);

  const m2cx = produto
    ? m2PorCaixa(
      produto.descricao
    )
    : 0;

  const cxPossivel = m2cx > 0;

  const qtdM2 =
    unidadeQtd === "cx"
      ? (parseFloat(
        quantidade.replace(
          ",",
          "."
        )
      ) || 0) * m2cx
      : parseFloat(
        quantidade.replace(
          ",",
          "."
        )
      ) || 0;

  const valido =
    !!imagem &&
    !!quantidade.trim() &&
    !!produto &&
    !!lote &&
    (unidadeQtd === "m2" ||
      cxPossivel) &&
    qtdM2 > 0;

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

  async function onImagemChange(
    e: React.ChangeEvent<HTMLInputElement>
  ) {
    const arq =
      e.target.files?.[0];

    if (!arq) {
      setImagem(null);
      setPreview("");
      setEconomia("");
      return;
    }

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

  async function escolherProduto(
    p: ItemERP
  ) {
    setProduto(p);
    setLote("");
    setLotes(null);
    setLotesCarregando(true);
    setPickerAberto(false);
    setAviso("");

    try {
      const r = await fetch(
        "/api/lotes?codigo=" +
        encodeURIComponent(
          p.codigo
        )
      );

      const d =
        await r
          .json()
          .catch(() => ({}));

      setLotes(d.lotes || []);
    } catch {
      setLotes([]);

      setAviso(
        "Produto escolhido, mas não foi possível carregar os lotes do ERP."
      );
    } finally {
      setLotesCarregando(false);
    }
  }

  function onLoteChange(
    codigoLote: string
  ) {
    setLote(codigoLote);

    const escolhido =
      lotes?.find(
        (l) =>
          l.lote ===
          codigoLote
      );

    if (
      escolhido &&
      escolhido.disponivel > 0
    ) {
      setQuantidade(
        String(
          escolhido.disponivel
        ).replace(".", ",")
      );

      setUnidadeQtd("m2");
    }
  }

  function nomeFoto() {
    return `${produto!.codigo}.jpg`;
  }

  async function salvar() {
    setAviso("");
    setSalvando(true);

    try {
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
                produto!.codigo,
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

      const resp = await fetch(
        "/api/pontas",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            codigo_erp:
              produto!.codigo,
            descricao:
              produto!.descricao,
            foto: upData.url,
            quantidade: qtdM2,
            lote: lote.trim(),
          }),
        }
      );

      const d =
        await resp.json();

      if (d.erro) {
        throw new Error(
          d.erro
        );
      }

      onSalvo();
    } catch (err: any) {
      setAviso(
        err.message ||
        "Erro ao salvar o produto."
      );
    } finally {
      setSalvando(false);
    }
  }

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
          <Ic d={ico.mais} /> Cadastrar
          nova ponta
        </h2>

        {aviso && (
          <div className="aviso">
            {aviso}
          </div>
        )}

        <div className="campo">
          <label>
            Produto ERP{" "}
            <span className="req">
              *
            </span>
          </label>

          {produto ? (
            <div className="info-produto">
              <b>
                {produto.codigo} —{" "}
                {produto.descricao}
              </b>

              {[
                produto.medida,
                produto.marca,
                produto.unidade,
              ]
                .filter(Boolean)
                .join(" · ")}

              <div
                style={{
                  marginTop: 10,
                }}
              >
                <button
                  type="button"
                  className="btn secundario mini"
                  onClick={() =>
                    setPickerAberto(
                      true
                    )
                  }
                >
                  Trocar produto
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="btn bloco"
              onClick={() =>
                setPickerAberto(
                  true
                )
              }
            >
              <Ic d={ico.lupa} />
              Consultar produtos
            </button>
          )}
        </div>

        <div className="campo">
          <label>
            Foto do material{" "}
            <span className="req">
              *
            </span>
          </label>

          <input
            type="file"
            accept="image/*"
            onChange={onImagemChange}
          />

          {preview && (
            <div
              style={{
                marginTop: 10,
              }}
            >
              <img
                src={preview}
                alt="Preview"
                className="foto-preview"
              />

              {economia && (
                <small className="dica">
                  Reduzida:{" "}
                  {economia} · máx.{" "}
                  {1600}px
                </small>
              )}
            </div>
          )}
        </div>

        <div className="modal-grade">
          <div className="campo">
            <label>
              Lote{" "}
              <span className="req">
                *
              </span>
            </label>

            <select
              value={lote}
              disabled={
                !produto ||
                lotesCarregando
              }
              onChange={(e) =>
                onLoteChange(
                  e.target.value
                )
              }
            >
              {!produto && (
                <option value="">
                  — Escolha o produto —
                </option>
              )}

              {produto &&
                lotesCarregando && (
                  <option value="">
                    Buscando lotes no
                    ERP…
                  </option>
                )}

              {produto &&
                !lotesCarregando &&
                lotes &&
                lotes.length === 0 && (
                  <option value="ÚNICO">
                    LOTE ÚNICO (sem
                    lote especificado)
                  </option>
                )}

              {produto &&
                !lotesCarregando &&
                lotes &&
                lotes.length > 0 && (
                  <>
                    <option value="">
                      — Selecione o lote —
                    </option>

                    {lotes.map(
                      (l) => (
                        <option
                          key={l.lote}
                          value={l.lote}
                        >
                          {l.lote} (Disp:{" "}
                          {
                            l.disponivel
                          }{" "}
                          m²)
                        </option>
                      )
                    )}
                  </>
                )}
            </select>
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
                  disabled={!produto}
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
                    !produto ||
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
              {unidadeQtd === "cx"
                ? `= ${formatar(
                  qtdM2
                )} m² (${formatarCaixas(
                  m2cx
                )} m²/cx)`
                : "Metragem que ficará disponível na ponta."}
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

          <button
            type="button"
            className="btn"
            disabled={
              !valido || salvando
            }
            onClick={salvar}
          >
            {salvando
              ? "Enviando…"
              : "Confirmar cadastro"}
          </button>
        </div>
      </div>

      {pickerAberto && (
        <PickerProdutos
          onEscolher={
            escolherProduto
          }
          onFechar={() =>
            setPickerAberto(false)
          }
        />
      )}
    </div>
  );
}

function PickerProdutos({
  onEscolher,
  onFechar,
}: {
  onEscolher: (
    p: ItemERP
  ) => void;
  onFechar: () => void;
}) {
  useEsc(onFechar);

  const router = useRouter();

  const [filtros, setFiltros] =
    useState({
      codigo: "",
      referencia: "",
      descricao: "",
    });

  const [itens, setItens] =
    useState<ItemERP[] | null>(
      null
    );

  const [pagina, setPagina] =
    useState(1);

  const [total, setTotal] =
    useState<number | null>(null);

  const [
    temProxima,
    setTemProxima,
  ] = useState<boolean | null>(
    null
  );

  const [erro, setErro] =
    useState("");

  const [carregando, setCarregando] =
    useState(false);

  const TAMANHO_PAGINA = 20;

  async function pesquisar(
    p: number
  ) {
    if (
      !filtros.codigo.trim() &&
      !filtros.referencia.trim() &&
      !filtros.descricao.trim()
    ) {
      setErro(
        "Informe ao menos código, referência ou descrição."
      );

      return;
    }

    setCarregando(true);

    try {
      const q =
        new URLSearchParams({
          ...filtros,
          pagina: String(p),
          tamanho: String(
            TAMANHO_PAGINA
          ),
        });

      const resp = await fetch(
        "/api/buscar?" + q
      );

      const d = await resp
        .json()
        .catch(() => ({}));

      if (resp.status === 401) {
        sessionStorage.removeItem(
          "ponta_usuario"
        );

        router.replace("/");

        return;
      }

      if (!resp.ok) {
        throw new Error(
          d.erro ||
          "falha na consulta"
        );
      }

      setItens(d.itens || []);
      setPagina(p);

      setTotal(
        typeof d.total ===
          "number"
          ? d.total
          : null
      );

      setTemProxima(
        typeof d.temProxima ===
          "boolean"
          ? d.temProxima
          : null
      );

      setErro("");
    } catch (e: any) {
      setItens(null);

      setErro(
        e?.message ||
        "não foi possível consultar o ERP"
      );
    } finally {
      setCarregando(false);
    }
  }

  function irPara(p: number) {
    if (p < 1 || carregando) {
      return;
    }

    const alvo =
      document.getElementById(
        "pickerProdutos"
      );

    if (alvo) {
      alvo.scrollTop = 0;
    }

    pesquisar(p);
  }

  const totalPaginas =
    total != null
      ? Math.max(
        1,
        Math.ceil(
          total / TAMANHO_PAGINA
        )
      )
      : 1;

  const podeAvancar =
    temProxima != null
      ? temProxima
      : (itens?.length || 0) >=
      TAMANHO_PAGINA;

  return (
    <div
      className="modal focado"
      onClick={(e) =>
        e.target ===
        e.currentTarget &&
        onFechar()
      }
    >
      <div className="modal-conteudo largo">
        <h2>
          <Ic d={ico.lupa} />
          Selecionar produto
        </h2>

        {erro && (
          <div className="aviso">
            {erro}
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            pesquisar(1);
          }}
        >
          <div className="filtros-linha">
            <div className="campo">
              <label htmlFor="pickerCodigo">
                Código
              </label>

              <input
                id="pickerCodigo"
                autoComplete="off"
                value={
                  filtros.codigo
                }
                onChange={(e) =>
                  setFiltros(
                    (f) => ({
                      ...f,
                      codigo:
                        e.target.value.replace(
                          /\D/g,
                          ""
                        ),
                    })
                  )
                }
              />
            </div>

            <div className="campo">
              <label htmlFor="pickerReferencia">
                Referência
              </label>

              <input
                id="pickerReferencia"
                autoComplete="off"
                value={
                  filtros.referencia
                }
                onChange={(e) =>
                  setFiltros(
                    (f) => ({
                      ...f,
                      referencia:
                        e.target.value,
                    })
                  )
                }
              />
            </div>

            <div className="campo">
              <label htmlFor="pickerDescricao">
                Descrição
              </label>

              <input
                id="pickerDescricao"
                placeholder="piso"
                value={
                  filtros.descricao
                }
                onChange={(e) =>
                  setFiltros(
                    (f) => ({
                      ...f,
                      descricao:
                        e.target.value,
                    })
                  )
                }
              />
            </div>
          </div>

          <div
            className="filtros-acoes"
            style={{
              marginTop: 14,
            }}
          >
            <button
              type="submit"
              className="btn"
              disabled={carregando}
            >
              {carregando
                ? "Pesquisando…"
                : "Pesquisar"}
            </button>

            <button
              type="button"
              className="btn secundario"
              onClick={onFechar}
            >
              Fechar
            </button>
          </div>
        </form>

        {carregando && !itens && (
          <div className="mensagem">
            <div className="spinner" />
            <div>
              Consultando o ERP…
            </div>
          </div>
        )}

        {itens &&
          itens.length === 0 && (
            <div className="tabela-vazia">
              Nenhum produto encontrado.
            </div>
          )}

        {itens &&
          itens.length > 0 && (
            <div
              className="cards"
              id="pickerProdutos"
            >
              {itens.map((i) => (
                <button
                  type="button"
                  key={i.codigo}
                  className="card"
                  onClick={() =>
                    onEscolher(i)
                  }
                >
                  <header className="card-topo">
                    <span className="card-codigo">
                      {i.codigo}
                    </span>

                    {(i.medida ||
                      i.unidade) && (
                        <span className="card-ref">
                          {[
                            i.medida,
                            i.unidade,
                          ]
                            .filter(
                              Boolean
                            )
                            .join(" · ")}
                        </span>
                      )}
                  </header>

                  <h3 className="card-desc">
                    {i.descricao || "—"}
                  </h3>

                  {i.marca && (
                    <div className="card-tags">
                      <span className="tag">
                        {i.marca}
                      </span>
                    </div>
                  )}

                  <dl className="card-dados">
                    <div>
                      <dt>
                        Est. filial
                      </dt>

                      <dd>
                        {formatar(
                          i.estoque ||
                          0
                        )}
                      </dd>
                    </div>

                    <div>
                      <dt>
                        Est. total
                      </dt>

                      <dd className="destaque-verde">
                        {formatar(
                          i.estoque_total ||
                          0
                        )}
                      </dd>
                    </div>
                  </dl>
                </button>
              ))}
            </div>
          )}

        {itens &&
          itens.length > 0 && (
            <div className="paginacao">
              <span className="paginacao-info">
                <b>
                  {itens.length}
                </b>{" "}
                {itens.length === 1
                  ? "produto"
                  : "produtos"}

                {total != null &&
                  ` de ${total}`}
              </span>

              <div className="paginacao-botoes">
                <button
                  type="button"
                  className="btn secundario mini"
                  disabled={
                    pagina <= 1 ||
                    carregando
                  }
                  onClick={() =>
                    irPara(
                      pagina - 1
                    )
                  }
                >
                  <Ic
                    d={ico.seta_esq}
                  />
                  Anterior
                </button>

                <span className="paginacao-atual">
                  Página{" "}
                  <b>{pagina}</b>
                  {total != null &&
                    ` de ${totalPaginas}`}
                </span>

                <button
                  type="button"
                  className="btn secundario mini"
                  disabled={
                    !podeAvancar ||
                    carregando
                  }
                  onClick={() =>
                    irPara(
                      pagina + 1
                    )
                  }
                >
                  Próxima
                  <Ic
                    d={ico.seta_dir}
                  />
                </button>
              </div>
            </div>
          )}
      </div>
    </div>
  );
}