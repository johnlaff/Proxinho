import type { Outcome } from "./model";

/** Como cada resultado aparece escrito na interface (nunca só pela cor). */
export const OUTCOME_LABEL: Record<Outcome, string> = {
  reescrita: "Reescrita em português",
  "imagem-pt": "Imagem oficial em português",
  "sem-traducao": "Em inglês: ainda sem tradução oficial",
  moldura: "Em inglês: esta moldura ainda não é reescrita",
};
