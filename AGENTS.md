# AGENTS.md

Guia curto para agentes de IA (e pessoas) que mexem neste repositório. Leia antes de mudar qualquer coisa.

## O que é

Proxinho: site que gera proxies de cartas com o texto oficial em português, sobre qualquer arte em inglês, e entrega um PDF no tamanho real (63 × 88 mm). Produção: https://proxinho.johnlaff.com. Contexto de produto em `PRODUCT.md`; decisões em `docs/adr/`; requisitos em `docs/specs/`.

## Comandos

```bash
pnpm install                # dependências (pnpm 12, Node 24)
pnpm db:seed:local          # cria o D1 local com 14 cartas e uma ficha de amostra
pnpm dev                    # site + API em http://localhost:5173 (Worker roda dentro do Vite)
pnpm check                  # tipos + lint + formatação + testes de unidade (rode antes de todo commit)
pnpm test:e2e               # Playwright desktop e celular (sobe o site sozinho)
pnpm data:build             # pipeline completo de dados (Python, baixa ~500 MB, ~5 min)
```

Sem download de navegador? `PW_CHROMIUM_PATH=/caminho/do/chrome pnpm test:e2e`.

## Mapa

- `src/engine/` motor da carta: `render.ts` (orquestra), `erase.ts` (apaga o inglês), `lama.ts` + `lamaWorker.ts` (preenchimento por rede neural nos planeswalkers, ADR 0008), `token.ts` (moldura de ficha: acha a barra de tipo na imagem, ADR 0009), `text.ts` (quebra e encaixe do texto), `geometry.ts` (caixas da moldura M15).
- `src/app/` lógica do pedido sem React: `model.ts` (escolha da arte, folhas), `preview.ts` (fila de prévias), `exportPdf.ts`.
- `src/components/` interface React. `src/lib/` leitor de listas e PDF.
- `worker/` API Cloudflare (`/api/search`, `/api/resolve`, `/api/cards`, `/api/import`, `/api/fontes/*`, `/api/health`).
- `scripts/modelo.mjs` baixa e divide o modelo LaMa e o runtime do ONNX em `public/modelos/` (roda sozinho no `dev` e no `build`).
- `data/pipeline/build.py` gera `data/out/cards.sql` para o D1. `migrations/` esquema do banco.

## Regras

- Português do Brasil em código, comentários, interface e docs. Jargão da comunidade ("deck", "sleeve", "proxy").
- Texto de carta nunca é traduzido por máquina. Fontes válidas: MTG Arena (arquivos públicos da Untapped) e impressões oficiais em PT (Scryfall). Sem tradução oficial, a carta sai em inglês e a interface diz isso.
- Nada extraído do cliente do Arena. Nenhuma imagem de carta passa pelo servidor nem fica guardada: o navegador baixa do Scryfall.
- Não usar "Magic", "MTG" nem logos da Wizards como marca. Aviso de conteúdo de fã fica no site e no PDF.
- Mudança de comportamento vem com teste. Mudança de arquitetura vem com ADR novo.
- Toda mudança ou feature nova atualiza, no mesmo commit, toda a documentação afetada: README, este arquivo, `docs/arquitetura.md`, `docs/operacao.md`, `docs/pesquisa.md`, `docs/specs/`, `docs/roadmap.md` e os ADRs.
- Interface segue `DESIGN.md` e o contrato em `.impeccable/surfaces/`. Contraste AA, alvos de toque de 44 px, nada só por cor.

## Erros que já aconteceram (não repita)

- Regex de símbolos do Arena casava "Co" em `{oCoC}`: o token é `o(\([^)]+\)|\d+|Si|[A-Z])`.
- Flavor do Arena pode ser de outra impressão: só use quando a arte escolhida é a mesma de `text_print`.
- Retângulos com coordenadas fracionárias como índice de pixel apagavam a caixa de P/R: arredonde.
- Sangria grande no PDF passa da área imprimível das impressoras caseiras: 2 mm (A4) e 1 mm (Carta).
- O bulk do Scryfall não tem mais `download_uri`; use `jsonl_download_uri`.
- O Moxfield bloqueia leitura por terceiros (403): oriente a colar o texto.
- Os arquivos originais da MPlantin eram recusados pelo Chrome e pelo Firefox (OTS: tabelas sobrepostas e `cmap` com idioma 1), e o site caía calado para a fonte livre. Passe toda fonte nova por `scripts/consertar-fontes.py` e confira no navegador.
- O pnpm 12 no CI (`--frozen-lockfile`) falha com `ERR_PNPM_IGNORED_BUILDS` quando uma dependência nova tem script de instalação: decida em `pnpm-workspace.yaml` (`allowBuilds`, `true` ou `false`) no mesmo commit da dependência.
- As threads do WebAssembly do ONNX reabrem o arquivo da worker com o nome "em-pthread": o handler de mensagens só pode existir fora delas.
- Fichas têm nomes iguais a cartas ("Adorned Pouncer" eternizado) e cartas de apoio com `layout: token` ("Copy", "The Monarch"): o Arena só casa fichas com `isToken`, e só entra ficha cujo tipo começa por "Token ".
- O .wasm do ONNX (28 MiB) não cabe nos assets do Cloudflare: o Vite não pode copiá-lo (plugin em `vite.config.ts`); ele vai em partes por `scripts/modelo.mjs`.
