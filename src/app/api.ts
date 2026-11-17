/** Cliente da API do Proxinho (mesmo domínio, rotas /api/*). */
import type { CardRecord, PrintRecord } from "../engine/types";

export interface Resolved {
  query: string;
  card: CardRecord | null;
  prints: PrintRecord[];
}

export interface SearchHit {
  oracle_id: string;
  name_en: string;
  name_pt: string | null;
  source: string | null;
  type_line: string | null;
}

async function call<T>(input: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(input, init);
  } catch {
    throw new Error("Sem conexão com o Proxinho. Confira a internet e tente de novo.");
  }
  const body = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok || !body) throw new Error(body?.error ?? `O servidor respondeu com erro ${res.status}. Tente de novo em instantes.`);
  return body;
}

export async function resolveNames(names: string[], signal?: AbortSignal): Promise<Resolved[]> {
  const out: Resolved[] = [];
  // a API aceita até 250 nomes por vez
  for (let i = 0; i < names.length; i += 250) {
    const chunk = names.slice(i, i + 250);
    const body = await call<{ results: Resolved[] }>("/api/resolve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ lines: chunk.map((name) => ({ name })) }),
      signal,
    });
    out.push(...body.results);
  }
  return out;
}

export async function searchCards(q: string, signal?: AbortSignal): Promise<SearchHit[]> {
  const body = await call<{ results: SearchHit[] }>(`/api/search?q=${encodeURIComponent(q)}`, { signal });
  return body.results;
}

export interface ImportedDeck {
  name: string;
  source: string;
  cards: { quantity: number; name: string; set?: string; number?: string; section: "commander" | "main" | "side" }[];
}

export function importFromUrl(url: string): Promise<ImportedDeck> {
  return call<ImportedDeck>(`/api/import?url=${encodeURIComponent(url)}`);
}
