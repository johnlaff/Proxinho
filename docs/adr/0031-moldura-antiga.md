# ADR 0031: moldura antiga (1997)

- Status: aceito
- Data: 25/11/2026
- Complementa: ADR 0008 (preenchimento por rede neural), ADR 0011 (medidas conferidas na imagem) e ADR 0024 (moldura de 2003)

## Contexto

A moldura antiga, que o Scryfall chama de `1997`, é a das cartas de Mirage (1996) a Scourge (2003), das edições básicas de 5ª a 7ª, de Portal e Starter, e das reimpressões "retrô" de hoje (Time Spiral Remastered, Modern Horizons 2 e 3, Dominaria Remastered, The Brothers' War, Innistrad Remastered...). No levantamento de 25/11 (Commander, impressões em inglês em papel), ela era a moldura das 3.278 cartas sem nenhuma arte reescrita: o maior grupo das 5.431 que só saíam em inglês.

Ela não tem barras lisas como a de 2003 e a M15. Medida em 78 impressões de 40 coleções (escala de 745 × 1040):

- o nome e o tipo são letras brancas com sombra preta (2 px para a direita e 2 para baixo), direto sobre a moldura texturizada: mármore, pedra, folhagem, conforme a cor;
- a primeira letra do nome fica em x ≈ 80, com a linha de base em ≈ 81 (83 nas retrô de 2021 em diante); a do tipo em x ≈ 80, com a linha de base em ≈ 608 (606 nas retrô);
- o custo de mana são círculos de ≈ 37 px, um a cada 40, o último acabando em x ≈ 687;
- o símbolo da coleção fica na ponta direita da linha de tipo, começando entre x ≈ 590 e 650; uns têm contorno branco, outros só cor;
- a caixa de texto é um painel com bisel de 7 a 9 px, de papel com textura na cor da carta (pergaminho, verde-musgo, vermelho), de x 74–77 a 666–670 e de y 618–623 a 921–927 por fora (930 nas retrô); o texto em inglês vai de x 93 a 649 e de y 635 a 911, centrado na altura, sem fio entre as regras e o flavor.

O nome é impresso em Goudy Medieval; o tipo e as regras, numa serifada como a MPlantin. A Goudy Medieval original é comercial. A MagicMedieval, um ajuste dela para as cartas, é grátis para uso não comercial, mas só tem as letras sem acento e os acentos soltos, sem cedilha: o navegador escrevia "Água" e "Ação" com outra fonte nas letras acentuadas.

## Decisão

**Pipeline.** `frame_supported` aceita a moldura antiga por `frame1997_supported`: layout `normal`, borda preta ou branca, sem efeito de moldura, salvo a lápide de Odyssey a Scourge (fica como está, antes do nome, e o nome em PT começa onde começava o inglês, depois dela: conferida em 18 impressões de 12 coleções), sem planeswalker (as retrô de MH3 têm caixa própria), sem marca-d'água (os logotipos das promos e o "wotc" das reimpressões de 30 anos ficam no meio da caixa, e o apagamento os levaria só onde as letras passam, como nas de 2003) e fora da Secret Lair (`SETS_1997_OFF`: ela escreve o nome e o tipo à mão ou em outras letras, como o "CREATURE - Goblin" em versalete da SLD 2517). As regras da M15 valem igual (`full_art`, `textless`, moldura desenhada à mão).

**Motor** (`src/engine/old.ts`, `renderOld` em `render.ts`):

- **As letras são medidas, não o fundo.** Não há barra para medir: `oldLetters` acha as letras brancas pelo que fica bem mais claro que a moldura (a mediana de cada fatia de 24 px, interpolada) e quase sem cor, e a sombra pelo que fica bem mais escuro logo abaixo e à direita delas. Traço claro de mais de 45 px na horizontal é o bisel da arte ou da caixa, não letra; e só ficam as manchas que passam pela faixa das letras, medida pelas manchas altas: os pedaços do bisel partido pela textura são baixos e, somados, enchiam a linha dele mais que as letras (Standardize, ONS 116). Fora da faixa, fica a mancha pequena dentro da altura das letras e a até 6 px de uma delas: o pingo do "i" e a ponta de uma haste que a textura separou da letra sobravam como um pingo ao lado do português.
- **O símbolo da coleção é separado das letras do tipo**: o último trecho, depois de x 575 e de um vão de 14 px, é o símbolo de contorno branco; sem ele, o que foge do tom da moldura, da ponta para a esquerda (`oldTypeEnds`).
- **A rede neural refaz a moldura.** A textura de mármore e pedra não se preenche linha a linha como uma barra: o nome e o tipo, com a sombra, vão ao LaMa num quadro só (`lamaBox` com `art`, como a arte sem borda), com o custo de mana e o símbolo escondidos. Sem a rede neural (navegador que não a roda), a carta sai na original, com `reason: "neural"` (nunca vai para o servidor).
- **A caixa é apagada como a da M15**: o papel é liso o bastante para o preenchimento de sempre (`eraseRegions`), com os lados medidos na imagem (`insideBoxSides`) e o alinhamento centrado medido no inglês (`measureCentered`). O texto em PT fica centrado na altura, sem o fio do flavor (`rule` em `drawLayout`), como na carta antiga.
- **O nome e o tipo são escritos como na carta**: branco com a sombra preta a 2 px, a partir da primeira letra do inglês (x ≈ 80), na linha de base medida (`baseline` de `oldLetters`, se estiver a até 5 px da esperada). O nome cabe até o custo, o tipo até o símbolo: comprime até 82% da largura e depois diminui a letra.

**Fonte do nome.** A MagicMedieval, com as letras acentuadas do português montadas por `scripts/acentuar-medieval.py`: cada letra com o acento dela como componentes (como nas fontes de verdade), e a cedilha desenhada (a haste e o gancho das romanas antigas, mais fino na ponta). O arquivo passa pelo OTS e fica no KV `FONTES` como `medieval.ttf`, fora do repositório, como a Beleren e a Matrix Bold. Sem ele, o nome sai na Beleren e `fontsId` passa a `b7|o`: as cartas guardadas e as do servidor deixam de valer, e o montador não começa. A fonte escolhida pela pessoa vale também no nome da moldura antiga.

**Arte padrão.** `defaultChoice` põe a moldura atual na frente da de 2003, e a de 2003 na frente da antiga (`frameRank`): a carta que tinha arte reescrita continua com ela. A antiga vira a padrão só quando é a única arte em PT.

## Consequências

- 8.151 das 9.666 impressões em inglês na moldura antiga passam a ser suportadas. 3.019 cartas com texto em PT ganham a primeira arte reescrita: 799 com o texto oficial e 2.220 com a tradução não oficial (ADR 0025); entre as mais jogadas, Gaea's Cradle, Grim Monolith, Serra's Sanctum e Replenish. Das 31.894 cartas com texto em PT, as que têm alguma arte reescrita vão de 26.606 para 29.625 (levantamento de 25/11, impressões em inglês em papel).
- A rede neural roda em toda carta antiga: no computador, um quadro a mais por carta (o mesmo das artes sem borda, ADR 0015); no celular sem placa de vídeo, mais lento. O PDF adiantado e as cartas do servidor (ADR 0014 e 0022) escondem a espera.
- Fora por ora: as de marca-d'água, as de duas faces e split da época (as split depois, ADR 0038), os planeswalkers antigos (Lorwyn em diante já são de 2003) e a borda dourada dos campeonatos (já de fora, `border_color`).
- Muda o resumo do código que desenha: as cartas do servidor são montadas de novo (ADR 0022). Publicar pede a `medieval.ttf` no KV antes do código novo (`wrangler kv key put --remote --binding FONTES medieval.ttf --path medieval.ttf`).

## Alternativas descartadas

- **Pintar uma barra lisa sobre o nome e o tipo**, como fazem os geradores de proxy com moldura digital: fica diferente da carta impressa, que tem a textura até as letras.
- **Preencher a moldura linha a linha** (`inpaintRows`, das barras): o remendo de cada linha sai da cor dos lados dela e não continua os veios na diagonal do mármore e da pedra, nem as folhas e as gotas das molduras verde e preta.
- **Deixar as letras acentuadas para o navegador**: sem elas no arquivo, ele as escreve com outra fonte, e "Água" sai com o "Á" em outro desenho. O acento composto é o que as fontes fazem de qualquer jeito.
