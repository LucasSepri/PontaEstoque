import { erpPesquisar, getSessao, json } from "@/lib/erp";

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
  if (!codigo && !referencia && !descricao) return json({ erro: "informe codigo, referencia ou descricao" }, 400);

  try {
    const r = await erpPesquisar({
      codigo,
      referencia,
      descricao,
      ordem: p.get("ordem") || "ALFABETICA",
      estoque_disponivel: p.get("estoque") === "1",
      estoque_cd: p.get("estoque_cd") === "1",
      estoque_outras: p.get("estoque_outras") === "1",
      pagina: Number(p.get("pagina") || 1),
      tamanho: Number(p.get("tamanho") || 20),
    });
    // "total" e "temProxima" já vêm de erpPesquisar; não sobrescrever com o tamanho
    // da página, que faria a UI jurar que a página 1 é a única.
    return json(r);
  } catch (e: any) {
    return json({ erro: String(e?.message || e) }, 502);
  }
}