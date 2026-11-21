import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { drawingHash } from "../../scripts/codigo.ts";

/** Um repositório de mentira com os arquivos que entram no resumo e um que não entra. */
function repo() {
  const root = mkdtempSync(join(tmpdir(), "codigo-"));
  const files: Record<string, string> = {
    "src/engine/render.ts": "motor",
    "src/app/cardStore.ts": "chave",
    "src/app/model.ts": "modelo",
    "src/app/preview.ts": "previa",
    "src/app/printFaces.ts": "pdf",
    "public/fonts/cartas/eczar.woff2": "fonte",
    "src/components/App.tsx": "interface",
  };
  const write = (path: string, text: string) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  for (const [path, text] of Object.entries(files)) write(path, text);
  return { root, write };
}

describe("resumo do código que desenha (chave das cartas guardadas e do servidor)", () => {
  it("muda com o motor, um arquivo novo dele ou as fontes; não com a interface", () => {
    const { root, write } = repo();
    const base = drawingHash(root);
    expect(base).toMatch(/^[0-9a-f]{16}$/);
    expect(drawingHash(root)).toBe(base);
    write("src/components/App.tsx", "outra interface");
    expect(drawingHash(root)).toBe(base);
    write("src/engine/render.ts", "motor corrigido");
    const fixed = drawingHash(root);
    expect(fixed).not.toBe(base);
    write("src/engine/novo.ts", "arquivo novo");
    expect(drawingHash(root)).not.toBe(fixed);
    const { root: other, write: write2 } = repo();
    write2("public/fonts/cartas/eczar.woff2", "outra fonte");
    expect(drawingHash(other)).not.toBe(base);
  });
});
