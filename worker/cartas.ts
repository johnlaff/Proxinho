/**
 * Cartas montadas no servidor (ADR 0022): `/api/cartas/<resumo do código>/<chave>.jpg`, a mesma
 * chave das cartas guardadas no navegador (src/app/cardStore.ts), montadas de antemão pelo mesmo
 * motor do site num Chromium (scripts/montagem). Ler é livre, e a resposta de um endereço nunca
 * muda (a chave resume o código que desenha, as fontes e a entrada inteira da carta). Gravar,
 * perguntar quais faltam e apagar as de um código velho pedem a senha do montador.
 */

/** O pedaço do R2 que a API usa (o `R2Bucket` do Worker cabe nele). */
export interface CardBucket {
  get(key: string): Promise<{ body: ReadableStream; httpEtag: string; customMetadata?: Record<string, string> } | null>;
  head(key: string): Promise<unknown>;
  put(
    key: string,
    value: ArrayBuffer,
    options: { httpMetadata: { contentType: string }; customMetadata: Record<string, string> },
  ): Promise<unknown>;
  list(options: { prefix?: string; limit?: number; delimiter?: string }): Promise<{
    objects: { key: string }[];
    truncated: boolean;
    delimitedPrefixes: string[];
  }>;
  delete(keys: string[]): Promise<unknown>;
}

export interface CardsEnv {
  /** Cartas já montadas pelo mesmo motor do site, num Chromium. */
  CARTAS?: CardBucket;
  /** Senha de quem grava as cartas montadas (o montador em lote, scripts/montagem). */
  CARTAS_TOKEN?: string;
}

const CARD_PATH = /^\/api\/cartas\/([0-9a-f]{16})\/([0-9a-f]{64})\.jpg$/;
const BUILD_PATH = /^\/api\/cartas\/([0-9a-f]{16})(\/faltando)?$/;
/** maior carta aceita: a face de impressão em alta tem ~700 KB */
export const MAX_CARD_BYTES = 4e6;
const MAX_MISSING = 1000;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

const problem = (status: number, message: string) => json({ error: message }, status);

/** Compara a senha sem vazar pelo tempo quanto dela bate. */
async function sameSecret(given: string, secret: string): Promise<boolean> {
  const digest = async (v: string) => new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(v)));
  const [a, b] = await Promise.all([digest(given), digest(secret)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function authorized(request: Request, env: CardsEnv): Promise<boolean> {
  const given = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  return Boolean(env.CARTAS_TOKEN && given && (await sameSecret(given, env.CARTAS_TOKEN)));
}

async function serve(request: Request, env: CardsEnv, key: string, cache?: Cache): Promise<Response> {
  const hit = await cache?.match(request);
  if (hit) return hit;
  const obj = await env.CARTAS?.get(key);
  // (sem guardar: a carta pode ser montada daqui a pouco)
  if (!obj) return problem(404, "Carta ainda não montada.");
  const res = new Response(obj.body, {
    headers: {
      "content-type": "image/jpeg",
      "cache-control": "public, max-age=31536000, immutable",
      "x-traduzida": obj.customMetadata?.traduzida === "0" ? "0" : "1",
      "x-content-type-options": "nosniff",
      "x-robots-tag": "noindex",
      etag: obj.httpEtag,
    },
  });
  await cache?.put(request, res.clone());
  return res;
}

/** As rotas de uma carta e de um código; `null` se o caminho não é delas. */
export async function cardsApi(request: Request, env: CardsEnv, url: URL, cache?: Cache): Promise<Response | null> {
  const card = CARD_PATH.exec(url.pathname);
  if (card && request.method === "GET") return serve(request, env, `${card[1]}/${card[2]}.jpg`, cache);
  const build = BUILD_PATH.exec(url.pathname);
  if (!card && !build) return null;
  const bucket = env.CARTAS;
  if (!bucket) return problem(503, "Sem o depósito das cartas montadas.");
  if (!(await authorized(request, env))) return problem(401, "Senha do montador inválida.");
  if (card && request.method === "PUT") {
    const body = await request.arrayBuffer();
    const head = new Uint8Array(body, 0, Math.min(3, body.byteLength));
    if (body.byteLength > MAX_CARD_BYTES || head[0] !== 0xff || head[1] !== 0xd8 || head[2] !== 0xff)
      return problem(400, "Envie a carta em JPEG.");
    const traduzida = request.headers.get("x-traduzida") === "0" ? "0" : "1";
    await bucket.put(`${card[1]}/${card[2]}.jpg`, body, { httpMetadata: { contentType: "image/jpeg" }, customMetadata: { traduzida } });
    return json({ ok: true });
  }
  if (build?.[2] && request.method === "POST") {
    // quais destas chaves ainda não estão montadas
    const body = (await request.json().catch(() => null)) as { chaves?: unknown } | null;
    const keys = Array.isArray(body?.chaves)
      ? body.chaves.filter((k): k is string => typeof k === "string" && /^[0-9a-f]{64}$/.test(k))
      : [];
    if (!keys.length || keys.length > MAX_MISSING) return problem(400, `Envie { chaves: [...] }, de 1 a ${MAX_MISSING}.`);
    const found = await Promise.all(keys.map((k) => bucket.head(`${build[1]}/${k}.jpg`)));
    return json({ faltando: keys.filter((_, i) => !found[i]) });
  }
  if (build && !build[2] && request.method === "DELETE") {
    // apaga um lote das cartas de um código velho (chame de novo enquanto `restam`)
    const list = await bucket.list({ prefix: `${build[1]}/`, limit: 1000 });
    if (list.objects.length) await bucket.delete(list.objects.map((o) => o.key));
    return json({ apagadas: list.objects.length, restam: list.truncated });
  }
  return problem(405, "Método não aceito aqui.");
}

/** Os códigos com cartas montadas (o montador apaga os que não são o atual). */
export async function cardBuilds(request: Request, env: CardsEnv): Promise<Response> {
  if (!env.CARTAS) return problem(503, "Sem o depósito das cartas montadas.");
  if (!(await authorized(request, env))) return problem(401, "Senha do montador inválida.");
  const list = await env.CARTAS.list({ delimiter: "/", limit: 1000 });
  return json({ codigos: list.delimitedPrefixes.map((p) => p.replace(/\/$/, "")) });
}
