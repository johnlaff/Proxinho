/**
 * A "prova": as folhas exatamente na ordem em que vão sair da impressora,
 * 9 cartas por folha, com marcas de corte e uma legenda técnica embaixo de
 * cada carta. Tocar numa carta abre a gaveta para trocar a arte.
 */
import { useEffect, useState } from "react";
import { displayName, outcomeOf, renderKey, selectedPrint, toSheets, type Entry } from "../app/model";
import { previewUrl } from "../app/preview";
import { ColorBar, CropCorners } from "./RegMark";
import { OutcomeTag } from "./OutcomeTag";

export function ProofSheets({ entries, paperLabel, onOpen }: { entries: Entry[]; paperLabel: string; onOpen: (key: string) => void }) {
  const sheets = toSheets(entries);
  return (
    <div className="sheets">
      {sheets.map((slots, si) => (
        <section className="sheet" key={si} aria-label={`Folha ${si + 1} de ${sheets.length}`}>
          <header className="sheet-head">
            <ColorBar />
            <span className="sheet-label">
              Folha {si + 1}/{sheets.length} · {paperLabel}
            </span>
          </header>
          <ol className="sheet-grid">
            {slots.map((entry, i) => (
              <li key={`${entry.key}-${i}`}>
                <Slot entry={entry} onOpen={onOpen} />
              </li>
            ))}
            {Array.from({ length: 9 - slots.length }, (_, i) => (
              <li key={`vazio-${i}`} className="slot slot--blank" aria-hidden="true">
                <div className="slot-card">
                  <CropCorners />
                </div>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}

function Slot({ entry, onOpen }: { entry: Entry; onOpen: (key: string) => void }) {
  const key = renderKey(entry);
  const [state, setState] = useState<{ key: string; url?: string; error?: string }>({ key });
  const [attempt, setAttempt] = useState(0);
  const current = state.key === key ? state : { key };

  useEffect(() => {
    let alive = true;
    previewUrl(entry).then(
      (url) => alive && setState({ key, url }),
      (err: Error) => alive && setState({ key, error: err.message }),
    );
    return () => {
      alive = false;
    };
    // a chave da imagem resume tudo que muda o desenho
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, attempt]);

  const outcome = outcomeOf(entry);
  const print = selectedPrint(entry);
  const name = displayName(entry.card);
  const caption =
    entry.choice.kind === "pt"
      ? `${entry.card.pt_print?.set.toUpperCase()} ${entry.card.pt_print?.number}`
      : print
        ? `${print.set_code.toUpperCase()} ${print.number}`
        : "";

  return (
    <button
      type="button"
      className="slot"
      data-outcome={outcome}
      onClick={() => (current.error ? setAttempt((a) => a + 1) : onOpen(entry.key))}
      aria-label={current.error ? `${name}: a imagem não carregou. Tentar de novo.` : `${name}, ${caption}. Trocar arte ou quantidade.`}
    >
      <div className="slot-card">
        {current.url ? (
          <img key={current.url} className="slot-img" src={current.url} alt="" draggable={false} />
        ) : current.error ? (
          <span className="slot-msg slot-msg--error">Não carregou. Toque para tentar de novo.</span>
        ) : (
          <span className="slot-msg">{name}</span>
        )}
        <CropCorners />
        {outcome !== "reescrita" && <OutcomeTag outcome={outcome} />}
      </div>
      <span className="slot-caption">
        <span className="slot-caption-set">{caption}</span>
      </span>
    </button>
  );
}
