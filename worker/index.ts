/**
 * API do Proxinho (Cloudflare Worker).
 *
 * O mesmo Worker entrega o site (arquivos estáticos do Vite) e responde em
 * /api/*. Os dados das cartas ficam no D1, atualizados todo dia pelo pipeline.
 * A imagem do Scryfall não passa por aqui: o navegador baixa direto do CDN dele
 * e monta a carta localmente. Daqui saem só as cartas já montadas de antemão
 * pelo mesmo motor (R2 privado, /api/cartas/*, ADR 0022).
 */
import { normalizeName } from "../src/lib/normalize";
import { suggestNames, type NameEntry } from "../src/lib/suggest";
import { cardsApi, cardBuilds, cardQueue } from "./cartas";
import { importDeck, ImportError } from "./importers";

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  /** Fontes das cartas reais, guardadas fora do repositório (opcional em dev). */
  FONTES?: KVNamespace;
  /** Cartas já montadas pelo mesmo motor do site, num Chromium (ADR 0022, worker/cartas.ts). */
  CARTAS?: R2Bucket;
  /** Senha de quem grava as cartas montadas (o montador em lote rodado à mão, scripts/montagem). */
  CARTAS_TOKEN?: string;
  /** Números do repositório e do dono no GitHub: o workflow da montagem entra sem senha (worker/github.ts). */
  MONTAGEM_REPO_ID?: string;
  MONTAGEM_DONO_ID?: string;
}

/** Resumo do código que desenha as cartas (vite.config.ts): o montador confere que é o mesmo dele. */
declare const __PROXINHO_BUILD__: string | undefined;

/** Arquivos de fonte que o site serve, pelo nome público. */
const FONT_FILES = new Set([
  "beleren-bold.ttf",
  "mplantin.ttf",
  "mplantin-bold.ttf",
  "mplantin-italic.ttf",
  "matrix-bold.ttf",
  "medieval.ttf",
]);

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
  set_code: string;
  number: string;
  highres: number;
  promo: number;
  has_pt: number;
  two_sided: number;
  supported: number;
  sides: string | null;
  text_flavor?: number;
  indicator?: number;
  flavor_pt?: string | null;
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
    text_flavor: !!row.text_flavor,
    indicator: !!row.indicator,
    flavor_pt: row.flavor_pt ? (JSON.parse(row.flavor_pt) as (string | null)[]) : null,
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

/**
 * A impressão pedida (coleção e número) de uma carta com esse nome. Fichas diferentes têm o mesmo
 * nome ("Spirit" 1/1 branca, 1/1 incolor, 2/2 azul…): só o nome achava uma delas, e o pedido
 * guardado ou o link do pedido (src/app/order.ts) voltavam com a ficha errada.
 */
async function findByPrint(db: D1Database, name: string, set: string, number: string) {
  const row = await db
    .prepare(
      `SELECT c.*, p.id AS print_id FROM prints p JOIN cards c ON c.oracle_id = p.oracle_id
       WHERE p.set_code = ?2 AND p.number = ?3 AND (${ALIAS_MATCH("c.search_en")} OR ${ALIAS_MATCH("c.search_pt")}) LIMIT 1`,
    )
    .bind(normalizeName(name), set.toLowerCase(), number)
    .first<CardRow & { print_id: string }>();
  if (!row) return null;
  const print = await db.prepare("SELECT * FROM prints WHERE id = ?1").bind(row.print_id).first<PrintRow>();
  return { row, print: print ? parsePrint(print) : null };
}

const lineKey = (l: ResolveLine) => [l.token ? "t" : "c", normalizeName(l.name), l.set ?? "", l.number ?? ""].join("|");

