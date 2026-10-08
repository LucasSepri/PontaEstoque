import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import { DIR_FOTOS } from "@/lib/db";

// A foto vive em `fotos/` na raiz, fora do `public/`: o `next start` serve
// `public/` de um retrato tirado no boot, então um upload gravado depois do
// start devolvia 404 para sempre. Aqui o disco é lido a cada request.
const TIPOS: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

export async function GET(_req: Request, { params }: { params: { nome: string } }) {
  const nome = decodeURIComponent(String(params.nome));

  // `params.nome` nunca traz "/", mas a checagem fecha o resto: sem barra não
  // existe subdiretório nem ".." a resolver, e a extensão tem que ser de imagem
  // (sem isso /fotos/.env.local seria lido). Validado em
  // scripts/check_fotos_guard.mjs.
  if (!nome || /[/\\]/.test(nome) || nome.includes("..")) return new Response("nao encontrado", { status: 404 });
  const ext = "." + nome.split(".").pop()!.toLowerCase();
  const tipo = TIPOS[ext];
  if (!tipo) return new Response("formato nao suportado", { status: 415 });

  try {
    const caminho = join(DIR_FOTOS, nome);
    const info = await stat(caminho);
    if (!info.isFile()) return new Response("nao encontrado", { status: 404 });
    const stream = createReadStream(caminho);
    return new Response(stream as unknown as BodyInit, {
      headers: {
        "Content-Type": tipo,
        "Content-Length": String(info.size),
        // O nome do arquivo é <codigo_erp>.<ext>: mudou o arquivo, mudou a URL.
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new Response("nao encontrado", { status: 404 });
  }
}
