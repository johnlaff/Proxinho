# Guia de operação

## Onde está cada coisa

| O quê | Onde |
|---|---|
| Site e API | Cloudflare Worker `proxinho`, domínio `proxinho.johnlaff.com` |
| Banco | Cloudflare D1 `proxinho` |
| Fontes das cartas (Beleren, MPlantin) | Cloudflare KV `proxinho-fontes` (binding `FONTES`), servidas em `/api/fontes/*.ttf` |
| Dicas das palavras-chave do Arena | O mesmo KV, chave `arena-dicas.json` (não é servida pela API); o workflow "Dados diários" baixa antes do pipeline (ADR 0021) |
| Modelo LaMa e runtimes do ONNX | Assets do site em `/modelos/`, gerados no build por `scripts/modelo.mjs` (baixa do Hugging Face numa revisão fixa, confere o SHA-256 e compacta em gzip): `lama-int4.onnx.gz.0` e `.1`, `ort-webgpu-<versão>.wasm.gz` (placa de vídeo) e `ort-cpu-<versão>.wasm.gz` (CPU) |
| Cartas montadas no servidor | Cloudflare R2 `proxinho-cartas` (binding `CARTAS`, privado), servidas em `/api/cartas/<código>/<chave>.jpg`; gravadas pelo montador em lote (`scripts/montagem`) com o segredo `CARTAS_TOKEN` do Worker (ADR 0022) |
| Atualização dos dados | GitHub Actions, workflow "Dados diários" (04h17 de Brasília) |
| Deploy | GitHub Actions, workflow "CI/CD", job "Deploy em produção" (a cada push na main) |
| Logs | Painel da Cloudflare → Workers → proxinho → Logs (observability ligada) |
| Saúde | `GET https://proxinho.johnlaff.com/api/health` → `{ ok, dataUpdatedAt }` |

## Segredos do repositório

`CLOUDFLARE_API_TOKEN` (permissões: Workers Scripts, D1 e Workers Routes do domínio, edição) e `CLOUDFLARE_ACCOUNT_ID`, no ambiente `producao` do GitHub. A senha do montador (`CARTAS_TOKEN`) é segredo do Worker (`wrangler secret put`), e fica também no ambiente de onde o montador roda.

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

**Atualizar as dicas do Arena** (quando o Arena ganha uma mecânica nova): com o Arena atualizado, pegue o `Raw_ClientLocalization_*.mtga` em `MTGA_Data/Downloads/Raw` da pasta do jogo e rode `python3 data/pipeline/build.py --dicas Raw_ClientLocalization_<…>.mtga` (grava `data/cache/arena_dicas.json`, fora do repositório) e `pnpm exec wrangler kv key put --remote --binding FONTES arena-dicas.json --path data/cache/arena_dicas.json`. O próximo "Dados diários" usa as novas. Nunca suba o banco nem o JSON para o repositório.

**Cartas guardadas no navegador:** cada publicação que muda o motor (`src/engine`), a entrada da montagem ou as fontes livres muda o resumo `__PROXINHO_BUILD__`, e as prévias e faces do PDF guardadas no IndexedDB de cada pessoa deixam de valer, como as montadas no servidor: a primeira visita depois dela monta no aparelho o que o montador ainda não refez (ADR 0014 e 0022). Mudanças só na interface não mexem nelas.

**Ligar o R2** (uma vez; até lá o site monta tudo no aparelho, como antes): ative o R2 no painel da Cloudflare (R2 Object Storage; sem isso a API responde com o erro 10042), crie o depósito (`pnpm exec wrangler r2 bucket create proxinho-cartas`), tire o comentário de `r2_buckets` em `wrangler.jsonc`, grave a senha do montador (abaixo) e publique. Confira com `curl https://proxinho.johnlaff.com/api/cartas`: a lista dos códigos com o depósito, 503 ("Sem o depósito das cartas montadas") sem ele.

**Montar as cartas no servidor** (depois de cada publicação que muda o desenho e depois dos dados diários; ADR 0022): no mesmo commit que está no ar,

```bash
pnpm montagem:build && pnpm montagem:serve &     # a página do montador em http://localhost:5198
CARTAS_TOKEN=… pnpm montagem -- --enviar          # só o que falta; --escolhidas monta só a arte padrão de cada carta
CARTAS_TOKEN=… pnpm montagem -- --apagar-velhas   # apaga as cartas dos códigos que não estão mais no ar
```

