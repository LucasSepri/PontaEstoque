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
    // A URL é estável (<codigo_erp>.<ext>) e a foto pode ser trocada por outra
    // do mesmo produto: com `immutable` o navegador servia a versão antiga por
    // um ano e a troca nunca aparecia. O ETag sobre size+mtime mantém o cache
    // (revalidar custa um 304, não os bytes) e troca a imagem assim que o
    // arquivo muda em disco.
    const etag = `W/"${info.size.toString(16)}-${Math.round(info.mtimeMs).toString(16)}"`;
    const headers = {
      "Content-Type": tipo,
      "Content-Length": String(info.size),
      "Cache-Control": "no-cache",
      ETag: etag,
    };
    if (_req.headers.get("if-none-match") === etag) {
      return new Response(null, { status: 304, headers });
    }
    const stream = createReadStream(caminho);
    return new Response(stream as unknown as BodyInit, { headers });
  } catch {
    return new Response("nao encontrado", { status: 404 });
  }
}
