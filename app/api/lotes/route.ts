import { erpLotes, getSessao, json } from "@/lib/erp";

export async function GET(req: Request) {
  if (!getSessao()) return json({ erro: "nao logado" }, 401);
  const codigo = (new URL(req.url).searchParams.get("codigo") || "").trim();
  if (!codigo) return json({ erro: "codigo obrigatorio" }, 400);
  try {
    return json({ lotes: await erpLotes(codigo) });
  } catch (e: any) {
    return json({ erro: String(e?.message || e) }, 502);
  }
}