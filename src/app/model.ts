/**
 * Modelo da lista em revisão: cada linha da lista vira uma "entrada" com a
 * carta encontrada, as artes disponíveis e a escolha atual.
 *
 * Tudo aqui é lógica pura (sem React, sem rede), coberta por testes.
 */
import type { CardRecord, PrintRecord, PtFace } from "../engine/types";
import type { Section } from "../lib/decklist";

/** Qual imagem vai para a folha. */
export type Choice =
  | { kind: "print"; printId: string } // arte em inglês, reescrita em PT quando der
  | { kind: "pt" }; // imagem oficial já impressa em português (Scryfall)

export interface Entry {
  key: string;
  query: string;
  quantity: number;
  section: Section;
  card: CardRecord;
  prints: PrintRecord[];
  choice: Choice;
}

export interface Missing {
  key: string;
  query: string;
  quantity: number;
}

/** Como a carta vai sair, para mostrar com honestidade na interface. */
export type Outcome =
  | "reescrita" // texto em PT escrito por cima da arte escolhida
  | "nao-oficial" // como a reescrita, mas com a tradução não oficial (ADR 0025)
  | "imagem-pt" // imagem oficial em português
  | "sem-traducao" // não há texto oficial em PT: sai em inglês
  | "moldura" // há texto em PT, mas esta moldura ainda não é suportada
  | "apagador"; // há texto em PT e a moldura é suportada, mas a rede neural não rodou neste navegador

export function frontFace(card: CardRecord): PtFace | null {
  return card.faces[0] ?? null;
}

export function hasPtText(card: CardRecord): boolean {
  const f = frontFace(card);
  return Boolean(card.source && f?.name_pt && f.text_pt !== null);
}

export function selectedPrint(entry: Entry): PrintRecord | null {
  if (entry.choice.kind !== "print") return null;
  const id = entry.choice.printId;
  return entry.prints.find((p) => p.id === id) ?? entry.prints[0] ?? null;
}

/**
 * O flavor em PT vale para a arte escolhida? Ele é de uma impressão (`text_print`) e vale
 * para ela e para as outras artes com o mesmo flavor em inglês (`text_flavor`, medido no
 * pipeline): a promo de arte estendida do Spock, Logical Choice (PMEI) tem o flavor da
 * Star Trek Commander e saía sem nenhum. Arte com outro flavor, ou sem flavor, fica sem.
 */
export function flavorApplies(card: CardRecord, print: PrintRecord): boolean {
  const tp = card.text_print;
  if (tp && print.set_code.toLowerCase() === tp.set.toLowerCase() && print.number === tp.number) return true;
  return Boolean(tp && print.text_flavor);
}

/** Chave de uma face de impressão em que o motor não reconheceu a moldura (ver `outcomeOf`). */
export function missKey(printId: string, side: Side): string {
  return `${printId}#${side}`;
}

/** Chave de uma face que saiu na original porque a rede neural não rodou (vem junto com `missKey`). */
export function neuralMissKey(printId: string, side: Side): string {
  return `${printId}#${side}:rede-neural`;
}

/**
 * `misses`: faces em que o motor desistiu ao montar a carta e saiu a imagem original. O
 * desenho de algumas impressões foge da moldura comum sem que os dados digam (o Garruk
 * espelhado da Secret Lair, SLD 9995, é "2015" e "normal" como qualquer outro): sem isso,
 * a interface prometia português numa carta que saía em inglês.
 */
export function outcomeOf(entry: Entry, misses?: ReadonlySet<string>): Outcome {
  if (entry.choice.kind === "pt") return "imagem-pt";
  if (!hasPtText(entry.card)) return "sem-traducao";
  const p = selectedPrint(entry);
  if (!p?.supported) return "moldura";
  if (misses?.has(neuralMissKey(p.id, 0))) return "apagador";
  if (misses?.has(missKey(p.id, 0))) return "moldura";
  return entry.card.source === "nao-oficial" ? "nao-oficial" : "reescrita";
}

/**
 * Escolhe a arte inicial:
 * 1. a impressão pedida na lista (coleção + número), se existir;
 * 2. a impressão suportada mais recente, sem promo, em alta resolução, na moldura atual antes da
 *    de 2003;
 * 3. sem moldura suportada: a imagem oficial em PT, se houver; com a tradução não oficial
 *    (ADR 0025), a imagem oficial em PT vem antes dela (as de Dragon's Maze só têm a imagem);
 * 4. senão, a original em inglês, pela mesma ordem, com a moldura suportada na frente: sem ela,
 *    a carta sem texto em PT ficava com a mais nova, muitas vezes um pôster da Secret Lair
 *    (Phyrexian Altar SLC 16).
 */
