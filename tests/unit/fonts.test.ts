import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * FontFace e document.fonts de mentira: `missing` lista os arquivos que o servidor não tem
 * (a carga deles falha, como um 404 em /api/fontes/).
 */
function stubFonts(missing: string[]) {
  class FakeFontFace {
    constructor(
      readonly family: string,
      readonly source: string,
    ) {}
    load() {
      return missing.some((f) => this.source.includes(f)) ? Promise.reject(new Error("404")) : Promise.resolve(this);
    }
  }
  vi.stubGlobal("FontFace", FakeFontFace);
  vi.stubGlobal("document", { fonts: { add: () => undefined, delete: () => undefined } });
}

async function freshFonts(missing: string[]) {
  stubFonts(missing);
  vi.resetModules();
  const fonts = await import("../../src/engine/fonts");
  await fonts.loadCardFonts();
  return fonts;
}

describe("fontes das cartas", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.unstubAllGlobals());

  it("moldura de 2003: nome e tipo na Matrix Bold, na linha de base (ADR 0024)", async () => {
    const fonts = await freshFonts([]);
    const m03 = fonts.titleFont(true);
    expect(m03.family).toBe("ProxinhoTitulo2003");
    // o "middle" do Chrome cai na linha de base da Matrix Bold: ela é escrita pela linha de base
    expect(m03.baseline).toBe("alphabetic");
    // as outras molduras seguem na Beleren
    expect(fonts.titleFont().family).toBe("ProxinhoTituloOficial");
    expect(fonts.titleFont().baseline).toBe("middle");
    expect(fonts.fontsId()).toBe("o|o");
  });

  it("sem o arquivo da Matrix Bold, a de 2003 sai na Beleren e as cartas guardadas não valem", async () => {
    const fonts = await freshFonts(["matrix-bold"]);
    expect(fonts.titleFont(true).family).toBe("ProxinhoTituloOficial");
    // "o|o" é o que o montador grava e o site procura no servidor: com a de 2003 diferente, não
    expect(fonts.fontsId()).toBe("b3|o");
    expect(fonts.activeFonts()).toBe("oficiais");
  });

  it("moldura antiga: o nome na Goudy Medieval, pela linha de base (ADR 0031)", async () => {
    const fonts = await freshFonts([]);
    const old = fonts.oldNameFont();
    expect(old.family).toBe("ProxinhoTitulo1997");
    expect(old.baseline).toBe("alphabetic");
    expect(old.rise).toBe(0);
  });

  it("sem o arquivo da Goudy Medieval, o nome da antiga sai na Beleren e as cartas guardadas não valem", async () => {
    const fonts = await freshFonts(["medieval"]);
    expect(fonts.oldNameFont().family).toBe("ProxinhoTituloOficial");
    // (a de 2003 continua na Matrix Bold)
    expect(fonts.titleFont(true).family).toBe("ProxinhoTitulo2003");
    expect(fonts.fontsId()).toBe("b7|o");
  });

  it("a fonte escolhida pela pessoa vale também nas molduras de 2003 e antiga", async () => {
    const fonts = await freshFonts([]);
    await fonts.applyCustomFonts({ title: new ArrayBuffer(8) });
    expect(fonts.titleFont(true).family).toBe("ProxinhoTituloPessoal");
    expect(fonts.oldNameFont().family).toBe("ProxinhoTituloPessoal");
  });
});
