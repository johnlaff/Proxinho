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

/** Linha de uma tabela de d20 ("1—9 | …", "20 | …", "15+ | …"). */
export const TABLE_ROW = /^\d+(?:[—–-]\d+|\+)? \|/;

/** Texto corrido de uma linha já diagramada (símbolos entre chaves). */
export function lineText(chunks: Chunk[]): string {
  return chunks.map((c) => c.map((r) => (r.kind === "symbol" ? `{${r.value}}` : r.value)).join("")).join(" ");
}

/**
 * Quebra uma linha de texto em runs, marcando itálico nos parênteses. No flavor (`italicAll`), o
 * trecho entre asteriscos sai em pé, como na carta impressa: o título do livro citado e a palavra
 * enfatizada ("— *Pergaminho dos Primórdios*", "Reforço *e* refresco!"). Sem isso os asteriscos
 * do texto saíam na carta. Só com os asteriscos aos pares.
 */
export function tokenize(line: string, italicAll = false): Run[] {
  const runs: Run[] = [];
  let depth = 0;
  let buf = "";
  const stars = italicAll && (line.match(/\*/g)?.length ?? 0) % 2 === 0;
  let upright = false;
  const italicNow = () => (italicAll && !upright) || depth > 0;
  const flush = () => {
    if (buf) runs.push({ kind: "text", value: buf, italic: italicNow() });
    buf = "";
  };
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === "*" && stars) {
      flush();
      upright = !upright;
      continue;
    }
    if (ch === "{") {
      const end = line.indexOf("}", i);
      if (end > i) {
        flush();
        runs.push({ kind: "symbol", value: line.slice(i + 1, end), italic: italicNow() });
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
    // aspas retas do Arena viram as curvas da carta impressa: abre no começo ou depois
    // de espaço, parêntese ou travessão; fecha no resto
    // o marcador das opções do Arena vem colado na palavra ("•Crie"): a carta tem espaço
    if (ch === "•" && line[i + 1] && line[i + 1] !== " ") {
      buf += "• ";
      continue;
    }
    if (ch === '"') {
      buf += i === 0 || /[\s([—–-]/.test(line[i - 1]) ? "“" : "”";
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
  // Travessão solto ("escolha um —", "Aterragem — Toda vez") vai junto da palavra de
  // antes: sozinho, ele podia cair no começo da linha seguinte, numa linha só dele
  // (Druida do Pólen Brilhante, CMM). Na carta impressa a quebra é sempre depois dele.
  for (let i = chunks.length - 1; i > 0; i--) {
    const c = chunks[i];
    if (c.length === 1 && c[0].kind === "text" && /^[—–]$/.test(c[0].value)) {
      chunks[i - 1].push({ ...c[0], value: ` ${c[0].value}` });
      chunks.splice(i, 1);
    }
  }
  // Número sozinho no fim da habilidade ("use vidência 1.") vai junto da palavra de antes:
  // sozinho, ele podia descer para uma linha só dele (Templo da Epifania, CLB 923).
  const last = chunks.at(-1);
  if (chunks.length > 1 && last?.length === 1 && last[0].kind === "text" && /^\d{1,2}[.,;:)]*$/.test(last[0].value)) {
    chunks[chunks.length - 2].push({ ...last[0], value: ` ${last[0].value}` });
    chunks.pop();
  }
  return chunks;
}

/**
 * Monta os parágrafos: regras (uma por linha) e, opcionalmente, o flavor. As linhas em
 * `abilityWords` (índices de `rules.split("\n")`) começam com uma palavra de habilidade
 * ("Aterragem — Toda vez…"), que a carta impressa traz em itálico, sem o travessão.
 */
export function buildParagraphs(rules: string | null, flavor: string | null, abilityWords: readonly number[] = []): Paragraph[] {
  const out: Paragraph[] = [];
  (rules ?? "").split("\n").forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    const dash = abilityWords.includes(i) ? line.indexOf(" — ") : -1;
    const runs =
      dash > 0 ? [{ kind: "text" as const, value: line.slice(0, dash), italic: true }, ...tokenize(line.slice(dash))] : tokenize(line);
    out.push({ chunks: toChunks(runs), flavor: false });
  });
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
  /** recuo da linha (as continuações de uma opção "•" começam embaixo do texto dela) */
  indent?: number;
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
export function layoutAt(
  paragraphs: Paragraph[],
  size: number,
  width: number,
  m: Measurer,
  narrow: ReadonlySet<number> = new Set(),
  narrowBy = 0,
): LayoutResult {
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
    // Opção de "escolha um" ("• Destrua o artefato alvo e o / encantamento alvo."): na carta
    // impressa a continuação começa embaixo do texto, não embaixo do marcador (Hull Breach)
    const lead = p.chunks[0];
    const hang = lead?.length === 1 && lead[0].kind === "text" && lead[0].value === "•" ? chunkWidth(lead, size, m) + space : 0;
    const push = () => lines.push({ chunks: cur, flavor: p.flavor, first, ...(first || !hang ? {} : { indent: hang }) });
    for (const chunk of p.chunks) {
      const cw = chunkWidth(chunk, size, m);
      const add = cur.length ? space + cw : cw;
      const limit = (narrow.has(lines.length) ? width - narrowBy : width) - (first ? 0 : hang);
      if (cur.length && curW + add > limit) {
        push();
        first = false;
        cur = [chunk];
        curW = cw;
      } else {
        cur.push(chunk);
        curW += add;
      }
    }
    if (cur.length) push();
  }
  let height = 0;
  lines.forEach((line, i) => {
    if (i > 0 && line.first) height += paragraphGap;
    if (i === flavorStart && i > 0) height += paragraphGap * 1.4; // espaço do fio
    height += lineHeight;
  });
  return { size, lines, height, lineHeight, paragraphGap, flavorStart };
}

/** Um canto reservado no pé da caixa (ex.: o lembrete "4/4" do verso). */
export interface Notch {
  width: number;
  height: number;
}

/** Linhas que, com o texto centralizado na caixa, encostam no canto reservado. */
function linesInNotch(res: LayoutResult, boxHeight: number, notch: Notch): Set<number> {
  const hit = new Set<number>();
  let y = (boxHeight - res.height) / 2;
  res.lines.forEach((line, i) => {
    if (i > 0 && line.first) y += res.paragraphGap;
    if (i === res.flavorStart && i > 0) y += res.paragraphGap * 1.4;
    if (y + res.lineHeight > boxHeight - notch.height) hit.add(i);
    y += res.lineHeight;
  });
  return hit;
}

/** Diagrama desviando do canto reservado (refaz até as linhas pararem de mudar). */
function layoutAround(paragraphs: Paragraph[], size: number, width: number, height: number, m: Measurer, notch?: Notch): LayoutResult {
  let res = layoutAt(paragraphs, size, width, m);
  if (!notch) return res;
  let narrow = new Set<number>();
  for (let i = 0; i < 4; i++) {
    const next = linesInNotch(res, height, notch);
    if ([...next].every((n) => narrow.has(n))) break;
    narrow = new Set([...narrow, ...next]);
    res = layoutAt(paragraphs, size, width, m, narrow, notch.width);
  }
  return res;
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
  notch?: Notch,
  abilityWords: readonly number[] = [],
): LayoutResult {
  const attempt = (fl: string | null): LayoutResult | null => {
    const paragraphs = buildParagraphs(rules, fl, abilityWords);
    for (let size = max; size >= min; size -= 0.5) {
      const res = layoutAround(paragraphs, size, width, height, m, notch);
      if (res.height <= height) return res;
    }
    return null;
  };
  // O flavor só entra se couber num corpo confortável (≥ 26 px).
  if (flavor) {
    const withFlavor = attempt(flavor);
    if (withFlavor && withFlavor.size >= 26) return withFlavor;
  }
  return attempt(null) ?? layoutAround(buildParagraphs(rules, null), min, width, height, m, notch);
}

/** Uma faixa de texto com tamanho próprio (habilidades de planeswalker). */
export interface TextRow {
  text: string;
  width: number;
  height: number;
  notch?: Notch;
  /** linhas da faixa que começam com palavra de habilidade (ver `buildParagraphs`) */
  italic?: readonly number[];
}

/**
 * Acha o maior corpo em que todas as faixas cabem, cada uma no seu espaço.
 * Todas usam o mesmo corpo, como nas cartas impressas.
 */
export function fitRows(rows: TextRow[], m: Measurer, max = 32, min = 15): LayoutResult[] {
  const paragraphs = rows.map((r) => buildParagraphs(r.text, null, r.italic));
  const at = (size: number) => rows.map((r, i) => layoutAround(paragraphs[i], size, r.width, r.height, m, r.notch));
  for (let size = max; size >= min; size -= 0.5) {
    const res = at(size);
    if (res.every((l, i) => l.height <= rows[i].height)) return res;
  }
  return at(min);
}

/** Diagrama cada faixa no corpo `size`, sem procurar o corpo (a Saga mede as faixas com ele, ver saga.ts). */
export function rowsAt(rows: TextRow[], m: Measurer, size: number): LayoutResult[] {
  return rows.map((r) => layoutAround(buildParagraphs(r.text, null, r.italic), size, r.width, r.height, m, r.notch));
}
