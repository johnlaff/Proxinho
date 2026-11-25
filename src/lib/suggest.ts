/**
 * "Você quis dizer…?": os nomes de carta mais parecidos com um nome que a lista trouxe e o banco
 * não achou (erro de digitação, nome pela metade, palavra a mais ou a menos).
 *
 * Roda no Worker (`/api/sugestoes`) sobre todos os nomes do banco, já normalizados como a busca
 * (`normalizeName`: minúsculas, sem acento nem pontuação). Quanto menor a nota, mais parecido:
 *
 * - 0: o mesmo nome (só falta quando a linha pediu ficha e o nome é de carta, ou o contrário);
 * - 1: o começo do nome, até o fim de uma palavra ("liesa" → "Liesa, Shroud of Dusk");
 * - 2 por erro: o nome inteiro com erros de digitação (Damerau-Levenshtein: uma letra trocada, a
 *   menos, a mais ou duas letras invertidas), até 1 erro em nomes de até 4 letras, 2 até 8 e 3
 *   nos maiores ("sol rng" → "Sol Ring", nota 2);
 * - 2,5: o começo do nome, no meio de uma palavra ("counterspe" → "Counterspell");
 * - 3: todas as palavras pedidas dentro do nome ("rescue beastie" → "Kona, Rescue Beastie");
 * - 3,5 + erros: o começo do nome com um erro de digitação ("leisa shroud" → "Liesa, Shroud of Dusk").
 *
 * Ficha sugerida para uma linha de carta (e carta para uma linha da seção de fichas) perde 0,75.
 * Entre notas iguais, a carta mais jogada no EDHREC vem primeiro.
 */

/** Um nome do banco: a carta e os nomes pelos quais ela é achada (inglês, português, faces). */
export interface NameEntry {
  id: string;
  /** já normalizados (`normalizeName`) */
  aliases: string[];
  /** posição no EDHREC (menor = mais jogada); `null` sem posição */
  rank: number | null;
  token: boolean;
}

export interface Suggestion {
  id: string;
  score: number;
}

/** Erros permitidos no nome inteiro, pelo tamanho do que foi pedido. */
export function allowedTypos(length: number): number {
  return length <= 4 ? 1 : length <= 8 ? 2 : 3;
}

// três linhas da tabela da distância, reaproveitadas entre as contas (são dezenas de milhares por nome)
let rows: [Int32Array, Int32Array, Int32Array] = [new Int32Array(64), new Int32Array(64), new Int32Array(64)];

/**
 * A tabela de Damerau-Levenshtein (a versão "alinhamento ótimo": troca, falta, sobra e inversão
 * de duas letras vizinhas contam 1 cada) de `a` contra `b`. Devolve a última linha, a distância
 * de `a` inteiro para cada começo de `b`, ou `null` quando uma linha inteira passa de `max`: a
 * maioria dos nomes do banco é descartada nas primeiras letras.
 */
function table(a: string, b: string, max: number): Int32Array | null {
  if (rows[0].length <= b.length + 1)
    rows = [new Int32Array(b.length * 2 + 2), new Int32Array(b.length * 2 + 2), new Int32Array(b.length * 2 + 2)];
  let [before, prev, cur] = rows;
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    let rowMin = i;
    const ca = a.charCodeAt(i - 1);
    for (let j = 1; j <= b.length; j++) {
      const cb = b.charCodeAt(j - 1);
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca === cb ? 0 : 1));
      if (i > 1 && j > 1 && ca === b.charCodeAt(j - 2) && a.charCodeAt(i - 2) === cb) v = Math.min(v, before[j - 2] + 1);
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return null;
    [before, prev, cur] = [prev, cur, before];
  }
  return prev;
}

/**
 * Distância de Damerau-Levenshtein entre `a` e `b`. Para de contar quando passa de `max` e
 * devolve `max + 1`.
 */
export function editDistance(a: string, b: string, max = Number.POSITIVE_INFINITY): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const last = table(a, b, max);
  return last ? Math.min(last[b.length], max + 1) : max + 1;
}

/** Distância de `a` para o começo de `b` mais parecido com ele (até `max` letras mais curto ou mais longo). */
export function prefixDistance(a: string, b: string, max: number): number {
  const head = b.slice(0, a.length + max);
  const last = table(a, head, max);
  if (!last) return max + 1;
  let best = max + 1;
  for (let j = Math.max(0, a.length - max); j <= head.length; j++) best = Math.min(best, last[j]);
  return best;
}

/** O que foi pedido, já preparado para comparar com dezenas de milhares de nomes. */
interface Query {
  text: string;
  max: number;
  words: string[];
}

function prepare(text: string): Query {
  return { text, max: allowedTypos(text.length), words: text.split(" ").filter((w) => w.length >= 2) };
}

/** A nota de um nome do banco para o que foi pedido (`Infinity`: nada parecido). */
export function aliasScore(query: string | Query, alias: string): number {
  const q = typeof query === "string" ? prepare(query) : query;
  const text = q.text;
  if (alias === text) return 0;
  if (alias.length > text.length && alias.startsWith(text) && alias.charCodeAt(text.length) === 32) return 1;
  let best = Number.POSITIVE_INFINITY;
  const d = editDistance(text, alias, q.max);
  if (d <= q.max) best = 2 * d;
  if (best <= 2.5) return best;
  if (text.length >= 4 && alias.startsWith(text)) return 2.5;
  if (q.words.length && alias.length > text.length) {
    const padded = ` ${alias} `;
    if (q.words.every((w) => padded.includes(` ${w} `))) best = Math.min(best, 3);
  }
  // começo com um erro: só se a primeira letra pedida é a primeira ou a segunda do nome
  if (best <= 3.5 || text.length < 5 || alias.length <= text.length) return best;
  if (alias.charCodeAt(0) !== text.charCodeAt(0) && alias.charCodeAt(1) !== text.charCodeAt(0)) return best;
  const p = prefixDistance(text, alias, 1);
  return p <= 1 ? Math.min(best, 3.5 + p) : best;
}

/**
 * As `limit` cartas mais parecidas com `query` (já normalizado), da mais parecida para a menos.
 * Só entram notas até 6 (três erros de digitação no nome inteiro).
 */
export function suggestNames(query: string, names: readonly NameEntry[], options: { token?: boolean; limit?: number } = {}): Suggestion[] {
  const { token = false, limit = 3 } = options;
  if (query.length < 2) return [];
  const q = prepare(query);
  const found: (Suggestion & { rank: number; length: number })[] = [];
  for (const entry of names) {
    let score = Number.POSITIVE_INFINITY;
    let length = 0;
    for (const alias of entry.aliases) {
      const s = aliasScore(q, alias);
      if (s < score) {
        score = s;
        length = alias.length;
      }
    }
    if (entry.token !== token) score += 0.75;
    if (score <= 6) found.push({ id: entry.id, score, rank: entry.rank ?? Number.MAX_SAFE_INTEGER, length });
  }
  found.sort((a, b) => a.score - b.score || a.rank - b.rank || a.length - b.length);
  return found.slice(0, limit).map(({ id, score }) => ({ id, score }));
}
