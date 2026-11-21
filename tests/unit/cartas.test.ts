import { describe, expect, it } from "vitest";
import { cardBuilds, cardQueue, cardsApi, type CardBucket, type CardsEnv } from "../../worker/cartas";

const BUILD = "0123456789abcdef";
const KEY = "a".repeat(64);
const PATH = `/api/cartas/${BUILD}/${KEY}.jpg`;
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

/** O R2 na memória. */
function bucket() {
  const files = new Map<string, { data: ArrayBuffer; meta: Record<string, string> }>();
  const b: CardBucket = {
    get: async (k) => {
      const f = files.get(k);
      return f ? { body: new Response(f.data).body!, httpEtag: '"e"', customMetadata: f.meta } : null;
    },
    head: async (k) => (files.has(k) ? {} : null),
    put: async (k, data, o) => void files.set(k, { data, meta: o.customMetadata }),
    // em páginas de `limit`, como o R2 (o cursor é a posição)
    list: async ({ prefix = "", limit = 1000, cursor }) => {
      const keys = [...files.keys()].filter((k) => k.startsWith(prefix)).sort();
      const from = Number(cursor ?? 0);
      const page = keys.slice(from, from + limit);
      const truncated = from + limit < keys.length;
      return {
        objects: page.map((key) => ({ key, size: files.get(key)!.data.byteLength })),
        truncated,
        cursor: truncated ? String(from + limit) : undefined,
      };
    },
    delete: async (keys) => keys.forEach((k) => files.delete(k)),
  };
  return { files, b };
}

function call(env: CardsEnv, path: string, init: RequestInit = {}) {
  const request = new Request(`https://proxinho.test${path}`, init);
  return cardsApi(request, env, new URL(request.url));
}

const secret = { authorization: "Bearer segredo" };

describe("cartas montadas no servidor", () => {
  it("serve a carta gravada pelo montador, guardável para sempre, com a etiqueta de inglês", async () => {
    const { b } = bucket();
    const env = { CARTAS: b, CARTAS_TOKEN: "segredo" };
    expect((await call(env, PATH))!.status).toBe(404);
    const put = await call(env, PATH, { method: "PUT", body: JPEG, headers: { ...secret, "x-traduzida": "0" } });
    expect(put!.status).toBe(200);
    const res = (await call(env, PATH))!;
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    expect(res.headers.get("cache-control")).toContain("immutable");
    expect(res.headers.get("x-traduzida")).toBe("0");
    expect(res.headers.get("x-robots-tag")).toBe("noindex");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(JPEG);
  });

  it("só grava com a senha do montador, e só JPEG", async () => {
    const { b, files } = bucket();
    const env = { CARTAS: b, CARTAS_TOKEN: "segredo" };
    expect((await call(env, PATH, { method: "PUT", body: JPEG }))!.status).toBe(401);
    expect((await call(env, PATH, { method: "PUT", body: JPEG, headers: { authorization: "Bearer outro" } }))!.status).toBe(401);
    expect((await call(env, PATH, { method: "PUT", body: "<svg/>", headers: secret }))!.status).toBe(400);
    // sem senha configurada no Worker, ninguém grava
    expect((await call({ CARTAS: b }, PATH, { method: "PUT", body: JPEG, headers: secret }))!.status).toBe(401);
    expect(files.size).toBe(0);
  });

  it("diz quais chaves faltam e apaga as cartas de um código velho", async () => {
    const { b, files } = bucket();
    const env = { CARTAS: b, CARTAS_TOKEN: "segredo" };
    await call(env, PATH, { method: "PUT", body: JPEG, headers: secret });
    const other = "b".repeat(64);
    const missing = await call(env, `/api/cartas/${BUILD}/faltando`, {
      method: "POST",
      body: JSON.stringify({ chaves: [KEY, other, "../segredo"] }),
      headers: secret,
    });
    expect(await missing!.json()).toEqual({ faltando: [other] });
    const list = await cardBuilds(new Request("https://proxinho.test/api/cartas", { headers: secret }), env);
    expect(await list.json()).toEqual({ codigos: [BUILD], bytes: JPEG.byteLength, objetos: 1 });
    const del = await call(env, `/api/cartas/${BUILD}`, { method: "DELETE", headers: secret });
    expect(await del!.json()).toEqual({ apagadas: 1, restam: false });
    expect(files.size).toBe(0);
  });

  it("não responde por outros caminhos nem aceita chave fora do formato", async () => {
    const { b } = bucket();
    const env = { CARTAS: b, CARTAS_TOKEN: "segredo" };
    expect(await call(env, "/api/cartas/qualquer")).toBeNull();
    expect(await call(env, `/api/cartas/${BUILD}/../../segredo.jpg`)).toBeNull();
    // sem o depósito (antes de ligar o R2), a carta simplesmente não existe
    expect((await call({}, PATH))!.status).toBe(404);
  });

  it("soma o depósito inteiro, de todos os códigos, página por página", async () => {
    const { b, files } = bucket();
    const env = { CARTAS: b, CARTAS_TOKEN: "segredo" };
    for (let i = 0; i < 2500; i++)
      files.set(`${i % 2 ? BUILD : "f".repeat(16)}/${i.toString(16).padStart(64, "0")}.jpg`, { data: new ArrayBuffer(10), meta: {} });
    const res = await cardBuilds(new Request("https://proxinho.test/api/cartas", { headers: secret }), env);
    const body = (await res.json()) as { codigos: string[]; bytes: number; objetos: number };
    expect(body.objetos).toBe(2500);
    expect(body.bytes).toBe(25000);
    expect(body.codigos.sort()).toEqual([BUILD, "f".repeat(16)]);
    // sem a senha, nada
    expect((await cardBuilds(new Request("https://proxinho.test/api/cartas"), env)).status).toBe(401);
  });

  it("dá a fila do montador só com a senha, e um token com cara de JWT não passa por senha", async () => {
    const queries: string[] = [];
    const DB = {
      prepare: (q: string) => ({
        all: async <T>() => (queries.push(q), { results: [{ oracle_id: "a" }, { oracle_id: "b" }] as T[] }),
      }),
    };
    const env = { DB, CARTAS_TOKEN: "segredo" };
    const ask = (headers: Record<string, string> = {}) =>
      cardQueue(new Request("https://proxinho.test/api/cartas/lista", { headers }), env);
    expect(await (await ask(secret)).json()).toEqual({ cartas: ["a", "b"] });
    // ordem fixa (os pedaços da montagem no GitHub dividem a mesma fila)
    expect(queries[0]).toMatch(/ORDER BY .*edhrec_rank.*oracle_id/);
    expect((await ask()).status).toBe(401);
    expect((await ask({ authorization: "Bearer a.b.c" })).status).toBe(401);
  });
});
