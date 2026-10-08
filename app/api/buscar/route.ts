import { buscarPorCaixa } from "@/lib/catalogo";
import { erpPesquisar, getSessao, json } from "@/lib/erp";

function num(s: string | null) {
  if (s == null || !s.trim()) return null;
  const v = parseFloat(s.replace(",", "."));
  return isNaN(v) ? null : v;
}

export async function GET(req: Request) {
  if (!getSessao()) return json({ erro: "nao logado" }, 401);
  const p = new URL(req.url).searchParams;

  // Modo legado (?q=) usado pelo modal de cadastro em /sistema: escolhe código ou
  // descrição pelo formato do texto. Mantido para não quebrar quem já chama assim.
  const q = (p.get("q") || "").trim();
  if (q) {
    try {
      const r = await erpPesquisar(q.match(/^\d+$/) ? { codigo: q } : { descricao: q });
      return json({ total: r.itens.length, itens: r.itens });
    } catch (e: any) {
      return json({ erro: String(e?.message || e) }, 502);
    }
  }

  const codigo = (p.get("codigo") || "").trim();
  const referencia = (p.get("referencia") || "").trim();
  const descricao = (p.get("descricao") || "").trim();
  const m2Min = num(p.get("m2_min"));
  const m2Max = num(p.get("m2_max"));
  const cxMin = num(p.get("cx_min"));
  const temFiltroCaixa = m2Min != null || m2Max != null || cxMin != null;
  if (!codigo && !referencia && !descricao) return json({ erro: "informe codigo, referencia ou descricao" }, 400);

  const base = {
    codigo,
    referencia,
    descricao,
    ordem: p.get("ordem") || "ALFABETICA",
    estoque_disponivel: p.get("estoque") === "1",
    estoque_cd: p.get("estoque_cd") === "1",
    estoque_outras: p.get("estoque_outras") === "1",
  };

  try {
    // Com filtro de m²/caixas o ERP não sabe responder, então varre o catálogo inteiro
    // e filtra em memória — a paginação da tela passa a ser sobre o resultado filtrado.
    if (temFiltroCaixa) {
      const { itens, varridos } = await buscarPorCaixa(base, { m2Min, m2Max, cxMin });
      const pagina = Math.max(1, Number(p.get("pagina") || 1));
      const tamanho = Math.max(1, Number(p.get("tamanho") || 20));
      const ini = (pagina - 1) * tamanho;
      return json({
        itens: itens.slice(ini, ini + tamanho),
        pagina,
        tamanho,
        total: itens.length,
        temProxima: ini + tamanho < itens.length,
        varridos,
      });
    }

    const r = await erpPesquisar({ ...base, pagina: Number(p.get("pagina") || 1), tamanho: Number(p.get("tamanho") || 20) });
    // "total" e "temProxima" já vêm de erpPesquisar; não sobrescrever com o tamanho
    // da página, que faria a UI jurar que a página 1 é a única.
    return json(r);
  } catch (e: any) {
    return json({ erro: String(e?.message || e) }, 502);
  }
}