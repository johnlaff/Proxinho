/**
 * API do Proxinho (Cloudflare Worker).
 *
 * O mesmo Worker entrega o site (arquivos estáticos do Vite) e responde em
 * /api/*. Os dados das cartas ficam no D1, atualizados todo dia pelo pipeline.
 * Nenhuma imagem de carta passa por aqui: o navegador baixa direto do CDN do
 * Scryfall e monta a carta localmente.
 */
import { normalizeName } from "../src/lib/normalize";
import { importDeck, ImportError } from "./importers";

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  /** Fontes das cartas reais, guardadas fora do repositório (opcional em dev). */
  FONTES?: KVNamespace;
}

/** Arquivos de fonte que o site serve, pelo nome público. */
const FONT_FILES = new Set(["beleren-bold.ttf", "mplantin.ttf", "mplantin-bold.ttf", "mplantin-italic.ttf"]);

async function serveFont(env: Env, name: string): Promise<Response> {
  if (!FONT_FILES.has(name) || !env.FONTES) return problem(404, "Fonte não encontrada.");
  const data = await env.FONTES.get(name, "arrayBuffer");
  if (!data) return problem(404, "Fonte não encontrada.");
  return new Response(data, {
    headers: {
      "content-type": "font/ttf",
      "cache-control": "public, max-age=604800",
      "x-content-type-options": "nosniff",
    },
  });
}

const MAX_RESOLVE = 250;
const MAX_PRINTS_PER_CARD = 80;

function json(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  if (!headers.has("cache-control")) headers.set("cache-control", "no-store");
  return new Response(JSON.stringify(data), { ...init, headers });
}

function problem(status: number, message: string): Response {
  return json({ error: message }, { status });
}

interface CardRow {
  oracle_id: string;
  name_en: string;
  name_pt: string | null;
  source: string | null;
  text_print: string | null;
  faces: string;
  pt_print: string | null;
  layout: string | null;
  type_line: string | null;
  /** fichas que a carta cria (JSON com oracle_id) */
  tokens?: string | null;
}

function parseCard(row: CardRow) {
  return {
    oracle_id: row.oracle_id,
    name_en: row.name_en,
    name_pt: row.name_pt,
    source: row.source,
    text_print: row.text_print ? JSON.parse(row.text_print) : null,
    faces: JSON.parse(row.faces),
    pt_print: row.pt_print ? JSON.parse(row.pt_print) : null,
    layout: row.layout,
    type_line: row.type_line,
    tokens: row.tokens ? (JSON.parse(row.tokens) as string[]) : [],
  };
}

interface PrintRow {
  id: string;
  oracle_id: string;
  highres: number;
  promo: number;
  has_pt: number;
  two_sided: number;
  supported: number;
  sides: string | null;
  [k: string]: unknown;
}

function parsePrint(row: PrintRow) {
  return {
    ...row,
    highres: !!row.highres,
    promo: !!row.promo,
    has_pt: !!row.has_pt,
    two_sided: !!row.two_sided,
    supported: !!row.supported,
    sides: row.sides ? JSON.parse(row.sides) : null,
  };
}

/** Condição SQL para casar um nome exato numa coluna com apelidos "a | b". */
const ALIAS_MATCH = (col: string) =>
  `(${col} = ?1 OR ${col} LIKE ?1 || ' | %' OR ${col} LIKE '% | ' || ?1 OR ${col} LIKE '% | ' || ?1 || ' | %')`;

/** Acha a carta pelo nome; `token` dá preferência às fichas (seção "Tokens" da lista). */
async function findByName(db: D1Database, name: string, token = false): Promise<CardRow | null> {
  const n = normalizeName(name);
  if (!n) return null;
  return db
    .prepare(
      `SELECT * FROM cards WHERE ${ALIAS_MATCH("search_en")} OR ${ALIAS_MATCH("search_pt")}
       ORDER BY (COALESCE(layout, '') = 'token') <> ?2, edhrec_rank IS NULL, edhrec_rank, name_pt IS NULL LIMIT 1`,
    )
    .bind(n, token ? 1 : 0)
    .first<CardRow>();
}

async function printsFor(db: D1Database, oracleIds: string[]): Promise<Map<string, ReturnType<typeof parsePrint>[]>> {
  const out = new Map<string, ReturnType<typeof parsePrint>[]>();
  for (let i = 0; i < oracleIds.length; i += 50) {
    const ids = oracleIds.slice(i, i + 50);
    const { results } = await db
      .prepare(`SELECT * FROM prints WHERE oracle_id IN (${ids.map(() => "?").join(",")}) ORDER BY released DESC`)
      .bind(...ids)
      .all<PrintRow>();
    for (const row of results) {
      const list = out.get(row.oracle_id) ?? [];
      if (list.length < MAX_PRINTS_PER_CARD) list.push(parsePrint(row));
      out.set(row.oracle_id, list);
    }
  }
  return out;
}

