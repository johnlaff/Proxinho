/**
 * Fichas e emblemas que o deck cria: aparecem no resumo do pedido para a pessoa escolher
 * quais imprimir, uma de cada (a quantidade muda depois, como nas cartas).
 */
import { Plus } from "lucide-react";
import type { Resolved } from "../app/api";
import { hasPtText, isEmblem, tokenDetails } from "../app/model";

interface Props {
  tokens: Resolved[];
  onAdd: (items: Resolved[]) => void;
  onDismiss: () => void;
}

export function TokenSuggestions({ tokens, onAdd, onDismiss }: Props) {
  if (!tokens.length) return null;
  const emblems = tokens.some((t) => t.card && isEmblem(t.card));
  return (
    <section className="tokens" aria-labelledby="tokens-title">
      <h2 id="tokens-title" className="section-title">
        {emblems ? "Fichas e emblemas que o deck cria" : "Fichas que o deck cria"}
      </h2>
      <p className="hint">Escolha as que quer imprimir. Elas entram com uma cópia cada, no fim das folhas.</p>
      <ul className="token-list">
        {tokens.map((t) => {
          const card = t.card!;
          const pt = hasPtText(card);
          return (
            <li key={card.oracle_id} className="token-row">
              <span className="token-name">
                {card.name_pt ?? card.name_en}
                <span className="token-meta">
                  {tokenDetails(card)}
                  {!pt && " · em inglês, sem tradução oficial"}
                </span>
              </span>
              <button
                type="button"
                className="icon-btn"
                onClick={() => onAdd([t])}
                aria-label={
                  isEmblem(card)
                    ? `Adicionar o ${card.name_pt ?? card.name_en}`
                    : `Adicionar a ficha ${card.name_pt ?? card.name_en} ${tokenDetails(card)}`
                }
              >
                <Plus size={20} aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ul>
      <div className="token-actions">
        <button type="button" className="btn btn--primary btn--small" onClick={() => onAdd(tokens)}>
          <Plus size={17} aria-hidden="true" />
          {tokens.length === 1
            ? emblems
              ? "Adicionar o emblema"
              : "Adicionar a ficha"
            : emblems
              ? `Adicionar todos (${tokens.length})`
              : `Adicionar as ${tokens.length} fichas`}
        </button>
        <button type="button" className="btn btn--quiet btn--small" onClick={onDismiss}>
          Agora não
        </button>
      </div>
    </section>
  );
}
