// Máquina de estados do gesto de zoom da foto, isolada de React e do DOM.
//
// Existe como módulo (e não embutida no `CartaoZoom`) por um motivo: ela é a
// parte com regra de verdade, e a regra do handoff pinça -> 1 dedo já bugou
// uma vez sem nenhum teste pegar. `scripts/check_zoom_toque.mjs` importa
// este arquivo, então injetar um bug aqui reprova o teste de verdade.
//
// Regras:
// - 1 dedo = pan
// - 2 dedos = pinça
// - ao levantar um dos dedos durante a pinça, o dedo restante continua o pan
//   a partir da posição atual
// - ao voltar para 1x, a imagem sempre retorna ao centro
// - cancelar() limpa completamente os dedos e os estados transitórios

export type Ponto = {
  x: number;
  y: number;
};

export type Estado = {
  escala: number;
  pos: Ponto;
};

const MIN = 1;
const MAX = 8;
const EPSILON = 0.0001;

export type Gesto = {
  /** Retângulo da área visível, em coordenadas de tela. */
  area: {
    left: number;
    top: number;
    width: number;
    height: number;
  };

  /** Retorna uma cópia do estado atual. */
  estado(): Estado;

  /** Registra um dedo/pointer entrando no gesto. */
  down(id: number, x: number, y: number): void;

  /** Atualiza a posição de um dedo/pointer. */
  move(id: number, x: number, y: number): Estado | null;

  /** Remove um dedo/pointer do gesto. */
  up(id: number): void;

  /**
   * Encerra o gesto inteiro, soltando todos os dedos de uma vez.
   *
   * É usado principalmente em pointercancel. O estado visual da foto
   * permanece intacto; somente os estados transitórios do gesto são limpos.
   */
  cancelar(): Estado;

  /**
   * Altera a escala externamente:
   * - roda
   * - botão +
   * - botão -
   * - duplo clique
   *
   * A máquina precisa receber essa alteração para saber se o pan de 1 dedo
   * deve estar habilitado.
   */
  ajustar(escala: number): Estado;

  /** Quantidade de pointers atualmente registrados. */
  dedos(): number;
};

