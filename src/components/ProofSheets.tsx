/**
 * A "prova": as folhas exatamente na ordem em que vão sair da impressora,
 * 9 cartas por folha, com marcas de corte, marcas de registro, régua de 5 cm
 * e uma legenda técnica embaixo de cada carta. Tocar numa carta abre a
 * gaveta para trocar a arte.
 */
import { useState, useSyncExternalStore, type ReactNode } from "react";
import { displayName, outcomeOf, selectedPrint, sideCount, toSheets, type Entry, type Side } from "../app/model";
import { engineMisses, onEngineMiss, waitsForNeuralFill } from "../app/preview";
import { NeuralStage } from "./NeuralStage";
import { usePreview } from "./usePreview";
import { ColorBar, CropCorners, RegMark } from "./RegMark";
import { OutcomeTag } from "./OutcomeTag";

/**
 * `filtered`: as folhas mostram só as cartas de um resultado da legenda (o PDF continua com
 * todas), e a folha diz "Filtro" para não passar pela folha de verdade com esse número.
 */
export function ProofSheets({
  entries,
  slug,
  onOpen,
  filtered = false,
}: {
  entries: Entry[];
  slug: string;
  onOpen: (key: string) => void;
  filtered?: boolean;
}) {
  const sheets = toSheets(entries);
  const name = filtered ? "Filtro" : "Folha";
  return (
    <div className="sheets">
      {sheets.map((slots, si) => (
        <Sheet
          key={si}
          label={`${name} ${si + 1}/${sheets.length}`}
          slug={slug}
          ariaLabel={`${filtered ? "Cartas filtradas, folha" : "Folha"} ${si + 1} de ${sheets.length}`}
        >
          <ol className="sheet-grid">
            {slots.map(({ entry, side }, i) => (
              <li key={`${entry.key}-${side}-${i}`}>
                <Slot entry={entry} side={side} onOpen={onOpen} />
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
          {/* a linha da legenda, vazia: sem ela, a folha de exemplo crescia quando as cartas chegavam (CLS) */}
          <span className="slot-caption" />
        </li>
      ))}
    </>
  );
}

const SOURCE_CAPTION = { arena: "Arena", impresso: "imp. PT", "nao-oficial": "não oficial" } as const;

/** Legenda técnica: coleção e número · origem do texto · artista. */
function captionOf(entry: Entry, misses: ReadonlySet<string>): { set: string; source: string; artist: string } {
  const outcome = outcomeOf(entry, misses);
  if (entry.choice.kind === "pt") {
    const pt = entry.card.pt_print;
    return { set: pt ? `${pt.set.toUpperCase()} ${pt.number}` : "", source: "imagem PT", artist: "" };
  }
  const p = selectedPrint(entry);
  const rewritten = outcome === "reescrita" || outcome === "nao-oficial";
  const source = rewritten && entry.card.source ? SOURCE_CAPTION[entry.card.source] : "em inglês";
  return { set: p ? `${p.set_code.toUpperCase()} ${p.number}` : "", source, artist: p?.artist ?? "" };
}

export function Slot({
  entry,
  side = 0,
  onOpen,
  example = false,
}: {
  entry: Entry;
  side?: Side;
  onOpen?: (key: string) => void;
  example?: boolean;
}) {
  const [attempt, setAttempt] = useState(0);
  const current = usePreview(entry, side, attempt);

  const misses = useSyncExternalStore(onEngineMiss, engineMisses);
  const outcome = outcomeOf(entry, misses);
  const twoSided = sideCount(entry) === 2;
  const faceName = entry.card.faces[side]?.name_pt ?? entry.card.faces[side]?.name_en;
  const name = twoSided ? (faceName ?? displayName(entry.card)) : displayName(entry.card);
  const sideLabel = twoSided ? (side === 0 ? "frente" : "verso") : "";
  const cap = captionOf(entry, misses);

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
        ) : current.draft ? (
          <>
            {/* rascunho: o português já no lugar, enquanto a rede neural refaz a arte atrás dele */}
            <img key={current.draft} className="slot-img slot-img--draft" src={current.draft} alt="" draggable={false} />
            {!example && <NeuralStage previewKey={current.key} />}
          </>
        ) : current.error ? (
          <span className="slot-msg slot-msg--error">
            {example ? "Exemplo indisponível agora." : "Não carregou. Toque para tentar de novo."}
          </span>
        ) : (
          <span className="slot-msg">
            <span>{name}</span>
            {!example && waitsForNeuralFill(entry, side) && <NeuralStage previewKey={current.key} />}
          </span>
        )}
        <CropCorners />
        {outcome !== "reescrita" && side === 0 && <OutcomeTag outcome={outcome} />}
        {example && <span className="tag tag--exemplo">Exemplo</span>}
      </div>
      <span className="slot-caption">
        <span className="slot-caption-set">{cap.set}</span>
        <span className="slot-caption-src">{cap.source}</span>
        {sideLabel && <span className="slot-caption-side">{sideLabel}</span>}
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
          : `${name}${sideLabel ? ` (${sideLabel})` : ""}, ${cap.set}, texto: ${cap.source}.${current.draft && !current.url ? " Prévia rápida, acabamento em andamento." : ""} Trocar arte ou quantidade.`
      }
    >
      {body}
    </button>
  );
}
