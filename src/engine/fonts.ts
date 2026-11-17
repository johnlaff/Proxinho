/**
 * Fontes usadas para escrever nas cartas, em três níveis:
 *
 * 1. As fontes que a pessoa escolheu no próprio navegador (`applyCustomFonts`).
 * 2. As fontes das cartas reais, Beleren Bold e MPlantin (normal e itálica), servidas pelo
 *    próprio site em /api/fontes/. Os arquivos ficam no Cloudflare KV, fora do
 *    repositório público (ver ADR 0001).
 * 3. Fontes livres (SIL OFL 1.1) que vêm com o site, usadas se as oficiais
 *    não carregarem: Eczar SemiBold no nome e Splentinex no texto.
 *
 * O itálico (lembretes e flavor) usa a MPlantin Italic.
 */
export const TITLE_FONT = "ProxinhoTitulo";
export const BODY_FONT = "ProxinhoTexto";
const OFFICIAL_TITLE = "ProxinhoTituloOficial";
const OFFICIAL_BODY = "ProxinhoTextoOficial";
const CUSTOM_TITLE = "ProxinhoTituloPessoal";
const CUSTOM_BODY = "ProxinhoTextoPessoal";

/**
 * A Splentinex desenha as letras menores que a MPlantin no mesmo corpo.
 * Este fator iguala o tamanho visual (altura-x) ao das cartas reais.
 */
const FREE_BODY_SCALE = 1.06;

/**
 * A Beleren tem a altura das maiúsculas menor que a Eczar no mesmo corpo; as
 * medidas da moldura foram feitas com a Eczar. Conferido com Cultivar (LCC 235
 * em PT e TRC 460 em inglês): maiúsculas com 27 px numa carta de 1040 px.
 */
const OFFICIAL_TITLE_SCALE = 1.08;

export interface CustomFontFiles {
  title?: ArrayBuffer | null;
  body?: ArrayBuffer | null;
  bodyItalic?: ArrayBuffer | null;
}

let loading: Promise<void> | null = null;
let official = { title: false, body: false };
let custom: { title: boolean; body: boolean; italic: boolean } = { title: false, body: false, italic: false };
let customFaces: FontFace[] = [];
let version = 0;

export function loadCardFonts(base = "/fonts/cartas/", officialBase = "/api/fontes/"): Promise<void> {
  if (!loading) {
    const free = [
      new FontFace(TITLE_FONT, `url(${base}Eczar-SemiBold.woff2)`, { weight: "600" }),
      new FontFace(BODY_FONT, `url(${base}Splentinex-Regular.otf)`, { style: "normal" }),
      new FontFace(BODY_FONT, `url(${base}Splentinex-Italic.otf)`, { style: "italic" }),
    ];
    // "?v=2": os arquivos da MPlantin foram consertados (scripts/consertar-fontes.py) e o cache
    // do navegador guarda a versão anterior por 7 dias; mude o número quando trocar os arquivos
    const title = new FontFace(OFFICIAL_TITLE, `url(${officialBase}beleren-bold.ttf?v=2)`, { weight: "700" });
    const body = [
      new FontFace(OFFICIAL_BODY, `url(${officialBase}mplantin.ttf?v=2)`, { style: "normal", weight: "400" }),
      new FontFace(OFFICIAL_BODY, `url(${officialBase}mplantin-italic.ttf?v=2)`, { style: "italic", weight: "400" }),
    ];
    const add = (f: FontFace) => (document.fonts.add(f), true);
    loading = Promise.all([
      Promise.all(free.map((f) => f.load())).then((loaded) => loaded.forEach(add)),
      // as oficiais são opcionais: se faltarem (dev sem os arquivos), ficam as livres
      title.load().then(add, () => false),
      Promise.all(body.map((f) => f.load())).then(
        (loaded) => loaded.every(add),
        () => false,
      ),
    ]).then(([, t, b]) => {
      official = { title: t, body: b };
    });
  }
  return loading;
}

/** Família CSS para o nome e o tipo (com o peso já incluído). */
export function titleFont(): { family: string; weight: string; scale: number; dx: number } {
  // dx: a Beleren tem mais respiro à esquerda; o recuo alinha a primeira letra à da carta real
  if (custom.title) return { family: CUSTOM_TITLE, weight: "400", scale: OFFICIAL_TITLE_SCALE, dx: -3 };
  if (official.title) return { family: OFFICIAL_TITLE, weight: "700", scale: OFFICIAL_TITLE_SCALE, dx: -3 };
  return { family: TITLE_FONT, weight: "600", scale: 1, dx: 0 };
}

/** Família CSS e fator de escala para o texto das regras. */
export function bodyFont(): { family: string; scale: number } {
  // sem o arquivo itálico, o navegador inclina a fonte normal (itálico sintético)
  if (custom.body) return { family: CUSTOM_BODY, scale: 1 };
  if (official.body) return { family: OFFICIAL_BODY, scale: 1 };
  return { family: BODY_FONT, scale: FREE_BODY_SCALE };
}

/** Quais fontes estão desenhando as cartas agora. */
export function activeFonts(): "pessoais" | "oficiais" | "livres" {
  if (custom.title || custom.body) return "pessoais";
  return official.title && official.body ? "oficiais" : "livres";
}

/** Muda sempre que as fontes mudam: entra na chave do cache das prévias. */
export function fontsVersion(): number {
  return version;
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

/** Volta para as fontes padrão do site. */
export function clearCustomFonts(): void {
  for (const f of customFaces) document.fonts.delete(f);
  customFaces = [];
  custom = { title: false, body: false, italic: false };
  version++;
}