O montador lê a lista de cartas do D1 remoto (com `CLOUDFLARE_API_TOKEN`), os dados e as fontes oficiais do site, e confere que as fontes oficiais carregaram e que a página tem o resumo do código. Monta a arte padrão de todas as cartas primeiro, das mais jogadas às menos, e depois as outras artes suportadas; as cartas comuns levam ~1,5 s por face e as da rede neural ~20 s no processador. Sem o R2 no ar, `--saida pasta` grava numa pasta e `--enviar-pasta pasta` envia depois. A senha: gere uma nova (`openssl rand -hex 32`), grave no Worker (`pnpm exec wrangler secret put CARTAS_TOKEN`) e use a mesma no montador; nunca no repositório. Enquanto o montador não termina, o site monta no aparelho o que falta, como antes.

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
| Prévia de planeswalker ou de arte sem borda parada no rascunho, sem a parte avançar | A rede neural travou (uma thread do WebAssembly que não sobe, como no Firefox do celular) ou está lenta na CPU | O vigia troca a worker pela do degrau seguinte (o console diz "a rede neural falhou; tentando num modo mais simples"); o limite de cada quadro segue o ritmo medido. Ver `LIMITS`, `MODES`, `nextMode` e `runLimit` em `src/engine/lama.ts` e `pnpm test` (`tests/unit/lama.test.ts`) |
| Arte sem borda sai na original com "Em inglês: o apagador de texto não rodou neste navegador" | A rede neural falhou nos três degraus na página | Esperado: sem ela a caixa sairia borrada. O "Detalhe técnico" da gaveta diz o motivo de cada degrau. Recarregar a página tenta de novo; em outro navegador costuma rodar |
| Chrome ou Safari com placa de vídeo levando dezenas de segundos por quadro | A placa de vídeo falhou e a carta foi para a CPU | Ver o "Detalhe técnico" da gaveta ou o console. Se for `[WebGPU] Kernel … failed`, conferir se a worker importa `onnxruntime-web/webgpu`, não o pacote principal (o JSEP falha no LaMa, ADR 0013) |
| Build com a worker num arquivo só e a preparação do modelo travando | O Vite gerou a worker no formato iife: os runtimes do ONNX ficam embutidos e as threads do WebAssembly não sobem | `worker: { format: "es" }` em `vite.config.ts`; o build tem de gerar `ort.webgpu.bundle.min-*.js` e `ort.wasm.bundle.min-*.js` à parte |
| Carta guardada no navegador com o desenho de antes de uma correção | A chave das cartas guardadas não mudou: o arquivo corrigido não entra no resumo do código que desenha | Pôr o arquivo na lista de `drawingHash` em `vite.config.ts` e publicar de novo; quem já abriu pode limpar os dados do site no navegador. Ver ADR 0014 |
| Primeiro planeswalker demora | Download único do modelo e do runtime (37 MB com placa de vídeo, 33 MB sem) e, sem placa de vídeo, ~7 s por quadro na CPU de um computador | Esperado; a carta aparece antes em rascunho. Ver ADRs 0008 e 0013 |
| Saga sai em inglês com texto em PT disponível | O motor não achou um fio por capítulo (digitalização clara demais, como as promos de pré-estreia), os números dos marcadores ou a barra de tipo no pé, ou o texto não coube nem no corpo 18 | Esperado nas promos de pré-estreia: a versão da coleção sai em PT. Ver `sagaDividers`, `sagaNumerals` e `sagaPlan` em `src/engine/saga.ts` e `pnpm test` (`tests/unit/saga.test.ts`); "Sagas com capítulos que não batem" no log do pipeline lista as que saem como estão já nos dados |
| Aventura sai em inglês com texto em PT disponível | O motor não achou o livro na imagem (a lombada entre as páginas ou a barra do tipo da aventura), ou a impressão não é da moldura de livro (vitrine, arte estendida, sem borda) | Ver `adventureBook` em `src/engine/adventure.ts` e `pnpm test` (`tests/unit/adventure.test.ts`); as de outro desenho saem como estão de propósito (`adventure_supported` no pipeline) |
| Nave ou planeta com Posicionar sai em inglês com texto em PT disponível | O motor não achou um selo por nível, a caixa de P/R numa nave que vira criatura ou o pé da caixa, o texto não coube nem no corpo 18, ou a rede neural não rodou | Ver `stationBadges`, `stationPt` e `stationBottom` em `src/engine/station.ts` e `pnpm test` (`tests/unit/station.test.ts`); as sem borda e as de vitrine saem como estão de propósito (`station_supported` no pipeline) |
| Classe sai em inglês com texto em PT disponível | O motor não achou a coluna, o fio do lembrete ou uma barra por nível, o texto não coube nem no corpo 18, ou é uma promo de loja com relevo (de fora de propósito) | Ver `classColumn`, `classRule` e `classBars` em `src/engine/classCard.ts` e `pnpm test` (`tests/unit/classCard.test.ts`); as de outro desenho saem como estão (`class_supported` no pipeline) |
| Ficha sai em inglês com texto em PT disponível | A barra de tipo não foi achada (moldura diferente) | Ver `findTokenBar` em `src/engine/token.ts`; a ficha sai como está de propósito |
| Ficha de 2003 sai em inglês | A placa do nome não foi achada (filete dourado apagado ou outro desenho) | Ver `findPlaque2003` e `plaqueRimEnd` em `src/engine/token.ts` |
| Ponta da placa do nome de 2003 quadrada, sem o filete dourado | A medida da placa passou do filete (sombra ou arte escura ao lado) | Ver a simetria e o filete em `findPlaque2003` e `pnpm test` (`tests/unit/token.test.ts`) |
| Emblema sem português | O planeswalker não tem texto em PT ou tem dois emblemas na mesma face | Esperado; ver `emblem_face` em `data/pipeline/build.py` e o ADR 0010 |
| Ficha sem a etiqueta de português | O Arena não tem essa ficha, o texto em inglês difere ou os tipos diferem (artefato, encantamento) | Conferir a chave em `token_key` (`data/pipeline/build.py`) |
| Planeswalker com o tipo em PT sobre a arte ou texto por cima da linha de tipo | Moldura alta e normal confundidas | Ver `measureTallPlaneswalker` em `src/engine/planeswalker.ts` e `pnpm test` (`tests/unit/planeswalker.test.ts`) |
| Tracejado ou pingo de tinta na caixa do planeswalker | Fio da imagem original entre dois pedaços do buraco, ou pingo inventado pelo LaMa | Ver `combineMasks` e `dropSpecks` em `src/engine/erase.ts` e `pnpm test` (`tests/unit/lama.test.ts`) |
| Emblema com o nome do planeswalker onde a carta diz "Emblem" (ou o contrário) | A largura do título impresso ficou entre as duas leituras | Ver `titleIsEmblemWord` em `src/engine/token.ts` e `emblemTitle` em `src/engine/render.ts` |
| Resto de letra ao lado do símbolo, fio da caixa apagado ou texto em branco sem apagar o inglês | Moldura medida errado (coleção nova, digitalização diferente) | Ver as medidas na imagem do ADR 0011 (`src/engine/erase.ts`); acrescente um caso em `tests/unit/medidas.test.ts` |
| Carta sem a explicação de uma palavra-chave que nunca saiu impressa em PT | O KV está sem `arena-dicas.json` (o log do pipeline avisa), a dica não existe no arquivo, diz outra coisa que a carta ou tem a tradução errada (`HINT_SKIP`) | Atualizar as dicas (acima); ver `hint_reminder` e `refers_to_self` em `data/pipeline/build.py` e `pnpm test:data` |
| Lembrete sem itálico com um ")" solto, ou sem o fecho | Parêntese faltando no texto oficial (Scryfall ou Arena) | Ver `balance_parens` em `data/pipeline/build.py` e `pnpm test:data` |
| Carta com o nome de outra versão no texto ("Keenser") | Versão com nome alternativo do Arena | Ver `cites_alt_name` em `data/pipeline/build.py` e `pnpm test:data` |
| Texto com outra fonte | `/api/fontes/` sem os arquivos no KV | Recolocar com `wrangler kv key put` (acima) |
| Primeira visita montando no aparelho cartas que deviam vir prontas | O montador não rodou depois da última publicação (o código mudou e as chaves também), o R2 está sem o binding `CARTAS`, ou a pessoa usa fontes próprias | Rodar o montador (acima); conferir `GET /api/cartas/<código>/<chave>.jpg` de uma carta (o código está no fim do log do montador) |
| Montador grava mas o site não acha as cartas | Montado de outro commit (outro resumo do código) ou sem as fontes oficiais | Rodar `pnpm montagem:build` no commit que está no ar; o montador recusa começar sem as fontes oficiais |
