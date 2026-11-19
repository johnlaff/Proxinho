# Guia de operação

## Onde está cada coisa

| O quê | Onde |
|---|---|
| Site e API | Cloudflare Worker `proxinho`, domínio `proxinho.johnlaff.com` |
| Banco | Cloudflare D1 `proxinho` |
| Fontes das cartas (Beleren, MPlantin) | Cloudflare KV `proxinho-fontes` (binding `FONTES`), servidas em `/api/fontes/*.ttf` |
| Modelo LaMa e runtime do ONNX | Assets do site em `/modelos/`, gerados no build por `scripts/modelo.mjs` (baixa do Hugging Face numa revisão fixa e confere o SHA-256) |
| Atualização dos dados | GitHub Actions, workflow "Dados diários" (04h17 de Brasília) |
| Deploy | GitHub Actions, workflow "CI/CD", job "Deploy em produção" (a cada push na main) |
| Logs | Painel da Cloudflare → Workers → proxinho → Logs (observability ligada) |
| Saúde | `GET https://proxinho.johnlaff.com/api/health` → `{ ok, dataUpdatedAt }` |

## Segredos do repositório

`CLOUDFLARE_API_TOKEN` (permissões: Workers Scripts, D1 e Workers Routes do domínio, edição) e `CLOUDFLARE_ACCOUNT_ID`, no ambiente `producao` do GitHub.

## Tarefas comuns

**Atualizar os dados agora:** GitHub → Actions → "Dados diários" → Run workflow.

**Publicar à mão:** sem os segredos acima no GitHub, o "Dados diários" e o deploy do "CI/CD" pulam o passo da Cloudflare (o log avisa) e nada chega à produção. Com `CLOUDFLARE_API_TOKEN` e `CLOUDFLARE_ACCOUNT_ID` no ambiente da máquina, os mesmos passos rodam daqui:
```bash
python3 data/pipeline/build.py                      # dados do dia (~5 min); confira que saíram mais de 30 mil cartas
pnpm exec wrangler d1 migrations apply proxinho --remote
pnpm exec wrangler d1 execute proxinho --remote --file data/out/cards.sql --yes
pnpm build && pnpm exec wrangler deploy             # site e API
curl -s https://proxinho.johnlaff.com/api/health    # dataUpdatedAt de hoje
```

**Voltar o site para a versão anterior:**
```bash
pnpm exec wrangler deployments list
pnpm exec wrangler rollback <id-da-versao>
```

**Rodar uma migração do banco:** crie `migrations/000N_nome.sql`; o deploy aplica sozinho (`wrangler d1 migrations apply proxinho --remote`). Para testar local: `pnpm db:migrate:local`.

**Trocar um arquivo de fonte:** primeiro `python3 scripts/consertar-fontes.py original.ttf arquivo.ttf` (o Chrome recusa fontes com defeito de estrutura e o site cai calado para a fonte livre), depois `pnpm exec wrangler kv key put --remote --binding FONTES mplantin.ttf --path arquivo.ttf` (nomes aceitos em `worker/index.ts`) e aumente o `?v=` das URLs em `src/engine/fonts.ts`, porque o navegador guarda as fontes por 7 dias. Para o ambiente local: `pnpm fonts:local`, com os arquivos em `.fontes-oficiais/`.

**Atualizar o modelo ou o ONNX Runtime:** mude a URL e o SHA-256 em `scripts/modelo.mjs` (ou a versão de `onnxruntime-web`); o runtime leva a versão no nome do arquivo, e um modelo novo deve ganhar nome novo, porque o cache desses arquivos é imutável.

**Atualizações de dependências:** só o Dependabot (`.github/dependabot.yml`), uma vez por semana, agrupado e com 7 dias de espera. O Renovate foi recusado em 17/11/2026 para não haver dois robôs abrindo PRs das mesmas dependências. `@types/node` não recebe versão maior sozinho: sobe junto com o Node do CI (`NODE_VERSION`).

**Consultar o banco:**
```bash
pnpm exec wrangler d1 execute proxinho --remote --command "SELECT count(*) FROM cards"
```

## Quando algo dá errado

