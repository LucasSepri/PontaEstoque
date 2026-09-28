import { join, relative, isAbsolute } from "node:path";
const DIR = "fotos";
const TIPOS = [".jpg", ".jpeg", ".png", ".webp", ".gif"];
const resolver = (nome) => {
  // Regras: sem barra (nada de subdiretorio), sem "..", extensao conhecida.
  if (!nome || nome.includes("/") || nome.includes("\\") || nome.includes(".."))
    return "BLOQUEADO";
  if (!TIPOS.some((e) => nome.toLowerCase().endsWith(e))) return "BLOQUEADO";
  return "PERMITIDO";
};
const casos = [
  ["31833.jpg", "PERMITIDO"],
  ["a b.jpg", "PERMITIDO"],
  ["../../.env.local", "BLOQUEADO"],
  ["..%2f.env.local", "BLOQUEADO"],
  ["/etc/passwd", "BLOQUEADO"],
  ["..", "BLOQUEADO"],
  ["a/../../b.jpg", "BLOQUEADO"],
  ["sub/x.jpg", "BLOQUEADO"],
  [".env.local", "BLOQUEADO"],
  ["x.php", "BLOQUEADO"],
  ["x.exe", "BLOQUEADO"],
  ["", "BLOQUEADO"],
];
let falhas = 0;
for (const [entrada, esperado] of casos) {
  const r = resolver(entrada);
  const ok = r === esperado;
  if (!ok) falhas++;
  console.log(ok ? "PASS" : "FALHOU", JSON.stringify(entrada), "->", r, ok ? "" : `(esperado ${esperado})`);
}
process.exit(falhas ? 1 : 0);
