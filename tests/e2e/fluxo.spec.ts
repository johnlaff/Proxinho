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

test("o pedido volta como estava ao recarregar, com a arte escolhida", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Lista do deck").fill("1 Sol Ring\n2 Counterspell");
  await page.getByRole("button", { name: "Montar folhas" }).click();
  await expect(page.getByRole("heading", { name: /Seu pedido: 3 cartas, 1 folha/ })).toBeVisible();
  await page
    .getByRole("button", { name: /Anel Solar/ })
    .first()
    .click();
  const drawer = page.getByRole("dialog");
  await drawer.getByRole("radio").nth(1).check();
  await drawer.getByRole("button", { name: "Fechar" }).click();

  await page.reload();
  await expect(page.getByText("Seu último pedido voltou como você deixou.")).toBeVisible();
  await expect(page.getByRole("heading", { name: /Seu pedido: 3 cartas, 1 folha/ })).toBeVisible();
  await page
    .getByRole("button", { name: /Anel Solar/ })
    .first()
    .click();
  await expect(page.getByRole("dialog").getByRole("radio").nth(1)).toBeChecked();

  // começar outro pedido apaga tudo, e o "Desfazer" traz de volta
  await page.getByRole("dialog").getByRole("button", { name: "Fechar" }).click();
  await page.getByRole("button", { name: "Começar outro pedido" }).click();
  await expect(page.getByRole("heading", { name: /Seu pedido/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Desfazer" }).click();
  await expect(page.getByRole("heading", { name: /Seu pedido: 3 cartas, 1 folha/ })).toBeVisible();
});

test("o link do pedido abre as mesmas cartas em outro navegador", async ({ page, context, browser }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.addInitScript(() => Object.defineProperty(navigator, "share", { value: undefined }));
  await page.goto("/");
  await page.getByLabel("Lista do deck").fill("2 Sol Ring\n1 Counterspell\n\nTokens\n1 Treasure");
  await page.getByRole("button", { name: "Montar folhas" }).click();
  await expect(page.getByRole("heading", { name: /Seu pedido: 4 cartas, 1 folha/ })).toBeVisible();
  await page.getByRole("button", { name: "Copiar link do pedido" }).click();
  await expect(page.getByText(/Link do pedido copiado/)).toBeVisible();
  const link = await page.evaluate(() => navigator.clipboard.readText());
  expect(link).toMatch(/\/#pedido=[\w-]+$/);

  const other = await browser.newContext();
  const friend = await other.newPage();
  await friend.goto(link);
  await expect(friend.getByText(/Pedido aberto pelo link/)).toBeVisible();
  await expect(friend.getByRole("heading", { name: /Seu pedido: 4 cartas, 1 folha/ })).toBeVisible();
  await expect(friend.getByRole("button", { name: /Tesouro/ })).toBeVisible();
  expect(new URL(friend.url()).hash).toBe(""); // recarregar não abre o link de novo por cima das mudanças
  await other.close();

  // quem já tinha outro pedido pode voltar a ele depois de abrir um link
  await page.getByLabel("Lista do deck").fill("1 Lightning Bolt");
  await page.getByRole("button", { name: "Montar folhas" }).click();
  await expect(page.getByRole("heading", { name: /Seu pedido: 1 carta, 1 folha/ })).toBeVisible();
  await page.goto(link);
  await expect(page.getByRole("heading", { name: /Seu pedido: 4 cartas, 1 folha/ })).toBeVisible();
  await page.getByRole("button", { name: "Voltar ao meu pedido" }).click();
  await expect(page.getByRole("heading", { name: /Seu pedido: 1 carta, 1 folha/ })).toBeVisible();
  await expect(page.getByLabel("Lista do deck")).toHaveValue("1 Lightning Bolt");
});

test("sugere o nome certo para um nome com erro de digitação", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Lista do deck").fill("1 Counterspell\n2x Sol Rng (C21) 263");
  await page.getByRole("button", { name: "Montar folhas" }).click();
  await expect(page.getByText("1 nome não encontrado")).toBeVisible();
  const hint = page.getByRole("group", { name: /Você quis dizer, no lugar de Sol Rng/ });
  await hint.getByRole("button", { name: "Sol Ring" }).click();
  await expect(page.getByRole("heading", { name: /Seu pedido: 3 cartas, 1 folha/ })).toBeVisible();
  await expect(page.getByText("1 nome não encontrado")).toHaveCount(0);
  await expect(page.getByLabel("Lista do deck")).toHaveValue("1 Counterspell\n2x Sol Ring (C21) 263");
});

test("a legenda filtra a prova pelas cartas de um resultado", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Lista do deck").fill("1 Sol Ring\n1 Counterspell");
  await page.getByRole("button", { name: "Montar folhas" }).click();
  const row = page.getByRole("button", { name: /Reescrita em português/ });
  await row.click();
  await expect(row).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("Só as cartas reescritas em português: 2")).toBeVisible();
  await expect(page.getByRole("region", { name: "Cartas filtradas, folha 1 de 1" })).toBeVisible();
  await page.getByRole("button", { name: "Mostrar todas" }).click();
  await expect(row).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByRole("region", { name: "Folha 1 de 1" })).toBeVisible();
});
