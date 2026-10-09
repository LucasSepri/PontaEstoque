// Máquina de estados do gesto de zoom da foto, isolada de React e do DOM.
//
// Existe como módulo (e não embutida no `CartaoZoom`) por um motivo: ela é a
// parte com regra de verdade, e a regra do handoff pinça -> 1 dedo já bugou
// uma vez sem nenhum teste pegar. `scripts/check_zoom_toque.mjs` importa
// *este* arquivo, então injetar um bug aqui reprova o teste de verdade.
//
// Regra central: o pan é de 1 dedo e a pinça é de 2. Ao levantar um dos dedos
// no meio da pinça, o que sobra tem de continuar arrastando a partir da
// posição atual, senão a foto só anda enquanto os dois dedos estão encostados.

export type Ponto = { x: number; y: number };
export type Estado = { escala: number; pos: Ponto };

const MIN = 1;
const MAX = 8;

export type Gesto = {
  /** Retângulo da área visível, em coordenadas de tela. */
  area: { left: number; top: number; width: number; height: number };
  estado(): Estado;
  down(id: number, x: number, y: number): void;
  move(id: number, x: number, y: number): Estado | null;
  up(id: number): void;
  /**
   * Muda a escala por fora do gesto (roda, botão +/-, duplo clique).
   *
   * Precisa existir porque a máquina é quem decide se o pan de 1 dedo engata
   * (`escala > 1`). Se a roda mudasse só o estado do React, a máquina ficaria
   * em 1x para sempre e o arrasto de um dedo nunca arrumaria a foto. É o mesmo
   * bug do "só desloco com dois dedos", por outro caminho.
   */
  ajustar(escala: number): Estado;
  /** Só para teste: em quantos pontos ainda há dedo na tela. */
  dedos(): number;
};

export function criarGesto(area: { left: number; top: number; width: number; height: number }, inicial?: Partial<Estado>): Gesto {
  const dedos = new Map<number, Ponto>();
  let estado: Estado = { escala: inicial?.escala ?? 1, pos: inicial?.pos ?? { x: 0, y: 0 } };
  // `pinca` guarda a âncora capturada no instante em que o 2º dedo encostou;
  // `arrasto` guarda o dedo que está puxando e a origem do deslocamento.
  let pinca: { dist: number; escala: number; lx: number; ly: number } | null = null;
  let arrasto: { x: number; y: number; ox: number; oy: number } | null = null;

  const lista = () => Array.from(dedos.values());
  const centro = () => {
    const p = lista();
    return {
      x: p.reduce((s, q) => s + q.x, 0) / p.length,
      y: p.reduce((s, q) => s + q.y, 0) / p.length,
    };
  };
  const distancia = () => {
    const p = lista();
    return p.length < 2 ? 0 : Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
  };
  const limita = (v: number) => Math.min(MAX, Math.max(MIN, v));

  return {
    area,
    estado: () => ({ escala: estado.escala, pos: { ...estado.pos } }),

    down(id, x, y) {
      dedos.set(id, { x, y });
      if (dedos.size === 2) {
        const c = centro();
        // `transform-origin: center` faz o scale() ser medido a partir do centro
        // da área, não do viewport. A âncora é o ponto do gesto em coordenadas
        // da imagem *antes* do scale — é isso que mantém o conteúdo parado sob
        // o dedo em vez de escorregar.
        pinca = {
          dist: distancia(),
          escala: estado.escala,
          lx: (c.x - area.left - area.width / 2 - estado.pos.x) / estado.escala,
          ly: (c.y - area.top - area.height / 2 - estado.pos.y) / estado.escala,
        };
      } else if (dedos.size === 1 && estado.escala > 1) {
        arrasto = { x, y, ox: estado.pos.x, oy: estado.pos.y };
      }
    },

    move(id, x, y) {
      if (!dedos.has(id)) return null;
      dedos.set(id, { x, y });
      if (dedos.size >= 2) {
        const g = pinca;
        if (!g) return null;
        const escala = limita((g.escala * distancia()) / g.dist);
        const c = centro();
        // Em 1x a translate precisa ser zero, senão fechar a pinça até o fim
        // deixa a foto deslocada e sem como recentralizar.
        const pos = escala === 1 ? { x: 0, y: 0 } : {
          x: c.x - area.left - area.width / 2 - g.lx * escala,
          y: c.y - area.top - area.height / 2 - g.ly * escala,
        };
        estado = { escala, pos };
        return estado;
      }
      if (arrasto) {
        // A origem do arrasto (`arrasto.x/y`) fica parada: o deslocamento sai
        // inteiro do dedo desde o pointerdown. Reancorar `arrasto.x` a cada
        // move sem mover `ox` junto faz o delta valer só o último frame, e o
        // pan trava depois do primeiro passo.
        estado = {
          escala: estado.escala,
          pos: { x: arrasto.ox + x - arrasto.x, y: arrasto.oy + y - arrasto.y },
        };
        return estado;
      }
      return null;
    },

    up(id) {
      dedos.delete(id);
      pinca = null;
      if (dedos.size === 1) {
        // Sobrou um dedo no meio de uma pinça. Sem o reancoramento abaixo o
        // pan morre aqui e a foto só anda enquanto os dois dedos estão
        // encostados — que é o bug do "só consigo deslocar com dois dedos".
        const p = lista()[0];
        arrasto = estado.escala > 1 ? { x: p.x, y: p.y, ox: estado.pos.x, oy: estado.pos.y } : null;
      } else {
        arrasto = null;
      }
    },

    ajustar(escala) {
      const s = limita(escala);
      // A translate é ancorada no centro, então mudar a escala sem reposicionar
      // faria a imagem pular. Voltar a 1x é o caso especial do recentralizar.
      estado = { escala: s, pos: s === MIN ? { x: 0, y: 0 } : estado.pos };
      return estado;
    },

    dedos: () => dedos.size,
  };
}
