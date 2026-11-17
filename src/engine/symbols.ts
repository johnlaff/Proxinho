/**
 * Símbolos de mana em SVG (baixados da API de simbologia do Scryfall e servidos
 * pelo próprio site em /symbols). São desenhados vetoriais no canvas.
 */
const cache = new Map<string, Promise<HTMLImageElement | null>>();

/** "G/W" → "G-W" (nome do arquivo), "T" → "T". */
export function symbolFile(code: string): string {
  return code.replace(/\//g, "-");
}

export function loadSymbol(code: string, base = "/symbols/"): Promise<HTMLImageElement | null> {
  const key = symbolFile(code);
  let p = cache.get(key);
  if (!p) {
    p = new Promise((resolve) => {
      const img = new Image();
      img.decoding = "async";
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = `${base}${encodeURIComponent(key)}.svg`;
    });
    cache.set(key, p);
  }
  return p;
}

/** Pré-carrega todos os símbolos que aparecem num texto. */
export async function preloadSymbols(...texts: (string | null | undefined)[]): Promise<Map<string, HTMLImageElement>> {
  const codes = new Set<string>();
  for (const t of texts) for (const m of (t ?? "").matchAll(/\{([^}]+)\}/g)) codes.add(m[1]);
  const out = new Map<string, HTMLImageElement>();
  await Promise.all(
    [...codes].map(async (c) => {
      const img = await loadSymbol(c);
      if (img) out.set(c, img);
    }),
  );
  return out;
}