export function defaultChoice(card: CardRecord, prints: PrintRecord[], wanted?: { set?: string; number?: string }): Choice {
  if (wanted?.set) {
    const set = wanted.set.toLowerCase();
    const hit = prints.find((p) => p.set_code.toLowerCase() === set && (!wanted.number || p.number === wanted.number));
    if (hit) return { kind: "print", printId: hit.id };
  }
  const translatable = hasPtText(card) && !(card.source === "nao-oficial" && card.pt_print);
  if (translatable) {
    const ranked = prints.filter((p) => p.supported).sort(byQuality);
    if (ranked[0]) return { kind: "print", printId: ranked[0].id };
    if (card.pt_print) return { kind: "pt" };
  } else if (card.pt_print) {
    return { kind: "pt" };
  }
  const first = [...prints].sort((a, b) => Number(b.supported) - Number(a.supported) || byQuality(a, b))[0];
  return first ? { kind: "print", printId: first.id } : card.pt_print ? { kind: "pt" } : { kind: "print", printId: "" };
}

/** A ordem das artes na escolha inicial: a melhor primeiro. */
function byQuality(a: PrintRecord, b: PrintRecord): number {
  return (
    Number(b.highres) - Number(a.highres) ||
    // a arte sem borda só é escolhida pela pessoa: o apagamento da moldura comum é mais seguro
    Number(a.border === "borderless") - Number(b.border === "borderless") ||
    // a moldura de 2003 (ADR 0024) também: com uma arte na moldura atual, a padrão continua
    // a mesma (e a carta já montada no servidor, ADR 0022, continua valendo)
    Number(a.frame === "2003") - Number(b.frame === "2003") ||
    Number(a.promo) - Number(b.promo) ||
    Number(isReprintList(a)) - Number(isReprintList(b)) ||
    (b.released ?? "").localeCompare(a.released ?? "")
  );
}

/** "The List" e afins trazem um símbolo de coleção extra que atrapalha o apagamento. */
function isReprintList(p: PrintRecord): boolean {
  return p.set_code.toLowerCase() === "plst";
}

/** Ordem na folha: comandante primeiro, depois o deck, o sideboard e as fichas. */
const SECTION_ORDER: Record<Section, number> = { commander: 0, main: 1, side: 2, tokens: 3 };

export function sortEntries(entries: Entry[]): Entry[] {
  return [...entries].sort((a, b) => SECTION_ORDER[a.section] - SECTION_ORDER[b.section]);
}

/** Frente (0) ou verso (1) de uma carta de duas faces. */
export type Side = 0 | 1;

/** Um espaço da folha: uma face de uma entrada. */
export interface SheetSlot {
  entry: Entry;
  side: Side;
}

const DOUBLE_FACED = new Set(["transform", "modal_dfc"]);

/**
 * Quantas faces a entrada imprime: cartas de duas faces (transformar e modais)
 * saem com a frente e o verso lado a lado, cada um num espaço da folha.
 */
export function sideCount(entry: Entry): 1 | 2 {
  if (entry.choice.kind === "pt") return DOUBLE_FACED.has(entry.card.layout ?? "") ? 2 : 1;
  return selectedPrint(entry)?.two_sided ? 2 : 1;
}

/** Expande quantidades (e faces) e quebra em folhas de 9. */
export function toSheets(entries: Entry[]): SheetSlot[][] {
  const slots = sortEntries(entries).flatMap((entry) =>
    Array.from({ length: entry.quantity }, () =>
      Array.from({ length: sideCount(entry) }, (_, side): SheetSlot => ({ entry, side: side as Side })),
    ).flat(),
  );
  const sheets: SheetSlot[][] = [];
  for (let i = 0; i < slots.length; i += 9) sheets.push(slots.slice(i, i + 9));
  return sheets;
}

/** Quantas faces vão para o papel (cada face de uma carta de duas faces ocupa um espaço da folha). */
export function totalCards(entries: Entry[]): number {
  return entries.reduce((n, e) => n + e.quantity * sideCount(e), 0);
}

/** Quantas cartas o pedido tem, como no deck: a carta de duas faces conta uma vez. */
export function orderedCards(entries: Entry[]): number {
  return entries.reduce((n, e) => n + e.quantity, 0);
}

/** Chave estável da imagem que uma face produz (para cache de prévia). */
export function renderKey(entry: Entry, fonts = 0, side: Side = 0): string {
  const base =
    entry.choice.kind === "pt"
      ? `pt:${entry.card.pt_print?.id}`
      : `p:${entry.choice.printId}:${hasPtText(entry.card) ? "pt" : "en"}:f${fonts}`;
  return side ? `${base}:verso` : base;
}

/** Ano de lançamento para a legenda. */
export function yearOf(p: PrintRecord): string {
  return p.released ? p.released.slice(0, 4) : "";
}

