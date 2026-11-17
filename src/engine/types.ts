/** Tipos compartilhados entre o site, o motor de render e a API. */

/** Uma face da carta com o texto em português. */
export interface PtFace {
  name_en: string;
  name_pt: string | null;
  type_pt: string | null;
  text_pt: string | null;
  flavor_pt: string | null;
  mana_cost: string | null;
}

/** De onde veio a tradução. */
export type TextSource = "arena" | "impresso" | null;

/** Uma carta (todas as impressões compartilham o mesmo `oracle_id`). */
export interface CardRecord {
  oracle_id: string;
  name_en: string;
  name_pt: string | null;
  source: TextSource;
  /** Impressão de onde veio o texto (o flavor só vale para ela). */
  text_print: { set: string; number: string } | null;
  faces: PtFace[];
  /** Impressão em português mais recente, para mostrar a imagem oficial. */
  pt_print: { id: string; set: string; number: string; hires: boolean } | null;
  layout: string | null;
  type_line: string | null;
}

/** Uma impressão (arte) em inglês de uma carta. */
export interface PrintRecord {
  id: string;
  oracle_id: string;
  set_code: string;
  set_name: string;
  number: string;
  released: string | null;
  artist: string | null;
  frame: string | null;
  effects: string | null;
  border: string | null;
  layout: string | null;
  highres: boolean;
  promo: boolean;
  mana_cost: string | null;
  has_pt: boolean;
  two_sided: boolean;
  supported: boolean;
}

/** Endereço da imagem no CDN do Scryfall (o padrão de URL é público e estável). */
export function scryfallImage(id: string, version: "png" | "normal" | "small" | "large" = "png", face: "front" | "back" = "front"): string {
  const ext = version === "png" ? "png" : "jpg";
  return `https://cards.scryfall.io/${version}/${face}/${id[0]}/${id[1]}/${id}.${ext}`;
}
