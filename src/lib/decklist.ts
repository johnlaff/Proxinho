/**
 * Leitor de listas de deck coladas.
 *
 * Aceita os formatos mais comuns sem o usuário escolher nada:
 * - MTGO / texto simples:   "1 Sol Ring", "1x Sol Ring", "Sol Ring"
 * - Arena / Moxfield:        "1 Sol Ring (C21) 263", "1 Sol Ring (C21) 263 *F*"
 * - Archidekt (texto):       "1x Sol Ring (c21) 263 [Ramp] ^Have,#37d67a^"
 * - Liga Magic:              "1 Anel Solar" (nomes em português também valem)
 * - Do próprio Proxinho:     "1 Sensory Deprivation *PT*" (a imagem oficial em português; ver `orderText`)
 * - Seções:                  "Commander", "Comandante", "Sideboard", "Tokens", "Fichas", "// Deck", "SB: 1 X"
 */

export type Section = "commander" | "main" | "side" | "tokens";

export interface DeckLine {
  quantity: number;
  name: string;
  set?: string;
  number?: string;
  foil?: boolean;
  /** "*PT*": a imagem oficial em português, em vez de uma arte em inglês reescrita */
  pt?: boolean;
  section: Section;
  /** linha original, para mostrar ao usuário se algo não for encontrado */
  raw: string;
}

const SECTION_HEADERS: Record<string, Section | "skip"> = {
  commander: "commander",
  commanders: "commander",
  comandante: "commander",
  comandantes: "commander",
  companion: "commander",
  deck: "main",
  mainboard: "main",
  main: "main",
  maindeck: "main",
  sideboard: "side",
  side: "side",
  maybeboard: "skip",
  maybe: "skip",
  considering: "skip",
  tokens: "tokens",
  token: "tokens",
  fichas: "tokens",
  ficha: "tokens",
};

/** Cabeçalhos de categoria comuns (Archidekt, Moxfield, Liga) que não mudam a seção. */
const LINE = /^(?:(?<qty>\d+)\s*[xX]?\s+)?(?<rest>.+)$/;

export function parseDecklist(text: string): DeckLine[] {
  const out: DeckLine[] = [];
  let section: Section | "skip" = "main";
  for (const rawLine of text.split(/\r?\n/)) {
    let line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    // "// Commander", "Commander:", "Sideboard (15)"
    const header = line
      .replace(/^\/\/\s*/, "")
      .replace(/[:]\s*$/, "")
      .replace(/\s*\(\d+\)\s*$/, "")
      .trim()
      .toLowerCase();
    if (header in SECTION_HEADERS) {
      section = SECTION_HEADERS[header];
      continue;
    }
    if (line.startsWith("//")) continue;

    let lineSection: Section | "skip" = section;
    if (/^sb:\s*/i.test(line)) {
      lineSection = "side";
      line = line.replace(/^sb:\s*/i, "");
    }
    if (lineSection === "skip") continue;

    const m = LINE.exec(line);
    if (!m?.groups) continue;
    const quantity = m.groups.qty ? Number.parseInt(m.groups.qty, 10) : 1;
    let rest = m.groups.rest;

    // Archidekt: ^Have,#37d67a^ e [Categoria]
    // (um "[C21] 263" seguido de número é coleção e fica; o resto é categoria)
    rest = rest.replace(/\^[^^]*\^/g, "").replace(/\s*\[[^\]]*\](?!\s*[\w★-]+\s*$)/g, "");
    const foil = /\*(F|E)\*/i.test(rest);
    const pt = /\*PT\*/i.test(rest);
    rest = rest.replace(/\*(?:[A-Z]|PT)\*/gi, "").trim();

    let set: string | undefined;
    let number: string | undefined;
    // "(C21) 263" ou "[C21] 263" ou só "(C21)"
    const printing = /\s*[([](?<set>[A-Za-z0-9]{2,6})[)\]]\s*(?<num>[\w★-]+)?\s*$/.exec(rest);
    if (printing?.groups) {
      set = printing.groups.set.toLowerCase();
      number = printing.groups.num;
      rest = rest.slice(0, printing.index).trim();
    }
    // "Nome | Nome em PT" (algumas exportações): fica com o primeiro
    rest = rest.split(" | ")[0].trim();
    // Cartas de duas faces escritas com uma barra só: "Delver of Secrets / Insectile Aberration"
    rest = rest.replace(/\s+\/\s+/, " // ");
    if (!rest || /^\d+$/.test(rest)) continue;
    out.push({
      quantity: Math.min(quantity, 99),
      name: rest,
      set,
      number,
      foil: foil || undefined,
      pt: pt || undefined,
      section: lineSection,
      raw: rawLine.trim(),
    });
  }
  return out;
}

/** Junta linhas repetidas do mesmo nome/impressão somando as quantidades. */
export function mergeLines(lines: DeckLine[]): DeckLine[] {
  const map = new Map<string, DeckLine>();
  for (const l of lines) {
    const key = `${l.section}|${l.name.toLowerCase()}|${l.set ?? ""}|${l.number ?? ""}|${l.pt ? "pt" : ""}`;
    const prev = map.get(key);
    if (prev) prev.quantity += l.quantity;
    else map.set(key, { ...l });
  }
  return [...map.values()];
}

/**
 * Troca o nome de uma carta na lista colada (a sugestão aceita em "Você quis dizer…?"), só nas
 * linhas em que o leitor acha exatamente esse nome: a quantidade, a coleção e as categorias da
 * linha ficam como estavam.
 */
export function renameInList(text: string, from: string, to: string): string {
  return text
    .split("\n")
    .map((line) => {
      if (parseDecklist(line)[0]?.name !== from) return line;
      const at = line.indexOf(from);
      return at < 0 ? line : line.slice(0, at) + to + line.slice(at + from.length);
    })
    .join("\n");
}
