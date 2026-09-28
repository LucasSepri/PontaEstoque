import { setSessao, json } from "@/lib/erp";

export async function POST() {
  setSessao(null);
  return json({ ok: true });
}