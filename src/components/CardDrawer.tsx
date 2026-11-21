/**
 * Gaveta de uma carta: escolher a arte, mudar a quantidade, ver no tamanho
 * real e entender de onde veio o texto em português.
 */
import { FlipHorizontal2, Minus, Plus, Ruler, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { displayName, frontFace, hasPtText, missKey, outcomeOf, sideCount, yearOf, type Choice, type Entry, type Side } from "../app/model";
import { engineMisses, hurry, onEngineMiss, waitsForNeuralFill } from "../app/preview";
import { NeuralStage } from "./NeuralStage";
import { usePreview } from "./usePreview";
import { lamaStatus, onLamaStatus } from "../engine/lama";
import { printImage, scryfallImage, type PrintRecord } from "../engine/types";
import { OUTCOME_LABEL } from "../app/labels";
import { OutcomeTag } from "./OutcomeTag";

interface Props {
  entry: Entry | null;
  onClose: () => void;
  onChoice: (key: string, choice: Choice) => void;
  onQuantity: (key: string, quantity: number) => void;
  onRemove: (key: string) => void;
}

function sourceNote(entry: Entry): string {
  const c = entry.card;
  if (!hasPtText(c))
    return "Esta carta ainda não tem tradução oficial em português, então sai em inglês. Quando a tradução existir, ela aparece aqui sozinha.";
  if (c.source === "arena") return "Texto oficial em português do MTG Arena, com a terminologia mais atual.";
  if (c.source === "nao-oficial") {
    const name =
      c.name_pt === c.name_en
        ? "O nome fica em inglês, porque a carta nunca saiu em português."
        : "O nome é o da impressão oficial em português.";
    return `Esta carta não tem texto oficial em português. A tradução é não oficial: as frases que já existem em cartas oficiais vêm iguais, e as outras foram traduzidas no padrão do Arena. ${name}`;
  }
  const tp = c.text_print;
  return tp
    ? `Texto oficial da impressão em português (${tp.set.toUpperCase()} ${tp.number}).`
    : "Texto oficial de uma impressão em português.";
}

export function CardDrawer({ entry, onClose, onChoice, onQuantity, onRemove }: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (entry && !d.open) d.showModal();
    if (!entry && d.open) d.close();
  }, [entry]);

  return (
    <dialog
      ref={ref}
      className="drawer"
      aria-labelledby="drawer-title"
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
    >
      {entry && (
        <DrawerBody key={entry.key} entry={entry} onClose={onClose} onChoice={onChoice} onQuantity={onQuantity} onRemove={onRemove} />
      )}
    </dialog>
  );
}

