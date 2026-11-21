/**
 * Fontes usadas para escrever nas cartas, em três níveis:
 *
 * 1. As fontes que a pessoa escolheu no próprio navegador (`applyCustomFonts`).
 * 2. As fontes das cartas reais, Beleren Bold e MPlantin (normal e itálica), e a Matrix Bold
 *    do nome e do tipo da moldura de 2003 (ADR 0024), servidas pelo próprio site em
 *    /api/fontes/. Os arquivos ficam no Cloudflare KV, fora do repositório público (ver ADR 0001).
 * 3. Fontes livres (SIL OFL 1.1) que vêm com o site, usadas se as oficiais
 *    não carregarem: Eczar SemiBold no nome e Splentinex no texto.
 *
 * O itálico (lembretes e flavor) usa a MPlantin Italic.
 */
export const TITLE_FONT = "ProxinhoTitulo";
export const BODY_FONT = "ProxinhoTexto";
const OFFICIAL_TITLE = "ProxinhoTituloOficial";
const OFFICIAL_BODY = "ProxinhoTextoOficial";
const OFFICIAL_2003 = "ProxinhoTitulo2003";
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

/**
 * A Matrix Bold (nome e tipo da moldura de 2003) tem as maiúsculas mais baixas que a Beleren
 * (0,59 do corpo contra 0,70). Medidas nas cartas: maiúsculas com 27 px no nome e 23 no tipo,
 * na escala de 745 px, nos corpos 35 e 30 da moldura.
 */
const MATRIX_SCALE = 1.3;

/** Fonte do nome e do tipo, com o peso, a escala, o recuo da primeira letra e onde fica a linha. */
export interface TitleFont {
  family: string;
  weight: string;
  scale: number;
  dx: number;
  /** a linha de referência do canvas em que a fonte é escrita */
  baseline: "middle" | "alphabetic";
  /** quanto essa linha desce do centro da linha do layout, em frações do corpo */
  rise: number;
}

export interface CustomFontFiles {
  title?: ArrayBuffer | null;
  body?: ArrayBuffer | null;
  bodyItalic?: ArrayBuffer | null;
}

let loading: Promise<void> | null = null;
let official = { title: false, body: false, title2003: false };
let custom: { title: boolean; body: boolean; italic: boolean } = { title: false, body: false, italic: false };
let customFaces: FontFace[] = [];
let version = 0;
/** Identidade dos arquivos pessoais (tamanho e um resumo dos bytes), para as cartas guardadas. */
let customIds = { title: "", body: "", italic: "" };

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
    const title2003 = new FontFace(OFFICIAL_2003, `url(${officialBase}matrix-bold.ttf?v=1)`, { weight: "700" });
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
      title2003.load().then(add, () => false),
    ]).then(([, t, b, t2003]) => {
      official = { title: t, body: b, title2003: t2003 };
    });
  }
  return loading;
}

/**
 * Família CSS para o nome e o tipo (com o peso já incluído). Na moldura de 2003 (`frame2003`),
 * a Matrix Bold, como na carta impressa; sem o arquivo dela, a Beleren.
 */
export function titleFont(frame2003 = false): TitleFont {
  // dx: a Beleren tem mais respiro à esquerda; o recuo alinha a primeira letra à da carta real
  const mid = { baseline: "middle", rise: 0.06 } as const;
  if (custom.title) return { family: CUSTOM_TITLE, weight: "400", scale: OFFICIAL_TITLE_SCALE, dx: -3, ...mid };
  // na Matrix Bold o "middle" do Chrome cai na linha de base (as métricas verticais do arquivo
  // de 1990 não servem): a linha de base fica meia altura-x (0,415 do corpo) abaixo do centro
  // das minúsculas, que é o centro da linha na moldura de 2003 (ver m15Layout)
  if (frame2003 && official.title2003)
    return { family: OFFICIAL_2003, weight: "700", scale: MATRIX_SCALE, dx: 0, baseline: "alphabetic", rise: 0.21 };
  if (official.title) return { family: OFFICIAL_TITLE, weight: "700", scale: OFFICIAL_TITLE_SCALE, dx: -3, ...mid };
  return { family: TITLE_FONT, weight: "600", scale: 1, dx: 0, ...mid };
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

/**
 * Quais arquivos desenham as cartas agora, estável entre uma visita e outra (ao contrário de
 * `fontsVersion`, que conta as trocas desta página): entra na chave das cartas guardadas no
 * navegador. Só vale depois de `loadCardFonts`.
 */
export function fontsId(): string {
  // "o": a Beleren e a Matrix Bold; só a Beleren ("b") muda as cartas de 2003
  const title = custom.title ? `p${customIds.title}` : official.title ? (official.title2003 ? "o" : "b") : "l";
  const body = custom.body ? `p${customIds.body}${custom.italic ? `+${customIds.italic}` : ""}` : official.body ? "o" : "l";
  return `${title}|${body}`;
}

/** Resumo curto de um arquivo: o tamanho e uma soma dos bytes (não precisa resistir a ataque). */
function digest(data: ArrayBuffer | null | undefined): string {
  if (!data) return "";
  const bytes = new Uint8Array(data);
  let h = 2166136261;
  for (let i = 0; i < bytes.length; i++) h = Math.imul(h ^ bytes[i], 16777619);
  return `${bytes.length.toString(36)}.${(h >>> 0).toString(36)}`;
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
  customIds = { title: digest(files.title), body: digest(files.body), italic: digest(files.bodyItalic) };
  version++;
}

/** Volta para as fontes padrão do site. */
export function clearCustomFonts(): void {
  for (const f of customFaces) document.fonts.delete(f);
  customFaces = [];
  custom = { title: false, body: false, italic: false };
  version++;
}