| Sintoma | Causa provável | O que fazer |
|---|---|---|
| "Dados diários" falha em "Confere se o resultado é saudável" | Scryfall ou Untapped mudou formato ou ficou fora | O banco antigo continua no ar. Ver o log do passo "Gera o banco"; ajustar `build.py` |
| Cartas novas do Arena sem português | Untapped ainda não publicou o arquivo novo | Esperar o próximo ciclo; rodar o workflow manualmente |
| Prévias não carregam ("Não carregou") | CDN do Scryfall lento ou fora | Nada a fazer do nosso lado; o botão tenta de novo |
| Importar do Archidekt falha | Deck privado ou API mudou | Testar `GET /api/import?url=...`; ver `worker/importers.ts` |
| Busca vazia por alguns segundos às 04h17 | Recarga do banco (apaga e reinsere) | Esperado; ver ADR 0004 |
| Planeswalker com mancha borrada na caixa de texto | O LaMa não carregou e o motor usou o preenchimento simples | Ver o console do navegador ("preenchimento por rede neural indisponível"); conferir se `/modelos/` foi publicado (o build avisa se o download falhou) |
| Primeiro planeswalker demora | Download único do modelo (~66 MB) e, sem placa de vídeo, ~6 s por carta na CPU | Esperado; ver ADR 0008 |
| Ficha sai em inglês com texto em PT disponível | A barra de tipo não foi achada (moldura diferente) | Ver `findTokenBar` em `src/engine/token.ts`; a ficha sai como está de propósito |
| Ficha de 2003 sai em inglês | A placa do nome não foi achada (filete dourado apagado ou outro desenho) | Ver `findPlaque2003` e `plaqueRimEnd` em `src/engine/token.ts` |
| Ponta da placa do nome de 2003 quadrada, sem o filete dourado | A medida da placa passou do filete (sombra ou arte escura ao lado) | Ver a simetria e o filete em `findPlaque2003` e `pnpm test` (`tests/unit/token.test.ts`) |
| Emblema sem português | O planeswalker não tem texto em PT ou tem dois emblemas na mesma face | Esperado; ver `emblem_face` em `data/pipeline/build.py` e o ADR 0010 |
| Ficha sem a etiqueta de português | O Arena não tem essa ficha, o texto em inglês difere ou os tipos diferem (artefato, encantamento) | Conferir a chave em `token_key` (`data/pipeline/build.py`) |
| Planeswalker com o tipo em PT sobre a arte ou texto por cima da linha de tipo | Moldura alta e normal confundidas | Ver `measureTallPlaneswalker` em `src/engine/planeswalker.ts` e `pnpm test` (`tests/unit/planeswalker.test.ts`) |
| Tracejado ou pingo de tinta na caixa do planeswalker | Fio da imagem original entre dois pedaços do buraco, ou pingo inventado pelo LaMa | Ver `combineMasks` e `dropSpecks` em `src/engine/erase.ts` e `pnpm test` (`tests/unit/lama.test.ts`) |
| Emblema com o nome do planeswalker onde a carta diz "Emblem" (ou o contrário) | A largura do título impresso ficou entre as duas leituras | Ver `titleIsEmblemWord` em `src/engine/token.ts` e `emblemTitle` em `src/engine/render.ts` |
| Resto de letra ao lado do símbolo, fio da caixa apagado ou texto em branco sem apagar o inglês | Moldura medida errado (coleção nova, digitalização diferente) | Ver as medidas na imagem do ADR 0011 (`src/engine/erase.ts`); acrescente um caso em `tests/unit/medidas.test.ts` |
| Lembrete sem itálico com um ")" solto, ou sem o fecho | Parêntese faltando no texto oficial (Scryfall ou Arena) | Ver `balance_parens` em `data/pipeline/build.py` e `pnpm test:data` |
| Carta com o nome de outra versão no texto ("Keenser") | Versão com nome alternativo do Arena | Ver `cites_alt_name` em `data/pipeline/build.py` e `pnpm test:data` |
| Texto com outra fonte | `/api/fontes/` sem os arquivos no KV | Recolocar com `wrangler kv key put` (acima) |