function DrawerBody({ entry, onClose, onChoice, onQuantity, onRemove }: Omit<Props, "entry"> & { entry: Entry }) {
  const [trueSize, onTrueSize] = useState(false);
  const [sideWanted, setSide] = useState<Side>(0);
  const twoSided = sideCount(entry) === 2;
  const side: Side = twoSided ? sideWanted : 0;
  const face = side === 1 ? (entry.card.faces[1] ?? frontFace(entry.card)) : frontFace(entry.card);
  const preview = usePreview(entry, side);
  const url = preview.url ?? null;
  // a carta aberta passa na frente da fila da rede neural
  useEffect(() => {
    hurry(entry, side);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview.key]);
  const misses = useSyncExternalStore(onEngineMiss, engineMisses);
  const outcome = outcomeOf(entry, misses);
  // a rede neural não rodou em nenhum modo: as artes sem borda saem na original
  const neural = useSyncExternalStore(onLamaStatus, lamaStatus);
  const neuralFailed = neural.stage === "failed";
  // arte que o motor já tentou e não reconheceu (Garruk espelhado da Secret Lair) sai em inglês;
  // sem a rede neural, a sem borda também
  const rewritable = (p: PrintRecord) => p.supported && !misses.has(missKey(p.id, 0)) && !(neuralFailed && p.border === "borderless");
  const name = displayName(entry.card);
  const translatable = hasPtText(entry.card);
  const unofficial = entry.card.source === "nao-oficial";

  const pt = entry.card.pt_print;
  const selectedId = entry.choice.kind === "print" ? entry.choice.printId : "pt";

  return (
    <div className="drawer-inner">
      <header className="drawer-head">
        <div>
          <h2 id="drawer-title" className="drawer-title">
            {name}
          </h2>
          {entry.card.name_pt && entry.card.name_pt !== entry.card.name_en && <p className="drawer-en">{entry.card.name_en}</p>}
        </div>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Fechar">
          <X size={22} aria-hidden="true" />
        </button>
      </header>

      <div className="drawer-scroll">
        <div className="drawer-preview">
          <div className={trueSize ? "preview-card preview-card--real" : "preview-card"}>
            {url ? (
              <img key={url} src={url} alt={`Prévia de ${name}${twoSided ? (side === 0 ? ", frente" : ", verso") : ""}`} />
            ) : preview.draft ? (
              <img
                key={preview.draft}
                className="preview-draft"
                src={preview.draft}
                alt={`Prévia rápida de ${name}${twoSided ? (side === 0 ? ", frente" : ", verso") : ""}, acabamento em andamento`}
              />
            ) : (
              <span className="slot-msg">
                <span>Montando a prévia…</span>
              </span>
            )}
          </div>
          <div className="drawer-facts">
            {!url && waitsForNeuralFill(entry, side) ? (
              <div className="drawer-finishing" role="status">
                <NeuralStage previewKey={preview.key} long />
                {preview.draft && (
                  <p className="drawer-note">Já dá para ver o português. O acabamento refaz a arte atrás do texto, e o PDF sai com ele.</p>
                )}
              </div>
            ) : (
              <OutcomeTag outcome={outcome} long />
            )}
            <p className="drawer-note">{sourceNote(entry)}</p>
            {outcome === "moldura" && (
              <p className="drawer-note">
                Escolha uma arte marcada “{unofficial ? "Tradução não oficial" : "Sai em português"}” para reescrever o texto, ou a imagem
                oficial em português, se houver.
              </p>
            )}
            {outcome === "apagador" && (
              <>
                <p className="drawer-note">
                  O apagador de texto não rodou neste navegador, então esta arte saiu na original. Escolha uma arte de moldura comum,
                  marcada “Sai em português”, ou tente em outro navegador.
                </p>
                {neural.reason && (
                  <details className="drawer-details">
                    <summary>Detalhe técnico</summary>
                    <code>{neural.reason}</code>
                  </details>
                )}
              </>
            )}
            {face?.type_pt && translatable && <p className="drawer-type">{face.type_pt}</p>}
            {twoSided && (
              <>
                <p className="drawer-note">Carta de duas faces: a frente e o verso saem lado a lado na folha.</p>
                <button
                  type="button"
                  className="btn btn--quiet btn--small"
                  aria-pressed={side === 1}
                  onClick={() => setSide(side === 0 ? 1 : 0)}
                >
                  <FlipHorizontal2 size={16} aria-hidden="true" />
                  {side === 0 ? "Ver o verso" : "Ver a frente"}
                </button>
              </>
            )}
            <button type="button" className="btn btn--quiet btn--small" aria-pressed={trueSize} onClick={() => onTrueSize(!trueSize)}>
              <Ruler size={16} aria-hidden="true" />
              {trueSize ? (
                <span>Voltar ao tamanho da prévia</span>
              ) : (
                <span>
                  Ver no tamanho real <span className="nowrap">(63 × 88 mm)</span>
                </span>
              )}
            </button>
            {trueSize && <p className="hint">O tamanho na tela depende do seu monitor; no PDF ele é exato.</p>}
          </div>
        </div>

        <div className="qty-row">
          <span className="field-label" id="qty-label">
            Cópias
          </span>
          <div className="stepper" role="group" aria-labelledby="qty-label">
            <button
              type="button"
              className="icon-btn"
              onClick={() => onQuantity(entry.key, entry.quantity - 1)}
              disabled={entry.quantity <= 1}
              aria-label="Uma cópia a menos"
            >
              <Minus size={18} aria-hidden="true" />
            </button>
            <output className="stepper-value" aria-live="polite">
              {entry.quantity}
            </output>
            <button
              type="button"
              className="icon-btn"
              onClick={() => onQuantity(entry.key, entry.quantity + 1)}
              disabled={entry.quantity >= 99}
              aria-label="Uma cópia a mais"
            >
              <Plus size={18} aria-hidden="true" />
            </button>
          </div>
          <button
            type="button"
            className="btn btn--danger btn--small"
            onClick={() => {
              onRemove(entry.key);
              onClose();
            }}
          >
            <Trash2 size={16} aria-hidden="true" />
            Tirar do pedido
          </button>
        </div>

        <fieldset className="arts">
          <legend className="arts-title">
            Escolha a arte <span className="arts-count">{entry.prints.length + (pt ? 1 : 0)} opções</span>
          </legend>
          <div className="arts-grid">
            {pt && (
              <ArtOption
                name={entry.key}
                checked={selectedId === "pt"}
                onSelect={() => onChoice(entry.key, { kind: "pt" })}
                thumb={scryfallImage(pt.id, "small")}
                title="Impressão oficial em português"
                meta={`${pt.set.toUpperCase()} ${pt.number}${pt.hires ? "" : " · baixa resolução"}`}
                tag="Já em português"
                tagKind="imagem-pt"
              />
            )}
            {entry.prints.map((p) => (
              <ArtOption
                key={p.id}
                name={entry.key}
                checked={selectedId === p.id}
                onSelect={() => onChoice(entry.key, { kind: "print", printId: p.id })}
                thumb={printImage(p, "small")}
                title={p.set_name}
                meta={[`${p.set_code.toUpperCase()} ${p.number}`, yearOf(p), p.artist].filter(Boolean).join(" · ")}
                tag={translatable && rewritable(p) ? (unofficial ? "Tradução não oficial" : "Sai em português") : "Sai em inglês"}
                tagKind={translatable ? (rewritable(p) ? (unofficial ? "nao-oficial" : "reescrita") : "moldura") : "sem-traducao"}
              />
            ))}
          </div>
        </fieldset>
      </div>
      <p className="sr-only" aria-live="polite">
        {OUTCOME_LABEL[outcome]}
      </p>
    </div>
  );
}

function ArtOption(props: {
  name: string;
  checked: boolean;
  onSelect: () => void;
  thumb: string;
  title: string;
  meta: string;
  tag: string;
  tagKind: string;
}) {
  return (
    <label className="art" data-checked={props.checked}>
      <input type="radio" name={`arte-${props.name}`} checked={props.checked} onChange={props.onSelect} className="art-radio" />
      <img className="art-thumb" src={props.thumb} alt="" loading="lazy" decoding="async" width={146} height={204} />
      <span className="art-text">
        <span className="art-title">{props.title}</span>
        <span className="art-meta">{props.meta}</span>
        <span className={`tag tag--${props.tagKind}`}>{props.tag}</span>
      </span>
    </label>
  );
}