async function resolve(db: D1Database, lines: ResolveLine[]) {
  const unique = [...new Map(lines.map((l) => [lineKey(l), l])).values()].slice(0, MAX_RESOLVE);
  const rows = await Promise.all(unique.map((l) => findByName(db, l.name, l.token)));
  const prints = await printsFor(db, [...new Set(rows.flatMap((r) => (r ? [r.oracle_id] : [])))]);
  // a impressão pedida que não está entre as da carta achada pelo nome: é de outra carta de mesmo
  // nome (fichas), ou mais antiga que as MAX_PRINTS_PER_CARD que vêm (Sol Ring tem mais de 80)
  const extra = await Promise.all(
    unique.map((l, i) => {
      if (!l.set || !l.number) return null;
      const set = l.set.toLowerCase();
      const have = rows[i] && prints.get(rows[i].oracle_id)?.some((p) => p.set_code === set && p.number === l.number);
      return have ? null : findByPrint(db, l.name, set, l.number);
    }),
  );
  const missingPrints = extra.flatMap((x, i) =>
    x && x.row.oracle_id !== rows[i]?.oracle_id && !prints.has(x.row.oracle_id) ? [x.row.oracle_id] : [],
  );
  for (const [id, list] of await printsFor(db, [...new Set(missingPrints)])) prints.set(id, list);
  return unique.map((line, i) => {
    const echo = { query: line.name, set: line.set, number: line.number, token: line.token || undefined };
    const row = extra[i]?.row ?? rows[i];
    if (!row) return { ...echo, card: null, prints: [] };
    let list = prints.get(row.oracle_id) ?? [];
    const wanted = extra[i]?.print;
    if (wanted && !list.some((p) => p.id === wanted.id)) list = [...list, wanted];
    return { ...echo, card: parseCard(row), prints: list };
  });
}

const MAX_SUGGEST = 40;
const NAMES_TTL = 60 * 60 * 1000;
/** Todos os nomes do banco, guardados enquanto o Worker vive (no máximo uma hora: os dados mudam). */
let names: { at: number; list: Promise<(NameEntry & { name_en: string; name_pt: string | null })[]> } | null = null;

function allNames(db: D1Database) {
  if (!names || Date.now() - names.at > NAMES_TTL) {
    const list = db
      .prepare("SELECT oracle_id, name_en, name_pt, search_en, search_pt, edhrec_rank, layout FROM cards")
      .all<{
        oracle_id: string;
        name_en: string;
        name_pt: string | null;
        search_en: string | null;
        search_pt: string | null;
        edhrec_rank: number | null;
        layout: string | null;
      }>()
      .then(({ results }) =>
        results.map((r) => ({
          id: r.oracle_id,
          name_en: r.name_en,
          name_pt: r.name_pt,
          aliases: [...new Set([...(r.search_en ?? "").split(" | "), ...(r.search_pt ?? "").split(" | ")].filter(Boolean))],
          rank: r.edhrec_rank,
          token: r.layout === "token",
        })),
      );
    names = { at: Date.now(), list };
    list.catch(() => {
      names = null;
    });
  }
  return names.list;
}

/** "Você quis dizer…?": até três cartas parecidas para cada nome que a lista trouxe e o banco não achou. */
async function suggestions(db: D1Database, queries: { name: string; token?: boolean }[]) {
  const list = await allNames(db);
  const byId = new Map(list.map((n) => [n.id, n]));
  return queries.slice(0, MAX_SUGGEST).map((q) => ({
    query: q.name,
    token: q.token || undefined,
    suggestions: suggestNames(normalizeName(q.name), list, { token: q.token }).map(({ id }) => {
      const n = byId.get(id)!;
      return { oracle_id: id, name_en: n.name_en, name_pt: n.name_pt, token: n.token };
    }),
  }));
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    try {
      if (url.pathname === "/api/health") {
        const meta = await env.DB.prepare("SELECT value FROM meta WHERE key = 'updated_at'").first<{ value: string }>();
        const codigo = typeof __PROXINHO_BUILD__ === "string" ? __PROXINHO_BUILD__ : null;
        return json({ ok: true, dataUpdatedAt: meta?.value ?? null, codigo });
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
        const text = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined);
        const lines = body.lines
          .filter((l) => typeof l?.name === "string" && l.name.trim())
          .map((l) => ({ name: l.name.slice(0, 200), token: l.token === true, set: text(l.set, 8), number: text(l.number, 16) }));
        return json({ results: await resolve(env.DB, lines) });
      }
      if (url.pathname === "/api/sugestoes" && request.method === "POST") {
        const body = (await request.json().catch(() => null)) as { names?: { name?: unknown; token?: unknown }[] } | null;
        const queries = (Array.isArray(body?.names) ? body.names : [])
          .filter((q): q is { name: string; token?: unknown } => typeof q?.name === "string" && q.name.trim().length >= 2)
          .map((q) => ({ name: q.name.trim().slice(0, 200), token: q.token === true }));
        if (!queries.length) return problem(400, "Envie { names: [{ name }] }.");
        return json({ results: await suggestions(env.DB, queries) });
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
      if (url.pathname === "/api/cartas" && request.method === "GET") return cardBuilds(request, env);
      if (url.pathname === "/api/cartas/lista" && request.method === "GET") return cardQueue(request, env);
      if (url.pathname.startsWith("/api/cartas/")) {
        const res = await cardsApi(request, env, url, caches.default);
        if (res) return res;
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
