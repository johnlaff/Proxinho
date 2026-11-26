import { defineConfig } from "vitest/config";

// Testes de unidade: lógica pura (leitor de listas, layout do texto, modelo do pedido, PDF, importadores).
export default defineConfig({
  test: {
    include: ["tests/unit/**/*.test.ts"],
    environment: "node",
    // Os testes do motor processam imagens de carta inteiras (745 × 1040) pixel a pixel. Na máquina
    // do GitHub, com a cobertura e os arquivos em paralelo, eles levam de 4 a 6 vezes o tempo de um
    // computador: o da moldura de 1993 com o bisel (0,7 s aqui) levava 4,3 s e passou dos 5 s do
    // padrão do Vitest, e a esteira falhou sem nada quebrado. O limite fica folgado; um teste
    // travado de verdade ainda para.
    testTimeout: 30_000,
    coverage: { provider: "v8", include: ["src/lib/**", "src/app/model.ts", "src/engine/text.ts", "src/engine/geometry.ts", "worker/**"] },
  },
});
