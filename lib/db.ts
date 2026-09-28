// Acesso ao Postgres (VPS) via node-postgres
import { Pool } from "pg";

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ||
    "postgres://ponta_app:senha@localhost:5432/ponta_estoque",
  max: 5,
});

export async function pontasListar(): Promise<any[]> {
  const { rows } = await pool.query("SELECT * FROM pontas ORDER BY id");
  return rows;
}

export async function pontaInserir(ponta: Record<string, unknown>) {
  const cols = Object.keys(ponta);
  const vals = cols.map((c) => ponta[c]);
  const { rows } = await pool.query(
    `INSERT INTO pontas (${cols.join(", ")}) VALUES (${cols
      .map((_, i) => "$" + (i + 1))
      .join(", ")}) RETURNING *`,
    vals
  );
  return rows[0];
}

export async function pontaAtualizar(codigoErp: string, campos: Record<string, unknown>) {
  const cols = Object.keys(campos);
  const vals = cols.map((c) => campos[c]);
  const { rows } = await pool.query(
    `UPDATE pontas SET ${cols
      .map((c, i) => `${c} = $${i + 1}`)
      .join(", ")} WHERE codigo_erp = $${cols.length + 1} RETURNING *`,
    [...vals, codigoErp]
  );
  // null = nenhuma linha casou (código inexistente), e o PUT depende disso.
  return rows[0] ?? null;
}

// Troca a foto de uma ponta e apaga o arquivo antigo. O CTE `anterior` é
// obrigatório: `RETURNING` num UPDATE devolve a linha já alterada, então
// perguntar o valor velho ali devolveria a foto nova e o `unlink` nunca
// rodaria. O snapshot do CTE é o de antes do UPDATE, num round-trip só.
export async function pontaTrocarFoto(codigoErp: string, novaFoto: string) {
  const { rows } = await pool.query(
    `WITH anterior AS (SELECT foto_url FROM pontas WHERE codigo_erp = $2),
          att AS (UPDATE pontas SET foto_url = $1 WHERE codigo_erp = $2 RETURNING foto_url)
     SELECT att.foto_url AS nova, anterior.foto_url AS anterior
     FROM att, anterior`,
    [novaFoto, codigoErp]
  );
  if (!rows[0]) return null;
  // Só apaga se o caminho realmente mudou: upload de reenvio com a mesma
  // extensão sobrescreve `codigo.jpg` e apagar depois deixaria o card sem foto.
  if (rows[0].anterior && rows[0].anterior !== novaFoto) await apagarFoto(rows[0].anterior);
  return rows[0].nova;
}

// Apaga a linha e a foto junto. A foto é removida aqui, e não no DELETE da API,
// porque o auto-delete de lote zerado em GET /api/pontas passa por esta mesma
// função: apagar a linha em um lugar e o arquivo em outro deixaria órfãos.
export async function pontaDeletar(codigoErp: string) {
  const { rows } = await pool.query("DELETE FROM pontas WHERE codigo_erp = $1 RETURNING foto_url", [codigoErp]);
  if (rows[0]?.foto_url) await apagarFoto(rows[0].foto_url);
}

// Fotos: salva em disco local (pasta public/fotos)
import { writeFile, mkdir, unlink } from "node:fs/promises";
import { join, normalize } from "node:path";

const DIR_FOTOS = join(process.cwd(), "public", "fotos");

export async function salvarFoto(fileBytes: Uint8Array, nomeArquivo: string, contentType: string) {
  await mkdir(DIR_FOTOS, { recursive: true });
  const caminho = join(DIR_FOTOS, nomeArquivo);
  await writeFile(caminho, fileBytes);
  return `/fotos/${nomeArquivo}`;
}

/** Apaga a foto de uma ponta. Silencioso se o arquivo já não existir. */
export async function apagarFoto(caminhoUrl: string) {
  // Só aceitamos o que o upload gerou (`/fotos/...`). Foto vinda do ERP
  // (http) ou qualquer outro caminho é ignorada — e o normalize + prefixo
  // impedem que "../" escape de public/fotos.
  const prefixo = "/fotos/";
  if (!caminhoUrl || !caminhoUrl.startsWith(prefixo)) return;
  const alvo = normalize(join(process.cwd(), "public", caminhoUrl));
  if (!alvo.startsWith(DIR_FOTOS + "/")) return;
  await unlink(alvo).catch(() => {});
}