async function search(db: D1Database, q: string) {
  const n = normalizeName(q);
  if (n.length < 2) return [];
  const { results } = await db
    .prepare(
      `SELECT oracle_id, name_en, name_pt, source, type_line FROM cards
       WHERE search_en LIKE ?1 || '%' OR search_pt LIKE ?1 || '%' OR search_en LIKE '% | ' || ?1 || '%' OR search_pt LIKE '% | ' || ?1 || '%'
          OR search_en LIKE '% ' || ?1 || '%' OR search_pt LIKE '% ' || ?1 || '%'
       ORDER BY layout = 'token', (search_en LIKE ?1 || '%' OR search_pt LIKE ?1 || '%') DESC, edhrec_rank IS NULL, edhrec_rank
       LIMIT 8`,
    )
    .bind(n)
    .all();
  return results;
}

const MAX_BY_ID = 120;

/** Cartas (ou fichas) pelo oracle_id, com as impressões: usado para as fichas do deck. */
async function cardsById(db: D1Database, ids: string[]) {
  const unique = [...new Set(ids)].slice(0, MAX_BY_ID);
  const rows: CardRow[] = [];
  for (let i = 0; i < unique.length; i += 50) {
    const chunk = unique.slice(i, i + 50);
    const { results } = await db
      .prepare(`SELECT * FROM cards WHERE oracle_id IN (${chunk.map(() => "?").join(",")})`)
      .bind(...chunk)
      .all<CardRow>();
    rows.push(...results);
  }
  const prints = await printsFor(
    db,
    rows.map((r) => r.oracle_id),
  );
  return rows.map((row) => ({ query: row.name_en, card: parseCard(row), prints: prints.get(row.oracle_id) ?? [] }));
}

interface ResolveLine {
  name: string;
  set?: string;
  number?: string;
  /** a linha veio da seção de fichas */
  token?: boolean;
}

async function resolve(db: D1Database, lines: ResolveLine[]) {
  const unique = [...new Map(lines.map((l) => [`${l.token ? "t" : "c"}:${normalizeName(l.name)}`, l])).values()].slice(0, MAX_RESOLVE);
  const rows = await Promise.all(unique.map((l) => findByName(db, l.name, l.token)));
  const found = rows.filter((r): r is CardRow => r !== null);
  const prints = await printsFor(db, [...new Set(found.map((r) => r.oracle_id))]);
  const results = unique.map((line, i) => {
    const row = rows[i];
    if (!row) return { query: line.name, card: null, prints: [] };
    return { query: line.name, card: parseCard(row), prints: prints.get(row.oracle_id) ?? [] };
  });
  return results;
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    try {
      if (url.pathname === "/api/health") {
        const meta = await env.DB.prepare("SELECT value FROM meta WHERE key = 'updated_at'").first<{ value: string }>();
        return json({ ok: true, dataUpdatedAt: meta?.value ?? null });
      }
      if (url.pathname === "/api/search" && request.method === "GET") {
        return json(
          { results: await search(env.DB, url.searchParams.get("q") ?? "") },
          { headers: { "cache-control": "public, max-age=3600" } },
        );
      }
      if (url.pathname === "/api/resolve" && request.method === "POST") {
        const body = (await request.json().catch(() => null)) as { lines?: ResolveLine[] } | null;
        if (!body?.lines || !Array.isArray(body.lines)) return problem(400, "Envie { lines: [{ name }] }.");
        const lines = body.lines
          .filter((l) => typeof l?.name === "string" && l.name.trim())
          .map((l) => ({ name: l.name.slice(0, 200), token: l.token === true }));
        return json({ results: await resolve(env.DB, lines) });
      }
      if (url.pathname === "/api/cards" && request.method === "POST") {
        const body = (await request.json().catch(() => null)) as { ids?: unknown } | null;
        const ids = Array.isArray(body?.ids) ? body.ids.filter((x): x is string => typeof x === "string" && /^[0-9a-f-]{36}$/.test(x)) : [];
        if (!ids.length) return problem(400, "Envie { ids: [oracle_id, …] }.");
        return json({ results: await cardsById(env.DB, ids) });
      }
      if (url.pathname === "/api/import" && request.method === "GET") {
        const target = url.searchParams.get("url") ?? "";
        const cache = caches.default;
        const key = new Request(`https://proxinho.cache/import?url=${encodeURIComponent(target)}`);
        const hit = await cache.match(key);
        if (hit) return hit;
        const deck = await importDeck(target);
        const res = json(deck, { headers: { "cache-control": "public, max-age=900" } });
        await cache.put(key, res.clone());
        return res;
      }
      if (url.pathname.startsWith("/api/fontes/") && request.method === "GET") {
        return serveFont(env, url.pathname.slice("/api/fontes/".length));
      }
      if (url.pathname.startsWith("/api/")) return problem(404, "Rota não encontrada.");
      return env.ASSETS.fetch(request);
    } catch (err) {
      if (err instanceof ImportError) return problem(err.status, err.message);
      console.error(err);
      return problem(500, "Algo deu errado do nosso lado. Tente de novo em instantes.");
    }
  },
} satisfies ExportedHandler<Env>;
