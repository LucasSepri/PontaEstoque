"use client";

const FOTO_LADO_MAX = 1600;
const FOTO_QUALIDADE = 0.82;

// A URL da foto é estável (`/fotos/<codigo>.jpg`) e o `src` não muda quando o
// arquivo é trocado: sem isso o card continuaria mostrando a imagem antiga
// mesmo com a foto nova já salva. Um contar por código quebra o cache na
// URL sem gravar versão no banco — some quando a aba fecha, que é o bastante.
const fotoVersao: Record<string, number> = {};

export function urlDaFoto(p: {
  codigo_erp?: string;
  foto_url?: string;
  foto?: string;
  imagem?: string;
}) {
  const caminho = p.foto_url || p.foto || p.imagem;

  if (!caminho) return "";

  if (caminho.startsWith("http") || caminho.startsWith("data:image")) {
    return caminho;
  }

  const url = caminho.startsWith("/") ? caminho : "/" + caminho;
  const v = p.codigo_erp ? fotoVersao[p.codigo_erp] : 0;
  return v ? url + "?v=" + v : url;
}

export function bumparVersaoFoto(codigo: string) {
  fotoVersao[codigo] = Date.now();
}

export function formatar(n: number) {
  return Number(n || 0).toLocaleString("pt-BR", {
    maximumFractionDigits: 2,
  });
}

export function formatarCaixas(n: number) {
  const inteiro = Math.round(n);

  return Math.abs(n - inteiro) < 0.01
    ? String(inteiro)
    : n.toLocaleString("pt-BR", {
      maximumFractionDigits: 2,
    });
}

export function formatarBytes(b: number) {
  if (b < 1024) return b + " B";

  if (b < 1024 * 1024) {
    return (b / 1024).toFixed(0).replace(".", ",") + " KB";
  }

  return (b / 1024 / 1024).toFixed(1).replace(".", ",") + " MB";
}

export async function prepararFoto(arq: File) {
  const dataUrl: string = await new Promise((resolve, reject) => {
    const r = new FileReader();

    r.onload = () => resolve(String(r.result));

    r.onerror = () =>
      reject(new Error("Não consegui ler a imagem."));

    r.readAsDataURL(arq);
  });

  const img: HTMLImageElement = await new Promise((resolve, reject) => {
    const i = new Image();

    i.onload = () => resolve(i);

    i.onerror = () =>
      reject(
        new Error(
          "Arquivo não é uma imagem válida (HEIC precisa ser convertido)."
        )
      );

    i.src = dataUrl;
  });

  const escala = Math.min(
    1,
    FOTO_LADO_MAX / Math.max(img.width, img.height)
  );

  const w = Math.max(1, Math.round(img.width * escala));
  const h = Math.max(1, Math.round(img.height * escala));

  const cv = document.createElement("canvas");

  cv.width = w;
  cv.height = h;

  const ctx = cv.getContext("2d");

  if (!ctx) {
    throw new Error("Não consegui processar a imagem.");
  }

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);

  ctx.drawImage(img, 0, 0, w, h);

  const saida = cv.toDataURL("image/jpeg", FOTO_QUALIDADE);

  return {
    base64: saida.split(",")[1],
    nome: "foto.jpg",
    tipo: "image/jpeg",
    preview: saida,
  };
}

export function dataCurta(iso?: string) {
  if (!iso) return "—";

  const d = new Date(iso);

  if (isNaN(d.getTime())) return "—";

  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
}