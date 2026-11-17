import { defineConfig } from "vitest/config";

// Testes de unidade: lógica pura (leitor de listas, layout do texto, modelo do pedido, PDF, importadores).
export default defineConfig({
  test: {
    include: ["tests/unit/**/*.test.ts"],
    environment: "node",
    coverage: { provider: "v8", include: ["src/lib/**", "src/app/model.ts", "src/engine/text.ts", "src/engine/geometry.ts", "worker/**"] },
  },
});
