import type { LamaStatus } from "../engine/lama";
import type { Outcome } from "./model";

/** Como cada resultado aparece escrito na interface (nunca só pela cor). */
export const OUTCOME_LABEL: Record<Outcome, string> = {
  reescrita: "Reescrita em português",
  "imagem-pt": "Imagem oficial em português",
  "sem-traducao": "Em inglês: ainda sem tradução oficial",
  moldura: "Em inglês: esta moldura ainda não é reescrita",
};

/**
 * Andamento da rede neural que apaga o inglês nas artes sem borda e nos planeswalkers, para a
 * prévia que espera por ela. `percent` só no download com tamanho conhecido (para no 99 até
 * acabar); `null` quando não há o que mostrar.
 */
export function neuralStage(s: LamaStatus): { text: string; percent: number | null } | null {
  if (s.stage === "download") {
    const percent = s.total > 0 ? Math.min(99, Math.floor((100 * s.loaded) / s.total)) : null;
    return { text: percent === null ? "Baixando o apagador de texto…" : `Baixando o apagador de texto: ${percent}%`, percent };
  }
  if (s.stage === "prepare") return { text: "Preparando o apagador de texto…", percent: null };
  if (s.stage === "run") return { text: "Apagando o inglês…", percent: null };
  return null;
}
