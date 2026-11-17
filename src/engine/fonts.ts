/**
 * Fontes usadas para escrever nas cartas. Ambas são livres (SIL OFL 1.1):
 * - Eczar SemiBold (Rosetta Type): nome e linha de tipo.
 * - Splentinex (Daniel Benjamin Miller): texto das regras, inspirada na Plantin.
 * As fontes originais das cartas pertencem a terceiros e não são distribuídas.
 */
export const TITLE_FONT = "ProxinhoTitulo";
export const BODY_FONT = "ProxinhoTexto";

let loading: Promise<void> | null = null;

export function loadCardFonts(base = "/fonts/cartas/"): Promise<void> {
  if (!loading) {
    const faces = [
      new FontFace(TITLE_FONT, `url(${base}Eczar-SemiBold.woff2)`, { weight: "600" }),
      new FontFace(BODY_FONT, `url(${base}Splentinex-Regular.otf)`, { style: "normal" }),
      new FontFace(BODY_FONT, `url(${base}Splentinex-Italic.otf)`, { style: "italic" }),
    ];
    loading = Promise.all(faces.map((f) => f.load())).then((loaded) => {
      for (const f of loaded) document.fonts.add(f);
    });
  }
  return loading;
}
