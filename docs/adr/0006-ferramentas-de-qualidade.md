# 0006. Ferramentas: Vite, TypeScript, oxlint/oxfmt, Vitest, Playwright

- Situação: aceita (17/11/2026)

## Decisão

- React 19 + Vite 8 + TypeScript 7 (`strict`), um projeto TS por ambiente (site, Worker, testes, configs).
- oxlint (com `--deny-warnings`) e oxfmt: o par de lint e formatação mais rápido hoje, sem dezenas de plugins.
- Vitest para unidade (leitor de listas, layout do texto, modelo do pedido, PDF, importadores) e Playwright para ponta a ponta em desktop e celular, com o Worker e um D1 local semeado com 14 cartas, uma ficha e um emblema (`tests/fixtures/seed.sql`).
- GitHub Actions com actions fixadas por SHA, permissões mínimas, prévia por PR (`wrangler versions upload --preview-alias`), deploy só na main depois dos testes, CodeQL e Dependabot agrupado com período de espera de 7 dias (é o único robô de dependências; o Renovate foi recusado em 17/11/2026 para não duplicar PRs, e `@types/node` só sobe de versão maior junto com o Node do CI).

## Consequências

- Um `pnpm check` local reproduz o que a CI exige.
- Teste de ponta a ponta baixa imagens reais do Scryfall: se o CDN cair, ele falha (sinal útil, não ruído).
