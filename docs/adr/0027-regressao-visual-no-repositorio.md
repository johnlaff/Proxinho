# ADR 0027: regressão visual no repositório

- Status: aceito
- Data: 25/11/2026
- Completa: ADR 0011 (medidas na imagem e varredura de erros) e ADR 0022 (o montador em lote, cuja página ela usa)

## Contexto

Desde 20/11 o dono do projeto exige zero regressões: nenhuma mudança no desenho das cartas é publicada sem montar de novo uma amostra grande de cartas e conferir, carta a carta, o que mudou. A "regressão de 630 cartas" que fazia isso era um script montado na hora numa máquina descartável; com a máquina, sumiam o script, a amostra e as montagens de referência. Cada rodada recomeçava do zero, com uma amostra diferente, e uma correção podia trazer de volta um erro velho sem que nada o pegasse.

As ferramentas de mercado (Percy, Chromatic, o `toHaveScreenshot` do Playwright, reg-suit) comparam capturas com imagens de referência guardadas no repositório ou num serviço. Aqui as imagens são cartas da Wizards e os artistas: não podem ir para o repositório, que é público, nem para um serviço de terceiros. E a referência não é uma imagem fixa: é o mesmo código de outro commit montando as mesmas cartas, com os dados do dia.

## Decisão

**A regressão vive no repositório; as imagens, só na máquina.**

- **Amostra fixa e versionada.** `scripts/regressao/amostra.py` monta `scripts/regressao/amostra.json` a partir do banco do pipeline: todas as impressões citadas como "COLEÇÃO NÚMERO" nos "Erros que já aconteceram" do AGENTS.md e nos ADRs (as cartas em que o motor já errou, 90 hoje), e um sorteio com semente fixa por grupo de moldura (comum, com P/R, terrenos, borda branca, arte estendida, 2003, sem borda, planeswalkers, as de duas faces, fichas, emblemas, Sagas, Aventuras, Classes, naves e a tradução não oficial): 632 impressões, 649 faces. A amostra só muda de propósito, com o motivo no commit; um erro novo registrado no AGENTS.md com a carta entra sozinho na próxima. Desde 25/11/2026 ela só cresce (ADR 0031): rodar `amostra.py` de novo mantém as impressões que já estão nela e acrescenta as citadas novas e o que falta em cada grupo, como a moldura antiga (40). Sortear tudo de novo trocava as cartas de quase todos os grupos a cada citação nova, porque o sorteio é um só, em sequência.
- **Os dois lados pelo mesmo caminho do site.** `scripts/regressao/regressao.mjs` faz um build da página do montador (ADR 0022) com o código desta árvore e outro com o de um commit de comparação (padrão: `origin/main`, num `git worktree`), serve os dois e monta cada face na resolução do PDF, com as funções do site (`renderInput`, `renderPrint`), os dados e as fontes oficiais do site no ar (ou do D1 local, com `--api`). Uma página só para as faces da rede neural, à parte das comuns, como no site.
- **Montagens guardadas por código e por dados.** Cada lado fica em `.regressao/montagens/<resumo do código>-<data dos dados>`: rodar de novo contra a mesma base só monta o lado novo, e uma rodada interrompida continua de onde parou (a face que deu erro é montada de novo: interrompida, a rodada deixava as que estavam na fila com o erro do navegador fechado, e a seguinte as pulava). `.regressao/` está no `.gitignore`.
- **Comparação pixel a pixel.** Arquivo igual é carta igual; senão, a diferença de cada pixel em cada canal, com o limiar de 24 (abaixo disso é ruído da compressão JPEG em volta de uma mudança). O relatório (`.regressao/relatorio/index.html`) lista as cartas que mudaram, da maior mudança para a menor, com antes, depois, o mapa da diferença e o zoom no trecho que mudou, e as faces que falharam ou mudaram de "em PT" para "na original" e vice-versa.
- **Ruído medido.** `--base HEAD --ruido` monta o mesmo código duas vezes e tem de dar zero: o motor é determinístico. Medido em 25/11 nas 649 faces, com a rede neural na CPU: nenhuma mudou. Se um dia a rede neural variar uns pixels entre rodadas (outra versão do runtime, a placa de vídeo), o relatório marca essas faces.
- **Regra.** Mudança que muda o resumo do código que desenha (`node scripts/codigo.ts`) só é publicada depois do `pnpm regressao` contra a main, com cada carta que mudou conferida no relatório (AGENTS.md).

## Consequências

- A regressão sobrevive à máquina e a qualquer sessão: `pnpm regressao` em qualquer clone com o Chromium do Playwright.
- A primeira rodada monta os dois lados (649 faces cada; ~5 min as comuns e ~20 min a rede neural na CPU de 4 núcleos); as seguintes, só o lado novo. `--sem-rede` faz uma rodada de poucos minutos sem as faces da rede neural.
- Nada de imagem de carta no repositório; a amostra é uma lista de coleções e números.
- A comparação usa os dados e as fontes do site no ar: uma mudança só de dados (o pipeline) se confere com `--api` apontando para o D1 local com o banco novo, contra o mesmo código.

## Alternativas descartadas

- **`toHaveScreenshot` do Playwright com as imagens no repositório**: as cartas não podem ir para um repositório público; e uma referência fixa envelhece a cada atualização dos dados.
- **Percy, Chromatic, Argos**: mandariam as cartas a um serviço de terceiros, e cobram por captura acima da cota grátis.
- **Guardar as montagens de referência no R2**: ocuparia a cota do depósito das cartas (ADR 0023) com imagens que se montam de novo em minutos a partir do commit.
