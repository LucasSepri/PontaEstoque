import { getSessao, json } from "@/lib/erp";
import { salvarFoto } from "@/lib/db";

export async function POST(req: Request) {
  if (!getSessao()) return json({ erro: "nao logado" }, 401);
  const corpo = await req.json().catch(() => ({}));
  const arq = corpo.arquivo || corpo.base64 || "";
  const nome = String(corpo.nome || "imagem.jpg");
  const ctype = corpo.content_type || corpo.tipo || "image/jpeg";

  let binario: Buffer;
  try {
    binario = Buffer.from(arq, "base64");
  } catch {
    return json({ erro: "base64 invalido" }, 400);
  }
  if (!binario.length) return json({ erro: "imagem vazia" }, 400);

  const nomeLimpo = nome.replace(/[^A-Za-z0-9._-]/g, "_");
  try {
    const url = await salvarFoto(binario, nomeLimpo, ctype);
    return json({ url });
  } catch (e: any) {
    console.error("Erro Upload:", e);
    return json({ erro: String(e?.message || e) }, 502);
  }
}