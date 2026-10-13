import { erpBuscar, erpLotes, getSessao, json } from "@/lib/erp";
import { pontasListar, pontaAtualizar, pontaDeletar, pontaInserir, pontaTrocarFoto, pontaConferir } from "@/lib/db";

export async function GET() {
  if (!getSessao()) return json({ erro: "nao logado" }, 401);
  try {
    const pontas = await pontasListar();
    // Sincroniza estoque com o ERP em paralelo. Antes era sequencial: ~11s por ponta
    // deixava a requisição passar de 40s e o proxy cortava. Lote zerado => deleta ponta.
    // O cache serve o poll de 60s da tela quase de graça; só quando o lote dá zero é
    // que vale gastar uma chamada fresca, porque aí a decisão é apagar registro.
    const sincronizadas = await Promise.all(
      pontas.map(async (p: any) => {
        try {
          const loteSel = String(p.lote || "").trim();
          // Três desfechos distintos, e a diferença importa: o ERP devolve a
          // lista de lotes do produto, então "não achei o lote" pode ser lote
          // renomeado, digitado errado ou já excluído — nada disso é estoque
          // zerado. Tratar os dois como zero apagava a ponta e a foto do
          // usuário por causa de um typo no campo Lote.
          const ler = (ls: any[]) => {
            if (!loteSel) return { achou: false, disponivel: 0 };
            const info = ls.find((l: any) => l.lote === loteSel);
            return info
              ? { achou: true, disponivel: Number(info.disponivel) || 0 }
              : { achou: false, disponivel: 0 };
          };
          let r = ler(await erpLotes(p.codigo_erp));
          if (!r.achou || r.disponivel <= 0) r = ler(await erpLotes(p.codigo_erp, true));
          // Sem lote cadastrado não dá para conferir nada: mantém o registro.
          if (!loteSel) return { remover: false as const };
          if (!r.achou) {
            // Antes isto zerava e apagava. Agora só marca o saldo como não lido
            // (null) para a tela cobrar a correção do lote no cadastro.
            if (p.estoque_erp !== null) {
              const campos = { estoque_erp: null, sincronizado_em: new Date().toISOString() };
              await pontaAtualizar(p.codigo_erp, campos);
              Object.assign(p, campos);
            }
            return { remover: false as const };
          }
          if (r.disponivel <= 0) return { remover: true as const, codigo: p.codigo_erp };
          // Comparação numérica obrigatória: `estoque_erp` é `numeric` e o pg
          // devolve string, então `!==` dava sempre verdadeiro e o sync
          // reescrevia a linha a cada poll — o que zeraria `conferido_em`.
          if (r.disponivel !== Number(p.estoque_erp)) {
            const campos = {
              estoque_erp: r.disponivel,
              sincronizado_em: new Date().toISOString(),
              conferido_em: null,
            };
            await pontaAtualizar(p.codigo_erp, campos);
            Object.assign(p, campos);
          }
          return { remover: false as const };
        } catch {
          // ERP fora do ar: mantém último conhecido
          return { remover: false as const };
        }
      })
    );

    const paraDeletar = sincronizadas.filter((s) => s.remover).map((s) => s.codigo);
    for (const codigo of paraDeletar) await pontaDeletar(codigo);
    const restantes = pontas.filter((p: any) => !paraDeletar.includes(p.codigo_erp));
    return json({ pontas: restantes });
  } catch (e: any) {
    return json({ erro: String(e?.message || e) }, 502);
  }
}

