# AGENTS.md

Guia curto para agentes de IA (e pessoas) que mexem neste repositório. Leia antes de mudar qualquer coisa.

## O que é

Proxinho: site que gera proxies de cartas com o texto oficial em português, sobre qualquer arte em inglês, e entrega um PDF no tamanho real (63 × 88 mm). Produção: https://proxinho.johnlaff.com. Contexto de produto em `PRODUCT.md`; decisões em `docs/adr/`; requisitos em `docs/specs/`.

## Comandos

```bash
pnpm install                # dependências (pnpm 12, Node 24)
pnpm db:seed:local          # cria o D1 local com 11 cartas de amostra
pnpm dev                    # site + API em http://localhost:5173 (Worker roda dentro do Vite)
pnpm check                  # tipos + lint + formatação + testes de unidade (rode antes de todo commit)
pnpm test:e2e               # Playwright desktop e celular (sobe o site sozinho)
pnpm data:build             # pipeline completo de dados (Python, baixa ~500 MB, ~5 min)
```

Sem download de navegador? `PW_CHROMIUM_PATH=/caminho/do/chrome pnpm test:e2e`.

## Mapa

- `src/engine/` motor da carta: `render.ts` (orquestra), `erase.ts` (apaga o inglês), `text.ts` (quebra e encaixe do texto), `geometry.ts` (caixas da moldura M15).
- `src/app/` lógica do pedido sem React: `model.ts` (escolha da arte, folhas), `preview.ts` (fila de prévias), `exportPdf.ts`.
- `src/components/` interface React. `src/lib/` leitor de listas e PDF.
- `worker/` API Cloudflare (`/api/search`, `/api/resolve`, `/api/import`, `/api/health`).
- `data/pipeline/build.py` gera `data/out/cards.sql` para o D1. `migrations/` esquema do banco.

## Regras

- Português do Brasil em código, comentários, interface e docs. Jargão da comunidade ("deck", "sleeve", "proxy").
- Texto de carta nunca é traduzido por máquina. Fontes válidas: MTG Arena (arquivos públicos da Untapped) e impressões oficiais em PT (Scryfall). Sem tradução oficial, a carta sai em inglês e a interface diz isso.
- Nada extraído do cliente do Arena. Nenhuma imagem de carta passa pelo servidor nem fica guardada: o navegador baixa do Scryfall.
- Não usar "Magic", "MTG" nem logos da Wizards como marca. Aviso de conteúdo de fã fica no site e no PDF.
- Mudança de comportamento vem com teste. Mudança de arquitetura vem com ADR novo.
- Interface segue `DESIGN.md` e o contrato em `.impeccable/surfaces/`. Contraste AA, alvos de toque de 44 px, nada só por cor.

## Erros que já aconteceram (não repita)

- Regex de símbolos do Arena casava "Co" em `{oCoC}`: o token é `o(\([^)]+\)|\d+|Si|[A-Z])`.
- Flavor do Arena pode ser de outra impressão: só use quando a arte escolhida é a mesma de `text_print`.
- Retângulos com coordenadas fracionárias como índice de pixel apagavam a caixa de P/R: arredonde.
- Sangria grande no PDF passa da área imprimível das impressoras caseiras: 2 mm (A4) e 1 mm (Carta).
- O bulk do Scryfall não tem mais `download_uri`; use `jsonl_download_uri`.
- O Moxfield bloqueia leitura por terceiros (403): oriente a colar o texto.
