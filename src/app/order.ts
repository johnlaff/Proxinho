/**
 * O pedido como texto (ADR 0028): guardado no navegador entre visitas, levado no link do pedido e
 * lido de volta pelo mesmo leitor das listas coladas (`parseDecklist`).
 *
 * Cada carta vira uma linha "1 Sol Ring (C21) 263": a coleção e o número são os da arte escolhida,
 * "*PT*" marca a imagem oficial em português, e os nomes que a busca não achou voltam como foram
 * escritos. Ficar com o texto, e não com as cartas, deixa o pedido guardado pequeno, legível e
 * sempre com os dados do dia (a carta volta pela API, com a tradução e as artes de agora).
 *
 * Fora de `model.ts` de propósito: aquele arquivo entra no resumo do código que desenha
 * (`scripts/codigo.ts`), e mudar o pedido não pode invalidar as cartas já montadas no servidor.
 */
import type { CardRecord, PrintRecord } from "../engine/types";
import type { Section } from "../lib/decklist";
import { normalizeName } from "../lib/normalize";
import { defaultChoice, isToken, selectedPrint, type Choice, type Entry, type Missing, type OrderLine } from "./model";

/** Linha pedida, com a marca da imagem oficial em português. */
export interface Line extends OrderLine {
  pt?: boolean;
}

/** Nome não encontrado, com a seção em que estava (volta para ela no pedido guardado). */
export interface MissingLine extends Missing {
  section: Section;
}

/** O que `/api/resolve` devolve para cada linha: o nome, a impressão e a seção pedidos, ecoados. */
export interface ResolvedLine {
  query: string;
  set?: string;
  number?: string;
  token?: boolean;
  card: CardRecord | null;
  prints: PrintRecord[];
}

/** Uma linha pedida na forma que vai para a API (`/api/resolve`). */
export interface LineQuery {
  name: string;
  token: boolean;
  set?: string;
  number?: string;
}

/** A chave que casa a linha pedida com a resposta da API: nome, seção de fichas, coleção e número. */
export function lineKey(l: { name?: string; query?: string; token?: boolean; set?: string; number?: string }): string {
  return [l.token ? "t" : "c", normalizeName(l.name ?? l.query ?? ""), (l.set ?? "").toLowerCase(), l.number ?? ""].join("|");
}

/** As linhas que vão para a API, sem repetir. A seção de fichas prefere a ficha quando há carta com o mesmo nome. */
export function lineQueries(lines: Line[]): LineQuery[] {
  const out = new Map<string, LineQuery>();
  for (const l of lines) {
    const q: LineQuery = { name: l.name.trim(), token: l.section === "tokens" };
    if (l.set) {
      q.set = l.set;
      if (l.number) q.number = l.number;
    }
    out.set(lineKey(q), q);
  }
  return [...out.values()];
}

/** A arte inicial: a imagem oficial em português quando a linha pede ("*PT*") e ela existe; senão, `defaultChoice`. */
export function lineChoice(card: CardRecord, prints: PrintRecord[], line: Line): Choice {
  if (line.pt && card.pt_print) return { kind: "pt" };
  return defaultChoice(card, prints, line);
}

/**
 * Junta as linhas pedidas com o que a API encontrou, como `buildOrder` de `model.ts`, casando
 * cada linha pela coleção e pelo número também: duas fichas com o mesmo nome ("Spirit" de duas
 * coleções) são cartas diferentes. A mesma carta na mesma seção vira uma entrada só.
 */
export function orderFrom(lines: Line[], resolved: ResolvedLine[]): { entries: Entry[]; missing: MissingLine[] } {
  const byKey = new Map(resolved.map((r) => [lineKey(r), r]));
  const entries = new Map<string, Entry>();
  const missing = new Map<string, MissingLine>();
  for (const line of lines) {
    const q: LineQuery = { name: line.name, token: line.section === "tokens", set: line.set, number: line.set ? line.number : undefined };
    const hit = byKey.get(lineKey(q));
    if (!hit?.card) {
      const key = `${line.section}:${line.name.trim().toLowerCase()}`;
      const prev = missing.get(key);
      if (prev) prev.quantity += line.quantity;
      else missing.set(key, { key, query: line.name.trim(), quantity: line.quantity, section: line.section });
      continue;
    }
    const key = `${line.section}:${hit.card.oracle_id}`;
    const prev = entries.get(key);
    if (prev) {
      prev.quantity = Math.min(99, prev.quantity + line.quantity);
      continue;
    }
    entries.set(key, {
      key,
      query: line.name,
      quantity: line.quantity,
      section: line.section,
      card: hit.card,
      prints: hit.prints,
      choice: lineChoice(hit.card, hit.prints, line),
    });
  }
  return { entries: [...entries.values()], missing: [...missing.values()] };
}

const SECTIONS: Section[] = ["commander", "main", "side", "tokens"];
/** Os cabeçalhos que `parseDecklist` reconhece. */
const HEADER: Record<Section, string> = { commander: "Comandante", main: "Deck", side: "Sideboard", tokens: "Fichas" };

/** "1 Sol Ring (C21) 263", "1 Sensory Deprivation *PT*". */
function entryLine(e: Entry): string {
  // na imagem em português, a ficha leva uma impressão em inglês só para achar a ficha certa entre as de mesmo nome
  const p = e.choice.kind === "print" ? selectedPrint(e) : isToken(e.card) ? (e.prints[0] ?? null) : null;
  const print = p?.set_code && p.number ? ` (${p.set_code.toUpperCase()}) ${p.number}` : "";
  return `${e.quantity} ${e.card.name_en}${print}${e.choice.kind === "pt" ? " *PT*" : ""}`;
}

/** O pedido inteiro como lista, por seção, com as artes escolhidas e os nomes ainda não encontrados. */
export function orderToText(entries: Entry[], missing: MissingLine[] = []): string {
  const out: string[] = [];
  for (const section of SECTIONS) {
    const lines = [
      ...entries.filter((e) => e.section === section).map(entryLine),
      ...missing.filter((m) => m.section === section).map((m) => `${m.quantity} ${m.query}`),
    ];
    if (!lines.length) continue;
    if (out.length) out.push("");
    out.push(HEADER[section], ...lines);
  }
  return out.join("\n");
}

/** Link do pedido: tamanho máximo da lista aberta (um deck de 100 cartas com artes tem uns 4 KB). */
const MAX_LINK_TEXT = 64 * 1024;

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(code: string): Uint8Array {
  const bin = atob(code.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

/** A lista comprimida (deflate) em base64 de URL: vai depois de "#pedido=", que nunca chega ao servidor. */
export async function encodeOrder(text: string): Promise<string> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream("deflate-raw"));
  return toBase64Url(new Uint8Array(await new Response(stream).arrayBuffer()));
}

/** A lista de volta de um link do pedido. Falha com link cortado, alterado ou grande demais. */
export async function decodeOrder(code: string): Promise<string> {
  if (!/^[\w-]+$/.test(code)) throw new Error("link inválido");
  const stream = new Blob([fromBase64Url(code) as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  const reader = stream.pipeThrough(new TextDecoderStream()).getReader();
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    text += value;
    if (text.length > MAX_LINK_TEXT) {
      await reader.cancel();
      throw new Error("pedido grande demais");
    }
  }
  return text;
}

/** O código do pedido no endereço ("#pedido=…"), se houver. */
export function orderCode(hash: string): string | null {
  return /^#pedido=([\w-]+)$/.exec(hash)?.[1] ?? null;
}
