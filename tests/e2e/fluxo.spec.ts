import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

test("cola a lista, revisa as folhas, troca a arte e baixa o PDF", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Proxies com o texto oficial em português");

  await page.getByRole("button", { name: "Usar uma lista de exemplo" }).click();
  await page.getByRole("button", { name: "Montar folhas" }).click();

  await expect(page.getByRole("heading", { name: /Seu pedido: 9 cartas, 1 folha/ })).toBeVisible();
  await expect(page.locator(".slot-img")).toHaveCount(9, { timeout: 60_000 });

  // gaveta da carta: troca a quantidade e a arte
  await page
    .getByRole("button", { name: /Anel Solar/ })
    .first()
    .click();
  const drawer = page.getByRole("dialog");
  await expect(drawer.getByRole("heading", { name: "Anel Solar" })).toBeVisible();
  await drawer.getByRole("button", { name: "Uma cópia a mais" }).click();
  await expect(drawer.locator("output")).toHaveText("2");
  await drawer.getByRole("radio").nth(1).check();
  await drawer.getByRole("button", { name: "Fechar" }).click();
  await expect(page.getByRole("heading", { name: /10 cartas, 2 folhas/ })).toBeVisible();

  // a folha 2 tem 1 carta e 8 espaços vazios: todos do mesmo tamanho da carta
  const sizes = await page
    .locator(".sheet")
    .nth(1)
    .locator(".slot-card")
    .evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)));
  expect(sizes).toHaveLength(9);
  expect(new Set(sizes).size).toBe(1);

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page
      .locator(".export")
      .getByRole("button", { name: /Baixar PDF/ })
      .click(),
  ]);
  const file = await download.path();
  const pdf = readFileSync(file);
  expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  expect(pdf.length).toBeGreaterThan(100_000);
});

test("avisa os nomes que não encontrou", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Lista do deck").fill("1 Sol Ring\n2 Carta Que Não Existe");
  await page.getByRole("button", { name: "Montar folhas" }).click();
  await expect(page.getByText("1 nome não encontrado")).toBeVisible();
  await expect(page.locator(".missing li")).toHaveText(/2 Carta Que Não Existe/);
});

test("busca uma carta pelo nome em português", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "Buscar carta" }).click();
  await page.getByRole("combobox").fill("contram");
  await page.getByRole("option", { name: /Contramágica/ }).click();
  await expect(page.getByRole("heading", { name: /Seu pedido: 1 carta/ })).toBeVisible();
});

test("carta de duas faces sai com frente e verso, cada um em português", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Lista do deck").fill("1 Tovolar, Dire Overlord");
  await page.getByRole("button", { name: "Montar folhas" }).click();
  await expect(page.getByRole("heading", { name: /Seu pedido: 1 carta \(2 faces\), 1 folha/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Tovolar, Soberano Medonho \(frente\)/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Tovolar, Flagelo da Meia-noite \(verso\)/ })).toBeVisible();
  await expect(page.locator(".slot-img")).toHaveCount(2, { timeout: 60_000 });
});

test("planeswalker sai reescrito em português", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Lista do deck").fill("1 Chandra, Torch of Defiance");
  await page.getByRole("button", { name: "Montar folhas" }).click();
  await expect(page.getByRole("button", { name: /^Chandra, Chama da Rebeldia/ })).toBeVisible(); // não o botão do emblema dela
  await expect(page.locator(".slot-img")).toHaveCount(1, { timeout: 60_000 });
  await expect(page.locator(".slot .tag")).toHaveCount(0); // sem etiqueta: saiu reescrito
});

test("sugere as fichas que o deck cria e as reescreve em português", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Lista do deck").fill("1 Smothering Tithe");
  await page.getByRole("button", { name: "Montar folhas" }).click();
  const tokens = page.getByRole("region", { name: "Fichas que o deck cria" });
  await expect(tokens.getByText("Tesouro")).toBeVisible();
  await tokens.getByRole("button", { name: "Adicionar a ficha", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Seu pedido: 2 cartas, 1 folha/ })).toBeVisible();
  // a sugestão some quando a ficha já está no pedido
  await expect(tokens).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Tesouro/ })).toBeVisible();
  await expect(page.locator(".slot-img")).toHaveCount(2, { timeout: 60_000 });
});

test("lê a seção Tokens da lista como fichas", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Lista do deck").fill("1 Smothering Tithe\n\nTokens\n2 Treasure");
  await page.getByRole("button", { name: "Montar folhas" }).click();
  await expect(page.getByRole("heading", { name: /Seu pedido: 3 cartas, 1 folha/ })).toBeVisible();
  await expect(page.getByRole("region", { name: "Fichas que o deck cria" })).toHaveCount(0);
});

test("sugere o emblema do planeswalker, em português", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Lista do deck").fill("1 Chandra, Torch of Defiance");
  await page.getByRole("button", { name: "Montar folhas" }).click();
  const box = page.getByRole("region", { name: "Fichas e emblemas que o deck cria" });
  await expect(box.getByText("Emblema — Chandra, Chama da Rebeldia")).toBeVisible();
  await box.getByRole("button", { name: "Adicionar o emblema", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Seu pedido: 2 cartas, 1 folha/ })).toBeVisible();
  await expect(page.locator(".slot-img")).toHaveCount(2, { timeout: 60_000 });
});
