/**
 * Fontes usadas para escrever nas cartas.
 *
 * Padrão: fontes livres (SIL OFL 1.1), distribuídas com o site.
 * - Eczar SemiBold (Rosetta Type): nome e linha de tipo.
 * - Splentinex (Daniel Benjamin Miller): texto das regras, inspirada na Plantin.
 *
 * As fontes das cartas reais (Beleren e MPlantin) pertencem a terceiros e não
 * são distribuídas. Quem tem os arquivos pode usá-los: eles são carregados só
 * no navegador da pessoa (`applyCustomFonts`) e nunca saem dele.
 */
export const TITLE_FONT = "ProxinhoTitulo";
export const BODY_FONT = "ProxinhoTexto";
const CUSTOM_TITLE = "ProxinhoTituloPessoal";
const CUSTOM_BODY = "ProxinhoTextoPessoal";

/**
 * A Splentinex desenha as letras menores que a MPlantin no mesmo corpo.
 * Este fator iguala o tamanho visual (altura-x) ao das cartas reais.
 */
const FREE_BODY_SCALE = 1.06;

export interface CustomFontFiles {
  title?: ArrayBuffer | null;
  body?: ArrayBuffer | null;
  bodyItalic?: ArrayBuffer | null;
}

let loading: Promise<void> | null = null;
let custom: { title: boolean; body: boolean; italic: boolean } = { title: false, body: false, italic: false };
let customFaces: FontFace[] = [];
let version = 0;

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

/** Família CSS para o nome e o tipo (com o peso já incluído). */
export function titleFont(): { family: string; weight: string } {
  return custom.title ? { family: CUSTOM_TITLE, weight: "400" } : { family: TITLE_FONT, weight: "600" };
}

/** Família CSS e fator de escala para o texto das regras. */
export function bodyFont(): { family: string; scale: number } {
  // sem o arquivo itálico, o navegador inclina a fonte normal (itálico sintético)
  if (custom.body) return { family: CUSTOM_BODY, scale: 1 };
  return { family: BODY_FONT, scale: FREE_BODY_SCALE };
}

/** Muda sempre que as fontes mudam: entra na chave do cache das prévias. */
export function fontsVersion(): number {
  return version;
}

export function usingCustomFonts(): boolean {
  return custom.title || custom.body;
}

/**
 * Registra as fontes escolhidas pela pessoa. Lança erro com mensagem em
 * português se algum arquivo não for uma fonte válida.
 */
export async function applyCustomFonts(files: CustomFontFiles): Promise<void> {
  const make = async (family: string, data: ArrayBuffer, desc: FontFaceDescriptors, label: string) => {
    try {
      return await new FontFace(family, data, desc).load();
    } catch {
      throw new Error(`O arquivo escolhido para ${label} não é uma fonte que o navegador consiga ler. Use .ttf, .otf ou .woff.`);
    }
  };
  const faces: FontFace[] = [];
  if (files.title) faces.push(await make(CUSTOM_TITLE, files.title, { weight: "400" }, "o nome e o tipo"));
  if (files.body) faces.push(await make(CUSTOM_BODY, files.body, { style: "normal" }, "o texto"));
  if (files.bodyItalic) faces.push(await make(CUSTOM_BODY, files.bodyItalic, { style: "italic" }, "o itálico"));
  for (const f of customFaces) document.fonts.delete(f);
  for (const f of faces) document.fonts.add(f);
  customFaces = faces;
  custom = { title: Boolean(files.title), body: Boolean(files.body), italic: Boolean(files.bodyItalic) };
  version++;
}

/** Volta para as fontes livres. */
export function clearCustomFonts(): void {
  for (const f of customFaces) document.fonts.delete(f);
  customFaces = [];
  custom = { title: false, body: false, italic: false };
  version++;
}
