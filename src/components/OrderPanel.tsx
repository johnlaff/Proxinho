/**
 * "Ordem de serviço": as três formas de pedir cartas (colar a lista, colar o
 * link do deck ou buscar uma carta pelo nome).
 */
import { ClipboardList, Link2, Search } from "lucide-react";
import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { searchCards, type SearchHit } from "../app/api";

export type Tab = "colar" | "link" | "buscar";

export const EXAMPLE_LIST = `Comandante
1 Kona, Rescue Beastie

Deck
1 Sol Ring
1 Arcane Signet
1 Llanowar Elves
1 Cultivate
1 Swords to Plowshares
1 Counterspell
1 Lightning Bolt
1 Command Tower`;

interface Props {
  text: string;
  onText: (value: string) => void;
  busy: boolean;
  onBuild: () => void;
  onImport: (url: string) => void;
  onAdd: (name: string) => void;
  tab: Tab;
  onTab: (tab: Tab) => void;
}

const TABS: { id: Tab; label: string; icon: typeof ClipboardList }[] = [
  { id: "colar", label: "Colar lista", icon: ClipboardList },
  { id: "link", label: "Link do deck", icon: Link2 },
  { id: "buscar", label: "Buscar carta", icon: Search },
];

export function OrderPanel({ text, onText, busy, onBuild, onImport, onAdd, tab, onTab }: Props) {
  const base = useId();
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  function onTabKey(e: KeyboardEvent<HTMLButtonElement>, i: number) {
    const dir = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const next = (i + dir + TABS.length) % TABS.length;
    onTab(TABS[next].id);
    tabRefs.current[next]?.focus();
  }

  return (
    <div className="order-form">
      <div className="tabs" role="tablist" aria-label="Como você quer pedir as cartas">
        {TABS.map((t, i) => (
          <button
            key={t.id}
            ref={(el) => {
              tabRefs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`${base}-tab-${t.id}`}
            aria-controls={`${base}-panel-${t.id}`}
            aria-selected={tab === t.id}
            tabIndex={tab === t.id ? 0 : -1}
            className="tab"
            onClick={() => onTab(t.id)}
            onKeyDown={(e) => onTabKey(e, i)}
          >
            <t.icon size={17} strokeWidth={2} aria-hidden="true" />
            {t.label}
          </button>
        ))}
      </div>

      {tab === "colar" && (
        <PastePanel id={`${base}-panel-colar`} labelledBy={`${base}-tab-colar`} text={text} onText={onText} busy={busy} onBuild={onBuild} />
      )}
      {tab === "link" && <LinkPanel id={`${base}-panel-link`} labelledBy={`${base}-tab-link`} busy={busy} onImport={onImport} />}
      {tab === "buscar" && <SearchPanel id={`${base}-panel-buscar`} labelledBy={`${base}-tab-buscar`} onAdd={onAdd} />}
    </div>
  );
}

function PastePanel({
  id,
  labelledBy,
  text,
  onText,
  busy,
  onBuild,
}: {
  id: string;
  labelledBy: string;
  text: string;
  onText: (v: string) => void;
  busy: boolean;
  onBuild: () => void;
}) {
  const help = useId();
  function submit(e: FormEvent) {
    e.preventDefault();
    onBuild();
  }
  return (
    <form id={id} role="tabpanel" aria-labelledby={labelledBy} className="panel" onSubmit={submit}>
      <label className="field-label" htmlFor={`${id}-text`}>
        Lista do deck
      </label>
      <textarea
        id={`${id}-text`}
        className="decklist"
        value={text}
        onChange={(e) => onText(e.target.value)}
        aria-describedby={help}
        spellCheck={false}
        autoComplete="off"
        placeholder={"1 Sol Ring\n1 Anel Solar\n1x Llanowar Elves (M19) 314\n…"}
        rows={11}
      />
      <p id={help} className="hint">
        Vale lista do Archidekt, Moxfield, Liga Magic, MTGO ou Arena, com nomes em inglês ou português.
      </p>
      <div className="actions">
        <button type="submit" className="btn btn--primary" disabled={busy || !text.trim()}>
          {busy ? "Montando…" : "Montar folhas"}
        </button>
        {!text.trim() && (
          <button type="button" className="btn btn--quiet" onClick={() => onText(EXAMPLE_LIST)}>
            Usar uma lista de exemplo
          </button>
        )}
      </div>
    </form>
  );
}

function LinkPanel({ id, labelledBy, busy, onImport }: { id: string; labelledBy: string; busy: boolean; onImport: (url: string) => void }) {
  const [url, setUrl] = useState("");
  const help = useId();
  return (
    <form
      id={id}
      role="tabpanel"
      aria-labelledby={labelledBy}
      className="panel"
      onSubmit={(e) => {
        e.preventDefault();
        if (url.trim()) onImport(url.trim());
      }}
    >
      <label className="field-label" htmlFor={`${id}-url`}>
        Link do deck no Archidekt ou no Moxfield
      </label>
      <input
        id={`${id}-url`}
        className="input"
        type="url"
        inputMode="url"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://archidekt.com/decks/…"
        aria-describedby={help}
        autoComplete="off"
      />
      <p id={help} className="hint">
        O deck precisa estar público. Se o Moxfield recusar, use Exportar → Copiar texto lá e cole na aba “Colar lista”.
      </p>
      <div className="actions">
        <button type="submit" className="btn btn--primary" disabled={busy || !url.trim()}>
          {busy ? "Importando…" : "Importar deck"}
        </button>
      </div>
    </form>
  );
}

function SearchPanel({ id, labelledBy, onAdd }: { id: string; labelledBy: string; onAdd: (name: string) => void }) {
  const [q, setQ] = useState("");
  const [rawHits, setHits] = useState<SearchHit[]>([]);
  const [active, setActive] = useState(-1);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<string | null>(null);
  const listId = `${id}-list`;
  // com menos de 2 letras não há busca: a lista some sem precisar de estado extra
  const hits = q.trim().length >= 2 ? rawHits : [];

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      searchCards(term, ctrl.signal)
        .then((r) => {
          setHits(r);
          setActive(r.length ? 0 : -1);
          setError(null);
        })
        .catch((err: Error) => {
          if (err.name !== "AbortError") setError(err.message);
        });
    }, 180);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  function pick(hit: SearchHit) {
    onAdd(hit.name_en);
    setAdded(hit.name_pt ?? hit.name_en);
    setQ("");
    setHits([]);
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (!hits.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (a + 1) % hits.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (a - 1 + hits.length) % hits.length);
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault();
      pick(hits[active]);
    } else if (e.key === "Escape") {
      setHits([]);
    }
  }

  return (
    <div id={id} role="tabpanel" aria-labelledby={labelledBy} className="panel">
      <label className="field-label" htmlFor={`${id}-q`}>
        Nome da carta, em português ou inglês
      </label>
      <div className="combo">
        <input
          id={`${id}-q`}
          className="input"
          type="search"
          role="combobox"
          aria-expanded={hits.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 && hits[active] ? `${listId}-${active}` : undefined}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setAdded(null);
          }}
          onKeyDown={onKey}
          placeholder="Ex.: Anel Solar, Cultivar, Sol Ring"
          autoComplete="off"
          spellCheck={false}
        />
        {hits.length > 0 && (
          <ul id={listId} role="listbox" className="combo-list" aria-label="Cartas encontradas">
            {hits.map((h, i) => (
              <li
                key={h.oracle_id}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                className="combo-option"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(h)}
                onMouseEnter={() => setActive(i)}
              >
                <span className="combo-name">{h.name_pt ?? h.name_en}</span>
                {h.name_pt && h.name_pt !== h.name_en && <span className="combo-en">{h.name_en}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="hint" role="status">
        {error ?? (added ? `“${added}” entrou no pedido.` : "Escolha na lista para adicionar uma cópia ao pedido.")}
      </p>
    </div>
  );
}
