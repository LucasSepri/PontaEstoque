import { erpAgregados, erpEstoquePorFilial, erpOfertas, erpSimilares, getSessao, json } from "@/lib/erp";

// Um endpoint só para os quatro painéis do card: a UI pede o que precisa com ?tipo=.
const TIPOS = {
  estoque: erpEstoquePorFilial,
  similares: erpSimilares,
  agregados: erpAgregados,
  ofertas: erpOfertas,
} as const;

export async function GET(req: Request) {
  if (!getSessao()) return json({ erro: "nao logado" }, 401);
  const p = new URL(req.url).searchParams;
  const codigo = (p.get("codigo") || "").trim();
  const tipo = (p.get("tipo") || "") as keyof typeof TIPOS;
  if (!codigo) return json({ erro: "informe codigo" }, 400);
  if (!TIPOS[tipo]) return json({ erro: "tipo invalido" }, 400);
  try {
    return json({ itens: await TIPOS[tipo](codigo) });
  } catch (e: any) {
    return json({ erro: String(e?.message || e) }, 502);
  }
}