export function criarGesto(
  area: {
    left: number;
    top: number;
    width: number;
    height: number;
  },
  inicial?: Partial<Estado>,
): Gesto {
  const dedos = new Map<number, Ponto>();

  const escalaInicial =
    typeof inicial?.escala === "number" && Number.isFinite(inicial.escala)
      ? limitarEscala(inicial.escala)
      : MIN;

  const posInicial =
    inicial?.pos &&
    Number.isFinite(inicial.pos.x) &&
    Number.isFinite(inicial.pos.y)
      ? {
          x: inicial.pos.x,
          y: inicial.pos.y,
        }
      : {
          x: 0,
          y: 0,
        };

  let estado: Estado = {
    escala: escalaInicial,
    pos: escalaInicial === MIN ? { x: 0, y: 0 } : posInicial,
  };

  /**
   * Estado da pinça.
   *
   * dist:
   *   distância entre os dois dedos no início da pinça.
   *
   * escala:
   *   escala existente quando o segundo dedo entrou.
   *
   * lx / ly:
   *   ponto da imagem, em coordenadas locais antes do scale, que estava
   *   exatamente abaixo do centro da pinça.
   */
  let pinca: {
    dist: number;
    escala: number;
    lx: number;
    ly: number;
  } | null = null;

  /**
   * Estado do pan de um dedo.
   *
   * x / y:
   *   posição atual do dedo no início do trecho de arrasto.
   *
   * ox / oy:
   *   posição da imagem correspondente àquele instante.
   */
  let arrasto: {
    x: number;
    y: number;
    ox: number;
    oy: number;
  } | null = null;

  const copiarEstado = (): Estado => ({
    escala: estado.escala,
    pos: {
      x: estado.pos.x,
      y: estado.pos.y,
    },
  });

  const lista = (): Ponto[] => Array.from(dedos.values());

  const centro = (): Ponto => {
    const pontos = lista();

    if (pontos.length === 0) {
      return {
        x: 0,
        y: 0,
      };
    }

    return {
      x: pontos.reduce((soma, ponto) => soma + ponto.x, 0) / pontos.length,
      y: pontos.reduce((soma, ponto) => soma + ponto.y, 0) / pontos.length,
    };
  };

  const distancia = (): number => {
    const pontos = lista();

    if (pontos.length < 2) {
      return 0;
    }

    return Math.hypot(
      pontos[0].x - pontos[1].x,
      pontos[0].y - pontos[1].y,
    );
  };

  return {
    area,

    estado: () => copiarEstado(),

    down(id, x, y) {
      // Novo pointer substitui a posição anterior caso o browser envie
      // novamente um pointerdown para o mesmo ID.
      dedos.set(id, { x, y });

      if (dedos.size >= 2) {
        // A partir do momento em que existem dois dedos, o modo pan deixa
        // de ser válido. A pinça passa a controlar a transformação.
        arrasto = null;

        const c = centro();
        const dist = distancia();

        // Evita uma divisão instável se os dois dedos forem registrados
        // praticamente no mesmo ponto.
        if (dist <= EPSILON) {
          pinca = null;
          return;
        }

        /**
         * transform-origin: center
         *
         * A transformação da imagem é:
         *
         * translate(pos.x, pos.y) scale(escala)
         *
         * Portanto, guardamos o ponto do gesto em coordenadas locais da
         * imagem antes da nova escala.
         */
        pinca = {
          dist,
          escala: estado.escala,

          lx:
            (c.x -
              area.left -
              area.width / 2 -
              estado.pos.x) /
            estado.escala,

          ly:
            (c.y -
              area.top -
              area.height / 2 -
              estado.pos.y) /
            estado.escala,
        };

        return;
      }

      if (dedos.size === 1 && estado.escala > MIN) {
        // Primeiro dedo de um novo pan.
        arrasto = {
          x,
          y,
          ox: estado.pos.x,
          oy: estado.pos.y,
        };
      } else {
        arrasto = null;
      }
    },

    move(id, x, y) {
      // Ignora eventos de pointer que não pertencem mais ao gesto.
      if (!dedos.has(id)) {
        return null;
      }

      dedos.set(id, { x, y });

      /**
       * ================================================================
       * PINÇA — 2 dedos
       * ================================================================
       */
      if (dedos.size >= 2) {
        const g = pinca;

        // Pode acontecer se os dois dedos entraram no mesmo ponto ou se
        // houve cancelamento/reentrada muito rápido.
        if (!g || g.dist <= EPSILON) {
          return null;
        }

        const novaDistancia = distancia();

        if (!Number.isFinite(novaDistancia)) {
          return null;
        }

        const escala = limitarEscala(
          (g.escala * novaDistancia) / g.dist,
        );

        const c = centro();

        /**
         * Mantém o ponto da imagem que estava sob o centro da pinça
         * exatamente sob o novo centro da pinça.
         */
        const pos =
          escala === MIN
            ? {
                x: 0,
                y: 0,
              }
            : {
                x:
                  c.x -
                  area.left -
                  area.width / 2 -
                  g.lx * escala,

                y:
                  c.y -
                  area.top -
                  area.height / 2 -
                  g.ly * escala,
              };

        estado = {
          escala,
          pos,
        };

        return copiarEstado();
      }

      /**
       * ================================================================
       * PAN — 1 dedo
       * ================================================================
       */
      if (dedos.size === 1 && arrasto) {
        const pos = {
          x: arrasto.ox + x - arrasto.x,
          y: arrasto.oy + y - arrasto.y,
        };

        /**
         * Atualizamos somente a origem do próximo deslocamento.
         *
         * IMPORTANTE:
         * ox/oy continuam sendo a posição acumulada da imagem. Isso evita
         * perda de deslocamento quando vários pointermove são recebidos.
         */
        arrasto = {
          x,
          y,
          ox: arrasto.ox,
          oy: arrasto.oy,
        };

        estado = {
          escala: estado.escala,
          pos,
        };

        return copiarEstado();
      }

      return null;
    },

    up(id) {
      /**
       * Se o ID já foi removido por outro evento (por exemplo, pointercancel),
       * não há nada para fazer.
       */
      if (!dedos.has(id)) {
        return;
      }

      dedos.delete(id);

      /**
       * A pinça acabou porque um dos dedos saiu.
       *
       * Se ainda existe exatamente um dedo, precisamos transformar esse
       * dedo imediatamente em um novo pan.
       *
       * Este é o ponto crítico do handoff:
       *
       *     2 dedos → pinça → 1 dedo → pan
       *
       * O pan começa na posição atual da imagem, portanto não existe salto.
       */
      pinca = null;

      if (dedos.size === 1 && estado.escala > MIN) {
        const [ponto] = lista();

        if (ponto) {
          arrasto = {
            x: ponto.x,
            y: ponto.y,
            ox: estado.pos.x,
            oy: estado.pos.y,
          };

          return;
        }
      }

      /**
       * Se não sobrou exatamente um dedo ampliado, não existe pan ativo.
       */
      arrasto = null;
    },

    cancelar() {
      /**
       * pointercancel significa que o browser tomou posse do gesto ou que
       * o pointer deixou de estar disponível.
       *
       * Não alteramos escala nem posição. Apenas eliminamos os pointers
       * e os estados intermediários para que o próximo gesto comece limpo.
       */
      dedos.clear();
      pinca = null;
      arrasto = null;

      return copiarEstado();
    },

    ajustar(escala) {
      /**
       * Normaliza valores vindos de controles externos.
       *
       * Isso evita que NaN ou Infinity contaminem o estado da máquina.
       */
      const s = limitarEscala(escala);

      /**
       * Ao voltar para 1x, sempre recentraliza.
       *
       * Para valores maiores que 1, mantemos a posição atual. O componente
       * React pode usar este método para +/-, roda e duplo clique sem perder
       * a posição do pan.
       */
      estado = {
        escala: s,
        pos:
          s === MIN
            ? {
                x: 0,
                y: 0,
              }
            : {
                x: estado.pos.x,
                y: estado.pos.y,
              },
      };

      /**
       * Um ajuste externo não deve deixar uma pinça/pan antigo ativo.
       * O próximo pointerdown deve estabelecer uma nova âncora.
       */
      pinca = null;
      arrasto = null;

      return copiarEstado();
    },

    dedos: () => dedos.size,
  };
}

/**
 * Mantém a escala sempre dentro dos limites válidos.
 *
 * Também trata NaN e Infinity para que nenhum valor inválido entre no estado.
 */
function limitarEscala(valor: number): number {
  if (!Number.isFinite(valor)) {
    return MIN;
  }

  return Math.min(MAX, Math.max(MIN, valor));
}