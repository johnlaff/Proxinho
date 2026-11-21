/**
 * Proxinho: cole a lista, revise as folhas, baixe o PDF.
 *
 * Este componente guarda o estado do pedido e liga as partes:
 * ordem de serviço (esquerda) → prova das folhas (direita) → PDF.
 */
import { Download, ExternalLink } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { cardsById, importFromUrl, resolveNames, type Resolved, type SearchHit } from "./app/api";
import type { ExportProgress } from "./app/exportPdf";
import { warmPrints, type Quality } from "./app/printFaces";
import {
  buildOrder,
  countOutcomes,
  entriesFrom,
  mergeEntries,
  orderedCards,
  tokenSuggestions,
  totalCards,
  type Choice,
  type Entry,
  type Missing,
  type OrderLine,
  type Outcome,
} from "./app/model";
import { engineMisses, onEngineMiss } from "./app/preview";
import { loadStoredFonts, toFiles, type StoredFonts } from "./app/userFonts";
import { CardDrawer } from "./components/CardDrawer";
import { FontPicker } from "./components/FontPicker";
import { applyCustomFonts } from "./engine/fonts";
import { OrderPanel, type Tab } from "./components/OrderPanel";
import { OUTCOME_LABEL } from "./app/labels";
import { BlankSlots, ProofSheets, Sheet, Slot } from "./components/ProofSheets";
import { RegMark } from "./components/RegMark";
import { TokenSuggestions } from "./components/TokenSuggestions";
import { mergeLines, parseDecklist } from "./lib/decklist";
import type { Paper, PrintMode } from "./lib/pdf";

const REPO = "https://github.com/johnlaff/proxinho";
const DRAFT_KEY = "proxinho:rascunho";
const SETTINGS_KEY = "proxinho:acabamento";

interface Settings {
  paper: Paper;
  mode: PrintMode;
  shrink: boolean;
  quality: Quality;
}
const DEFAULT_SETTINGS: Settings = { paper: "a4", mode: "sleeve", shrink: false, quality: "padrao" };

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}
function loadText(key: string): string {
  try {
    return localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}
function save(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* modo anônimo ou armazenamento cheio: segue sem lembrar */
  }
}

const PAPER_LABEL: Record<Paper, string> = { a4: "A4", letter: "Carta" };
const MODE_LABEL: Record<PrintMode, string> = { sleeve: "na frente da carta", full: "carta inteira" };
const sheetsFor = (n: number) => Math.ceil(n / 9);
const plural = (n: number, one: string, many: string) => `${n.toLocaleString("pt-BR")} ${n === 1 ? one : many}`;
/** "100 cartas", ou "100 cartas (101 faces)" quando há carta de duas faces: o deck tem 100, o papel leva 101. */
const countLabel = (cards: number, faces: number) =>
  cards === faces ? plural(cards, "carta", "cartas") : `${plural(cards, "carta", "cartas")} (${plural(faces, "face", "faces")})`;

