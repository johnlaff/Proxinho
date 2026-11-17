/**
 * Composição do texto das regras em português dentro da caixa de texto.
 *
 * Faz o que um diagramador faria numa carta: quebra de linha por palavra,
 * símbolos de mana no meio do texto, lembretes entre parênteses em itálico,
 * texto de ambientação (flavor) em itálico depois de um fio, e reduz o corpo
 * da fonte até tudo caber, centralizando na vertical.
 */

export interface Run {
  kind: "text" | "symbol";
  /** texto (para "text") ou código do símbolo, ex.: "T", "2", "G/W" */
  value: string;
  italic: boolean;
}

/** Um "pedaço" inquebrável: o que fica entre espaços. */
export type Chunk = Run[];

export interface Paragraph {
  chunks: Chunk[];
  flavor: boolean;
}

/** Quebra uma linha de texto em runs, marcando itálico nos parênteses. */
export function tokenize(line: string, italicAll = false): Run[] {
  const runs: Run[] = [];
  let depth = 0;
  let buf = "";
  const flush = () => {
    if (buf) runs.push({ kind: "text", value: buf, italic: italicAll || depth > 0 });
    buf = "";
  };
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === "{") {
      const end = line.indexOf("}", i);
      if (end > i) {
        flush();
        runs.push({ kind: "symbol", value: line.slice(i + 1, end), italic: italicAll || depth > 0 });
        i = end;
        continue;
      }
    }
    if (ch === "(") {
      flush();
      depth++;
      buf = "(";
      continue;
    }
    if (ch === ")") {
      buf += ")";
      flush();
      depth = Math.max(0, depth - 1);
      continue;
    }
    buf += ch;
  }
  flush();
  return runs;
}

/** Agrupa runs em pedaços separados por espaço (cada pedaço não quebra). */
export function toChunks(runs: Run[]): Chunk[] {
  const chunks: Chunk[] = [];
  let cur: Chunk = [];
  for (const run of runs) {
    if (run.kind === "symbol") {
      cur.push(run);
      continue;
    }
    const parts = run.value.split(/( +)/);
    for (const part of parts) {
      if (!part) continue;
      if (/^ +$/.test(part)) {
        if (cur.length) chunks.push(cur);
        cur = [];
      } else {
        cur.push({ ...run, value: part });
      }
    }
  }
  if (cur.length) chunks.push(cur);
  return chunks;
}

/** Monta os parágrafos: regras (uma por linha) e, opcionalmente, o flavor. */
export function buildParagraphs(rules: string | null, flavor: string | null): Paragraph[] {
  const out: Paragraph[] = [];
  for (const line of (rules ?? "").split("\n")) {
    if (line.trim()) out.push({ chunks: toChunks(tokenize(line.trim())), flavor: false });
  }
  if (flavor) {
    for (const line of flavor.split("\n")) {
      if (line.trim()) out.push({ chunks: toChunks(tokenize(line.trim(), true)), flavor: true });
    }
  }
  return out;
}

export interface Measurer {
  /** largura de um texto no corpo `size`, regular ou itálico */
  text(value: string, size: number, italic: boolean): number;
}

export interface Line {
  chunks: Chunk[];
  flavor: boolean;
  /** primeira linha de um parágrafo (recebe espaço antes) */
  first: boolean;
}

export interface LayoutResult {
  size: number;
  lines: Line[];
  height: number;
  lineHeight: number;
  paragraphGap: number;
  /** índice da primeira linha de flavor (para desenhar o fio), ou -1 */
  flavorStart: number;
}

export const SYMBOL_EM = 0.78;

export function chunkWidth(chunk: Chunk, size: number, m: Measurer): number {
  let w = 0;
  for (const run of chunk) {
    w += run.kind === "symbol" ? size * (SYMBOL_EM + 0.06) : m.text(run.value, size, run.italic);
  }
  return w;
}

/** Diagrama no corpo `size`; devolve as linhas e a altura total. */
export function layoutAt(paragraphs: Paragraph[], size: number, width: number, m: Measurer): LayoutResult {
  const lineHeight = size * 1.12;
  const paragraphGap = size * 0.3;
  const space = m.text(" ", size, false);
  const lines: Line[] = [];
  let flavorStart = -1;
  for (const p of paragraphs) {
    if (p.flavor && flavorStart < 0) flavorStart = lines.length;
    let cur: Chunk[] = [];
    let curW = 0;
    let first = true;
    for (const chunk of p.chunks) {
      const cw = chunkWidth(chunk, size, m);
      const add = cur.length ? space + cw : cw;
      if (cur.length && curW + add > width) {
        lines.push({ chunks: cur, flavor: p.flavor, first });
        first = false;
        cur = [chunk];
        curW = cw;
      } else {
        cur.push(chunk);
        curW += add;
      }
    }
    if (cur.length) lines.push({ chunks: cur, flavor: p.flavor, first });
  }
  let height = 0;
  lines.forEach((line, i) => {
    if (i > 0 && line.first) height += paragraphGap;
    if (i === flavorStart && i > 0) height += paragraphGap * 1.4; // espaço do fio
    height += lineHeight;
  });
  return { size, lines, height, lineHeight, paragraphGap, flavorStart };
}

/**
 * Procura o maior corpo (de `max` para baixo, passos de 0,5) em que o texto cabe.
 * Se não couber nem no mínimo, tenta sem o flavor antes de desistir.
 */
export function fitText(
  rules: string | null,
  flavor: string | null,
  width: number,
  height: number,
  m: Measurer,
  max = 34,
  min = 15,
): LayoutResult {
  const attempt = (fl: string | null): LayoutResult | null => {
    const paragraphs = buildParagraphs(rules, fl);
    for (let size = max; size >= min; size -= 0.5) {
      const res = layoutAt(paragraphs, size, width, m);
      if (res.height <= height) return res;
    }
    return null;
  };
  // O flavor só entra se couber num corpo confortável (≥ 26 px).
  if (flavor) {
    const withFlavor = attempt(flavor);
    if (withFlavor && withFlavor.size >= 26) return withFlavor;
  }
  return attempt(null) ?? layoutAt(buildParagraphs(rules, null), min, width, m);
}
