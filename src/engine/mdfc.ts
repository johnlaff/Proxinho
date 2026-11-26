/**
 * A faixa de baixo das cartas modais de duas faces (ADR 0029): o resumo do outro lado. À
 * esquerda vem uma palavra sobre o outro lado; à direita, o custo de mana dele ou, quando o
 * outro lado é um terreno, a habilidade de mana ("{T}: Add {R}."). O custo é desenho e fica;
 * a palavra e a habilidade são reescritas em português, como nas impressões em PT de Zendikar
 * Rising, Kaldheim, Strixhaven e Modern Horizons 3 ("Terreno", "Clérigo", "Mágica Instantânea",
 * "{T}: Adicione {W} ou {B}.").
 *
 * Que palavra a carta escreve muda com a coleção, e foi conferida carta a carta nas imagens:
 * - terreno: "Land", com a habilidade de mana;
 * - sem subtipo: o tipo ("Sorcery", "Instant", "Artifact", "Enchantment"), sem os supertipos;
 * - com subtipo: o último ("Kor Cleric" → "Cleric", "Elf Druid" → "Druid", "Legendary
 *   Planeswalker — Lukka" → "Lukka"), salvo duas de Modern Horizons 3 que escrevem o primeiro
 *   (`FIRST_SUBTYPE`);
 * - desde Marvel's Spider-Man (set. 2025), a criatura sai com o poder e a resistência:
 *   "4/4 Creature", em português "Criatura 4/4" (como "uma criatura 4/4" no texto oficial).
 */
import type { PtFace } from "./types";

export interface MdfcHint {
  /** a palavra da esquerda: "Terreno", "Feitiço", "Clérigo", "Criatura 4/4" */
  word: string;
  /** a habilidade de mana do terreno do outro lado ("{T}: Adicione {R}."); fora dos terrenos, o custo fica como está */
  mana: string | null;
}

/** Os tipos de carta em português, como nas linhas de tipo oficiais. */
const MAIN_PT: Record<string, string> = {
  Artifact: "Artefato",
  Battle: "Batalha",
  Creature: "Criatura",
  Enchantment: "Encantamento",
  Instant: "Mágica Instantânea",
  Land: "Terreno",
  Planeswalker: "Planeswalker",
  Sorcery: "Feitiço",
};

const SUPERTYPES = new Set(["Legendary", "Basic", "Snow", "World", "Ongoing", "Elite", "Host"]);

/**
 * Faces cuja faixa (no outro lado) escreve o primeiro subtipo, e não o último: em Modern
 * Horizons 3, "Human" para Witch Enchanter (Human Warlock) e "Elf" para Disciple of Freyalise
 * (Elf Druid); a Pinnacle Monk (Djinn Monk), da mesma coleção, escreve "Monk".
 */
const FIRST_SUBTYPE = new Set(["Witch Enchanter", "Disciple of Freyalise"]);

/** Desde esta data a faixa diz "4/4 Creature" (Marvel's Spider-Man, 26/9/2025; a pré-venda saiu antes). */
export const MDFC_PT_SINCE = "2025-09-01";

/**
 * O que a faixa desta face diz do outro lado, em português. `other` é a outra face (o texto em
 * PT dela), `otherTypeEn` a linha de tipo dela em inglês, `otherPt` o poder e a resistência
 * dela ("4/4") e `released` a data da impressão. `null` quando não dá para escrever com o
 * texto oficial: a faixa fica como está.
 */
export function mdfcHint(other: PtFace, otherTypeEn: string, otherPt: string | null, released: string | null): MdfcHint | null {
  const [mainEn, subEn = ""] = otherTypeEn.split(" — ");
  const mains = mainEn.split(" ").filter((w) => w && !SUPERTYPES.has(w));
  if (mains.includes("Land")) {
    // a última habilidade de mana do terreno ("{T}: Adicione {W} ou {B}."), como na carta
    const lines = (other.text_pt ?? "").split("\n").filter((l) => /^\{T\}: Adicione .+\.$/.test(l.trim()));
    const mana = lines.at(-1)?.trim();
    return mana ? { word: MAIN_PT.Land, mana } : null;
  }
  if ((released ?? "") >= MDFC_PT_SINCE && mains.includes("Creature") && otherPt)
    return { word: `${MAIN_PT.Creature} ${otherPt}`, mana: null };
  const subs = subEn.split(" ").filter(Boolean);
  if (subs.length) {
    // o subtipo em português, na mesma posição da linha de tipo oficial (as 99 cartas modais de
    // hoje têm o mesmo número de subtipos nas duas línguas; sem isso, a faixa fica como está)
    const subsPt = (other.type_pt ?? "").split(" — ")[1]?.split(" ").filter(Boolean) ?? [];
    if (subsPt.length !== subs.length) return null;
    return { word: FIRST_SUBTYPE.has(other.name_en) ? subsPt[0] : subsPt[subsPt.length - 1], mana: null };
  }
  if (mains.length !== 1 || !MAIN_PT[mains[0]]) return null;
  return { word: MAIN_PT[mains[0]], mana: null };
}