export default function App() {
  const [text, setText] = useState(() => loadText(DRAFT_KEY));
  const [tab, setTab] = useState<Tab>("colar");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [missing, setMissing] = useState<Missing[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [settings, setSettings] = useState<Settings>(() => load(SETTINGS_KEY, DEFAULT_SETTINGS));
  // fontes das cartas escolhidas pela pessoa (ficam só no navegador)
  const [fonts, setFonts] = useState<StoredFonts | null>(null);
  useEffect(() => {
    void loadStoredFonts().then(async (saved) => {
      if (!saved) return;
      try {
        await applyCustomFonts(toFiles(saved));
        setFonts(saved);
      } catch {
        /* arquivo salvo corrompido: segue com as fontes padrão */
      }
    });
  }, []);
  const [progress, setProgress] = useState<ExportProgress | null>(null);

  useEffect(() => save(DRAFT_KEY, text), [text]);
  useEffect(() => save(SETTINGS_KEY, JSON.stringify(settings)), [settings]);

  // PDF adiantado: enquanto a pessoa revisa, as cartas já vão sendo montadas para a impressão
  // (só depois das prévias; ver printFaces.ts). O respiro deixa a folha começar antes.
  useEffect(() => {
    const t = setTimeout(() => warmPrints(entries, settings.quality), entries.length ? 1500 : 0);
    return () => clearTimeout(t);
  }, [entries, settings.quality, fonts]);

  const total = totalCards(entries);
  const cardsLabel = countLabel(orderedCards(entries), total);
  const misses = useSyncExternalStore(onEngineMiss, engineMisses);
  const counts = useMemo(() => countOutcomes(entries, misses), [entries, misses]);
  const openEntry = entries.find((e) => e.key === openKey) ?? null;
  const slug = [
    PAPER_LABEL[settings.paper],
    MODE_LABEL[settings.mode],
    settings.quality === "alta" ? "480 dpi" : "300 dpi",
    "imprimir em 100%",
  ].join(" · ");

  /** Resolve linhas na API e junta (ou substitui) o pedido. */
  const resolveLines = useCallback(async (lines: OrderLine[], mode: "replace" | "append") => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      // linhas da seção de fichas preferem a ficha quando há carta com o mesmo nome
      const names = [
        ...new Map(
          lines.map((l) => [`${l.section === "tokens"}:${l.name.trim()}`, { name: l.name.trim(), token: l.section === "tokens" }]),
        ).values(),
      ];
      const resolved = await resolveNames(names);
      const order = buildOrder(lines, resolved);
      if (mode === "replace") {
        setEntries(order.entries);
        setMissing(order.missing);
        if (!order.entries.length) setError("Não reconhecemos nenhuma carta nessa lista. Confira se há um nome por linha.");
      } else {
        setEntries((prev) => mergeEntries(prev, order.entries));
        setMissing((prev) => [...prev, ...order.missing]);
      }
      return order;
    } catch (err) {
      setError((err as Error).message);
      return null;
    } finally {
      setBusy(false);
    }
  }, []);

  function buildFromText() {
    const lines = mergeLines(parseDecklist(text));
    if (!lines.length) {
      setError("Não achamos nenhuma carta. Cole uma carta por linha, por exemplo “1 Sol Ring”.");
      return;
    }
    if (lines.length > 600) {
      setError("A lista passou de 600 linhas. Divida em partes menores.");
      return;
    }
    void resolveLines(lines, "replace");
  }

  async function importDeck(url: string) {
    setBusy(true);
    setError(null);
    try {
      const deck = await importFromUrl(url);
      const listText = deck.cards
        .map((c) => `${c.quantity} ${c.name}${c.set ? ` (${c.set.toUpperCase()})${c.number ? ` ${c.number}` : ""}` : ""}`)
        .join("\n");
      setText(listText);
      const order = await resolveLines(deck.cards, "replace");
      if (order) setNotice(`Deck “${deck.name}” importado do ${deck.source}. A lista também ficou na aba “Colar lista”.`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  /** Da busca: pelo oracle_id, para a ficha "Tesouro" não virar uma carta de mesmo nome. */
  async function addCard(hit: SearchHit) {
    setBusy(true);
    setError(null);
    try {
      const found = await cardsById([hit.oracle_id]);
      setEntries((prev) => mergeEntries(prev, entriesFrom(found)));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // fichas que as cartas do pedido criam (buscadas uma vez por ficha)
  const [tokenCache, setTokenCache] = useState<Map<string, Resolved>>(() => new Map());
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(() => new Set());
  const suggestedIds = useMemo(() => tokenSuggestions(entries, dismissed), [entries, dismissed]);
  useEffect(() => {
    const want = suggestedIds.filter((id) => !tokenCache.has(id));
    if (!want.length) return;
    const ctrl = new AbortController();
    cardsById(want, ctrl.signal)
      .then((found) =>
        setTokenCache((prev) => {
          const next = new Map(prev);
          for (const r of found) if (r.card) next.set(r.card.oracle_id, r);
          // o que a API não devolveu não volta a ser pedido
          for (const id of want) if (!next.has(id)) next.set(id, { query: id, card: null, prints: [] });
          return next;
        }),
      )
      .catch(() => {
        /* sem as sugestões o pedido segue normal */
      });
    return () => ctrl.abort();
  }, [suggestedIds, tokenCache]);
  const suggestions = suggestedIds.map((id) => tokenCache.get(id)).filter((r): r is Resolved => Boolean(r?.card && r.prints.length));
  const addTokens = (items: Resolved[]) => setEntries((prev) => mergeEntries(prev, entriesFrom(items, "tokens")));

  const setChoice = (key: string, choice: Choice) => setEntries((prev) => prev.map((e) => (e.key === key ? { ...e, choice } : e)));
  const setQuantity = (key: string, quantity: number) =>
    setEntries((prev) => prev.map((e) => (e.key === key ? { ...e, quantity: Math.max(1, Math.min(99, quantity)) } : e)));
  const remove = (key: string) => setEntries((prev) => prev.filter((e) => e.key !== key));

  async function download() {
    setError(null);
    setProgress({ phase: "cartas", done: 0, total: entries.length });
    try {
      // o gerador de PDF (pdf-lib) só é baixado quando a pessoa pede o arquivo
      const { exportPdf, pdfFileName } = await import("./app/exportPdf");
      const blob = await exportPdf(entries, settings, setProgress);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = pdfFileName();
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
      setNotice(`PDF pronto: ${cardsLabel} em ${plural(sheetsFor(total), "folha", "folhas")}. Imprima em “Tamanho real” (100%).`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setProgress(null);
    }
  }

  const progressLabel = progress
    ? progress.phase === "cartas"
      ? `Montando cartas em alta resolução: ${progress.done} de ${progress.total}${
          progress.neural ? `. Acabamento de ${progress.neural.name}: parte ${progress.neural.done + 1} de ${progress.neural.total}` : ""
        }`
      : `Paginando o PDF: folha ${progress.done} de ${progress.total}`
    : "";

  return (
    <>
      <a className="skip" href="#pedido">
        Pular para o pedido
      </a>
      <header className="masthead">
        <a className="brand" href="/" aria-label="Proxinho, página inicial">
          <RegMark size={26} className="brand-mark" />
          <span className="brand-name">Proxinho</span>
        </a>
        <nav className="masthead-nav" aria-label="Links">
          <a href="#como-funciona">Como funciona</a>
          <a href={REPO} target="_blank" rel="noreferrer">
            Código aberto
            <ExternalLink size={14} aria-hidden="true" />
          </a>
        </nav>
      </header>

      <main className="workbench">
        <section className="order" id="pedido" aria-labelledby="titulo">
          <h1 id="titulo" className="title">
            Proxies com o texto oficial em português
          </h1>
          <p className="lead">
            Cole a lista do deck, escolha a arte de cada carta e baixe o PDF no tamanho exato para pôr na frente da carta, dentro do sleeve.
          </p>

          <OrderPanel
            text={text}
            onText={setText}
            busy={busy}
            onBuild={buildFromText}
            onImport={importDeck}
            onAdd={addCard}
            tab={tab}
            onTab={setTab}
          />

          <div className="messages" aria-live="polite">
            {error && (
              <p className="msg msg--error" role="alert">
                {error}
              </p>
            )}
            {notice && <p className="msg msg--ok">{notice}</p>}
          </div>

          {missing.length > 0 && (
            <details className="missing" open={missing.length <= 5}>
              <summary>{plural(missing.length, "nome não encontrado", "nomes não encontrados")}</summary>
              <ul>
                {missing.map((m) => (
                  <li key={m.key}>
                    <span>
                      {m.quantity} {m.query}
                    </span>
                    <button type="button" className="link-btn" onClick={() => setMissing((prev) => prev.filter((x) => x.key !== m.key))}>
                      Ignorar
                    </button>
                  </li>
                ))}
              </ul>
              <p className="hint">
                Confira a grafia ou procure pela aba “Buscar carta”. Fichas entram pela busca ou pela seção “Tokens” da lista.
              </p>
            </details>
          )}
        </section>

        {total > 0 && (
          <section className="closing" aria-label="Resumo e acabamento">
            <section className="tally" aria-labelledby="tally-title">
              <h2 id="tally-title" className="section-title">
                Seu pedido: {cardsLabel}, {plural(sheetsFor(total), "folha", "folhas")}
              </h2>
              <ul className="legend">
                {(Object.keys(counts) as Outcome[])
                  .filter((k) => counts[k] > 0)
                  .map((k) => (
                    <li key={k} className="legend-row">
                      <span className={`swatch swatch--${k}`} aria-hidden="true" />
                      <span className="legend-label">{OUTCOME_LABEL[k]}</span>
                      <span className="legend-num">{counts[k]}</span>
                    </li>
                  ))}
              </ul>
              <p className="hint">Toque ou clique numa carta da folha para trocar a arte ou a quantidade.</p>
              <TokenSuggestions
                tokens={suggestions}
                onAdd={addTokens}
                onDismiss={() => setDismissed((prev) => new Set([...prev, ...suggestedIds]))}
              />
            </section>

            <fieldset className="finish">
              <legend className="section-title">Acabamento</legend>
              <Segmented
                label="Papel"
                value={settings.paper}
                options={[
                  ["a4", "A4"],
                  ["letter", "Carta (EUA)"],
                ]}
                onChange={(paper) => setSettings((s) => ({ ...s, paper }))}
              />
              <Segmented
                label="Uso"
                value={settings.mode}
                options={[
                  ["sleeve", "Na frente da carta"],
                  ["full", "Carta inteira"],
                ]}
                onChange={(mode) => setSettings((s) => ({ ...s, mode }))}
                hint={
                  settings.mode === "sleeve"
                    ? "Sem sangria: corte na marca e ponha na frente da carta original, dentro do sleeve."
                    : "Com sangria de 1 a 2 mm para cortar sem filete branco. Use para colar sobre um papel mais grosso."
                }
              />
              {settings.mode === "sleeve" && (
                <label className="check">
                  <input
                    type="checkbox"
                    checked={settings.shrink}
                    onChange={(e) => setSettings((s) => ({ ...s, shrink: e.target.checked }))}
                  />
                  <span>Reduzir 0,5 mm para entrar fácil no sleeve</span>
                </label>
              )}
              <Segmented
                label="Qualidade"
                value={settings.quality}
                options={[
                  ["padrao", "Padrão (300 dpi)"],
                  ["alta", "Alta (480 dpi)"],
                ]}
                onChange={(quality) => setSettings((s) => ({ ...s, quality }))}
                hint={
                  settings.quality === "alta"
                    ? "Arquivo cerca de 2,5 vezes maior e mais lento para montar."
                    : "Ideal para impressora caseira e copiadora."
                }
              />
              <FontPicker stored={fonts} onChange={setFonts} />
            </fieldset>

            <div className="export">
              <button type="button" className="btn btn--primary btn--wide" onClick={download} disabled={Boolean(progress) || busy}>
                <Download size={19} aria-hidden="true" />
                {progress ? "Gerando PDF…" : `Baixar PDF · ${plural(sheetsFor(total), "folha", "folhas")}`}
              </button>
              {progress && (
                <div className="progress" role="status">
                  <progress max={progress.total} value={progress.done} aria-label={progressLabel} />
                  <span>{progressLabel}</span>
                </div>
              )}
              {!progress && <p className="hint">Tudo é montado no seu navegador. Na impressão, escolha “Tamanho real” ou 100%.</p>}
            </div>
          </section>
        )}

        <section className="proof" aria-label="Prova das folhas">
          {total > 0 && (
            <div className="proof-bar">
              <span className="proof-bar-count">
                {cardsLabel} · {plural(sheetsFor(total), "folha", "folhas")} {PAPER_LABEL[settings.paper]}
              </span>
              <button type="button" className="btn btn--primary btn--small" onClick={download} disabled={Boolean(progress) || busy}>
                <Download size={17} aria-hidden="true" />
                {progress ? `${progress.done}/${progress.total}` : "Baixar PDF"}
              </button>
            </div>
          )}
          {total > 0 ? <ProofSheets entries={entries} slug={slug} onOpen={setOpenKey} /> : <EmptySheet busy={busy} slug={slug} />}
        </section>
      </main>

      <HowItWorks />

      <footer className="colophon">
        <p>
          O Proxinho é conteúdo de fã, gratuito e não oficial, permitido pela Política de Conteúdo de Fãs da Wizards. Não é aprovado nem
          endossado pela Wizards. Partes dos materiais usados são propriedade da Wizards of the Coast. ©Wizards of the Coast LLC.
        </p>
        <p>
          Imagens das cartas: <a href="https://scryfall.com">Scryfall</a>, baixadas direto pelo seu navegador. Textos em português: MTG
          Arena e impressões oficiais. Proxies são para uso pessoal e em mesas casuais; não venda.
        </p>
      </footer>

      <CardDrawer entry={openEntry} onClose={() => setOpenKey(null)} onChoice={setChoice} onQuantity={setQuantity} onRemove={remove} />
    </>
  );
}

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  hint,
}: {
  label: string;
  value: T;
  options: [T, string][];
  onChange: (v: T) => void;
  hint?: string;
}) {
  return (
    <div className="seg">
      <span className="field-label" id={`seg-${label}`}>
        {label}
      </span>
      <div className="seg-track" role="radiogroup" aria-labelledby={`seg-${label}`}>
        {options.map(([v, text]) => (
          <label key={v} className="seg-opt" data-checked={v === value}>
            <input type="radio" name={`seg-${label}`} value={v} checked={v === value} onChange={() => onChange(v)} />
            <span>{text}</span>
          </label>
        ))}
      </div>
      {hint && <p className="hint">{hint}</p>}
    </div>
  );
}

const EXAMPLE_NAMES = ["Sol Ring", "Llanowar Elves", "Lightning Bolt"];

/** Folha vazia com três cartas de exemplo já em português: a prova do que o site faz. */
function EmptySheet({ busy, slug }: { busy: boolean; slug: string }) {
  const [examples, setExamples] = useState<Entry[]>([]);
  useEffect(() => {
    const ctrl = new AbortController();
    resolveNames(EXAMPLE_NAMES, ctrl.signal)
      .then((res) =>
        setExamples(
          buildOrder(
            EXAMPLE_NAMES.map((name) => ({ quantity: 1, name, section: "main" })),
            res,
          ).entries,
        ),
      )
      .catch(() => undefined); // sem exemplos, a folha fica só com os espaços vazios
    return () => ctrl.abort();
  }, []);
  return (
    <div className="sheets">
      <Sheet
        label="Folha 1 · 9 cartas"
        slug={slug}
        ariaLabel="Folha de exemplo"
        intro={
          <p className="sheet-empty-msg">
            {busy ? "Procurando as cartas…" : "Suas cartas aparecem aqui, já em português, na ordem em que vão sair da impressora."}
          </p>
        }
      >
        <ol className="sheet-grid">
          {examples.map((e) => (
            <li key={e.key}>
              <Slot entry={e} example />
            </li>
          ))}
          <BlankSlots count={9 - examples.length} />
        </ol>
      </Sheet>
    </div>
  );
}

function HowItWorks() {
  return (
    <section className="how" id="como-funciona" aria-labelledby="como-titulo">
      <h2 id="como-titulo" className="how-title">
        Como funciona
      </h2>
      <div className="how-cols">
        <div>
          <h3>De onde vem o texto</h3>
          <p>
            Primeiro do MTG Arena, que é traduzido para o português até hoje. Se a carta não está no Arena, usamos a impressão oficial em
            português mais recente. Sem nenhuma das duas, a carta sai com uma tradução não oficial e fica marcada assim: as frases que já
            saíram em cartas oficiais vêm iguais, e as outras foram traduzidas no padrão do Arena. O nome continua em inglês se a carta
            nunca saiu em português.
          </p>
        </div>
        <div>
          <h3>Qualquer arte</h3>
          <p>
            Você escolhe qualquer impressão em inglês. O Proxinho apaga o nome, o tipo e o texto e escreve o português no lugar, com as
            fontes das cartas reais. Arte, custo de mana, poder e resistência, artista e copyright continuam os da carta.
          </p>
        </div>
        <div>
          <h3>Na impressão</h3>
          <p>
            Imprima em “Tamanho real” ou 100%, sem ajustar à página. Cada folha tem uma régua de 5 cm na margem: se ela medir menos, a
            impressora reduziu. Corte nas marcas e ponha o papel na frente da carta original, dentro do sleeve.
          </p>
        </div>
      </div>
      <p className="how-note">
        A reescrita cobre a moldura atual e a de 2003: cartas normais e de duas faces, planeswalkers, fichas, Sagas, Aventuras, Classes e as
        artes sem borda. Molduras especiais usam a imagem oficial em português quando existe; senão, a carta sai em inglês e fica marcada.
      </p>
    </section>
  );
}
