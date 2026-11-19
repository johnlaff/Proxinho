import { OUTCOME_LABEL } from "../app/labels";
import type { Outcome } from "../app/model";

const SHORT: Record<Outcome, string> = { reescrita: "PT", "imagem-pt": "PT img", "sem-traducao": "EN", moldura: "EN", apagador: "EN" };

/** Etiqueta curta (texto, nunca só cor) com o resultado da carta. */
export function OutcomeTag({ outcome, long = false }: { outcome: Outcome; long?: boolean }) {
  return (
    <span className={`tag tag--${outcome}`} title={OUTCOME_LABEL[outcome]}>
      {long ? OUTCOME_LABEL[outcome] : SHORT[outcome]}
    </span>
  );
}