/** Linha pedida (vinda da lista colada, da importação ou da busca). */
export interface OrderLine {
  quantity: number;
  name: string;
  set?: string;
  number?: string;
  section: Section;
}

/**
 * Junta as linhas pedidas com o que a API encontrou. Duas linhas da mesma
 * carta na mesma seção viram uma entrada só (somando as quantidades).
 */
export function buildOrder(
  lines: OrderLine[],
  resolved: { query: string; card: CardRecord | null; prints: PrintRecord[] }[],
): { entries: Entry[]; missing: Missing[] } {
  const byQuery = new Map(resolved.map((r) => [r.query.trim().toLowerCase(), r]));
  const entries = new Map<string, Entry>();
  const missing = new Map<string, Missing>();
  for (const line of lines) {
    const hit = byQuery.get(line.name.trim().toLowerCase());
    if (!hit?.card) {
      const key = line.name.trim().toLowerCase();
      const prev = missing.get(key);
      if (prev) prev.quantity += line.quantity;
      else missing.set(key, { key, query: line.name.trim(), quantity: line.quantity });
      continue;
    }
    const key = `${line.section}:${hit.card.oracle_id}`;
    const prev = entries.get(key);
    if (prev) {
      prev.quantity += line.quantity;
      continue;
    }
    entries.set(key, {
      key,
      query: line.name,
      quantity: line.quantity,
      section: line.section,
      card: hit.card,
      prints: hit.prints,
      choice: defaultChoice(hit.card, hit.prints, line),
    });
  }
  return { entries: [...entries.values()], missing: [...missing.values()] };
}

export function countOutcomes(entries: Entry[], misses?: ReadonlySet<string>): Record<Outcome, number> {
  const out: Record<Outcome, number> = { reescrita: 0, "nao-oficial": 0, "imagem-pt": 0, "sem-traducao": 0, moldura: 0, apagador: 0 };
  for (const e of entries) out[outcomeOf(e, misses)] += e.quantity;
  return out;
}

/** Nome para mostrar: o português quando existe. */
export function displayName(card: CardRecord): string {
  return card.name_pt ?? card.name_en;
}

/** Emblema de planeswalker (entra no pedido como as fichas). */
export function isEmblem(card: CardRecord): boolean {
  return (card.type_line ?? "").startsWith("Emblem");
}

/** A entrada é uma ficha (token) ou emblema, não uma carta. */
export function isToken(card: CardRecord): boolean {
  return card.layout === "token";
}

/**
 * Fichas que as cartas do pedido criam e que ainda não estão nele, pelo
 * oracle_id, na ordem em que aparecem no deck.
 */
export function tokenSuggestions(entries: Entry[], dismissed: ReadonlySet<string> = new Set()): string[] {
  const have = new Set(entries.map((e) => e.card.oracle_id));
  const out = new Set<string>();
  for (const e of sortEntries(entries)) {
    for (const id of e.card.tokens ?? []) if (!have.has(id) && !dismissed.has(id)) out.add(id);
  }
  return [...out];
}

const COLOR_NAME: Record<string, string> = { W: "branca", U: "azul", B: "preta", R: "vermelha", G: "verde" };

/** "1/1 branca e preta", "incolor": o que distingue fichas de mesmo nome. */
export function tokenDetails(card: CardRecord): string {
  if (isEmblem(card)) return "emblema";
  const face = frontFace(card);
  const colors = [...(face?.colors ?? "")].map((c) => COLOR_NAME[c]).filter(Boolean);
  const color = colors.length === 0 ? "incolor" : colors.length === 1 ? colors[0] : `${colors.slice(0, -1).join(", ")} e ${colors.at(-1)}`;
  return [face?.pt, color].filter(Boolean).join(" ");
}

/** Entradas direto do que a API devolveu (busca, fichas sugeridas): uma cópia de cada. */
export function entriesFrom(resolved: { card: CardRecord | null; prints: PrintRecord[] }[], section?: Section): Entry[] {
  return resolved.flatMap(({ card, prints }) => {
    if (!card) return [];
    const s = section ?? (isToken(card) ? "tokens" : "main");
    return [
      { key: `${s}:${card.oracle_id}`, query: card.name_en, quantity: 1, section: s, card, prints, choice: defaultChoice(card, prints) },
    ];
  });
}

/** Soma entradas novas ao pedido: a mesma carta na mesma seção ganha quantidade (até 99). */
export function mergeEntries(prev: Entry[], add: Entry[]): Entry[] {
  const next = [...prev];
  for (const e of add) {
    const same = next.findIndex((x) => x.key === e.key);
    if (same >= 0) next[same] = { ...next[same], quantity: Math.min(99, next[same].quantity + e.quantity) };
    else next.push(e);
  }
  return next;
}
