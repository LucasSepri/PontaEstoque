// Autoverificação da máquina de gestos do zoom da foto.
//
// Importa `lib/gestoZoom.ts` — o mesmo arquivo que `app/sistema/page.tsx`
// usa — em vez de reimplementar a regra aqui. Um teste que copia a lógica
// passa mesmo com o app quebrado: foi exatamente o que aconteceu com o
// handoff pinça -> 1 dedo, que o teste antigo "validou" com o bug injetado.
//
// Rodar: node scripts/check_zoom_toque.mjs  (Node 22.6+/24 faz type-stripping)
import assert from "node:assert/strict";
import { criarGesto } from "../lib/gestoZoom.ts";

const AREA = { left: 0, top: 0, width: 400, height: 800 };
const g = () => criarGesto(AREA);

/** Posição de tela do pixel (px,py) da imagem no estado `s`. */
const tela = (s, px, py) => ({
  x: AREA.left + AREA.width / 2 + s.pos.x + px * s.escala,
  y: AREA.top + AREA.height / 2 + s.pos.y + py * s.escala,
});

// --- 1. Pinça ancorada mantém o ponto sob o ponto médio dos dedos.
{
  const s = g();
  s.down(1, 100, 400);
  s.down(2, 300, 400); // dist 200, centro (200,400)
  s.move(1, 50, 400);
  s.move(2, 350, 400); // dist 300 => 1.5x
  const e = s.estado();
  assert.equal(e.escala, 1.5);
  // o pixel âncora (0,0 relativo ao centro da área) continua sob os dedos
  assert.deepEqual(tela(e, 0, 0), { x: 200, y: 400 });
}

// --- 2. Teto em 8x e floor em 1x, com recentralização ao chegar em 1x.
{
  const s = g();
  s.down(1, 100, 400);
  s.down(2, 300, 400); // dist 200
  s.move(1, 0, 400);
  s.move(2, 400, 400); // dist 400 => 2x
  assert.equal(s.estado().escala, 2);
  s.move(1, 100, 400);
  s.move(2, 300, 400); // volta a dist 200 => 1x (piso)
  const e = s.estado();
  assert.equal(e.escala, 1);
  assert.deepEqual(e.pos, { x: 0, y: 0 }, "em 1x a translate volta a zero");
}

// --- 2b. Teto: passando muito do teto, a escala clampa em 8x.
{
  const s = g();
  s.down(1, 0, 400);
  s.down(2, 200, 400); // dist 200
  s.move(1, -4000, 400);
  s.move(2, 4000, 400);
  assert.equal(s.estado().escala, 8);
}

// --- 3. Pan de 1 dedo engata só quando já ampliado; em 1x o dedo é só tap.
{
  const s = g();
  s.down(1, 100, 100);
  s.move(1, 200, 200);
  assert.deepEqual(s.estado(), { escala: 1, pos: { x: 0, y: 0 } }, "1x não arrasta");
}

// --- 4. Handoff pinça -> 1 dedo: ao levantar um dedo, o outro continua
// arrastando 1:1. Este é o bug do "só consigo deslocar com dois dedos".
{
  const s = g();
  s.down(1, 100, 400);
  s.down(2, 300, 400);
  s.move(1, 50, 400);
  s.move(2, 350, 400);
  assert.equal(s.estado().escala, 1.5);

  s.up(1); // sobrou o dedo 2 na tela
  const antes = s.estado();
  s.move(2, 300, 430);
  const depois = s.estado();
  assert.deepEqual(
    { x: depois.pos.x - antes.pos.x, y: depois.pos.y - antes.pos.y },
    { x: -50, y: 30 },
    "1 dedo arrasta 1:1 com o deslocamento do dedo",
  );
  assert.equal(depois.escala, antes.escala, "o pan não mexe na escala");
}

// --- 5. Handoff inverso: pan pelo 1º dedo e o 2º volta durante o arasto.
{
  const s = g();
  s.down(1, 100, 400);
  s.down(2, 300, 400);
  s.move(1, 100, 400);
  s.move(2, 300, 500); // afasta os dedos
  s.up(2);
  const antes = s.estado();
  s.move(1, 120, 420);
  const depois = s.estado();
  assert.deepEqual(
    { x: depois.pos.x - antes.pos.x, y: depois.pos.y - antes.pos.y },
    { x: 20, y: 20 },
    "reancorar não duplica o deslocamento",
  );
}

// --- 6. Zoom por fora do gesto (roda, botão, duplo clique) tem de ligar o pan
// de 1 dedo. Sem `ajustar`, a máquina fica em 1x e só a pinça continua
// funcionando — era o sintoma "só consigo deslocar com dois dedos".
{
  const s = g();
  s.ajustar(3);
  s.down(1, 200, 400);
  s.move(1, 300, 400);
  assert.deepEqual(
    { x: s.estado().pos.x, y: s.estado().pos.y },
    { x: 100, y: 0 },
    "após zoom de roda, 1 dedo arrasta 1:1",
  );
}

// --- 7. `ajustar` volta a zero a translate ao chegar em 1x, e clampa o teto.
{
  const s = g();
  s.ajustar(4);
  s.down(1, 200, 400);
  s.down(2, 300, 400);
  s.move(1, 200, 400);
  s.move(2, 500, 400);
  assert.ok(s.estado().pos.x !== 0, "pinça deslocou a imagem");
  const e = s.ajustar(1);
  assert.deepEqual(e, { escala: 1, pos: { x: 0, y: 0 } });
  assert.equal(s.ajustar(99).escala, 8, "teto");
  assert.equal(s.ajustar(0.1).escala, 1, "piso");
}

console.log("check_zoom_toque: 8 grupos de asserção OK");
