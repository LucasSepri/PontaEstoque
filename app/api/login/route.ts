import { erpLogin, setSessao, json } from "@/lib/erp";

export async function POST(req: Request) {
  const corpo = await req.json().catch(() => ({}));
  const usuario = String(corpo.Usuario || "").trim();
  const senha = String(corpo.Senha || "");
  if (!usuario || !senha) {
    return json({ Status: "ERRO", Mensagem: "Usuario e senha obrigatorios" }, 400);
  }
  try {
    const data = await erpLogin(usuario, senha);
    if (data.Status === "SUCESSO") {
      setSessao({ usuario, senha });
      console.log("Login ERP:", usuario);
    }
    return json(data);
  } catch (e: any) {
    return json({ Status: "ERRO", Mensagem: String(e?.message || e) }, 502);
  }
}