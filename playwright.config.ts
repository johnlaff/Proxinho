import { defineConfig, devices } from "@playwright/test";

// Testes de ponta a ponta: sobem o site de verdade (Worker + D1 local com uma
// amostra de cartas) e fazem o caminho completo colar → revisar → baixar PDF.
const PORT = 4173;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    // permite usar um Chromium já instalado na máquina (ex.: ambientes sem download de navegador)
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "celular", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: `pnpm db:seed:local && pnpm build && pnpm preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
