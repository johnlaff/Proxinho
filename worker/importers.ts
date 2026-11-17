/**
 * Importadores de deck por URL.
 *
 * Só falamos com hosts conhecidos (lista fechada), o que evita que o Worker
 * seja usado como proxy aberto para qualquer endereço.
 */

export interface ImportedCard {
  quantity: number;
  name: string;
  set?: string;
  number?: string;
  section: "commander" | "main" | "side";
}

export interface ImportedDeck {
  name: string;
  source: string;
  cards: ImportedCard[];
}

export class ImportError extends Error {
  constructor(
    message: string,
    public status = 422,
  ) {
    super(message);
  }
}

const UA = { "user-agent": "Proxinho/1.0 (+https://proxinho.johnlaff.com)", accept: "application/json" };

async function archidekt(id: string): Promise<ImportedDeck> {
  const res = await fetch(`https://archidekt.com/api/decks/${id}/`, { headers: UA });
  if (res.status === 404) throw new ImportError("Não achamos esse deck no Archidekt. Confira se ele é público.", 404);
  if (!res.ok) throw new ImportError(`O Archidekt respondeu com erro ${res.status}. Tente de novo em instantes.`, 502);
  const data = (await res.json()) as {
    name: string;
    cards: {
      quantity: number;
      categories?: string[];
      card: { collectorNumber?: string; edition?: { editioncode?: string }; oracleCard: { name: string } };
    }[];
  };
  const cards: ImportedCard[] = [];
  for (const c of data.cards) {
    const cats = (c.categories ?? []).map((x) => x.toLowerCase());
    if (cats.includes("maybeboard")) continue;
    cards.push({
      quantity: c.quantity,
      name: c.card.oracleCard.name,
      set: c.card.edition?.editioncode,
      number: c.card.collectorNumber,
      section: cats.includes("commander") ? "commander" : cats.includes("sideboard") ? "side" : "main",
    });
  }
  return { name: data.name, source: "Archidekt", cards };
}

async function moxfield(id: string): Promise<ImportedDeck> {
  const res = await fetch(`https://api2.moxfield.com/v3/decks/all/${id}`, { headers: UA });
  if (!res.ok) {
    throw new ImportError(
      "O Moxfield não deixa outros sites lerem os decks. No Moxfield, abra o deck, clique em Exportar, copie a lista e cole aqui.",
      422,
    );
  }
  const data = (await res.json()) as {
    name: string;
    boards: Record<string, { cards: Record<string, { quantity: number; card: { name: string; set: string; cn: string } }> }>;
  };
  const cards: ImportedCard[] = [];
  const map: Record<string, ImportedCard["section"]> = {
    commanders: "commander",
    mainboard: "main",
    sideboard: "side",
    companions: "commander",
  };
  for (const [board, section] of Object.entries(map)) {
    for (const entry of Object.values(data.boards?.[board]?.cards ?? {})) {
      cards.push({ quantity: entry.quantity, name: entry.card.name, set: entry.card.set, number: entry.card.cn, section });
    }
  }
  return { name: data.name, source: "Moxfield", cards };
}

export async function importDeck(raw: string): Promise<ImportedDeck> {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new ImportError("Esse endereço não parece um link. Cole o link completo do deck, começando com https://.", 400);
  }
  const host = url.hostname.replace(/^www\./, "");
  if (host === "archidekt.com") {
    const id = url.pathname.match(/\/decks\/(\d+)/)?.[1];
    if (!id) throw new ImportError("Não achamos o número do deck nesse link do Archidekt.", 400);
    return archidekt(id);
  }
  if (host === "moxfield.com") {
    const id = url.pathname.match(/\/decks\/([\w-]+)/)?.[1];
    if (!id) throw new ImportError("Não achamos o código do deck nesse link do Moxfield.", 400);
    return moxfield(id);
  }
  throw new ImportError("Por enquanto importamos links do Archidekt e do Moxfield. De outros sites, copie a lista e cole aqui.", 400);
}
