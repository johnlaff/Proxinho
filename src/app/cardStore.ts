/**
 * Cartas já montadas, guardadas no próprio navegador (IndexedDB) entre uma visita e outra: a
 * prévia e a face do PDF de cada carta. Abrir a mesma lista de novo, ou trocar uma carta e baixar
 * outro PDF, não refaz as outras; nas artes sem borda e nos planeswalkers isso evita de 20 s a
 * 1 min de rede neural por carta. Nada passa pelo servidor.
 *
 * A chave resume tudo o que muda o desenho: o código que desenha (`__PROXINHO_BUILD__`, um
 * resumo de src/engine e do que monta a entrada, ver vite.config.ts), os arquivos das fontes
 * (`fontsId`), o tipo da imagem e a entrada inteira da carta (impressão, textos em PT, flavor).
 * Uma correção no motor ou no texto muda a chave, e a carta é montada de novo. No `dev` nada é
 * guardado (o código muda sem mudar o resumo). As usadas há mais tempo saem quando o espaço passa
 * de `STORE_BYTES`, e o navegador também pode apagar tudo quando falta espaço no aparelho.
 */
import { fontsId, loadCardFonts } from "../engine/fonts";

declare const __PROXINHO_BUILD__: string | undefined;

/** Uma carta guardada: a imagem e se o português foi escrito (as etiquetas dependem disso). */
export type StoredCard = { blob: Blob; translated: boolean };
type Usage = { id: string; at: number; size: number };

/** Onde as cartas ficam: o IndexedDB no navegador; nos testes, a memória. */
export interface CardBackend {
  get(id: string): Promise<StoredCard | undefined>;
  put(id: string, card: StoredCard, usage: Usage): Promise<void>;
  /** marca a carta como usada agora (as mais antigas saem primeiro) */
  touch(usage: Usage): Promise<void>;
  usage(): Promise<Usage[]>;
  remove(ids: string[]): Promise<void>;
}

/** Espaço das cartas guardadas: uns quatro a seis decks (prévia e PDF de 100 cartas, ~20 MB). */
export const STORE_BYTES = 120e6;

const DB = "proxinho-cartas";
const CARDS = "cartas";
const USAGE = "uso";

function indexedDbBackend(): CardBackend {
  let opened: Promise<IDBDatabase> | null = null;
  const open = () =>
    (opened ??= new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore(CARDS);
        req.result.createObjectStore(USAGE, { keyPath: "id" });
      };
      req.onsuccess = () => {
        // outra aba com uma versão nova do banco: esta solta a conexão
        req.result.onversionchange = () => {
          req.result.close();
          opened = null;
        };
        resolve(req.result);
      };
      req.onerror = () => reject(req.error);
    }).catch((e) => {
      opened = null;
      throw e;
    }));
  const run = async <T>(stores: string[], mode: IDBTransactionMode, fn: (t: IDBTransaction) => IDBRequest<T> | void) => {
    const tx = (await open()).transaction(stores, mode);
    const req = fn(tx);
    return new Promise<T>((resolve, reject) => {
      tx.oncomplete = () => resolve(req ? req.result : (undefined as T));
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  };
  return {
    get: (id) => run<StoredCard | undefined>([CARDS], "readonly", (t) => t.objectStore(CARDS).get(id)),
    put: (id, card, usage) =>
      run([CARDS, USAGE], "readwrite", (t) => {
        t.objectStore(CARDS).put(card, id);
        t.objectStore(USAGE).put(usage);
      }),
    touch: (usage) => run([USAGE], "readwrite", (t) => t.objectStore(USAGE).put(usage)).then(() => undefined),
    usage: () => run<Usage[]>([USAGE], "readonly", (t) => t.objectStore(USAGE).getAll()),
    remove: (ids) =>
      run([CARDS, USAGE], "readwrite", (t) => {
        for (const id of ids) {
          t.objectStore(CARDS).delete(id);
          t.objectStore(USAGE).delete(id);
        }
      }),
  };
}

let build = typeof __PROXINHO_BUILD__ === "string" ? __PROXINHO_BUILD__ : "";
let backend: CardBackend | null = null;
let backendTried = false;

function store(): CardBackend | null {
  if (!backendTried) {
    backendTried = true;
    if (build && typeof indexedDB !== "undefined") backend = indexedDbBackend();
  }
  return backend;
}

/** Troca onde as cartas ficam (os testes usam a memória; `null` desliga). */
export function useCardBackend(next: CardBackend | null, buildId = "teste") {
  backend = next;
  backendTried = true;
  build = next ? buildId : "";
}

/**
 * Chave da carta guardada para `kind` ("previa", "impressao:padrao"…) e a entrada da montagem,
 * ou `null` quando nada é guardado (no `dev`, sem IndexedDB ou sem `crypto.subtle`).
 */
export async function cardKey(kind: string, input: unknown): Promise<string | null> {
  if (!store() || !globalThis.crypto?.subtle) return null;
  // a fonte que de fato desenha só se sabe depois de carregar (as oficiais podem faltar)
  await loadCardFonts();
  const text = JSON.stringify([build, fontsId(), kind, input]);
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
  return Array.from(hash, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** A carta guardada com essa chave, ou `null` (sem chave, sem a carta, ou com erro no banco). */
export async function storedCard(id: string | null): Promise<StoredCard | null> {
  const s = store();
  if (!id || !s) return null;
  try {
    const card = await s.get(id);
    if (!card) return null;
    void s.touch({ id, at: Date.now(), size: card.blob.size }).catch(() => undefined);
    return card;
  } catch {
    return null;
  }
}

let pruning: ReturnType<typeof setTimeout> | undefined;

/** Guarda uma carta montada (sem esperar) e, logo depois, tira as mais antigas se passou do espaço. */
export function storeCard(id: string | null, card: StoredCard): void {
  const s = store();
  if (!id || !s) return;
  s.put(id, card, { id, at: Date.now(), size: card.blob.size })
    .catch(() => undefined)
    .finally(() => {
      clearTimeout(pruning);
      pruning = setTimeout(() => void prune(), 2000);
    });
}

/** Tira as cartas usadas há mais tempo até o total caber em `limit`. */
export async function prune(limit = STORE_BYTES): Promise<void> {
  const s = store();
  if (!s) return;
  try {
    const all = (await s.usage()).sort((a, b) => a.at - b.at);
    let total = all.reduce((n, u) => n + u.size, 0);
    const out: string[] = [];
    for (const u of all) {
      if (total <= limit) break;
      out.push(u.id);
      total -= u.size;
    }
    if (out.length) await s.remove(out);
  } catch {
    /* banco bloqueado: fica para a próxima */
  }
}
