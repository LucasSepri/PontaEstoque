import { erpDisponibilidades, getSessao, json } from "@/lib/erp";

export async function GET() {
  if (!getSessao()) return json({ erro: "nao logado" }, 401);
  try {
    return json(await erpDisponibilidades());
  } catch (e: any) {
    return json({ erro: String(e?.message || e) }, 502);
  }
}