export async function POST(req: Request) {
  if (!getSessao()) return json({ erro: "nao logado" }, 401);
  const corpo = await req.json().catch(() => ({}));
  const codigo = String(corpo.codigo_erp || "").trim();
  if (!codigo) return json({ erro: "codigo_erp obrigatorio" }, 400);

  const pontas = await pontasListar();
  if (pontas.some((p: any) => p.codigo_erp === codigo)) {
    return json({ erro: "ponta ja cadastrada" }, 409);
  }

  let descricao = String(corpo.descricao || "").trim();
  let unidade = "";
  try {
    const itens = await erpBuscar(codigo);
    const item = itens.find((i: any) => i.codigo === codigo);
    if (item) {
      descricao = descricao || item.descricao;
      unidade = item.unidade;
    }
  } catch {
    // ERP indisponível: usa descrição enviada
  }
  if (!descricao) return json({ erro: "produto nao encontrado no ERP" }, 404);

  const quantidade = parseFloat(String(corpo.quantidade || 0).replace(",", ".")) || 0;
  const nova = {
    codigo_erp: codigo,
    descricao,
    unidade,
    foto_url: String(corpo.foto || "").trim(),
    quantidade,
    lote: String(corpo.lote || "").trim(),
    estoque_erp: null,
    ativo: true,
  };
  try {
    await pontaInserir(nova);
    return json({ ok: true }, 201);
  } catch (e: any) {
    return json({ erro: String(e?.message || e) }, 502);
  }
}

// PUT edita os campos que o usuário controls: metragem, lote e foto. O
// codigo_erp é a identidade da ponta (chave do update e do nome do arquivo de
// foto), então trocar o produto exigiria apagar e cadastrar de novo.
// Também aceita `conferido_em` para marcar a conferência aceita (sem mexer na
// quantidade contada).
export async function PUT(req: Request) {
  if (!getSessao()) return json({ erro: "nao logado" }, 401);
  const corpo = await req.json().catch(() => ({}));
  const codigo = String(corpo.codigo_erp || "").trim();
  if (!codigo) return json({ erro: "codigo_erp obrigatorio" }, 400);

  const campos: Record<string, unknown> = {};
  if (corpo.quantidade !== undefined) {
    const qtd = parseFloat(String(corpo.quantidade).replace(",", "."));
    if (!(qtd > 0)) return json({ erro: "quantidade invalida" }, 400);
    campos.quantidade = qtd;
  }
  if (corpo.lote !== undefined) campos.lote = String(corpo.lote || "").trim();
  const novaFoto = corpo.foto ? String(corpo.foto).trim() : "";

  // Conferência aceita: carimba conferido_em no servidor (não confia no cliente).
  const conferir = corpo.conferido_em !== undefined;
  if (conferir) {
    const quando = new Date().toISOString();
    if (!(await pontaConferir(codigo, quando))) {
      return json({ erro: "ponta nao encontrada" }, 404);
    }
  }

  // Se só veio conferido_em, não cai no "nada para atualizar".
  if (Object.keys(campos).length === 0 && !novaFoto && !conferir) {
    return json({ erro: "nada para atualizar" }, 400);
  }

  try {
    // A foto vai por fora porque só ela precisa do arquivo antigo em disco:
    // `pontaTrocarFoto` apaga o anterior, e fazer isso no mesmo UPDATE deixaria
    // de saber qual URL era a velha.
    if (Object.keys(campos).length > 0) {
      // `pontaAtualizar` devolve null quando o WHERE não casa nada: sem isso um
      // código inexistente responderia 200 e a UI juraria que salvou.
      if (!(await pontaAtualizar(codigo, campos))) return json({ erro: "ponta nao encontrada" }, 404);
    }
    if (novaFoto && !(await pontaTrocarFoto(codigo, novaFoto))) {
      return json({ erro: "ponta nao encontrada" }, 404);
    }
    return json({ ok: true });
  } catch (e: any) {
    return json({ erro: String(e?.message || e) }, 502);
  }
}

export async function DELETE(req: Request) {
  if (!getSessao()) return json({ erro: "nao logado" }, 401);
  const codigo = new URL(req.url).searchParams.get("codigo") || "";
  try {
    await pontaDeletar(codigo);
    return json({ ok: true });
  } catch (e: any) {
    return json({ erro: String(e?.message || e) }, 502);
  }
}