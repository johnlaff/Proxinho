/**
 * A "prova": as folhas exatamente na ordem em que vão sair da impressora,
 * 9 cartas por folha, com marcas de corte, marcas de registro, régua de 5 cm
 * e uma legenda técnica embaixo de cada carta. Tocar numa carta abre a
 * gaveta para trocar a arte.
 */
import { useEffect, useState, type ReactNode } from "react";
import { displayName, outcomeOf, renderKey, selectedPrint, toSheets, type Entry } from "../app/model";
import { previewUrl } from "../app/preview";
import { ColorBar, CropCorners, RegMark } from "./RegMark";
import { OutcomeTag } from "./OutcomeTag";

export function ProofSheets({ entries, slug, onOpen }: { entries: Entry[]; slug: string; onOpen: (key: string) => void }) {
  const sheets = toSheets(entries);
  return (
    <div className="sheets">
      {sheets.map((slots, si) => (
        <Sheet key={si} label={`Folha ${si + 1}/${sheets.length}`} slug={slug} ariaLabel={`Folha ${si + 1} de ${sheets.length}`}>
          <ol className="sheet-grid">
            {slots.map((entry, i) => (
              <li key={`${entry.key}-${i}`}>
                <Slot entry={entry} onOpen={onOpen} />
              </li>
            ))}
            <BlankSlots count={9 - slots.length} />
          </ol>
        </Sheet>
      ))}
    </div>
  );
}

/** Uma folha de prova: tira de cor, marcas de registro, régua e linha de rodapé. */
export function Sheet({
  label,
  slug,
  ariaLabel,
  children,
  intro,
}: {
  label: string;
  slug: string;
  ariaLabel: string;
  children: ReactNode;
  intro?: ReactNode;
}) {
  return (
    <section className="sheet" aria-label={ariaLabel}>
      <RegMark size={14} className="sheet-reg sheet-reg--top" />
      <RegMark size={14} className="sheet-reg sheet-reg--left" />
      <RegMark size={14} className="sheet-reg sheet-reg--right" />
      <RegMark size={14} className="sheet-reg sheet-reg--bottom" />
      <header className="sheet-head">
        <ColorBar />
        <span className="sheet-label">{label}</span>
      </header>
      {intro}
      {children}
      <footer className="sheet-foot">
        <span className="ruler" aria-hidden="true">
          <span className="ruler-ticks" />
          <span className="ruler-label">5 cm</span>
        </span>
        <span className="sheet-label">
          {slug.split(" · ").map((part) => (
            <span key={part} className="slug-part">
              {part}
            </span>
          ))}
        </span>
      </footer>
    </section>
  );
}

export function BlankSlots({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <li key={`vazio-${i}`} className="slot slot--blank" aria-hidden="true">
          <div className="slot-card">
            <CropCorners />
          </div>
        </li>
      ))}
    </>
  );
}

const SOURCE_CAPTION = { arena: "Arena", impresso: "imp. PT" } as const;

/** Legenda técnica: coleção e número · origem do texto · artista. */
function captionOf(entry: Entry): { set: string; source: string; artist: string } {
  const outcome = outcomeOf(entry);
  if (entry.choice.kind === "pt") {
    const pt = entry.card.pt_print;
    return { set: pt ? `${pt.set.toUpperCase()} ${pt.number}` : "", source: "imagem PT", artist: "" };
  }
  const p = selectedPrint(entry);
  const source = outcome === "reescrita" && entry.card.source ? SOURCE_CAPTION[entry.card.source] : "em inglês";
  return { set: p ? `${p.set_code.toUpperCase()} ${p.number}` : "", source, artist: p?.artist ?? "" };
}

export function Slot({ entry, onOpen, example = false }: { entry: Entry; onOpen?: (key: string) => void; example?: boolean }) {
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
  const name = displayName(entry.card);
  const cap = captionOf(entry);

  const body = (
    <>
      <div className="slot-card">
        {current.url ? (
          <img
            key={current.url}
            className="slot-img"
            src={current.url}
            alt={example ? `Exemplo: ${name} em português` : ""}
            draggable={false}
          />
        ) : current.error ? (
          <span className="slot-msg slot-msg--error">
            {example ? "Exemplo indisponível agora." : "Não carregou. Toque para tentar de novo."}
          </span>
        ) : (
          <span className="slot-msg">{name}</span>
        )}
        <CropCorners />
        {outcome !== "reescrita" && <OutcomeTag outcome={outcome} />}
        {example && <span className="tag tag--exemplo">Exemplo</span>}
      </div>
      <span className="slot-caption">
        <span className="slot-caption-set">{cap.set}</span>
        <span className="slot-caption-src">{cap.source}</span>
        {cap.artist && <span className="slot-caption-artist">{cap.artist}</span>}
      </span>
    </>
  );

  if (example) return <div className="slot slot--example">{body}</div>;

  return (
    <button
      type="button"
      className="slot"
      data-outcome={outcome}
      onClick={() => (current.error ? setAttempt((a) => a + 1) : onOpen?.(entry.key))}
      aria-label={
        current.error
          ? `${name}: a imagem não carregou. Tentar de novo.`
          : `${name}, ${cap.set}, texto: ${cap.source}. Trocar arte ou quantidade.`
      }
    >
      {body}
    </button>
  );
}
