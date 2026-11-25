# ADR 0024: moldura de 2003

- Status: aceito
- Data: 21/11/2026
- Complementa: ADR 0011 (medidas conferidas na imagem)

## Contexto

A moldura de 2003 a 2014 (de Eighth Edition a Magic 2014, mais as reimpressões e promos da época) é a segunda mais comum do catálogo: 15.692 impressões em inglês, contra 72.687 da M15. Até aqui só as fichas dela eram reescritas (ADR 0009). As cartas saíam na original em inglês, e 4.312 cartas com texto oficial em PT não tinham nenhuma arte na moldura atual.

Medida em 40 impressões de 30 coleções, a moldura é quase a da M15:

- a barra do nome vai de y ≈ 54 a 111 e a de tipo de 586 a 644, com as letras na mesma altura da M15 (centro em 82 e 613);
- o papel da caixa vai de x 61 a 679 e de y 652 a 936 (na M15, de 58 a 688 e até 954);
- a caixa de P/R começa em y ≈ 927, 8 px antes do fim da caixa;
- a ponta das barras é mais funda: o fio escuro de dentro fica em x ≈ 50 a 56 no meio da barra e em 54 a 60 no alto e no pé, com uns 5 px de degradê até o papel;
- o centro das minúsculas fica em y ≈ 88 no nome e 617,5 no tipo (6,5 px abaixo do nome da M15), com as maiúsculas de 71 a 98 e de 603 a 626;
- a primeira letra muda com a época (6 cartas de cada uma de 20 coleções): o nome em x ≈ 65 e o tipo em 67 em Eighth Edition; 63 e 64 em Mirrodin, Darksteel e Fifth Dawn; 63 e 72 de Kamigawa a Time Spiral (Ninth Edition, 73); 67 e 75 de Planar Chaos em diante.

O nome e o tipo são impressos em Matrix Bold (Emigre, 1990), e as regras em MPlantin, como hoje. A Matrix Bold é uma fonte comercial, como a Beleren, e o site a usa como a Beleren, a partir do arquivo do João.

## Decisão

**Pipeline.** `frame_supported` aceita a moldura de 2003 por `frame2003_supported`: layout `normal`, borda preta ou branca, sem efeito de moldura, salvo o céu estrelado de Theros (a lápide de Odyssey, o milagre e as cores trocadas de Planar Chaos mudam o desenho; ver o adendo abaixo), sem planeswalker (a caixa é outra), sem marca-d'água (`WATERMARKS_2003_OK`) e fora de duas coleções de promos com outro desenho que o Scryfall não marca (`SETS_2003_OFF`): as de Champs and States, com a arte atrás do tipo e da caixa (o motor desistia das 11, Rakdos Guildmage PCMP 3), e a Viscera Seer espelhada da Secret Lair (SLD VS). As demais regras da M15 valem igual (`full_art`, `textless`, Game Day, moldura desenhada à mão).

**Motor.** O caminho é o da carta comum (`renderCard`), com `frame2003` em `m15Layout`:

- a caixa do texto fica em x 72 a 668 e y 660 a 926 (918 com P/R): com a da M15, o texto comprido descia até o fio de baixo e encostava no fio da direita (Uncontrollable Anger 10E 244, Undying Evil DKA 77);
- o apagamento do nome e do tipo começa em x = 60. Começando em 50, a curva da ponta passava dos 11 px de `barCapGuard` no alto e no pé das barras e saía borrada (Divination M10 49, Azorius Signet DIS 159);
- o nome e o tipo começam onde começavam na época da impressão (`frame2003Start`, pela data). As reimpressões de The List usam a digitalização da original com a data delas e ficam com a medida mais nova (3 a 4 px de diferença nas antigas);
- as linhas ficam no centro das minúsculas medido nas cartas (88 e 617,5), e o alinhamento pelo inglês (`alignBar`) mede a partir dele (`BAR_CENTER_2003`). Com o centro da M15, o nome de quase todas descia 6,5 px no alinhamento e o das que ficavam abaixo dos 4 px, não. O apagamento do nome fica de 64,5 a 112,5, até o pé das letras com perna;
- o resto é o mesmo da M15: as medidas na imagem (o fio da barra, o símbolo da coleção, a caixa de P/R, os lados e o fio de baixo da caixa) acompanham os poucos pixels de diferença.

**Arte padrão.** `defaultChoice` põe a moldura atual na frente da de 2003. A carta que tem arte na M15 continua com a mesma arte de antes, e a carta já montada no servidor (ADR 0022) continua valendo. A de 2003 vira a padrão só quando é a única arte em PT.

