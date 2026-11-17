/**
 * "Fontes das cartas": por padrão, fontes livres parecidas com as originais.
 * Quem tem a Beleren e a MPlantin pode escolher os arquivos; eles ficam só
 * neste navegador.
 */
import { Upload } from "lucide-react";
import { useId, useState } from "react";
import { clearStoredFonts, saveStoredFonts, type StoredFonts } from "../app/userFonts";
import { clearCustomFonts, applyCustomFonts } from "../engine/fonts";

type Slot = "title" | "body" | "bodyItalic";

const SLOTS: { id: Slot; label: string; example: string }[] = [
  { id: "title", label: "Nome e tipo", example: "Beleren Bold" },
  { id: "body", label: "Texto", example: "MPlantin" },
  { id: "bodyItalic", label: "Texto em itálico (opcional)", example: "MPlantin Italic" },
];

export function FontPicker({ stored, onChange }: { stored: StoredFonts | null; onChange: (fonts: StoredFonts | null) => void }) {
  const base = useId();
  const [open, setOpen] = useState(Boolean(stored));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const current: StoredFonts = stored ?? { title: null, body: null, bodyItalic: null, names: {} };

  async function pick(slot: Slot, file: File | undefined) {
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      if (file.size > 5_000_000) throw new Error("Esse arquivo passa de 5 MB e não parece ser uma fonte.");
      const next: StoredFonts = { ...current, [slot]: await file.arrayBuffer(), names: { ...current.names, [slot]: file.name } };
      await applyCustomFonts({ title: next.title, body: next.body, bodyItalic: next.bodyItalic });
      await saveStoredFonts(next);
      onChange(next);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    clearCustomFonts();
    await clearStoredFonts();
    setError(null);
    onChange(null);
  }

  return (
    <div className="fonts">
      <span className="field-label">Fontes das cartas</span>
      <p className="hint fonts-status">
        {stored
          ? `Usando as suas fontes${stored.names.title ? ` (${[stored.names.title, stored.names.body].filter(Boolean).join(", ")})` : ""}.`
          : "Usando fontes livres parecidas com as originais (Eczar e Splentinex)."}
      </p>
      {!open ? (
        <button type="button" className="btn btn--quiet btn--small" onClick={() => setOpen(true)}>
          Usar as fontes das cartas reais que eu tenho
        </button>
      ) : (
        <div className="fonts-panel">
          <p className="hint">
            As fontes das cartas reais são pagas e não podem vir com o site. Se você tem os arquivos, escolha abaixo. Eles ficam só neste
            navegador e nunca são enviados.
          </p>
          {SLOTS.map((s) => (
            <div key={s.id} className="font-row">
              <label className="btn btn--file btn--small" htmlFor={`${base}-${s.id}`}>
                <Upload size={16} aria-hidden="true" />
                {s.label}
              </label>
              <input
                id={`${base}-${s.id}`}
                className="sr-only"
                type="file"
                accept=".ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2"
                disabled={busy}
                onChange={(e) => {
                  void pick(s.id, e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
              <span className="font-name">{current.names[s.id] ?? `ex.: ${s.example}`}</span>
            </div>
          ))}
          {error && (
            <p className="msg msg--error" role="alert">
              {error}
            </p>
          )}
          {stored && (
            <button type="button" className="link-btn" onClick={() => void reset()}>
              Voltar às fontes livres
            </button>
          )}
        </div>
      )}
    </div>
  );
}
