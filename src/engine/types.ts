/** Tipos compartilhados entre o site, o motor de render e a API. */

/** Uma face da carta com o texto em português. */
export interface PtFace {
  name_en: string;
  name_pt: string | null;
  type_pt: string | null;
  text_pt: string | null;
  flavor_pt: string | null;
  mana_cost: string | null;
  /** Fichas: poder/resistência ("1/1") e cores ("WB"), para distinguir fichas de mesmo nome. */
  pt?: string | null;
  colors?: string;
  /** Linhas de `text_pt` (índices de `split("\n")`) que começam com palavra de habilidade, em itálico na carta. */
  ability_words?: number[];
  /**
   * Lembrete que a carta imprime fora da caixa: o das Salas de Duskmourn, na faixa entre a linha
   * de tipo e as caixas ("(Você pode conjurar qualquer metade. …)", da dica do Arena, ADR 0033).
   */
  reminder_pt?: string;
  /**
   * Na frente das cartas de fundir: o P/R da carta fundida, que ela imprime no pé da caixa ("9/10"
   * na Bruna), como o do verso nas de transformar (ADR 0043).
   */
  meld_pt?: string;
  /**
   * Nas criaturas com Protótipo: o custo do protótipo ("{1}{W}{W}"), impresso na aba à direita da
   * faixa do alto da caixa; o motor acha a aba pelo número de símbolos (ADR 0045).
   */
  prototype_cost?: string;
}

/**
 * De onde veio a tradução: o Arena, uma impressão oficial em PT ou, sem nenhuma das duas, a
 * tradução não oficial montada no pipeline com as frases das cartas oficiais (ADR 0025).
 */
export type TextSource = "arena" | "impresso" | "nao-oficial" | null;

/** Uma carta (todas as impressões compartilham o mesmo `oracle_id`). */
export interface CardRecord {
  oracle_id: string;
  name_en: string;
  name_pt: string | null;
  source: TextSource;
  /** Impressão de onde veio o texto (o flavor só vale para ela e para as de mesmo flavor em inglês, `text_flavor`). */
  text_print: { set: string; number: string } | null;
  faces: PtFace[];
  /** Impressão em português mais recente, para mostrar a imagem oficial. */
  pt_print: { id: string; set: string; number: string; hires: boolean } | null;
  layout: string | null;
  type_line: string | null;
  /** Fichas (oracle_id) que a carta cria; vazio nas próprias fichas. */
  tokens?: string[];
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
  /** Cartas de duas faces: dados de cada face (frente e verso). */
  sides?: PrintSide[] | null;
  /**
   * O flavor em inglês desta impressão é o mesmo da impressão de onde veio o texto em PT
   * (`text_print`): o flavor em PT vale para ela também.
   */
  text_flavor?: boolean;
  /**
   * O flavor em PT desta arte, um por face, quando ela não leva o da impressão do texto: o da
   * versão do Arena com o mesmo flavor em inglês (Birds of Paradise BLC 81, a fala da Ms.
   * Bumbleflower; o texto vem da LTC 235).
   */
  flavor_pt?: (string | null)[] | null;
  /**
   * Nome de crossover impresso no alto ("Skeletor, Lord of Destruction"); o nome de jogo vem
   * numa linha pequena logo abaixo da barra do nome, que recebe o nome em PT.
   */
  flavor_name?: string | null;
  /**
   * Marca-d'água da impressão ("golgari", "mirran", "fnm"…): na moldura de 2003 ela fica, e só as
   * letras saem de cima dela (ADR 0024).
   */
  watermark?: string | null;
  /**
   * Carta de uma face só com indicador de cor (o círculo à esquerda da linha de tipo:
   * Crashing Footfalls, Living End). Nas de duas faces ele vem em `sides`.
   */
  indicator?: boolean;
}

/** Uma face de uma impressão de duas faces. */
export interface PrintSide {
  mana_cost: string | null;
  has_pt: boolean;
  /** poder/resistência, ex.: "4/4" (aparece pequeno na frente, como lembrete do verso) */
  pt: string | null;
  /** tem indicador de cor na linha de tipo */
  indicator: boolean;
  /** o motor sabe reescrever esta face */
  supported: boolean;
}

/**
 * Imagem de uma impressão. Nas fichas de duas faces, cada face é uma "impressão"
 * da sua ficha, e a de trás tem id "<id do Scryfall>#1" (ver data/pipeline/build.py).
 */
export function printImage(print: Pick<PrintRecord, "id">, version: "png" | "normal" | "small" | "large" = "png", side: 0 | 1 = 0): string {
  const [id, face] = print.id.split("#");
  return scryfallImage(id, version, side === 1 || face === "1" ? "back" : "front");
}

/** Endereço da imagem no CDN do Scryfall (o padrão de URL é público e estável). */
export function scryfallImage(id: string, version: "png" | "normal" | "small" | "large" = "png", face: "front" | "back" = "front"): string {
  const ext = version === "png" ? "png" : "jpg";
  return `https://cards.scryfall.io/${version}/${face}/${id[0]}/${id[1]}/${id}.${ext}`;
}