**Fonte.** O nome e o tipo da moldura de 2003 saem na Matrix Bold (`titleFont(true)`), guardada como a Beleren: passada pelo `scripts/consertar-fontes.py`, no KV `FONTES` como `matrix-bold.ttf`, fora do repositório. As maiúsculas dela têm 0,59 do corpo (a Beleren, 0,70): a escala de 1,3 dá as 27 px do nome e as 23 do tipo das cartas reais. O Chrome põe o `middle` dela na linha de base (as métricas verticais do arquivo de 1990 não servem), então ela é escrita pela linha de base (`baseline: "alphabetic"`), 0,21 do corpo abaixo do centro da linha (meia altura-x). Sem o arquivo, a de 2003 sai na Beleren, e `fontsId` passa de `o|o` a `b|o`: as cartas guardadas e as do servidor deixam de valer, e o montador não começa. A fonte escolhida pela pessoa vale também na de 2003.

## Regressão

- As 40 impressões das medidas e 116 de 150 coleções da época, uma por coleção, sorteadas entre as suportadas, foram montadas e conferidas em folhas e em zoom nas pontas das barras e na caixa. As 34 restantes eram terrenos básicos sem texto ou não montaram por um erro do servidor.
- Com a Matrix Bold, as 40 de novo e 140 das 150 coleções: maiúsculas com a mesma altura e a mesma posição das originais (27 px de 71 a 98 no nome, 23 px de 603 a 626 no tipo, medianas iguais), e a primeira letra a até 2 px da original em 36 das 38 das medidas (as outras: o "J" da Matrix, que começa antes, e uma de The List). E as 65 promos suportadas de 15 coleções pequenas: as de Champs and States saíam na original (agora ficam de fora), as outras, em português.
- Dessas conferências saíram a caixa e as pontas acima, e duas exclusões:
  - as marcas-d'água das guildas e de Scars of Mirrodin, cinza-claras e sem cor, que o apagamento levava só onde as letras cruzavam (o resto ficava em cacos: Darksteel Relic NPH 134, Peace Strider MBS 119);
  - os logotipos das promos (FNM, DCI, Junior), que ficavam em manchas claras (Elvish Visionary F10 6, Counterspell F05 11).
- A moldura de 2015 não muda: `frame2003` só vale para `frame` 2003.

## Consequências

- 12.189 impressões na moldura de 2003 saem em português (12.547 entram como suportadas; as outras são de cartas sem texto oficial em PT, que seguem em inglês). 3.704 cartas passam a ter uma arte em PT pela primeira vez, e as cartas com arte em PT vão de 21.555 para 25.259.
- As 1.854 impressões de 2003 com marca-d'água seguem na original. O próximo passo é guardar a marca-d'água inteira: apagar só as letras e refazer o desenho por baixo delas.
- Split, flip, leveler e as de duas faces de 2003 seguem de fora, cada uma com o próprio desenho.
- Publicar pede a Matrix Bold no KV antes do código novo (`wrangler kv key put --remote --binding FONTES matrix-bold.ttf`): sem ela, o site no ar troca `o|o` por `b|o` e deixa de achar as cartas do servidor.

## Adendo (25/11/2026): o céu estrelado de Theros e o símbolo da coleção

**Céu estrelado.** As criaturas e os artefatos encantamento de Theros, Born of the Gods e Journey into Nyx (`frame_effects` `enchantment`: 109 impressões de cartas sem marca-d'água) têm as estrelas só na moldura em volta: as barras, a caixa e a caixa de P/R são as da moldura comum de 2003. `frame2003_supported` passa a aceitar esse efeito (só ele). Conferidas 34 impressões de THS, BNG, JOU, The List e das promos de pré-estreia: nome, tipo e caixa limpos, entre elas Archetype of Endurance, Erebos, Athreos e Karametra.

**Símbolo da coleção.** Nessa conferência apareceu um defeito que já estava no site: o símbolo da coleção saía sem a metade da esquerda. A ponta da barra de tipo de 2003 é mais funda que a da M15 (o contorno de dentro começa em x ≈ 686), e a busca do símbolo ia até o fim da M15 (711): o contorno e a moldura colorida depois dele formavam um bloco de 25 px, largo demais para passar por fio da ponta, e eram tomados pelo símbolo. O símbolo de verdade ficava "antes do símbolo", com o tipo, e o apagamento ia até 654 (o limite de `m15Layout`). Num sorteio de 240 impressões suportadas, 66 (27%) tinham o símbolo cortado (Magma Spray JOU 103, Gods Willing THS 16, o "M10" de M10 166). Na de 2003 a busca vai até x = 684 (`TYPE_BAR_END_2003`), como nas fichas, que passam o fim da barra: nas 240, nenhum símbolo cortado. Nas outras 174 o corte muda no máximo 3 px, salvo o selo "M10" de M10 166, que perdia a ponta da esquerda: o corte começava 14 px dentro dele.

