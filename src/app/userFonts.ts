/**
 * Guarda as fontes que a pessoa escolheu no próprio navegador (IndexedDB),
 * para não precisar escolher de novo a cada visita. Nada vai para o servidor.
 */
import type { CustomFontFiles } from "../engine/fonts";

const DB = "proxinho";
const STORE = "fontes";
const KEY = "cartas";

export interface StoredFonts {
  title: ArrayBuffer | null;
  body: ArrayBuffer | null;
  bodyItalic: ArrayBuffer | null;
  names: { title?: string; body?: string; bodyItalic?: string };
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }).finally(() => db.close());
}

export async function loadStoredFonts(): Promise<StoredFonts | null> {
  try {
    return ((await run("readonly", (s) => s.get(KEY))) as StoredFonts | undefined) ?? null;
  } catch {
    return null; // modo anônimo ou armazenamento bloqueado: segue com as fontes livres
  }
}

export async function saveStoredFonts(fonts: StoredFonts): Promise<void> {
  try {
    await run("readwrite", (s) => s.put(fonts, KEY));
  } catch {
    /* sem armazenamento: as fontes valem só nesta visita */
  }
}

export async function clearStoredFonts(): Promise<void> {
  try {
    await run("readwrite", (s) => s.delete(KEY));
  } catch {
    /* nada a apagar */
  }
}

export function toFiles(f: StoredFonts): CustomFontFiles {
  return { title: f.title, body: f.body, bodyItalic: f.bodyItalic };
}
